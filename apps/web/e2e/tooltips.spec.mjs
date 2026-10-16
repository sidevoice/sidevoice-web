import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The (i) beside End of turn and Patience, in real browsers: inside a modal dialog (the setup's, Settings), which lives
 * in the browser's top layer. A tooltip drawn outside it is open and invisible beneath it — so each one is checked to
 * be on top: the element at its centre is the tooltip. On a desktop by hover and by keyboard focus, on a phone by tap. */

// The setup's record at its End of turn step: the basics done, another machine paired, transcription and voice chosen
// (the default settings' keys), the end of turn not yet.
const AT_END_OF_TURN = {
  version: 1, basics_done: true, microphone_done: true, choice: "remote", agents_done: false, turn_done: false, deferred_at: null, completed_at: null, trials: {},
  chosen: { stt: '{"catalog":"local","language":null,"model":"whisper-base"}', tts: '{"catalog":"local","model":"kokoro-82m-v1.0","speed":1,"voice":null}' },
  baseline_release: 0, features: {},
};

/** Whether the tooltip is shown and on top: the element at its centre belongs to it. */
async function tooltipOnTop(page) {
  const tooltip = page.locator(".ui-tooltip").first();
  await expect(tooltip).toBeVisible();
  const box = await tooltip.boundingBox();
  expect(box && box.width > 0 && box.height > 0).toBe(true);
  return page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".ui-tooltip"), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

async function checkInfoTips(page, phone) {
  const tips = page.locator(".ui-infotip:visible");
  await expect(tips).toHaveCount(2);
  for (let index = 0; index < 2; index++) {
    const tip = tips.nth(index);
    if (phone) {
      await tip.tap();
      expect(await tooltipOnTop(page)).toBe(true);
      await tip.tap();
      await expect(page.locator(".ui-tooltip")).toHaveCount(0);
    } else {
      await tip.hover();
      expect(await tooltipOnTop(page)).toBe(true);
      await page.mouse.move(2, 2);
      await expect(page.locator(".ui-tooltip")).toHaveCount(0);
      // By the keyboard (Tab away and back onto it): focus the browser shows, which is what opens it.
      await tip.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(tip).toBeFocused();
      expect(await tooltipOnTop(page)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.locator(".ui-tooltip")).toHaveCount(0);
    }
  }
}

for (const [name, viewport, phone] of [["desktop", { width: 1280, height: 800 }, false], ["phone", { width: 390, height: 844 }, true]]) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch: phone, isMobile: phone });

    test("the setup's End of turn step: each (i) shows its tooltip on top of the dialog", async ({ page }) => {
      await installHarness(page, { onboarding: AT_END_OF_TURN });
      await page.goto("/voice/");
      const wizard = page.locator("#wizard");
      await expect(wizard.locator("#wizard-title")).toHaveText("When your turn ends");
      expect(await wizard.evaluate((element) => element.matches(":modal"))).toBe(true);
      await checkInfoTips(page, phone);
    });

    test("Settings › Call: each (i) shows its tooltip on top of the dialog", async ({ page }) => {
      await installHarness(page);
      await page.goto("/voice/");
      await page.waitForFunction(() => !!window.sidevoiceActions);
      await page.locator(phone ? "#settings-open" : ".sidebar-settings").click();
      const dialog = page.locator("#language-settings");
      await expect(dialog).toBeVisible();
      await page.locator("#settings-call").click();
      await checkInfoTips(page, phone);
    });
  });
}
