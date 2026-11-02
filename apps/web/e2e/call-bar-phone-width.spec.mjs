import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The call bar (the microphone with its devices, captions, skip, the call, ⋮) on a phone: the tray is centred, and no
 * control is cut by, or past, the screen's edges — at 360 and 412px (a Galaxy A54), joined, in each language.
 * SCREENSHOTS=<dir> also writes the bar as a picture. */

const SHOTS = process.env.SCREENSHOTS;
const conversation = { thread_id: "t1", title: "sidevoice-web", available: true, reach: { state: "listening" }, harness: "claude-code" };

async function joined(page, language) {
  await installHarness(page, { participants: { first: [conversation] } });
  await page.addInitScript((ui) => localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: ui })), language);
  await page.goto("/voice/");
  await page.locator(".stage-choose").first().click();
  await page.locator("#participants").getByText("sidevoice-web").first().click();
  await page.locator(".stage-tile[data-mood]").waitFor();
  await page.waitForFunction(() => !!window.sidevoiceUI?.store);
  await page.evaluate(() => {
    const { store } = window.sidevoiceUI;
    const person = store.getState().facts.people.find((p) => p.thread_id === "t1");
    store.patch({ ws: { readyState: 1, send() {}, close() {}, addEventListener() {}, removeEventListener() {} },
      roomBinding: { thread_id: "t1", title: "sidevoice-web" }, sessionId: "s1", callNode: person.node, micEnabled: true, userLive: false, botLive: false,
      voiceState: { listening: "listening", recognising: 0, playback: "idle", microphone: "live" } });
  });
  await page.locator("#call-controls .call-actions").waitFor();
}

const measure = (page) => page.evaluate(() => {
  const box = (node) => { const { left, right, top, bottom, width } = node.getBoundingClientRect(); return { left, right, top, bottom, width }; };
  const tray = document.querySelector("#call-controls .call-actions");
  const controls = [...tray.querySelectorAll(".call-button, #mic-control, #connect, summary")].filter((n) => n.getClientRects().length).map((n) => ({ id: n.id || n.className, ...box(n) }));
  return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, tray: box(tray), controls };
});

for (const language of ["en", "es", "de"]) {
  for (const width of [360, 412]) {
    test.describe(`${language} ${width}px`, () => {
      test.use({ viewport: { width, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      test("every call control is inside the screen and the tray is centred", async ({ page }) => {
        await joined(page, language);
        if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.locator(".call-bar").screenshot({ path: path.join(SHOTS, `call-bar-${language}-${width}.png`) }); }
        const m = await measure(page);
        expect(m.controls.length, "the controls are there").toBeGreaterThanOrEqual(5);
        expect(m.scrollWidth).toBeLessThanOrEqual(m.width);
        for (const control of m.controls) {
          expect(control.left, `${control.id} inside, left`).toBeGreaterThanOrEqual(0);
          expect(control.right, `${control.id} inside, right`).toBeLessThanOrEqual(m.width);
        }
        expect(m.tray.left).toBeGreaterThanOrEqual(0);
        expect(m.tray.right).toBeLessThanOrEqual(m.width);
        expect(Math.abs(m.tray.left - (m.width - m.tray.right)), "centred").toBeLessThanOrEqual(2);
        // Every control's own box, to the pixel, and none overlapping another.
        const buttons = m.controls.filter((c) => c.id !== "mic-control" && !String(c.id).includes("mic-control"));
        for (const a of buttons) for (const b of buttons) if (a !== b) expect(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5, `${a.id} over ${b.id}`).toBe(true);
      });
    });
  }
}
