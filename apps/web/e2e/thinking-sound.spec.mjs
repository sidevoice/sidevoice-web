import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The thinking sound (Settings → Call, "Thinking sound": never, screen off, always) in a real browser: while the agent
 * works on the person's turn in a call, a soft breath plays through Web Audio, by the setting and whether the page is
 * shown (sidevoice-web#439). The page's Web Audio is watched, not heard: a source started in its context and not stopped
 * is the breath playing. Whether the browser lets that context run is the Join tap's (it is begun there:
 * test/room-session-controller.test.cjs); a real join is not run here, and a headless browser may have no audio device. */

const THREAD = "t1";
const conversation = { thread_id: THREAD, title: "sidevoice-web", available: true, reach: { state: "listening" }, harness: "claude-code" };

/** Every AudioContext the page makes, and the sources started in it and not stopped. */
function watchWebAudio() {
  const Native = window.AudioContext;
  const contexts = [];
  window.__breath = { contexts, playing: () => contexts.some((entry) => entry.sources > 0) };
  window.AudioContext = class extends Native {
    constructor(...args) {
      super(...args);
      const entry = { context: this, sources: 0 };
      contexts.push(entry);
      const make = this.createBufferSource.bind(this);
      this.createBufferSource = () => {
        const source = make();
        const start = source.start.bind(source), stop = source.stop.bind(source);
        let counted = false;
        source.start = (...a) => { start(...a); if (!counted) { counted = true; entry.sources++; } };
        source.stop = (...a) => { stop(...a); if (counted) { counted = false; entry.sources--; } };
        return source;
      };
    }
  };
}

/** The page shown or hidden, as the browser would say it (a tab in the background, a phone's screen off). */
async function setHidden(page, hidden) {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

async function inCall(page, presence) {
  await page.addInitScript(watchWebAudio);
  await page.addInitScript((presence) => localStorage.setItem("sidevoice.call-preferences", JSON.stringify({ presence, keepAwake: false })), presence);
  await installHarness(page, { participants: { first: [conversation] } });
  // The call is the page's own state: nothing answers the room's binding poll, which would end it.
  await page.route((url) => url.pathname === "/api/presentation", (route) => route.abort());
  await page.goto("/voice/");
  const narrow = await page.evaluate(() => matchMedia("(max-width: 899px)").matches);
  if (narrow) await page.getByRole("button", { name: /Choose a conversation/ }).first().click();
  await page.locator("#participants").getByText("sidevoice-web").first().click();
  await page.locator(".stage-tile[data-mood]").waitFor();
  await page.waitForFunction(() => !!window.sidevoiceUI?.store);
  return page.evaluate(() => {
    const { store } = window.sidevoiceUI;
    const person = store.getState().facts.people.find((p) => p.thread_id === "t1");
    store.patch({ ws: { readyState: 1, send() {}, close() {}, addEventListener() {}, removeEventListener() {} },
      roomBinding: { thread_id: "t1", title: "sidevoice-web" }, sessionId: "s1", callNode: person.node, micEnabled: true, userLive: false, botLive: false,
      voiceState: { listening: "listening", recognising: 0, playback: "idle", microphone: "live" } });
    return `${person.node}|t1`;
  });
}

const work = (page, key, busy) => page.evaluate(({ key, busy }) => window.sidevoiceUI.store.patch(busy
  ? { harness: { [key]: true }, workingSince: { [key]: 0 }, now: 60_000 } : { harness: { [key]: false }, workingSince: {} }), { key, busy });

const playing = (page) => page.evaluate(() => window.__breath.playing());

test("always: the breath plays while the agent works, shown or not, and stops when it is done", async ({ page }) => {
  const key = await inCall(page, "always");
  await page.waitForTimeout(400);
  expect(await playing(page)).toBe(false);
  await work(page, key, true);
  await expect.poll(() => playing(page)).toBe(true);
  await setHidden(page, true);
  await expect.poll(() => playing(page)).toBe(true);
  await work(page, key, false);
  await expect.poll(() => playing(page)).toBe(false);
});

test("screen off: the breath plays only while the page is hidden", async ({ page }) => {
  const key = await inCall(page, "hidden");
  await work(page, key, true);
  await page.waitForTimeout(600);
  expect(await playing(page)).toBe(false);
  await setHidden(page, true);
  await expect.poll(() => playing(page)).toBe(true);
  await setHidden(page, false);
  await expect.poll(() => playing(page)).toBe(false);
});

test("never: no breath, shown or hidden", async ({ page }) => {
  const key = await inCall(page, "off");
  await work(page, key, true);
  await setHidden(page, true);
  await page.waitForTimeout(800);
  expect(await playing(page)).toBe(false);
});
