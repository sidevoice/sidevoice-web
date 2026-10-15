import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { installHarness, listing } from "./harness.mjs";

for (const [language, width] of [["de", 320], ["fr", 320], ["it", 320], ["es", 320], ["pl", 320]]) {
  test(`simple Cursor bridge instruction fits ${width}px in ${language}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await installHarness(page, { agents: { ...listing(), agents: [
      ...listing().agents,
      { id: "cursor", label: "Cursor", present: true, version: null, registration: "connected", connect: "auto",
        cursor_bridge: { state: "not_running", chat_known: null } },
    ] } });
    await page.addInitScript((ui) => localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: ui })), language);
    await page.goto("/voice/");
    await page.waitForFunction(() => !!window.sidevoiceActions);
    await page.locator("#settings-open").click();
    await page.locator("#settings-machines").click();
    await page.locator(".machines-menu .machine-entry[data-name='E2E Host']").click();
    const row = page.locator(".host-agent-row").filter({ has: page.locator(".host-agent-bridge") });
    const toggle = row.locator(".host-agent-bridge-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(row.locator(".host-agent-bridge-body p")).toHaveCount(2);
    await expect(row.locator(".host-agent-bridge-body")).toContainText("Settings → Beta");
    await expect(row.locator(".host-agent-bridge-body")).not.toContainText("sqlite3");
    for (const selector of [".host-agent-bridge-labels > span:first-child", ".host-agent-bridge-state", ".host-agent-bridge-body p"]) {
      for (const element of await row.locator(selector).all()) {
        expect(await element.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const clip = node.closest(".host-agent-rows").getBoundingClientRect();
          return box.width > 0 && box.left >= clip.left - 1 && box.right <= clip.right + 1;
        }), `${selector} in ${language} at ${width}px`).toBe(true);
      }
    }
    if (process.env.WEB98_SCREENSHOTS) {
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.documentElement.style.colorScheme = value; }, theme);
        await row.screenshot({ path: join(process.env.WEB98_SCREENSHOTS, `cursor-narrow-${language}-${width}-not_running-${theme}.png`) });
      }
    }
  });
}
