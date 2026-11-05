const fs = require("node:fs"), test = require("node:test"), assert = require("node:assert/strict");

// The room's stylesheet, comments out and one space per run of whitespace, as rules: selector and body; and what holds
// under reduced motion.
const read = (file) => fs.readFileSync(__dirname + "/../src/" + file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const css = read("features/room/room.css");
const rules = (text) => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
const at = css.indexOf("@media (prefers-reduced-motion: reduce) { .state-dot");
const reduced = rules(css.slice(at, css.indexOf("} }", at) + 3).replace(/^@media[^{]+\{/, ""));
const outside = rules(css.slice(0, at === -1 ? css.length : at) + css.slice(at === -1 ? css.length : css.indexOf("} }", at) + 3));
const find = (list, selector) => list.find((rule) => rule.selector === selector);

test("a conversation's light is the fixed colour of its state, from the tokens in one place", () => {
  const tokens = read("styles/tokens.css");
  // Scheme E (the operator's, 2026-11-05): one edit to swap (styles/tokens.css); nothing else spells a state's colour.
  const scheme = { listening: "#2fb67c", speaking: "#3d8bfd", working: "#6b4fd8", attention: "#e0a82e", muted: "#e5484d", idle: "#b9b3c4", offline: "#8a8594" };
  for (const [state, colour] of Object.entries(scheme)) assert.match(tokens, new RegExp(`--sv-state-${state}: ${colour};`), state);
  for (const kind of ["listening", "speaking", "working", "offline"])
    assert.match(find(outside, `.state-dot[data-kind="${kind}"]`).body, new RegExp(`background: var\\(--sv-state-${kind}\\)`), kind);
  assert.match(find(outside, ".state-dot").body, /background: var\(--sv-state-idle\)/, "resting and present are the plain dot");
  // The dark theme lightens the chromatic ones, in the same file; the greys stay.
  const dark = tokens.slice(tokens.indexOf('[data-theme="dark"]'));
  for (const state of ["listening", "speaking", "working", "attention", "muted"]) assert.match(dark, new RegExp(`--sv-state-${state}: #[0-9a-f]{6};`), state);
  for (const state of ["idle", "offline"]) assert.doesNotMatch(dark, new RegExp(`--sv-state-${state}:`), state);
  assert.doesNotMatch(read("styles/theme.css"), /--sv-state-/);
  for (const rule of outside.filter((rule) => /\.state-dot\[data-kind=/.test(rule.selector)))
    assert.doesNotMatch(rule.body, /--sv-(positive|voice|accent)\b/, rule.selector);
});

test("working blinks; where motion is reduced it holds still, with a halo that still tells it from the rest", () => {
  assert.match(find(outside, '.state-dot[data-kind="working"]').body, /animation: state-dot-blink /);
  assert.match(css, /@keyframes state-dot-blink \{ 0%, 100% \{ opacity: 1; \} 50% \{ opacity: \.25; \} \}/);
  assert.notEqual(at, -1, "a reduced-motion rule for the light");
  const still = find(reduced, '.state-dot[data-kind="working"]');
  assert.match(still.body, /animation: none !important/);
  assert.match(still.body, /box-shadow: 0 0 0 2px color-mix\(in srgb, var\(--sv-state-working\)/);
});

test("a card's creature stands out of its square; the card is ringed in mustard when it needs the person", () => {
  assert.match(find(outside, ".conversation-avatar[data-pop]").body, /width: 56px; height: 56px; overflow: visible/);
  assert.match(find(outside, ".conversation-avatar[data-pop] .sv-avatar").body, /border-radius: 30%/);
  assert.match(find(outside, ".conversation-avatar[data-pop] .sv-avatar").body, /radial-gradient\(circle at 50% 70%, color-mix\(in srgb, var\(--av-color\) 34%, transparent\), var\(--sv-accent-soft\) 72%\)/);
  assert.match(find(outside, ".sidebar-rows .participant-row:has(.conversation-avatar[data-attention])").body, /border-color: var\(--sv-state-attention\)/);
});

test("a card's dot is the connected green, blinks in the working colour, and the state's words stay uncoloured", () => {
  assert.match(find(outside, ".conversation-avatar[data-pop] .state-dot").body, /background: var\(--sv-state-listening\)/);
  assert.match(find(outside, '.conversation-avatar[data-pop] .state-dot[data-kind="working"]').body, /background: var\(--sv-state-working\)/);
  // Only the dot carries colour: no rule colours the state's words.
  for (const rule of outside.filter((rule) => /\.(sidebar-state|person-sub|participant-copy)/.test(rule.selector)))
    assert.doesNotMatch(rule.body, /(^|[; ])color: var\(--sv-state-/, rule.selector);
});

test("a working card has no light along its foot, and its type is the Live Activity cards': bold tight title, medium grey state", () => {
  assert.doesNotMatch(css, /row-strip|sidebar-working-strip/);
  assert.match(find(outside, ".sidebar-rows .person-name").body, /font-weight: 700; letter-spacing: -\.01em/);
  assert.match(find(outside, ".sidebar-rows .person-sub").body, /font-weight: 500; color: var\(--sv-text-muted\)/);
  assert.ok(outside.some((rule) => rule.selector === ".sidebar-rows .person" && /font-family: var\(--sv-font-sans\)/.test(rule.body)), "DM Sans on the card's button");
});

test("the transcript's Working row wears the working colour and blinks like the conversations' dot", () => {
  const transcript = read("features/conversation/transcript.css");
  assert.match(transcript, /\.working-label > svg \{[^}]*color: var\(--sv-state-working\); animation: transcript-blink 1\.2s ease-in-out infinite;/);
  assert.match(transcript, /@keyframes transcript-blink \{ 50% \{ opacity: \.25; \} \}/);
  assert.match(transcript, /prefers-reduced-motion: reduce\) \{ \.working-label > svg[^}]*animation: none/);
});
