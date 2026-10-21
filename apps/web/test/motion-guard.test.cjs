const fs = require("node:fs"), path = require("node:path"), test = require("node:test"), assert = require("node:assert/strict");

/* The motion guard's static half (the browsers' half is e2e/motion-guard.spec.mjs): what the stylesheets can move, and the
 * rules that judge what runs. Everything that moves is a compositable animation, transform or opacity on an HTML layer
 * (desktop#149, web#278); the exceptions are the allowlist in e2e/motion-audit.mjs, each with its reason. */

const SRC = path.join(__dirname, "../src");
const load = () => import("../e2e/motion-audit.mjs");

/** Every file that holds stylesheet text: the app's CSS, and the creatures' engine, whose rules are written in TypeScript. */
function stylesheets(dir = SRC, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) stylesheets(file, found);
    else if (/\.(css|ts)$/.test(entry.name) && !/\.test\.|\.d\.ts$/.test(entry.name)) found.push(file);
  }
  return found;
}

/** The properties each @keyframes sets, by name: { name: { properties, files } }. */
function keyframes() {
  const found = {};
  for (const file of stylesheets()) {
    const text = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of text.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
      let depth = 1, i = match.index + match[0].length;
      const start = i;
      while (depth && i < text.length) { const c = text[i++]; if (c === "{") depth += 1; else if (c === "}") depth -= 1; }
      const entry = found[match[1]] ??= { properties: new Set(), files: new Set() };
      entry.files.add(path.relative(SRC, file));
      for (const block of text.slice(start, i - 1).matchAll(/\{([^{}]*)\}/g)) {
        for (const declaration of block[1].split(";")) {
          const property = declaration.split(":")[0].trim();
          if (property && property !== "animation-timing-function") entry.properties.add(property);
        }
      }
    }
  }
  return found;
}

test("the stylesheets define keyframes (the scan finds them)", () => {
  const all = keyframes();
  assert.ok(Object.keys(all).length > 100, "the creatures' and the app's keyframes");
  assert.deepEqual([...all["ui-spin"].properties], ["transform"]);
});

test("every @keyframes moves transform and opacity only, but those the allowlist excuses", async () => {
  const { ALLOWED, COMPOSITABLE } = await load();
  const excused = new Set(ALLOWED.filter((entry) => entry.rule === "property" && typeof entry.name === "string").map((entry) => entry.name));
  const offenders = Object.entries(keyframes())
    .map(([name, { properties, files }]) => ({ name, files: [...files], bad: [...properties].filter((p) => !COMPOSITABLE.has(p)) }))
    .filter(({ bad }) => bad.length)
    .filter(({ name }) => !excused.has(name))
    .map(({ name, files, bad }) => `${name} (${files.join(", ")}) sets ${bad.join(", ")}`);
  assert.deepEqual(offenders, [], "a keyframes that lays out or paints on every frame: move it by transform or opacity, or excuse it in ALLOWED with its reason");
});

test("an allowlist entry says what it excuses and why", async () => {
  const { ALLOWED } = await load();
  for (const entry of ALLOWED) {
    assert.ok(["svg", "property", "invisible", "restarted"].includes(entry.rule), `a known rule: ${JSON.stringify(entry)}`);
    assert.ok(entry.name || entry.target || entry.key || entry.paintOnly, `names what it matches: ${entry.why}`);
    assert.ok(typeof entry.why === "string" && entry.why.length > 30, `gives its reason: ${entry.name ?? entry.key}`);
  }
});

const running = (extra) => ({ kind: "CSSAnimation", name: "x", target: "div.card", pseudo: null, svg: null, playState: "running", props: ["transform"],
  nonCompositable: [], infinite: true, visible: true, hidden: null, ...extra });
const rules = (animations, counted, allowed = []) => load().then(({ violations }) => violations({ animations, counted }, allowed).map((v) => v.rule));

test("a running animation inside an SVG is a finding; the SVG's own root, and a paused one, are not", async () => {
  assert.deepEqual(await rules([running({ svg: "inside" })]), ["svg"]);
  assert.deepEqual(await rules([running({ svg: "root" })]), []);
  assert.deepEqual(await rules([running({ svg: "inside", playState: "paused" })]), []);
});

test("an animation of anything but transform and opacity is a finding", async () => {
  assert.deepEqual(await rules([running({ props: ["left"], nonCompositable: ["left"], infinite: false })]), ["property"]);
  assert.deepEqual(await rules([running({ props: ["transform", "opacity"] })]), []);
});

test("an infinite animation where nobody sees it is a finding; a finite one, or a visible one, is not", async () => {
  assert.deepEqual(await rules([running({ visible: false, hidden: "offscreen" })]), ["invisible"]);
  assert.deepEqual(await rules([running({ visible: false, hidden: "offscreen", infinite: false })]), []);
  assert.deepEqual(await rules([running({ visible: true })]), []);
});

test("a transition restarted in every second of the window, more than twice a second, is a finding", async () => {
  const started = (perSecond, activeSeconds) => ({ windowSeconds: 3, started: [{ key: "transition transform on i.bar", perSecond, activeSeconds }] });
  assert.deepEqual(await rules([], started(30, 3)), ["restarted"]);
  assert.deepEqual(await rules([], started(30, 1)), [], "a burst is one second");
  assert.deepEqual(await rules([], started(1, 3)), [], "a slow loop is cheap");
});

test("the allowlist excuses what it names, and only that rule", async () => {
  const allowed = [{ rule: "svg", name: "bx-pop", target: /\.bang$/, why: "x".repeat(40) }];
  const bang = running({ name: "bx-pop", target: "svg > g > g.prop-wait.bang", svg: "inside" });
  assert.deepEqual(await rules([bang], undefined, allowed), []);
  assert.deepEqual(await rules([{ ...bang, props: ["filter"], nonCompositable: ["filter"] }], undefined, allowed), ["property"]);
  assert.deepEqual(await rules([{ ...bang, name: "other" }], undefined, allowed), ["svg"]);
});

test("a colour fading on a change of state is excused as a class; a width or a left is not", async () => {
  const { violations } = await load();
  const transition = (props) => ({ kind: "CSSTransition", name: props[0], target: "button#send", pseudo: null, svg: null, playState: "running", props, nonCompositable: props, infinite: false, visible: true });
  assert.deepEqual(violations({ animations: [transition(["backgroundColor", "color"])] }), []);
  assert.deepEqual(violations({ animations: [transition(["width"])] }).map((v) => v.rule), ["property"]);
  assert.deepEqual(violations({ animations: [transition(["color", "width"])] }).map((v) => v.rule), ["property"], "one that also moves a width is not just a colour");
  assert.deepEqual(violations({ animations: [{ ...transition(["backgroundColor"]), kind: "CSSAnimation", infinite: true }] }).map((v) => v.rule), ["property"], "a keyframe loop of colours is not a state's fade");
});

/* What waits while nobody sees it (the audit of 2026-10-21): the CSS that stops a loop where it is off screen, hidden, or
 * under an opaque page. The browsers' half (e2e/motion-guard.spec.mjs) watches that nothing infinite runs unseen. */
const css = (file) => fs.readFileSync(path.join(SRC, file), "utf8").replace(/\s+/g, " ");

test("on a phone the closed conversation list and the closed transcript run no animation", () => {
  assert.match(css("features/room/room.css"), /\.conversation-sidebar:not\(\[data-open\]\) \* \{ animation: none !important; \}/);
  // Both of its drawers: the phone's sheet and the compact window's.
  assert.equal(css("features/conversation/transcript.css").match(/\.call-layout > \.transcript:not\(\[data-open\]\) \* \{ animation: none !important; \}/g)?.length, 2);
});

test("an offline agent, drawn at opacity 0 under the wanted poster, runs no animation", () => {
  assert.match(css("styles/call.css"), /\.stage-tile\[data-mood=offline\] \.stage-agent \* \{ animation:none !important \}/);
});

test("a full page (Settings) over the room pauses what moves behind it, and not the page itself", () => {
  const app = css("styles/app.css");
  assert.match(app, /#root > \.room-shell:has\(> \.ui-dialog\[data-layout="page"\]\[open\]\) > :not\(\.ui-dialog\) \* \{ animation-play-state: paused !important; \}/);
});
