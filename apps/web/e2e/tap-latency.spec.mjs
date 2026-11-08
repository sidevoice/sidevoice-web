import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* A tap on a phone must show its answer at once. For the controls that open something (the conversations list, the
 * title's details, the microphone's panel), the time from the click to the opened thing being on screen and opaque is
 * measured in the page itself, in a touch WebKit and Chromium, and bounded (Settings, a whole page, has its own cost
 * and is not held to it). The bound is
 * generous (a CI runner is slow; a regression, work on the main thread that every tap now waits for, or a long
 * fade-in, costs what it did: 130-250 ms here before the fix). A delay of the engine itself (the double-tap wait) cannot
 * be seen in these browsers, so the CSS that removes it is held by its own test. */

const BOUND_MS = Number(process.env.TAP_BOUND_MS ?? 100);
const conversation = { thread_id: "t1", title: "sidevoice-web", available: true, reach: { state: "listening" }, harness: "claude-code" };

async function joined(page) {
  await installHarness(page, { participants: { first: [conversation] } });
  await page.goto("/voice/");
  await page.getByRole("button", { name: /Choose a conversation/ }).first().click();
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
  await page.waitForTimeout(500);
}

/** Taps `trigger`; resolves with the ms from the first pointer down to the first frame in which `target` is laid out
 *  (`shown`) and to the first in which it is also at least 90% opaque, ancestors included (`opaque`). */
async function tapToVisible(page, trigger, targetSelector) {
  await page.evaluate((selector) => {
    window.__tap = new Promise((resolve) => {
      let start = null, shown = null;
      addEventListener("click", () => { start ??= performance.now(); }, { capture: true, once: true });
      const opaque = (node) => { for (let n = node; n; n = n.parentElement) if (+getComputedStyle(n).opacity < 0.9) return false; return true; };
      const frame = () => {
        const node = document.querySelector(selector);
        if (start !== null && node && node.getBoundingClientRect().width > 0 && getComputedStyle(node).visibility !== "hidden") {
          shown ??= performance.now() - start;
          if (opaque(node)) return resolve({ shown, opaque: performance.now() - start });
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }, targetSelector);
  await trigger.tap();
  return page.evaluate(() => window.__tap);
}

const controls = {
  "conversations list": (page) => [page.locator("button.conversations-toggle"), ".conversation-sidebar[data-open]"],
  "title details": (page) => [page.locator("button.stage-heading:visible").first(), ".call-details-popover"],
  "microphone panel": (page) => [page.getByRole("button", { name: "Microphone and speaker" }), "#audio-devices"],
};

test("controls take a tap at once: no double-tap wait on the page nor its buttons", async ({ page }) => {
  await installHarness(page);
  await page.goto("/voice/");
  const wait = await page.evaluate(() => ({ root: getComputedStyle(document.documentElement).touchAction, button: getComputedStyle(document.querySelector("button")).touchAction }));
  expect(wait).toEqual({ root: "manipulation", button: "manipulation" });
});

test.describe("tap to open, on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  for (const [name, find] of Object.entries(controls)) {
    test(`${name} is on screen within ${BOUND_MS} ms of the tap`, async ({ page }) => {
      await joined(page);
      // Five taps, the median measured: one slow frame on a busy runner is not a regression.
      const [trigger, target] = find(page);
      await expect(trigger).toBeVisible();
      const samples = [], shown = [];
      for (let i = 0; i < 5; i++) {
        const got = await tapToVisible(page, trigger, target);
        samples.push(got.opaque); shown.push(got.shown);
        await page.keyboard.press("Escape");
        await page.mouse.click(2, 2).catch(() => {});
        await page.waitForTimeout(500);
      }
      samples.sort((a, b) => a - b);
      const median = samples[2];
      console.log(`TAP ${name}: opaque ${samples.map((s) => s.toFixed(0)).join(" ")} ms (median ${median.toFixed(0)}); first frame shown ${shown.map((s) => s.toFixed(0)).join(" ")}`);
      expect(median).toBeLessThan(BOUND_MS);
    });
  }
});

/* Settings over a call, on a phone: a model's lists open as quickly as the controls above, and the page's Back shows the
 * list at once. The room stays laid out under Settings but is not drawn or styled while Settings covers it: everything a
 * list does to the whole page (a modal list sets the body's pointer-events, a focus matches :has()) restyled the room too,
 * the creatures most, and a phone took seconds to open the transcription model's list (about three times longer here, at
 * a phone's speed). And Back does not wait for the history: a phone's webview answered history.back() up to a second
 * late, and the list only showed then. */
test.describe("Settings over a call, on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

  async function transcription(page) {
    await joined(page);
    await page.locator("#settings-open").tap();
    await page.locator("#settings-transcription").tap();
    await expect(page.locator("#stt-model")).toBeVisible();
    await page.waitForTimeout(300);
  }

  test("the room behind Settings is skipped, and the model's lists open within the bound", async ({ page, browserName }) => {
    await transcription(page);
    const room = await page.evaluate(() => [...document.querySelectorAll("#root > .room-shell > :not(.ui-dialog)")].map((node) => getComputedStyle(node).contentVisibility));
    expect(room.length).toBeGreaterThan(0);
    expect(room.every((value) => value === "hidden")).toBe(true);
    // Timed where the room was the cost (Chromium: Android's webview). WebKit styles a content-visibility: hidden subtree
    // all the same, and a modal list's changes to the whole page cost it more than the bound there: sidevoice-web#446.
    // From the tap to the list's first frame on screen: it then fades in, as it is designed to (--sv-dur-fast).
    for (const id of browserName === "webkit" ? [] : ["#stt-family", "#stt-model"]) {
      const trigger = page.locator(id);
      const samples = [];
      for (let i = 0; i < 5; i++) {
        samples.push((await tapToVisible(page, trigger, ".ui-select-content")).shown);
        await page.keyboard.press("Escape");
        await expect(page.locator(".ui-select-content")).toHaveCount(0);
        await page.waitForTimeout(300);
      }
      samples.sort((a, b) => a - b);
      console.log(`TAP ${id}: shown ${samples.map((s) => s.toFixed(0)).join(" ")} ms (median ${samples[2].toFixed(0)})`);
      expect(samples[2]).toBeLessThan(BOUND_MS);
    }
    // Closed, the room is drawn again.
    await page.getByRole("button", { name: "Back to Settings" }).tap();
    await page.locator("#settings-close").tap();
    await expect(page.locator("#language-settings")).toBeHidden();
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("#root > .room-shell > main")).contentVisibility)).toBe("visible");
  });

  test("Back shows the list at once, whenever the history answers, and the history follows", async ({ page }) => {
    await transcription(page);
    // The history answering a second late, as a phone's webview did.
    await page.evaluate(() => {
      const go = history.go.bind(history), back = history.back.bind(history);
      history.go = (delta) => setTimeout(() => go(delta), 1000);
      history.back = () => setTimeout(back, 1000);
    });
    const levels = () => page.evaluate(() => history.state?.sidevoiceSettings?.stack ?? null);
    const shown = await page.evaluate(() => new Promise((resolve) => {
      let start = null;
      addEventListener("click", () => { start ??= performance.now(); }, { capture: true, once: true });
      const frame = () => {
        if (start !== null && document.getElementById("settings-title")?.textContent === "Settings") return resolve(performance.now() - start);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      document.querySelector("button.settings-back:not([hidden]):not(#settings-close)").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }));
    console.log(`TAP Back: the list in ${shown.toFixed(0)} ms`);
    expect(shown).toBeLessThan(BOUND_MS);
    // Its entry still there until the history answers; a section opened meanwhile takes its own entry after it.
    expect(await levels()).toEqual(["list", "transcription"]);
    await page.waitForTimeout(500);
    await page.locator("#settings-voice").tap();
    await expect(page.locator("#settings-title")).toHaveText("Voice");
    await expect.poll(levels, { timeout: 3000 }).toEqual(["list", "voice"]);
    // And the system's back still goes up from there.
    await page.evaluate(() => { delete history.go; delete history.back; });
    await page.goBack();
    await expect(page.locator("#settings-title")).toHaveText("Settings");
    expect(await levels()).toEqual(["list"]);
  });
});
