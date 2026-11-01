import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The room's shell keeps off the screen's own edges: the header starts below the status bar, the call bar ends above the
 * home indicator, and a turned phone keeps off the notch. Playwright cannot emulate `env(safe-area-inset-*)`, so the page's
 * one place that reads them (`--sv-inset-*` on the root, styles/app.css) is set the way a phone sets it. In a browser
 * window the insets are 0 and nothing moves. */

const PHONE = { top: 59, bottom: 34, left: 0, right: 0 };
const TURNED = { top: 0, bottom: 21, left: 59, right: 59 };

const inset = (page, insets) => page.evaluate((values) => {
  for (const [side, px] of Object.entries(values)) document.documentElement.style.setProperty(`--sv-inset-${side}`, `${px}px`);
}, insets);

/** Where the header's things and the call bar's last control are, against the screen. */
const geometry = (page) => page.evaluate(() => {
  const rect = (node) => { const { left, right, top, bottom } = node.getBoundingClientRect(); return { left, right, top, bottom }; };
  const header = document.querySelector(".room-header");
  const shown = header.getClientRects().length > 0;
  const inner = shown ? [...header.querySelectorAll("button, a, img, svg")].filter((node) => node.getBoundingClientRect().width > 0).map(rect) : [];
  const main = document.querySelector(".room-shell > main");
  const bar = document.querySelector(".room-shell .call-bar");
  const controls = bar ? [...bar.querySelectorAll("button")].map(rect) : [];
  return {
    width: innerWidth, height: innerHeight, header: shown ? rect(header) : null, main: rect(main),
    topOfHeaderItems: shown ? Math.min(...inner.map((box) => box.top)) : null, leftOfHeaderItems: shown ? Math.min(...inner.map((box) => box.left)) : null,
    rightOfHeaderItems: shown ? Math.max(...inner.map((box) => box.right)) : null, bottomOfBar: controls.length ? Math.max(...controls.map((box) => box.bottom)) : null, barPadding: bar ? parseFloat(getComputedStyle(bar).paddingBottom) : null,
  };
});

for (const [name, viewport, insets] of [["a phone", { width: 440, height: 956 }, PHONE], ["a phone turned", { width: 956, height: 440 }, TURNED]]) {
  test.describe(name, () => {
    test.use({ viewport, deviceScaleFactor: 3, hasTouch: true, isMobile: true });

    test("the room keeps off the screen's edges", async ({ page }) => {
      await installHarness(page);
      await page.goto("/voice/");
      await expect(page.locator(".room-shell > main")).toBeVisible();
      const before = await geometry(page);
      await inset(page, insets);
      const after = await geometry(page);
      // The room keeps off the notch at the sides, and the call bar off the home indicator.
      expect(after.main.left).toBeGreaterThanOrEqual(insets.left - 0.5);
      expect(after.main.right).toBeLessThanOrEqual(after.width - insets.right + 0.5);
      // Where the header shows (a phone held upright) it grows by the status bar's height and starts its content below it.
      if (after.header) {
        expect(after.header.bottom - after.header.top).toBeCloseTo(before.header.bottom - before.header.top + insets.top, 0);
        expect(after.topOfHeaderItems).toBeGreaterThanOrEqual(insets.top - 0.5);
        expect(after.leftOfHeaderItems).toBeGreaterThanOrEqual(insets.left - 0.5);
        expect(after.rightOfHeaderItems).toBeLessThanOrEqual(after.width - insets.right + 0.5);
      }
      // The call bar is there, and its bottom padding grew by exactly the home indicator's height.
      expect(after.bottomOfBar, "the call bar").not.toBeNull();
      expect(after.bottomOfBar).toBeLessThanOrEqual(after.height - insets.bottom + 0.5);
      expect(after.barPadding - before.barPadding).toBeCloseTo(insets.bottom, 0);
    });
  });
}

test("with no insets nothing moves", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await installHarness(page);
  await page.goto("/voice/");
  const main = page.locator(".room-shell > main");
  await expect(main).toBeVisible();
  const box = await main.boundingBox();
  expect(box.x).toBe(0);
  expect(box.width).toBe(1280);
});
