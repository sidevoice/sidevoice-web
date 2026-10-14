const fs = require("node:fs"), test = require("node:test"), assert = require("node:assert/strict");

// The room's stylesheet, comments out and one space per run of whitespace, as rules: selector and body; and what holds
// under reduced motion.
const css = fs.readFileSync(__dirname + "/../src/features/room/room.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const rules = (text) => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
const at = css.indexOf("@media (prefers-reduced-motion: reduce) { .state-dot");
const reduced = rules(css.slice(at, css.indexOf("} }", at) + 3).replace(/^@media[^{]+\{/, ""));
const outside = rules(css.slice(0, at === -1 ? css.length : at) + css.slice(at === -1 ? css.length : css.indexOf("} }", at) + 3));
const find = (list, selector) => list.find((rule) => rule.selector === selector);

test("a conversation's light: green while its agent hears you, in the call or waiting for you, and while it works", () => {
  const green = find(outside, '.state-dot:is([data-state="in-call"], [data-state="waiting"], [data-state="working"])');
  assert.ok(green, "one rule lights the three states");
  assert.match(green.body, /background: var\(--sv-positive\)/);
  // No other colour for a state that hears you: not the voice's mustard, not the accent.
  for (const rule of outside.filter((rule) => /\.state-dot\[data-state=/.test(rule.selector)))
    assert.doesNotMatch(rule.body, /--sv-(voice|accent)\b/, rule.selector);
});

test("working blinks; where motion is reduced it holds still, with a halo that still tells it from plain green", () => {
  assert.match(find(outside, '.state-dot[data-state="working"]').body, /animation: state-dot-blink /);
  assert.match(css, /@keyframes state-dot-blink \{ 0%, 100% \{ opacity: 1; \} 50% \{ opacity: \.25; \} \}/);
  assert.notEqual(at, -1, "a reduced-motion rule for the light");
  const still = find(reduced, '.state-dot[data-state="working"]');
  assert.match(still.body, /animation: none !important/);
  assert.match(still.body, /box-shadow: 0 0 0 2px color-mix\(in srgb, var\(--sv-positive\)/);
});

test("on the sidebar's cards only a conversation that cannot hear you has no light", () => {
  assert.ok(find(outside, '.sidebar-rows .state-dot[data-state="idle"]'));
  assert.match(find(outside, '.sidebar-rows .state-dot[data-state="idle"]').body, /display: none/);
  assert.equal(outside.filter((rule) => rule.selector.startsWith(".sidebar-rows .state-dot") && /display: none/.test(rule.body)).length, 1);
});
