const fs = require("node:fs"), test = require("node:test"), assert = require("node:assert/strict");

// The stage's voice cards' stylesheet, comments out and one space per run of whitespace, as rules: selector and body.
const css = fs.readFileSync(__dirname + "/../src/features/call/stage-voice.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
const declared = (selector, property) => rules.find((rule) => rule.selector === selector)?.body.match(new RegExp(`(?:^|[\\s;])${property}: ([^;]+)`))?.[1].trim();

test("the reply card's three lines are centred: one length is its top and bottom padding and the strip the line before shows in", () => {
  const pad = declared(".vcap.card.agent", "--vcap-pad-y");
  assert.ok(pad, "the card names its vertical padding once");
  assert.equal(declared(".vcap.card.agent", "padding-block"), "var(--vcap-pad-y)");
  // The strip is that padding: the window reaches the card's edge, and the lines under it start where the padding ends.
  assert.equal(declared(".vcap .paged-text", "--paged-peek"), "var(--vcap-pad-y)");
});
