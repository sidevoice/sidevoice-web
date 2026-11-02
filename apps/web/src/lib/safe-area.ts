/* Where a floating panel (a popover, a menu, a tooltip, a select's list) keeps off the screen's edges: its own margin, and
 * where the screen has an edge of its own (the status bar, the notch, the home indicator), that inset. The insets are the
 * page's one place that reads them, `--sv-inset-*` on the root (styles/app.css), 0 in a browser window. Read as the panel
 * opens, so a turned phone's are the current ones.
 *
 * The property holds `env(safe-area-inset-*)` and an unregistered custom property is never resolved: reading it returns
 * that text, which is no number (a phone's tooltips then ignored the notch and the home indicator). So it is read where
 * the engine resolves it: as the padding of a probe, in pixels. */
export function collisionPadding(margin = 12): { top: number; right: number; bottom: number; left: number } {
  const sides = ["top", "right", "bottom", "left"] as const;
  const read: Record<(typeof sides)[number], number> = { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof document !== "undefined" && document.body) {
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;box-sizing:content-box;"
      + sides.map((side) => `padding-${side}:var(--sv-inset-${side},0px);`).join("");
    document.body.append(probe);
    const style = getComputedStyle(probe);
    for (const side of sides) read[side] = Number.parseFloat(style.getPropertyValue(`padding-${side}`)) || 0;
    probe.remove();
  }
  return { top: Math.max(margin, read.top), right: Math.max(margin, read.right), bottom: Math.max(margin, read.bottom), left: Math.max(margin, read.left) };
}
