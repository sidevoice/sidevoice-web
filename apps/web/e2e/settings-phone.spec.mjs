import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* Settings on a phone, in real browsers (PHONE-SETTINGS-SPEC part 1): the list of sections, a section's page under it, a
 * machine's page under Machines — one history entry each, so the system's back goes up a level and, from the list,
 * closes Settings without leaving the room; Escape does the same; Close takes every entry back off. */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** What Settings has in the history where the page is now: its levels, or nothing. */
const levels = (page) => page.evaluate(() => history.state?.sidevoiceSettings?.stack ?? null);

test("a phone's Settings: the system's back and Escape go up a level, and from the list close it, in the room still", async ({ page }) => {
  await installHarness(page);
  await page.goto("/voice/");
  await page.waitForFunction(() => !!window.sidevoiceActions);
  const room = page.url();
  const dialog = page.locator("#language-settings");
  const title = page.locator("#settings-title");

  await page.locator("#settings-open").click();
  await expect(dialog).toBeVisible();
  await expect(title).toHaveText("Settings");
  await expect(title).toBeFocused();
  await expect(page.locator("#settings-machines .settings-menu-summary")).toHaveText("E2E Host · Online");
  await page.locator("#settings-machines").click();
  await expect(title).toHaveText("Machines");
  const machine = page.locator(".machines-menu .machine-entry[data-name='E2E Host']");
  await expect(machine).toContainText("Online");
  await machine.click();
  await expect(title).toHaveText("E2E Host");
  await expect(page.getByRole("button", { name: "Back to Machines" })).toBeVisible();
  expect(await levels(page)).toEqual(["list", "machines", expect.any(String)]);

  // The system's back, a level at a time, focus on what led there; from the list, Settings closes.
  await page.goBack();
  await expect(title).toHaveText("Machines");
  await expect(machine).toBeFocused();
  await page.goBack();
  await expect(title).toHaveText("Settings");
  await expect(page.locator("#settings-machines")).toBeFocused();
  await page.goBack();
  await expect(dialog).toBeHidden();
  expect(page.url()).toBe(room);
  await expect(page.locator("h1.brand")).toBeAttached();

  // Opened again it is at the list; Escape from a page goes up, and Close from a page takes its entries off.
  await page.locator("#settings-open").click();
  await expect(title).toHaveText("Settings");
  await page.locator("#settings-advanced").click();
  await expect(title).toHaveText("Advanced");
  await page.keyboard.press("Escape");
  await expect(title).toHaveText("Settings");
  await expect(dialog).toBeVisible();
  await page.locator("#settings-call").click();
  await expect(title).toHaveText("Call");
  await page.locator("#settings-close").click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => levels(page)).toBeNull();
  expect(page.url()).toBe(room);
});
