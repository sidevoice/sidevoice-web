import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The setup's last step (Ready) fits its dialog unscrolled at a desktop's 1280×720 and a phone's 390×844, in English and
 * in Spanish, light and dark: the 64px mark, the six recap rows, and what to tell an agent (the creature beside its title and
 * line, then the phrase to copy). Measured once the page's fonts are in. The body keeps its scroll for shorter windows and
 * zoom; it is never cut (overflow stays auto). */

const READY = { version: 1, basics_done: true, choice: "remote", machine_skipped: true, stt_skipped: true, tts_skipped: true, turn_done: true,
  agents_done: false, completed_at: null, trials: {}, chosen: {}, baseline_release: 0, features: {} };

for (const [width, height] of [[1280, 720], [390, 844]]) {
  for (const [language, theme] of [["en", "light"], ["es", "light"], ["en", "dark"]]) {
    test(`the ready step fits unscrolled at ${width}×${height} in ${language}, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await installHarness(page, { onboarding: READY });
      await page.addInitScript((ui) => localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: ui })), language);
      await page.goto("/voice/");
      await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; }, theme);
      const body = page.locator("#wizard .wizard-body");
      await expect(body.locator(".wizard-ready-connect .agent-message")).toBeVisible();
      await expect(body.locator(".wizard-ready-mark")).toHaveCSS("width", width < 600 ? "56px" : "64px");
      await page.evaluate(() => document.fonts.ready);
      // Compact: the creature to the left of its title and line, sharing their rows; the phrase under all three.
      const geometry = await body.evaluate((node) => {
        const box = (selector) => node.querySelector(".wizard-ready-connect " + selector).getBoundingClientRect();
        const creature = box(".connect-waiting-creature"), title = box(".connect-agent-title"), line = box(".connect-agent-body"), phrase = box(".agent-message");
        return { creature: creature.toJSON(), title: title.toJSON(), line: line.toJSON(), phrase: phrase.toJSON() };
      });
      for (const text of [geometry.title, geometry.line]) {
        expect(geometry.creature.right, "the creature left of its text").toBeLessThanOrEqual(text.left + 0.5);
        // Beside it: their heights overlap, the text neither above nor below the creature.
        expect(text.top, "not below the creature").toBeLessThan(geometry.creature.bottom);
        expect(text.bottom, "not above the creature").toBeGreaterThan(geometry.creature.top);
      }
      expect(geometry.title.bottom, "the title over the line").toBeLessThanOrEqual(geometry.line.top + 0.5);
      const above = Math.max(geometry.creature.bottom, geometry.title.bottom, geometry.line.bottom);
      expect(geometry.phrase.top, "the phrase under all three").toBeGreaterThanOrEqual(above - 0.5);
      const fit = await body.evaluate((node) => ({ scroll: node.scrollHeight, client: node.clientHeight, overflow: getComputedStyle(node).overflowY }));
      expect(fit.overflow).toBe("auto");
      expect(fit.scroll, "nothing below the fold").toBeLessThanOrEqual(fit.client);
    });
  }
}
