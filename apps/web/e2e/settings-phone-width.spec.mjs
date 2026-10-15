import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* Settings on the narrowest phone (360px): no section is wider than the screen. Nothing scrolls sideways, and nothing
 * sticks out of the card it sits in (an overflow a card does not clip still crosses its border). Seeded with what made
 * sections overflow: a model run on the graphics card (its long "how it runs" line), downloaded models not in use (their
 * size and when they were last used), a provider connected; in Spanish, German and Polish too, whose words are longer
 * — German on a 320px screen as well, the narrowest still sold. */

test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

const build = (id, installed, extra = {}) => ({ id, backend: "transformers.js", precision: "fp16", accelerator: "webgpu", acceleratorClass: "gpu", downloadBytes: 1_600e6,
  memoryMb: 1900, available: true, reasons: [], installed, ...extra });
const model = (id, family, task, installed, extra = {}) => ({ id, family, capabilities: [task], parametersM: 809, license: "MIT",
  languages: ["es", "en", "de", "fr", "it", "pt", "nl", "pl"], voices: [], installed, builds: [build(id + "/fp16", installed)],
  recommendedBuild: id + "/fp16", ...extra });
const DAY = 86_400_000;
const CATALOGS = [
  { id: "local", name: null, status: { stale: false }, models: [
    model("whisper-large-v3-turbo", "whisper", "stt", true),
    model("whisper-small", "whisper", "stt", true, { lastUsedAt: Date.now() - 120 * DAY }),
    model("kokoro-82m-v1.0", "kokoro", "tts", true, { voices: [{ id: "ef_dora", languages: ["es"], gender: "female" }] }),
    model("kokoro-82m-v0.19", "kokoro", "tts", true, { lastUsedAt: Date.now() - 45 * DAY }),
    model("smart-turn-v3.2", "smart-turn", "end-of-turn", true),
  ] },
  { id: "elevenlabs", name: "ElevenLabs", status: { stale: false }, models: [{ id: "scribe_v2", capabilities: ["stt"], languages: [], voices: [] }] },
  { id: "openai", name: "OpenAI", status: { stale: false, reason: { code: "credential-missing", params: {} } }, models: [] },
];

/** What sticks out: the page wider than the screen, a scroller wider than itself, or an element past the edges of the
 *  nearest box around it (a border, a background, or a clip), unless cut by an ellipsis on purpose. */
const overflow = (page) => page.evaluate(() => {
  const width = innerWidth;
  const found = [];
  if (document.documentElement.scrollWidth > width) found.push(`page ${document.documentElement.scrollWidth}px`);
  const dialog = document.getElementById("language-settings");
  for (const element of dialog.querySelectorAll("*")) {
    if (element.closest("[hidden], .sr-only, .ui-logo") || (element.closest("svg") && element.tagName !== "svg")) continue;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (!rect.width || !rect.height || style.visibility === "hidden" || style.position === "absolute" || style.position === "fixed") continue;
    if (["auto", "scroll"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1) found.push(`${element.className} scrolls sideways`);
    let box = null;
    for (let parent = element.parentElement; parent && parent !== dialog; parent = parent.parentElement) {
      const around = getComputedStyle(parent);
      if (around.display === "contents") continue;
      const drawn = parseFloat(around.borderRightWidth) > 0 || !["rgba(0, 0, 0, 0)", "transparent"].includes(around.backgroundColor);
      if (around.overflowX !== "visible" || drawn) { box = parent; break; }
    }
    if (style.textOverflow === "ellipsis" || (box && getComputedStyle(box).textOverflow === "ellipsis")) continue;
    const edges = box ? box.getBoundingClientRect() : { left: 0, right: width };
    if (rect.right > Math.min(width, edges.right) + 1 || rect.left < Math.max(0, edges.left) - 1)
      found.push(`${element.tagName.toLowerCase()}.${element.className} "${element.textContent.trim().slice(0, 30)}" ${Math.round(rect.left)}–${Math.round(rect.right)}px in ${box ? box.className : "the screen"} ${Math.round(edges.left)}–${Math.round(edges.right)}px`);
  }
  return found;
});

for (const [language, width] of [["en", 360], ["es", 360], ["de", 360], ["pl", 360], ["de", 320]]) {
  test(`every Settings section fits a ${width}px phone (${language})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.addInitScript((ui) => localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: ui })), language);
    await installHarness(page);
    await page.goto("/voice/");
    await page.waitForFunction(() => !!window.sidevoiceActions && !!window.sidevoiceUI?.store);
    const seed = () => page.evaluate((catalogs) => {
      const settings = { ...window.sidevoiceUI.store.getState().facts.voiceSettings, stt: { catalog: "local", model: "whisper-large-v3-turbo", language: null } };
      window.sidevoiceUI.store.patch({
        voiceCatalogue: { state: "ready", catalogs, error: "" }, modelsRemovable: true, providerKeys: { elevenlabs: true, openai: false },
        voiceSettings: settings, voiceDraft: settings,
      });
    }, CATALOGS);

    await page.locator("#settings-open").click();
    await seed();
    const sections = await page.locator("#language-settings .settings-menu-row[id^='settings-']").evaluateAll((rows) => rows.map((row) => row.id));
    expect(sections.length).toBeGreaterThan(4);
    expect(await overflow(page), "the list").toEqual([]);
    for (const id of sections) {
      await page.locator("#" + id).click();
      await seed();
      // Its "how it runs" open too, where it has one.
      for (const fold of await page.locator(".model-runtime-toggle[aria-expanded='false']:visible").all()) await fold.click();
      if (id === "settings-transcription") await expect(page.locator(".model-runtime-summary:visible")).toContainText("WebGPU");
      await page.waitForTimeout(350);
      expect(await overflow(page), id).toEqual([]);
      await page.goBack();
      await expect(page.locator("#" + id)).toBeVisible();
    }
  });
}
