import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* Developer options are unlocked by tapping the build in Settings › Advanced ten times (developer-mode.ts), on a
 * phone too, where This device is not in the list: with a real touch tap(), and the keyboard's Enter and Space. */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function openAdvanced(page, channel) {
  await installHarness(page);
  await page.addInitScript((channel) => {
    window.__sidevoiceHost = { host: { build: { channel, version: "0.2.1-nightly.608" } } };
  }, channel);
  await page.goto("/voice/");
  await page.waitForFunction(() => !!window.sidevoiceActions);
  await page.locator("#settings-open").click();
  await page.locator("#settings-advanced").click();
  await expect(page.locator("#settings-title")).toHaveText("Advanced");
}

test("on a phone, ten touch taps on the build of a nightly turn developer mode on, and ten more turn it off", async ({ page }) => {
  await openAdvanced(page, "nightly");
  const build = page.getByRole("button", { name: /\S/ }).filter({ has: page.locator("#build-id") });
  await expect(build).toHaveCSS("touch-action", "manipulation");
  for (let i = 0; i < 10; i++) await build.tap();
  await expect(page.getByRole("status").filter({ hasText: "Developer mode on" })).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem("sidevoiceDeveloperMode"))).toBe("1");
  for (let i = 0; i < 10; i++) await build.tap();
  await expect(page.getByRole("status").filter({ hasText: "Developer mode off" })).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem("sidevoiceDeveloperMode"))).toBeNull();
});

test("the build answers the keyboard: Enter and Space count as taps", async ({ page }) => {
  await openAdvanced(page, "nightly");
  const build = page.getByRole("button", { name: /\S/ }).filter({ has: page.locator("#build-id") });
  await build.focus();
  for (let i = 0; i < 5; i++) { await page.keyboard.press("Enter"); await page.keyboard.press("Space"); }
  expect(await page.evaluate(() => localStorage.getItem("sidevoiceDeveloperMode"))).toBe("1");
});

test("outside a nightly the build is only text", async ({ page }) => {
  await openAdvanced(page, "release");
  await expect(page.locator("#build-id")).toBeVisible();
  await expect(page.locator("button:has(#build-id)")).toHaveCount(0);
});
