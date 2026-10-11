import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The shared Select in real browsers, inside the two modal dialogs that hold most of them — Settings and the first-run
 * setup — which live in the browser's top layer: a list drawn outside them would be open and invisible beneath. So each
 * list is checked to be on top (the element at its centre is the list) and anchored to its box (dropped from it, or,
 * with no room below, raised above it). On a desktop with the mouse and the keyboard, on a phone by tap. */

// The setup's record at its first step, the basics.
const AT_BASICS = {
  version: 1, basics_done: false, choice: null, agents_done: false, turn_done: false, deferred_at: null, completed_at: null, trials: {},
  chosen: {}, baseline_release: 0, features: {},
};

/** The open list of the select `trigger`: shown, on top, and anchored to it. */
async function expectListOnTop(page, trigger) {
  const list = page.locator(".ui-select-content");
  await expect(list).toBeVisible();
  // Its first frame slides in: measured once it has settled.
  await page.waitForFunction(() => document.querySelector(".ui-select-content")?.getAnimations().every((animation) => animation.playState !== "running"));
  const box = await list.boundingBox();
  const anchor = await trigger.boundingBox();
  expect(box && anchor && box.width > 0 && box.height > 0).toBe(true);
  const onTop = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".ui-select-content"), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(onTop).toBe(true);
  const side = await list.getAttribute("data-side");
  if (side === "top") expect(Math.abs(anchor.y - (box.y + box.height))).toBeLessThanOrEqual(8);
  else expect(Math.abs(box.y - (anchor.y + anchor.height))).toBeLessThanOrEqual(8);
  // At least as wide as its box, and over it from edge to edge.
  expect(box.width).toBeGreaterThanOrEqual(anchor.width - 1);
  expect(box.x).toBeLessThanOrEqual(anchor.x + 1);
  expect(box.x + box.width).toBeGreaterThanOrEqual(anchor.x + anchor.width - 1);
  return list;
}

/** Opens `trigger`'s list, checks it, picks the option `value`, and checks the box shows `label`. */
async function pick(page, trigger, value, label, phone) {
  if (phone) await trigger.tap(); else await trigger.click();
  const list = await expectListOnTop(page, trigger);
  const option = list.locator(`[role=option][data-value="${value}"]`);
  if (phone) await option.tap(); else await option.click();
  await expect(list).toHaveCount(0);
  await expect(trigger).toHaveText(label);
  await expect(trigger).toHaveAttribute("data-value", value);
}

/** Opens `trigger`'s list from the keyboard; Escape closes the list alone, and `dialog` stays open. */
async function escapeKeepsDialog(page, trigger, dialog) {
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expectListOnTop(page, trigger);
  await page.keyboard.press("Escape");
  await expect(page.locator(".ui-select-content")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  await expect(trigger).toBeFocused();
}

for (const [name, viewport, phone] of [["desktop", { width: 1280, height: 800 }, false], ["phone", { width: 390, height: 844 }, true]]) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch: phone, isMobile: phone });

    test("the setup's basics: a language picked from a list on top of the dialog, dropped from its box", async ({ page }) => {
      await installHarness(page, { onboarding: AT_BASICS });
      await page.goto("/voice/");
      const wizard = page.locator("#wizard");
      await expect(wizard.locator("#wizard-title")).toHaveText("The basics");
      expect(await wizard.evaluate((element) => element.matches(":modal"))).toBe(true);
      const speech = page.locator("#wizard-speech-language");
      await pick(page, speech, "en", "English", phone);
      if (!phone) await escapeKeepsDialog(page, speech, wizard);
    });

    test("Settings › Advanced: a list on top of Settings, anchored to its box, which goes up near the bottom edge", async ({ page }) => {
      await installHarness(page);
      await page.goto("/voice/");
      await page.waitForFunction(() => !!window.sidevoiceActions);
      await page.locator(phone ? "#settings-open" : ".sidebar-settings").click();
      const dialog = page.locator("#language-settings");
      await expect(dialog).toBeVisible();
      await page.locator("#settings-advanced").click();
      const idle = page.locator("#voice-idle-unload");
      await expect(idle).toBeVisible();
      const other = (await idle.getAttribute("data-value")) === "30" ? "10" : "30";
      await pick(page, idle, other, `After ${other} minutes`, phone);
      if (!phone) await escapeKeepsDialog(page, idle, dialog);
      // With its box at the foot of what Settings shows, the list goes up, still anchored and on top.
      await idle.evaluate((element) => {
        element.closest(".settings-content").style.paddingTop = "100vh";
        element.scrollIntoView({ block: "end" });
      });
      if (phone) await idle.tap(); else await idle.click();
      const list = await expectListOnTop(page, idle);
      await expect(list).toHaveAttribute("data-side", "top");
      await page.keyboard.press("Escape");
      await expect(list).toHaveCount(0);
      await expect(dialog).toBeVisible();
    });
  });
}
