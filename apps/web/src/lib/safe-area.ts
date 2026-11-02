/* Where a floating panel (a popover, a menu, a tooltip, a select's list) keeps off the screen's edges: its own margin, and
 * where the screen has an edge of its own (the status bar, the notch, the home indicator), that inset. The insets are the
 * page's one place that reads them, `--sv-inset-*` on the root (styles/app.css), 0 in a browser window. Read as the panel
 * opens, so a turned phone's are the current ones. They are registered lengths (styles/app.css), so what is read here is
 * pixels, never the text of the `env()` that holds them. */
export function collisionPadding(margin = 12): { top: number; right: number; bottom: number; left: number } {
  const style = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  const inset = (side: string) => Math.max(margin, Number.parseFloat(style?.getPropertyValue(`--sv-inset-${side}`) ?? "") || 0);
  return { top: inset("top"), right: inset("right"), bottom: inset("bottom"), left: inset("left") };
}
