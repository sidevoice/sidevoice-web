/* What moves on a page, and whether it should (desktop#149, web#278): the probe and the rules that the motion guard
 * (motion-guard.spec.mjs) and the audit (perf/animation-audit.mjs) share.
 *
 * The rule (script that moves things — loops of writes to style, class, attributes and content — is read as an animation too, `inspect`):
 * everything that moves is a compositable animation, transform or opacity on an HTML layer, never a per-frame
 * repaint or layout, never an animation inside an SVG (WebKit repaints the whole drawing on the CPU every frame), and
 * nothing keeps running where nobody can see it. The page-side half (`probe`, `inspect`) is plain functions, sent to the
 * page whole (page.evaluate / addInitScript), so it runs unchanged in WebKit and in Chromium. */

/** The properties a browser moves on the compositor, without painting or laying out again. */
export const COMPOSITABLE = new Set(["transform", "opacity", "translate", "rotate", "scale"]);

/** Installed before the page's scripts: counts what a page schedules (animation frames, timers), what it writes to the DOM
 *  and which transitions and animations it starts, while `window.__motion.on` is true, and notices what blocks its thread.
 *  Nothing is counted (and nothing watches) until `start()`: the page runs as it would without the probe. */
export function probe() {
  if (window.__motion) return;
  const original = {
    setTimeout: window.setTimeout.bind(window), setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window), raf: window.requestAnimationFrame.bind(window),
  };
  const state = window.__motion = {
    // The page's own timers, which the probe does not count: for whatever feeds the page in a test.
    timers: original,
    on: false, startedAt: 0, raf: 0, timeouts: 0, intervalTicks: 0, mutations: 0, blocks: [], longTasks: [],
    sites: new Map(), mutationSites: new Map(), events: new Map(), intervals: new Map(),
    // What the page's script writes to the DOM, per site (see `written`): which elements, what the writes changed.
    writes: new Map(),
    start() {
      state.raf = state.timeouts = state.intervalTicks = state.mutations = 0;
      state.blocks = []; state.longTasks = [];
      state.sites = new Map(); state.mutationSites = new Map(); state.events = new Map(); state.writes = new Map();
      state.startedAt = performance.now(); state.on = true; last = performance.now(); watch();
    },
    stop() {
      state.on = false;
      const seconds = Math.max((performance.now() - state.startedAt) / 1000, 0.001);
      // Per key: how often, and in how many of the window's seconds it happened at all (a burst is one second; a loop is all of them).
      const top = (map) => [...map.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 12)
        .map(([key, { count, seconds: active }]) => ({ key, perSecond: +(count / seconds).toFixed(2), activeSeconds: active.size }));
      return {
        seconds: +seconds.toFixed(2), windowSeconds: Math.max(1, Math.floor(seconds)), rafPerSecond: +(state.raf / seconds).toFixed(2), timeoutsPerSecond: +(state.timeouts / seconds).toFixed(2),
        intervalTicksPerSecond: +(state.intervalTicks / seconds).toFixed(2), mutationsPerSecond: +(state.mutations / seconds).toFixed(2),
        scheduled: top(state.sites), mutated: top(state.mutationSites), started: top(state.events),
        // Per site of script writes (style, class, attributes, content): how often, and in how many of the window's seconds.
        written: [...state.writes.entries()].map(([key, { count, seconds: active }]) => ({ key, perSecond: +(count / seconds).toFixed(2), activeSeconds: active.size })),
        // Intervals still registered: a timer that never stops is a loop for the page's whole life.
        intervals: [...state.intervals.values()].map((entry) => ({ ...entry })), blocks: state.blocks.slice(), longTasks: state.longTasks.slice(),
      };
    },
  };
  const bump = (map, key) => {
    const entry = map.get(key) ?? { count: 0, seconds: new Set() };
    entry.count += 1; entry.seconds.add(Math.floor((performance.now() - state.startedAt) / 1000));
    map.set(key, entry);
  };
  /** Where in the page's own code a call came from: the first stack frame in its scripts (a source-mapped build resolves it). */
  const site = (kind) => {
    const frames = String(new Error().stack || "").split("\n");
    const frame = frames.find((line) => /\/assets\/|\/src\//.test(line)) || frames[2] || "?";
    const match = frame.match(/([^\s()@]+?:\d+:\d+)/);
    return `${kind} ${match ? match[1] : frame.trim().slice(0, 100)}`;
  };
  const text = (fn) => String(fn).replace(/\s+/g, " ").slice(0, 90);

  window.requestAnimationFrame = (callback) => {
    const key = site("raf");
    return original.raf((time) => { if (state.on) { state.raf += 1; bump(state.sites, key); } callback(time); });
  };
  window.setTimeout = (callback, delay, ...args) => {
    if (typeof callback !== "function") return original.setTimeout(callback, delay, ...args);
    const key = site("timeout");
    return original.setTimeout((...rest) => { if (state.on) { state.timeouts += 1; bump(state.sites, key); } return callback(...rest); }, delay, ...args);
  };
  window.setInterval = (callback, delay, ...args) => {
    if (typeof callback !== "function") return original.setInterval(callback, delay, ...args);
    const key = site("interval");
    const id = original.setInterval((...rest) => { if (state.on) { state.intervalTicks += 1; bump(state.sites, key); } return callback(...rest); }, delay, ...args);
    state.intervals.set(id, { id, delay: delay ?? 0, site: key, callback: text(callback) });
    return id;
  };
  window.clearInterval = (id) => { state.intervals.delete(id); return original.clearInterval(id); };

  /** A short description of an element: tag, id, first two classes. */
  const named = (node) => {
    if (!node || node.nodeType !== 1) return node?.nodeName?.toLowerCase?.() ?? "?";
    const classes = typeof node.className === "string" ? node.className : node.className?.baseVal ?? "";
    return node.localName + (node.id ? "#" + node.id : "") + classes.split(/\s+/).filter(Boolean).slice(0, 2).map((c) => "." + c).join("");
  };
  /** The element and the two above it, outermost first: enough to find it in the markup. */
  const where = (node) => { const path = []; for (let n = node; n && n.nodeType === 1 && path.length < 3; n = n.parentElement) path.unshift(named(n)); return path.join(" > "); };
  /** The declarations of a style attribute, by property. */
  const declared = (css) => new Map([...String(css ?? "").matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map((m) => [m[1], m[2].trim()]));
  /** What a record changed: `what` (style, class, another attribute, or the element's content) and its `details` (the style
   *  properties or the classes that differ). */
  const change = (record) => {
    if (record.type !== "attributes") return { what: "content", details: [] };
    const now = record.target.getAttribute(record.attributeName);
    if (record.attributeName === "style") {
      const before = declared(record.oldValue), after = declared(now);
      return { what: "style", details: [...new Set([...before.keys(), ...after.keys()])].filter((p) => before.get(p) !== after.get(p)) };
    }
    if (record.attributeName === "class") {
      const before = new Set(String(record.oldValue ?? "").split(/\s+/)), after = new Set(String(now ?? "").split(/\s+/));
      return { what: "class", details: [...before, ...after].filter((c) => c && before.has(c) !== after.has(c)) };
    }
    return { what: record.attributeName, details: [] };
  };
  const observer = new MutationObserver((records) => {
    if (!state.on) return;
    state.mutations += records.length;
    for (const record of records) {
      const target = record.type === "characterData" ? record.target.parentElement : record.target;
      bump(state.mutationSites, `${record.type}${record.attributeName ? ":" + record.attributeName : ""} on ${named(target)}`);
      if (!target || target.nodeType !== 1 || !target.isConnected) continue;
      const { what, details } = change(record);
      // A style write that changed nothing a reader could see (the same value again) is not a write.
      if (what === "style" && !details.length) continue;
      const key = `${what} on ${where(target)}`;
      bump(state.writes, key);
      const entry = state.writes.get(key);
      entry.what = what; entry.details ??= new Set(); entry.refs ??= [];
      for (const detail of details) entry.details.add(detail);
      if (entry.refs.length < 4 && !entry.refs.some((ref) => ref.deref() === target)) entry.refs.push(new WeakRef(target));
    }
  });
  const attach = () => observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
  if (document.documentElement) attach(); else document.addEventListener("DOMContentLoaded", attach, { once: true });

  // A transition or an animation starting, however often: the cost of a thing restarted on every reading.
  const started = (type) => (event) => {
    if (!state.on) return;
    // The element and the two above it: a bar that is only a `b` is told by the wave it is in.
    const trail = [];
    for (let n = event.target; n && n.nodeType === 1 && trail.length < 3; n = n.parentElement) trail.unshift(named(n));
    bump(state.events, `${type} ${event.propertyName || event.animationName} on ${trail.join(" > ")}${event.pseudoElement || ""}`);
  };
  document.addEventListener("transitionrun", started("transition"), true);
  document.addEventListener("animationstart", started("animation"), true);

  // What blocks the thread: a timer that arrives late (WebKit has no Long Tasks API), and long tasks where there are.
  let last = 0, watching = false;
  const watch = () => {
    if (watching) return;
    watching = true;
    const beat = () => {
      if (!state.on) { watching = false; return; }
      const now = performance.now();
      if (now - last > 70) state.blocks.push(Math.round(now - last - 25));
      last = now;
      original.setTimeout(beat, 25);
    };
    original.setTimeout(beat, 25);
  };
  try {
    new PerformanceObserver((list) => { if (state.on) for (const entry of list.getEntries()) state.longTasks.push(Math.round(entry.duration)); }).observe({ entryTypes: ["longtask"] });
  } catch { /* WebKit: no long tasks */ }
}

/** Reads the animations running on the page right now, with what they animate, where, and whether anybody can see it. Runs
 *  in the page. */
export function inspect({ compositable, writes = [] }) {
  const allowed = new Set(compositable);
  // Keys of a keyframe that are not a property.
  const notProperty = new Set(["offset", "computedOffset", "easing", "composite"]);
  const viewport = { width: innerWidth, height: innerHeight };
  const named = (node) => {
    if (!node || node.nodeType !== 1) return "?";
    const classes = typeof node.className === "string" ? node.className : node.className?.baseVal ?? "";
    return node.localName + (node.id ? "#" + node.id : "") + classes.split(/\s+/).filter(Boolean).slice(0, 2).map((c) => "." + c).join("");
  };
  /** The element and the two above it, outermost first: enough to find it in the markup. */
  const where = (node) => { const path = []; for (let n = node; n && n.nodeType === 1 && path.length < 3; n = n.parentElement) path.unshift(named(n)); return path.join(" > "); };
  /** The opacity of a computed colour: rgb(...) and color(...) are opaque, rgba(..., a) and "... / a" are a. */
  const alphaOf = (color) => {
    const slash = color.match(/\/\s*([\d.]+)(%?)\s*\)$/);
    if (slash) return Number.parseFloat(slash[1]) / (slash[2] ? 100 : 1);
    const parts = color.startsWith("rgba(") ? color.slice(5, -1).split(",") : null;
    return parts && parts.length === 4 ? Number.parseFloat(parts[3]) : 1;
  };
  const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  /** Why nobody can see `node`, or null when it can be seen. `ownOpacity`: the animation moves it, so the value read now is
   *  not the element's. */
  const hiddenReason = (node, ownOpacity) => {
    if (!node.isConnected) return "detached";
    if (!node.getClientRects().length) return "no box";
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) return "zero-size";
    const visible = { left: 0, top: 0, right: viewport.width, bottom: viewport.height };
    if (!intersects(rect, visible)) return "offscreen";
    // Under a modal dialog that is opaque where the element is: a full page (Settings) over the room hides all of it.
    const modal = document.querySelector("dialog:modal");
    if (modal && !modal.contains(node)) {
      const top = document.elementFromPoint(Math.min(Math.max(rect.left + rect.width / 2, 0), viewport.width - 1), Math.min(Math.max(rect.top + rect.height / 2, 0), viewport.height - 1));
      for (let n = top; top && modal.contains(top) && n && n !== modal.parentElement; n = n.parentElement) {
        if (alphaOf(getComputedStyle(n).backgroundColor) >= 0.98) return `covered by ${named(n)}`;
      }
    }
    let opacity = 1;
    for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (n === node && style.visibility !== "visible") return `visibility:${style.visibility}`;
      if (style.display === "none") return "display:none";
      if (style.contentVisibility === "hidden") return "content-visibility:hidden";
      if (!(n === node && ownOpacity)) opacity *= Number.parseFloat(style.opacity);
      if (opacity < 0.02) return n === node ? "opacity:0" : `opacity:0 on ${named(n)}`;
      if (style.clip === "rect(0px, 0px, 0px, 0px)" || /inset\(\s*(50|100)%/.test(style.clipPath)) return `clipped away on ${named(n)}`;
      if (n !== node && n !== document.documentElement && n !== document.body && /hidden|clip|scroll|auto/.test(style.overflowX + style.overflowY)
        && !(node instanceof SVGElement && n instanceof SVGElement)) {
        const box = n.getBoundingClientRect();
        if (!intersects(rect, box)) return `clipped by ${named(n)}`;
      }
    }
    return null;
  };

  /* What a script's writes move. A style write names its properties; a custom property, a class and an attribute move what
   * the page's stylesheets (and inline styles) make of them: the properties declared where the selector names the class or the
   * attribute, and the ones a custom property is read by (var(), through the custom properties that read it in turn). */
  const declared = (css) => [...String(css ?? "").matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map((m) => [m[1], m[2]]);
  const rules = [];
  const collect = (list) => {
    for (const rule of list ?? []) {
      if (rule.style && rule.selectorText !== undefined) rules.push({ selector: rule.selectorText, declarations: declared(rule.style.cssText) });
      if (rule.cssRules) collect(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) { try { collect(sheet.cssRules); } catch { /* a sheet from another origin */ } }
  const readers = new Map();
  const readBy = (name) => {
    if (readers.has(name)) return readers.get(name);
    const found = new Set();
    readers.set(name, found);
    const add = (property) => { if (property.startsWith("--")) for (const further of readBy(property)) found.add(further); else found.add(property); };
    const uses = new RegExp(`var\\(\\s*${name}\\b`);
    for (const rule of rules) for (const [property, value] of rule.declarations) if (uses.test(value)) add(property);
    for (const node of document.querySelectorAll(`[style*="${name}"]`)) for (const [property, value] of declared(node.getAttribute("style"))) if (uses.test(value)) add(property);
    return found;
  };
  /** The properties the declarations of the rules whose selector holds `needle` set, custom properties by what reads them. */
  const declaredWhere = (needle) => {
    const found = new Set();
    for (const rule of rules) if (rule.selector.includes(needle)) for (const [property] of rule.declarations) {
      if (property.startsWith("--")) for (const further of readBy(property)) found.add(further); else found.add(property);
    }
    return found;
  };
  /** What a site of writes moves, as property names: none when it moves nothing a reader sees (aria-valuenow). */
  const movedBy = (entry, onSvg) => {
    if (entry.what === "content") return ["content"];
    if (entry.what === "style") {
      const moved = new Set();
      for (const property of entry.details) {
        if (!property.startsWith("--")) moved.add(property);
        else if (readBy(property).size) for (const read of readBy(property)) moved.add(read); else moved.add(property);
      }
      return [...moved];
    }
    if (entry.what === "class") return [...new Set([...entry.details].flatMap((name) => [...declaredWhere("." + name)]))];
    const styled = [...declaredWhere(`[${entry.what}`)];
    // The drawing's own attributes (d, transform, fill, x) are what is painted.
    return styled.length || !onSvg || /^(data|aria)-/.test(entry.what) ? styled : [entry.what];
  };
  const written = [];
  for (const key of writes) {
    const entry = window.__motion.writes.get(key);
    const nodes = (entry?.refs ?? []).map((ref) => ref.deref()).filter((node) => node?.isConnected);
    if (!nodes.length) continue;
    const props = movedBy(entry, nodes[0] instanceof SVGElement);
    if (!props.length) continue;
    const reasons = nodes.map((node) => hiddenReason(node, props.includes("opacity")));
    const hidden = reasons.every(Boolean) ? reasons[0] : null;
    written.push({
      kind: "ScriptWrite", name: entry.what + (entry.details.size ? ":" + [...entry.details].join("+") : ""), target: where(nodes[0]), pseudo: null,
      svg: nodes[0].ownerSVGElement ? "inside" : nodes[0] instanceof SVGElement ? "root" : null, playState: "running", props,
      nonCompositable: props.filter((p) => !allowed.has(p)), infinite: true, iterations: "infinite", duration: null, easing: null, direction: null,
      hidden, visible: hidden === null,
    });
  }

  return [...written, ...document.getAnimations().map((animation) => {
    const effect = animation.effect;
    const target = effect?.target;
    const kind = animation.constructor.name;
    const name = animation.animationName || animation.transitionProperty || animation.id || "script";
    if (!target) return { kind, name, playState: animation.playState, orphan: true };
    const timing = effect.getComputedTiming();
    const properties = new Set();
    for (const frame of effect.getKeyframes()) for (const key of Object.keys(frame)) if (!notProperty.has(key)) properties.add(key);
    const props = [...properties];
    const svg = target.ownerSVGElement ? "inside" : target instanceof SVGElement ? "root" : null;
    const hidden = hiddenReason(target, properties.has("opacity"));
    return {
      kind, name, target: where(target), pseudo: effect.pseudoElement || null, svg, playState: animation.playState, props,
      nonCompositable: props.filter((p) => !allowed.has(p)), infinite: timing.iterations === Infinity,
      iterations: timing.iterations === Infinity ? "infinite" : timing.iterations, duration: typeof timing.duration === "number" ? Math.round(timing.duration) : null,
      easing: effect.getTiming().easing, direction: timing.direction, hidden, visible: hidden === null,
    };
  })];
}

/** Whether something that happens `perSecond` times, in `activeSeconds` of a window of `window` seconds, is a loop: in every second of
 *  it, and more than twice a second (a one-off, or a burst on a change of state, is not). */
const loops = (s, window) => window >= 2 && s.activeSeconds >= window && s.perSecond > 2;

/** One running animation's identity: the same thing seen twice is one thing. */
const identity = (a) => [a.kind, a.name, a.target, a.pseudo ?? "", a.svg ?? "", a.props?.join("+")].join(" | ");

/**
 * Watches a page that is settled (the probe installed before it loaded): waits `settle` ms, then for `duration` ms counts
 * what the page schedules and writes (`counted`, see probe) and reads its animations `samples` times, merging them: each
 * distinct running animation once, with how many elements it is on (`elements`) and in how many of the readings it was
 * running (`seen`: a transition restarted on every reading shows in all of them).
 */
export async function observe(page, { settle = 1500, duration = 3000, samples = 4 } = {}) {
  await page.waitForTimeout(settle);
  await page.evaluate(() => window.__motion.start());
  const found = new Map();
  for (let i = 0; i < samples; i += 1) {
    const now = (await page.evaluate(inspect, { compositable: [...COMPOSITABLE] })).filter((a) => a.kind !== "ScriptWrite");
    const here = new Map();
    for (const a of now) {
      if (a.playState !== "running" && a.playState !== "pending") continue;
      const key = identity(a);
      here.set(key, (here.get(key) ?? 0) + 1);
      if (!found.has(key)) found.set(key, { ...a, seen: 0, elements: 0 });
    }
    for (const [key, n] of here) { const entry = found.get(key); entry.seen += 1; entry.elements = Math.max(entry.elements, n); }
    await page.waitForTimeout(duration / samples);
  }
  const counted = await page.evaluate(() => window.__motion.stop());
  // What the page's script writes in a loop moves things as an animation would: held to the same rules.
  const writes = counted.written.filter((w) => loops(w, counted.windowSeconds)).map((w) => w.key);
  if (writes.length) {
    for (const a of await page.evaluate(inspect, { compositable: [...COMPOSITABLE], writes })) {
      if (a.kind === "ScriptWrite") found.set(identity(a), { ...a, seen: samples, elements: 1 });
    }
  }
  return { animations: [...found.values()], samples, counted };
}

/**
 * The rule, applied to what runs. Returns the findings, one per animation and reason:
 *   svg          a running animation on an element inside an SVG (WebKit repaints the whole drawing on the CPU every frame)
 *   property     an animation that moves something other than transform / opacity (layout or paint on every frame)
 *   invisible    an infinite animation where nobody can see it (hidden, zero-size, offscreen, clipped away): pure waste
 *   restarted    (from `counted.started`) a transition or animation that starts again and again, in every second of the
 *                window and more than twice a second: one retargeted on each reading of a level (desktop#149)
 *
 * What is on the allowlist (ALLOWED) is an intended exception and is not a finding.
 */
export function violations(seen, allowed = ALLOWED) {
  const found = [];
  const add = (rule, text, ...subjects) => { if (!allowed.some((entry) => entry.rule === rule && subjects.some((s) => matches(entry, s)))) found.push({ rule, text }); };
  for (const a of seen.animations ?? []) {
    if (a.orphan || (a.playState !== "running" && a.playState !== "pending")) continue;
    if (a.svg === "inside") add("svg", `svg: ${a.kind} "${a.name}" on ${a.target}${a.pseudo ?? ""} (inside an SVG)`, a);
    if (a.nonCompositable?.length) add("property", `property: ${a.kind} "${a.name}" on ${a.target}${a.pseudo ?? ""} animates ${a.nonCompositable.join(", ")}`, a);
    if (a.infinite && !a.visible) add("invisible", `invisible: ${a.kind} "${a.name}" on ${a.target}${a.pseudo ?? ""} runs forever where nobody sees it (${a.hidden})`, a);
  }
  const window = seen.counted?.windowSeconds ?? 0;
  for (const s of seen.counted?.started ?? []) {
    if (loops(s, window)) add("restarted", `restarted: ${s.key} starts ${s.perSecond} times a second`, { key: s.key });
  }
  return found;
}

/** What a colour or a shadow changing repaints, and nothing else: the properties of a state's fade. */
const PAINT_ONLY = new Set(["color", "backgroundColor", "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "outlineColor", "textDecorationColor", "caretColor", "boxShadow", "fill", "stroke"]);

/** An allowlist entry matches when every field it names matches: `name` (string or RegExp), `target` (RegExp on the element's
 *  path), `kind`, `property` (one of the animated properties), `paintOnly` (nothing it animates but colours and shadows),
 *  `key` (RegExp on a restart's description). */
function matches(entry, subject) {
  if (entry.paintOnly && !(subject.nonCompositable?.length && subject.nonCompositable.every((p) => PAINT_ONLY.has(p)))) return false;
  if (entry.name && !(entry.name instanceof RegExp ? entry.name.test(subject.name ?? "") : entry.name === subject.name)) return false;
  if (entry.target && !entry.target.test(subject.target ?? "")) return false;
  if (entry.kind && entry.kind !== subject.kind) return false;
  if (entry.property && !subject.props?.includes(entry.property)) return false;
  if (entry.key && !entry.key.test(subject.key ?? "")) return false;
  return true;
}

/**
 * The intended exceptions to the rule. Each entry says which rule it excuses (`svg`, `property`, `invisible`, `restarted`),
 * what it matches (see `matches`) and `why`. Adding one is a decision, not a fix: say why the animation cannot be a
 * transform or an opacity on an HTML layer, or why it has to run unseen, and what removes the entry.
 */
export const ALLOWED = [
  {
    rule: "property", name: "bx-bulb",
    why: "The creatures' lamps, gems and bulbs flicker (brightness 1.5 / .7, steps(1)): twice a cycle, not on every frame. An opacity version is a different glow; the look is the operator's call (audit 2026-10-21, to decide).",
  },
  {
    rule: "svg", name: "bx-pop", target: /\.bang$/,
    why: "The '!' that pops twice (2.6 s in all) on a still thumbnail when something new arrives, kept on purpose when the creatures were held still (web#274, web#278). Finite, once per arrival; an HTML '!' would redraw the badge.",
  },
  {
    rule: "svg", kind: "CSSTransition", target: /(^|> )g(\.|$| )/,
    why: "The still creatures' eyes, brows and mouth ease when its mood changes (a transition on its SVG, a few frames per change of state, never on a loop). Only a layered creature (data-motion=gpu, the stage) moves them as HTML; the thumbnails stay SVG.",
  },
  {
    rule: "property", kind: "CSSTransition", paintOnly: true,
    why: "A button, a field or a row takes its colours (text, background, border, shadow) over 100-300 ms when its state changes: it repaints that element's own box, once, and cannot loop (a loop is a 'restarted' finding). Fading colours is how every control answers a hover, a focus or a change of state.",
  },
  {
    rule: "restarted", key: /your-wave/,
    why: "The title card's wave: 5 bars ease their transform over 70 ms to each of 10 readings a second (call-card.css). Without the ease it steps at 10 fps; the look is the operator's call (audit 2026-10-21, to decide).",
  },
];

/**
 * How often Chromium paints a settled page (Chromium only: WebKit has no trace to read). Records a DevTools trace for `ms`
 * and counts the frames it painted: a page where nothing is happening paints nothing, and anything that paints on a loop
 * (a colour, a text, a size, an SVG, the properties the compositor cannot move) shows here whatever moved it. A frame is a
 * run of `Paint` events (one per painted layer and element) with no gap of a frame's length.
 * `browser`: the Playwright Browser the page is in.
 */
export async function paints(browser, page, ms = 3000) {
  await browser.startTracing(page, { categories: ["devtools.timeline"] });
  await page.waitForTimeout(ms);
  const trace = JSON.parse((await browser.stopTracing()).toString());
  const times = (trace.traceEvents ?? trace).filter((event) => event.name === "Paint").map((event) => event.ts).sort((a, b) => a - b);
  const frames = times.filter((time, i) => i === 0 || time - times[i - 1] > 12_000).length;
  return { frames, perSecond: +(frames / (ms / 1000)).toFixed(2) };
}
