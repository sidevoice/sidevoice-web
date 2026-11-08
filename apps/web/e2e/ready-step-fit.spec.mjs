import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The setup's last step (Ready) fits its dialog unscrolled at a desktop's 1280×720 and a phone's 390×844, in English and
 * in Spanish: the 64px mark, the six recap rows, and what to tell an agent (the creature beside its title and line, then the
 * phrase to copy). The body keeps its scroll for shorter windows and zoom; it is never cut (overflow stays auto). */

const READY = { version: 1, basics_done: true, choice: "remote", machine_skipped: true, stt_skipped: true, tts_skipped: true, turn_done: true,
  agents_done: false, completed_at: null, trials: {}, chosen: {}, baseline_release: 0, features: {} };

for (const [width, height] of [[1280, 720], [390, 844]]) {
  for (const language of ["en", "es"]) {
    test(`the ready step fits unscrolled at ${width}×${height} in ${language}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await installHarness(page, { onboarding: READY });
      await page.addInitScript((ui) => localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: ui })), language);
      await page.goto("/voice/");
      const body = page.locator("#wizard .wizard-body");
      await expect(body.locator(".wizard-ready-connect .agent-message")).toBeVisible();
      await expect(body.locator(".wizard-ready-mark")).toHaveCSS("width", width < 600 ? "56px" : "64px");
      const fit = await body.evaluate((node) => ({ scroll: node.scrollHeight, client: node.clientHeight, overflow: getComputedStyle(node).overflowY }));
      expect(fit.overflow).toBe("auto");
      expect(fit.scroll, "nothing below the fold").toBeLessThanOrEqual(fit.client);
    });
  }
}
