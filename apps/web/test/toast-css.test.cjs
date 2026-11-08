const fs = require("node:fs"), test = require("node:test"), assert = require("node:assert/strict");

// The toast is not a tooltip: it keeps its own dark card (light and dark theme) when the tooltips take the soft brand look.
const flat = (file) => fs.readFileSync(__dirname + "/../src/" + file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

test("the toast reads its own tokens, with the values it had before the tooltip changed", () => {
  const patterns = flat("design-system/app-patterns.css");
  const toast = patterns.slice(patterns.indexOf(".pt-toast {"), patterns.indexOf("}", patterns.indexOf(".pt-toast {")));
  assert.match(toast, /background: var\(--sv-toast-bg\)/);
  assert.match(toast, /color: var\(--sv-toast-text\)/);
  assert.doesNotMatch(toast, /--sv-tooltip/);
  const theme = flat("styles/theme.css");
  assert.match(theme, /--sv-toast-bg: #2a1a40; --sv-toast-text: #ffffff;/);
  assert.match(theme, /--sv-toast-bg: #fafafa; --sv-toast-text: #18181b;/);
});
