const fs = require("node:fs"), test = require("node:test"), assert = require("node:assert/strict");

// The call view's stylesheet, comments out and one space per run of whitespace, as rules: selector and body.
const css = fs.readFileSync(__dirname + "/../src/features/call/call-view.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));

test("the transcript button is the box its unread dot sits in, in the tile's corner and in the call bar alike", () => {
  const dot = rules.find((rule) => rule.selector === ".transcript-entry-dot");
  assert.ok(dot, ".transcript-entry-dot has a rule");
  assert.match(dot.body, /position: absolute/);
  // Every rule placing the button itself (not a part of it) keeps it positioned: a static one hands the dot to the
  // nearest positioned box around it (the call bar), loose at the stage's bottom-right edge (desktop trial, item 9).
  const button = rules.filter((rule) => /\.transcript-entry(?![-\w])/.test(rule.selector) && /(^|[\s;])position:/.test(rule.body));
  assert.ok(button.length >= 2, "the tile's corner and the call bar both place the button");
  for (const rule of button) assert.doesNotMatch(rule.body, /(^|[\s;])position: static/, rule.selector);
  assert.match(button.find((rule) => rule.selector === ".call-bar-end .transcript-entry").body, /position: relative/);
});
