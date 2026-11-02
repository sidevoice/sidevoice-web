import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* A confirmation on a phone ("Continue without a machine?", over the first-run setup) is the whole screen, and what it
 * holds keeps a gutter on both sides: its box is the viewport's, its title and body start at least 16px in, and its
 * buttons end at least 16px before the edges. Measured, in the sizes of an iPhone 17 Pro Max (440x956, 3x) and a
 * smaller phone, in light and dark. */

// The setup's record at the step that asks for a machine, where "Skip for now" asks first.
const AT_MACHINE = {
  version: 1, basics_done: true, choice: "remote", agents_done: false, turn_done: false, completed_at: null, trials: {},
  chosen: {}, baseline_release: 0, features: {},
};
const GUTTER = 16;

for (const [name, viewport, scale] of [["an iPhone 17 Pro Max", { width: 440, height: 956 }, 3], ["a smaller phone", { width: 390, height: 844 }, 3]]) {
  for (const theme of ["light", "dark"]) {
    test.describe(`${name}, ${theme}`, () => {
      test.use({ viewport, deviceScaleFactor: scale, hasTouch: true, isMobile: true, colorScheme: theme });

      test("the skip confirmation fits the screen with a gutter on both sides", async ({ page }) => {
        await installHarness(page, { onboarding: AT_MACHINE });
        // No machine paired yet: the setup asks for one.
        await page.addInitScript(() => localStorage.setItem("sidevoice.pairings", JSON.stringify({ pairings: [] })));
        await page.goto("/voice/");
        await page.locator("#wizard-step-skip").click();
        const dialog = page.locator("#wizard-skip-machine");
        await expect(dialog).toBeVisible();
        const boxes = await dialog.evaluate((element) => {
          const rect = (node) => { const { left, right, top, bottom } = node.getBoundingClientRect(); return { left, right, top, bottom }; };
          return {
            width: innerWidth, scrollWidth: document.documentElement.scrollWidth, dialog: rect(element),
            title: rect(element.querySelector(".ui-dialog-title")), body: rect(element.querySelector(".ui-dialog-body > p")),
            close: rect(element.querySelector(".ui-dialog-close")), buttons: [...element.querySelectorAll(".ui-dialog-foot > .ui-button")].map(rect),
          };
        });
        expect(boxes.scrollWidth).toBeLessThanOrEqual(boxes.width);
        expect(Math.round(boxes.dialog.left)).toBe(0);
        expect(Math.round(boxes.dialog.right)).toBe(boxes.width);
        for (const [what, box] of Object.entries({ title: boxes.title, body: boxes.body })) expect(box.left, what).toBeGreaterThanOrEqual(GUTTER - 0.5);
        expect(boxes.body.right, "body").toBeLessThanOrEqual(boxes.width - GUTTER + 0.5);
        expect(boxes.close.right, "close").toBeLessThanOrEqual(boxes.width);
        expect(boxes.buttons.length).toBe(2);
        for (const [index, box] of boxes.buttons.entries()) {
          expect(box.left, `button ${index}`).toBeGreaterThanOrEqual(GUTTER - 0.5);
          expect(box.right, `button ${index}`).toBeLessThanOrEqual(boxes.width - GUTTER + 0.5);
        }
      });
    });
  }
}
