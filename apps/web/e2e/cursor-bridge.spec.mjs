import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { installHarness, listing } from "./harness.mjs";

const readiness = (preset) => preset === "unknown_code"
  ? { state: "needs_attention", reasons: ["cursor.future_code"] }
  : preset === "needs_attention" ? { state: "needs_attention", reasons: ["cursor.bridge_not_running"] }
  : preset === "unsupported" ? { state: "unsupported", reasons: ["cursor.unsupported"] }
  : { state: "ready", reasons: [] };

async function show(page, { width, height, language = "en", preset }) {
  await page.setViewportSize({ width, height });
  await installHarness(page, { agents: { ...listing(), agents: [
    ...listing().agents,
    { id: "cursor", label: "Cursor", present: true, version: null, registration: "connected", connect: "auto",
      readiness: { ...readiness(preset), extra_future_field: "ignored" } },
  ] } });
  await page.addInitScript((ui) => localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: ui })), language);
  await page.goto("/voice/");
  await page.waitForFunction(() => !!window.sidevoiceActions);
  await page.waitForFunction(() => typeof document.getElementById("settings-open")?.onclick === "function");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#settings-machines").click();
  const cursor = page.locator(".host-agent-row").filter({ has: page.locator(".host-agent-name strong", { hasText: "Cursor" }) });
  if (!(await cursor.isVisible())) await page.locator(".machines-menu .machine-entry[data-name='E2E Host']").click();
  const codex = page.locator(".host-agent-row").filter({ has: page.locator(".host-agent-name strong", { hasText: "Codex" }) });
  await expect(cursor).toBeVisible();
  await expect(codex.locator(".host-agent-readiness")).toHaveCount(0);
  const panel = cursor.locator(".host-agent-readiness");
  await expect(panel).toBeVisible();
  if (preset === "ready") {
    await expect(panel).toContainText("Ready");
    await expect(panel.locator("button")).toHaveCount(0);
  } else if (preset === "unsupported") {
    await expect(panel).toContainText(language === "en" ? "Not supported" : "");
    await expect(panel.locator("button")).toHaveCount(0);
  } else {
    await panel.locator(".host-agent-readiness-toggle").click();
    await expect(panel.locator(".host-agent-readiness-body p")).toHaveCount(1);
    if (preset === "needs_attention") await expect(panel).toContainText("Settings → Beta");
    else {
      await expect(panel).toContainText(language === "en" ? "Sidevoice cannot show why" : "Sidevoice");
      await expect(panel).not.toContainText("cursor.future_code");
    }
  }
  return { cursor, codex, panel };
}

for (const preset of ["ready", "needs_attention", "unsupported", "unknown_code"]) {
  for (const [view, width, height] of [["desktop", 1280, 900], ["phone", 390, 844]]) {
    test(`agent readiness ${preset} on ${view}`, async ({ page }) => {
      const { cursor, codex, panel } = await show(page, { width, height, preset });
      await expect(panel).not.toContainText("sqlite3");
      await expect(panel).not.toContainText("Join the Sidevoice");
      if (process.env.WEB98_SCREENSHOTS) {
        for (const theme of ["light", "dark"]) {
          await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.documentElement.style.colorScheme = value; }, theme);
          await cursor.screenshot({ path: join(process.env.WEB98_SCREENSHOTS, `readiness-${preset}-${theme}-${view}.png`) });
          if (preset === "ready") await codex.screenshot({ path: join(process.env.WEB98_SCREENSHOTS, `codex-existing-${theme}-${view}.png`) });
        }
      }
    });
  }
}

for (const language of ["de", "fr"]) {
  test(`readiness explanation fits a 320px ${language} phone`, async ({ page }) => {
    const { cursor } = await show(page, { width: 320, height: 700, language, preset: "needs_attention" });
    for (const selector of [".host-agent-readiness-state", ".host-agent-readiness-body p"]) {
      const element = cursor.locator(selector);
      expect(await element.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const clip = node.closest(".host-agent-rows").getBoundingClientRect();
        return box.width > 0 && box.left >= clip.left - 1 && box.right <= clip.right + 1;
      }), `${selector} in ${language}`).toBe(true);
    }
    if (process.env.WEB98_SCREENSHOTS) {
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.documentElement.style.colorScheme = value; }, theme);
        await cursor.screenshot({ path: join(process.env.WEB98_SCREENSHOTS, `readiness-narrow-${language}-320-${theme}.png`) });
      }
    }
  });
}
