const fs = require("node:fs"), test = require("node:test"), assert = require("node:assert/strict");

// The transcript's stylesheet, one space per run of whitespace, so a rule reads the same however it is wrapped.
const css = fs.readFileSync(__dirname + "/../src/features/conversation/transcript.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const rule = (selector) => {
  const at = css.indexOf(selector + " {");
  assert.notEqual(at, -1, `${selector} has a rule`);
  return css.slice(at, css.indexOf("}", at));
};

test("the messages keep the panel's width: one column that can shrink, no sideways scroll, long words break", () => {
  // One column, its newest at the foot (the first block takes the slack: the creature redesign's transcript, T31).
  assert.match(rule("#messages"), /flex-direction: column/);
  assert.match(rule("#messages"), /overflow-x: hidden/);
  assert.match(rule(".messages-content"), /min-width: 0; margin-top: auto/);
  assert.match(rule(".message-group"), /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(rule(".chat-message-row"), /min-width: 0/);
  const bubble = rule(".chat-bubble");
  assert.match(bubble, /min-width: 0/);
  assert.match(bubble, /max-width: 82%/);
  assert.match(bubble, /overflow-wrap: anywhere/);
  assert.match(rule(".karaoke-text"), /overflow-wrap: anywhere/);
});

test("the text box is never resized by hand, and there is no keyboard button to open it", () => {
  assert.doesNotMatch(css, /resize: (?!none)/);
  assert.doesNotMatch(css, /compose-toggle/);
});

test("on a phone the transcript is a sheet over a scrim; on a desktop a docked card that is gone while closed", () => {
  // The creature redesign's panel (T40): 320px, 12px off the call's edges, a 22px corner and its own edge.
  assert.match(rule(".call-layout > .transcript"), /width: 320px; min-width: 0; min-height: 0; margin: 12px 12px 12px 0;/);
  assert.match(rule(".call-layout > .transcript"), /border-radius: 22px/);
  assert.match(css, /\.call-layout > \.transcript:not\(\[data-open\]\) \{ display: none; \}/);
  const phone = css.slice(css.indexOf("@media (max-width: 559px), (max-width: 899px) and (pointer: coarse)"));
  assert.match(phone, /\.transcript-scrim\[data-open\] \{ opacity: 1; pointer-events: auto; \}/);
  assert.match(phone, /\.call-layout > \.transcript, \.call-layout > \.transcript:not\(\[data-open\]\) \{ display: flex; position: fixed;/);
  assert.match(phone, /\.transcript-grab \{ display: block;/);
  assert.match(phone, /height: 76dvh; margin: 0; border-width: 1px 0 0; border-radius: 26px 26px 0 0;/);
});
