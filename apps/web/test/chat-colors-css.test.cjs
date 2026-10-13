const fs = require("node:fs"), test = require("node:test"), assert = require("node:assert/strict");

// The chat's colours (theme.css --sv-chat-*), each palette in each theme as the page resolves it, and the two bubbles
// that read them: the transcript's and the stage's person bubble.
const read = (path) => fs.readFileSync(__dirname + "/../src/" + path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const theme = read("styles/theme.css");
const rules = [...theme.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector.trim(),
  tokens: Object.fromEntries([...body.matchAll(/(--sv-chat-[a-z-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])),
}));

/** The chat's tokens in `mode` ("light" | "dark") and `palette`, applied in the order the cascade would. */
function resolve(mode, palette) {
  const steps = [
    (s) => s.includes(":root") && s.includes('[data-theme="light"]'),
    (s) => mode === "dark" && s === '[data-theme="dark"]',
    (s) => s.includes(`[data-chat-colors="${palette}"]`) && !s.includes("data-theme"),
    (s) => mode === "dark" && s.includes(`[data-chat-colors="${palette}"]`) && s.includes('[data-theme="dark"]'),
  ];
  return Object.assign({}, ...steps.flatMap((step) => rules.filter((rule) => step(rule.selector)).map((rule) => rule.tokens)));
}

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const palette of ["today", "soft", "filled"]) for (const mode of ["light", "dark"]) {
  test(`chat colours "${palette}", ${mode}: every text 4.5:1 and more on its bubble`, () => {
    const tokens = resolve(mode, palette);
    for (const role of ["agent", "person"]) {
      const bg = tokens[`--sv-chat-${role}-bg`];
      assert.match(bg ?? "", /^#[0-9a-f]{6}$/i, `${role} fill`);
      for (const ink of ["fg", "subtle"]) {
        const value = tokens[`--sv-chat-${role}-${ink}`];
        assert.ok(ratio(value, bg) >= 4.5, `${role} ${ink} ${value} on ${bg}: ${ratio(value, bg).toFixed(2)}`);
      }
    }
    if (palette !== "filled") return;
    // What sits on a filled bubble: a failure in words, 4.5:1; the marks, 3:1 (WCAG 1.4.11).
    const bg = tokens["--sv-chat-person-bg"];
    assert.ok(ratio(tokens["--sv-chat-person-danger"], bg) >= 4.5);
    for (const mark of ["mark", "quiet"]) assert.ok(ratio(tokens[`--sv-chat-person-${mark}`], bg) >= 3, mark);
  });
}

test("today's palette is the one the page had: agent lila, person crema", () => {
  assert.equal(resolve("light", "today")["--sv-chat-agent-bg"], "#f3eefa");
  assert.equal(resolve("light", "today")["--sv-chat-person-bg"], "#f7f1e6");
  assert.equal(resolve("dark", "today")["--sv-chat-agent-bg"], "#1e1b26");
  assert.equal(resolve("dark", "today")["--sv-chat-person-bg"], "#24211b");
});

test("the person's bubble on the stage and in the transcript are one rule, on the chat's tokens", () => {
  const transcript = read("features/conversation/transcript.css");
  const shared = transcript.slice(transcript.indexOf('.chat-bubble[data-role="user"], .person-bubble {'));
  const body = shared.slice(0, shared.indexOf("}"));
  assert.match(body, /background: var\(--sv-chat-person-bg\)/);
  assert.match(body, /--sv-text: var\(--sv-chat-person-fg\)/);
  assert.match(body, /--sv-text-subtle: var\(--sv-chat-person-subtle\)/);
  // The stage draws its shape only: no fill or text colour of its own to drift from the transcript's.
  const stage = read("features/call/call-view.css");
  const bubble = stage.slice(stage.indexOf(".person-bubble {"), stage.indexOf("}", stage.indexOf(".person-bubble {")));
  assert.doesNotMatch(bubble, /background|(^|[^-])color:/);
  assert.doesNotMatch(theme + transcript + stage, /--sv-bubble-(agent|self)/);
});
