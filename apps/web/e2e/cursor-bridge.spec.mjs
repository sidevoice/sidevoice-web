import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { installHarness, listing } from "./harness.mjs";

const bridge = (state) => ({
  state, reason: state === "unknown" ? "cursor_version_unknown" : "bridge_stale",
  cursor_version: state === "unknown" ? null : "3.22.12",
  minimum_cursor_version: "3.22.12", minimum_connector_version: "0.9.0",
  steps: ["cursor_version", "enable_desktop_bridge", "bridge_running", "sqlite3", "register_sidevoice", "join_editor_chat", "wait_for_chat_registration"]
    .map((id) => ({ id, state: id === "join_editor_chat" || id === "enable_desktop_bridge" ? "unknown" : "done" })),
});

for (const [language, width, state] of [
  ["it", 320, "unknown"], ["it", 390, "unknown"], ["es", 320, "unknown"],
  ["fr", 320, "unknown"], ["pl", 320, "unknown"], ["it", 320, "needs_attention"],
]) {
  test(`Cursor bridge disclosure fits ${width}px in ${language} (${state})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await installHarness(page, { agents: { ...listing(), agents: [
      ...listing().agents,
      { id: "cursor", label: "Cursor", present: true, version: "3.22.12", registration: "connected", connect: "auto", cursor_bridge: bridge(state) },
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
    // Test actual glyph boxes, not just the button: the row clips overflow at the edge.
    for (const selector of [".host-agent-bridge-labels > span:first-child", ".host-agent-bridge-state", ".host-agent-bridge-toggle .ui-button-content > svg"]) {
      expect(await row.locator(selector).evaluate((element) => {
        const box = element.getBoundingClientRect();
        const clip = element.closest(".host-agent-rows").getBoundingClientRect();
        return box.width > 0 && box.left >= clip.left - 1 && box.right <= clip.right + 1;
      }), `${selector} in ${language} at ${width}px`).toBe(true);
    }
    await toggle.click();
    const quote = row.locator(".host-agent-bridge-steps .ui-quote");
    await expect(quote).toBeVisible();
    await expect(quote.getByRole("button")).toBeVisible();
    expect(await quote.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const clip = element.closest(".host-agent-rows").getBoundingClientRect();
      return box.left >= clip.left - 1 && box.right <= clip.right + 1;
    })).toBe(true);
    if (process.env.WEB98_SCREENSHOTS) {
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
          document.documentElement.style.colorScheme = value;
        }, theme);
        await row.screenshot({ path: join(process.env.WEB98_SCREENSHOTS, `cursor-narrow-${language}-${width}-${state}-${theme}.png`) });
        await quote.locator("..").screenshot({ path: join(process.env.WEB98_SCREENSHOTS, `cursor-narrow-${language}-${width}-${state}-${theme}-quote.png`) });
      }
    }
  });
}
