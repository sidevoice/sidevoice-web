const fs = require("node:fs"), test = require("node:test"), assert = require("node:assert/strict");

// The pairing form's stylesheet, without comments and one space per run of whitespace, so a rule reads the same however
// it is wrapped.
const css = fs.readFileSync(__dirname + "/../src/features/pairing/pairing.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
// Every rule whose whole selector is `selector`, one after another: it may have more than one.
const rules = (selector) => {
  const found = [];
  for (let at = css.indexOf(selector + " {"); at !== -1; at = css.indexOf(selector + " {", at + 1)) {
    // Its own selector, not the end of a longer one: what comes before it closes a rule or opens a block.
    if (!/(^|[{}])\s*$/.test(css.slice(0, at))) continue;
    found.push(css.slice(at, css.indexOf("}", at)));
  }
  assert.notEqual(found.length, 0, `${selector} has a rule`);
  return found.join(" ");
};

test("the address's link turns its chevron as it opens: sideways folded, pointing down open, mirrored right to left", () => {
  assert.match(rules(".pairing-address-link svg"), /transform: rotate\(-90deg\)/);
  assert.match(rules(".pairing-address-link svg"), /transition: transform/);
  assert.match(rules('.pairing-address-link[aria-expanded="true"] svg'), /transform: none/);
  assert.match(rules(".pairing-address-link svg:dir(rtl)"), /transform: rotate\(90deg\)/);
  assert.match(rules('.pairing-address-link[aria-expanded="true"] svg:dir(rtl)'), /transform: none/);
});

test("open, the address's field shows no label, and keeps it for assistive tech: clipped out of sight, never display: none", () => {
  const head = rules(".pairing-address .ui-field-head");
  assert.match(head, /position: absolute/);
  assert.match(head, /clip-path: inset\(50%\)/);
  assert.match(head, /overflow: hidden/);
  assert.doesNotMatch(head, /display: none|visibility: hidden/);
});
