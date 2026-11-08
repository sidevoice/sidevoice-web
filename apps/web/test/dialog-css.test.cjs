const fs = require("node:fs"), test = require("node:test"), assert = require("node:assert/strict");

// The shared components' stylesheet, comments out and one space per run of whitespace, as rules: selector and body.
// What a phone's media query holds is read apart.
const css = fs.readFileSync(__dirname + "/../src/components/ui/ui.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const rules = (text) => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
const at = css.indexOf("@media (max-width: 599px) {");
const end = css.indexOf("} }", at) + 3;
const phone = rules(css.slice(at, end).replace(/^@media[^{]+\{/, ""));
const outside = rules(css.slice(0, at) + css.slice(end));
const find = (list, selector) => list.find((rule) => rule.selector === selector);

// Real browsers draw it (e2e/provider-dialog.spec.mjs), but CI's WebKit is newer than the macOS app's: this holds the
// rule itself.
test("a card dialog grows with what it holds: its cap is its own, never a percentage of the dialog's fit-content height", () => {
  assert.notEqual(at, -1, "a phone's media query");
  // WebKit up to Safari 26 resolves a percentage max-height against a dialog's fit-content height as 0.
  for (const rule of [...outside, ...phone].filter((rule) => rule.selector.includes(".ui-dialog-surface")))
    assert.doesNotMatch(rule.body, /max-height: \d+%/, rule.selector);
  assert.match(find(outside, '.ui-dialog[data-layout="dialog"] .ui-dialog-surface').body, /max-height: min\(85dvh, 760px\)/);
  assert.doesNotMatch(find(outside, '.ui-dialog[data-layout="dialog"]').body, /max-height/, "one cap, on the card");
  // A phone's is the whole screen: the card's cap is lifted there.
  assert.match(find(phone, '.ui-dialog[data-layout="dialog"] .ui-dialog-surface').body, /height: 100%; max-height: none/);
});

// A confirmation on a phone (the setup's "Continue without a machine?") is the whole screen, and its head, body and
// footer keep a gutter on both sides, never less than the screen's own safe-area inset.
test("a dialog on a phone stretches between the screen's edges and keeps a gutter on both sides", () => {
  const dialog = find(phone, '.ui-dialog[data-layout="dialog"]').body;
  assert.match(dialog, /inset: 0/);
  assert.match(dialog, /width: auto/);
  assert.doesNotMatch(dialog, /100vw/, "100vw is the layout viewport's width, not the screen's");
  for (const part of [".ui-dialog-head", ".ui-dialog-body", ".ui-dialog-foot"]) {
    const padding = find(phone, part).body.match(/padding: ([^;]+);/)[1];
    assert.match(padding, /max\(var\(--sv-space-4\), env\(safe-area-inset-right\)\)/, `${part}: right`);
    assert.match(padding, /max\(var\(--sv-space-4\), env\(safe-area-inset-left\)\)/, `${part}: left`);
  }
});
