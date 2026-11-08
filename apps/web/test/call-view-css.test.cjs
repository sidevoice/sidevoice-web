const fs = require("node:fs"), test = require("node:test"), assert = require("node:assert/strict");

// The call view's stylesheet, comments out and one space per run of whitespace, as rules: selector and body.
const css = fs.readFileSync(__dirname + "/../src/features/call/call-view.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));

test("the transcript button stays placed in the tile's corner and in the call bar without an unread mark", () => {
  assert.equal(rules.find((rule) => rule.selector === ".transcript-entry-dot"), undefined);
  const button = rules.filter((rule) => /\.transcript-entry(?![-\w])/.test(rule.selector) && /(^|[\s;])position:/.test(rule.body));
  assert.ok(button.length >= 2, "the tile's corner and the call bar both place the button");
  for (const rule of button) assert.doesNotMatch(rule.body, /(^|[\s;])position: static/, rule.selector);
  assert.match(button.find((rule) => rule.selector === ".call-bar-end .transcript-entry").body, /position: relative/);
});
