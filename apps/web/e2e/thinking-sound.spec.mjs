import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The thinking sound (Settings → Call, "Thinking sound": never, screen off, always) in a real browser: while the agent
 * works on the person's turn in a call, the chosen sound plays through Web Audio at its cadence, by the setting and whether
 * the page is shown (sidevoice-web#439). The page's Web Audio is watched, not heard: the player keeps the next play on the
 * audio clock while it runs, so a source started (now or for later) that has neither ended nor been stopped is the sound
 * playing; each play is a one-shot that ends by itself, and stopping the sound stops the one waiting. Whether the browser
 * lets that context run is the Join tap's (it is begun there: test/room-session-controller.test.cjs); a real join is not
 * run here, and a headless browser may have no audio device (its clock then holds still, and the next play stays waiting). */

const THREAD = "t1";
const conversation = { thread_id: THREAD, title: "sidevoice-web", available: true, reach: { state: "listening" }, harness: "claude-code" };

/** Every AudioContext the page makes; every play started in it (when on its clock, how long, whether it ended or was stopped);
 *  and every sound file the page fetched. */
function watchWebAudio() {
  const Native = window.AudioContext;
  const plays = [];
  const fetched = [];
  window.__sound = {
    plays, fetched,
    playing: () => plays.some((play) => !play.ended && !play.stopped),
    // When each play was put on the clock, and its length: the cadence.
    cadence: () => plays.map((play) => ({ at: play.at, seconds: play.seconds })),
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, ...rest) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/sounds/thinking/")) fetched.push(new URL(url, location.href).pathname.split("/").pop());
    return nativeFetch(input, ...rest);
  };
  window.AudioContext = class extends Native {
    constructor(...args) {
      super(...args);
      const make = this.createBufferSource.bind(this);
      this.createBufferSource = () => {
        const source = make();
        const start = source.start.bind(source), stop = source.stop.bind(source);
        const play = { at: null, seconds: null, ended: false, stopped: false };
        source.addEventListener("ended", () => { play.ended = true; });
        source.start = (when = 0, ...a) => { start(when, ...a); play.at = when; play.seconds = source.buffer?.duration ?? null; plays.push(play); };
        source.stop = (...a) => { stop(...a); play.stopped = true; };
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

/** What the paired machine says of its conversation's work: the room asks again every few seconds (its machines' beat) and takes
 *  the machine's word, so a state only patched into the page is gone at the next beat, which on a slow runner falls inside the
 *  spec. `working` is null while it says nothing. */
const machines = new WeakMap();

async function inCall(page, presence, sound = {}) {
  await page.addInitScript(watchWebAudio);
  await page.addInitScript(([presence, sound]) => localStorage.setItem("sidevoice.call-preferences", JSON.stringify({ presence, keepAwake: false, ...sound })), [presence, sound]);
  const machine = { working: null };
  machines.set(page, machine);
  await installHarness(page, { participants: { get first() { return [{ ...conversation, working: machine.working }]; } } });
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

const work = (page, key, busy) => {
  machines.get(page).working = busy;
  return page.evaluate(({ key, busy }) => window.sidevoiceUI.store.patch(busy
    ? { harness: { [key]: true }, workingSince: { [key]: 0 }, now: 60_000 } : { harness: { [key]: false }, workingSince: {} }), { key, busy });
};

const playing = (page) => page.evaluate(() => window.__sound.playing());
const watched = (page) => page.evaluate(() => ({ fetched: [...window.__sound.fetched], cadence: window.__sound.cadence() }));

test("always: the chosen sound plays at its cadence while the agent works, shown or not, and stops when it is done", async ({ page }) => {
  // Single beat: 0.9 s, then 2 to 3 s of silence before the next.
  const key = await inCall(page, "always", { sound: "single-beat", soundGainDb: -3 });
  await page.waitForTimeout(400);
  expect(await playing(page)).toBe(false);
  await work(page, key, true);
  await expect.poll(() => playing(page)).toBe(true);
  // That sound's file, decoded once; the play now and the next already on the clock, a play and a gap in its interval later.
  await expect.poll(async () => (await watched(page)).cadence.length).toBeGreaterThanOrEqual(2);
  const { fetched, cadence } = await watched(page);
  expect(fetched).toHaveLength(1);
  expect(fetched[0]).toMatch(/^single-beat\.(webm|m4a)$/);
  const [first, second] = cadence;
  expect(first.seconds).toBeCloseTo(0.9, 1);
  expect(second.at - first.at - first.seconds).toBeGreaterThanOrEqual(2 - 0.01);
  expect(second.at - first.at - first.seconds).toBeLessThanOrEqual(3 + 0.01);
  await setHidden(page, true);
  await expect.poll(() => playing(page)).toBe(true);
  await work(page, key, false);
  await expect.poll(() => playing(page)).toBe(false);
  // Stopped: nothing more is put on the clock.
  const plays = (await watched(page)).cadence.length;
  await page.waitForTimeout(3500);
  expect((await watched(page)).cadence.length).toBe(plays);
});

test("screen off: the sound plays only while the page is hidden", async ({ page }) => {
  const key = await inCall(page, "hidden");
  await work(page, key, true);
  await page.waitForTimeout(600);
  expect(await playing(page)).toBe(false);
  await setHidden(page, true);
  await expect.poll(() => playing(page)).toBe(true);
  await setHidden(page, false);
  await expect.poll(() => playing(page)).toBe(false);
});

test("never: no sound, shown or hidden, and none fetched", async ({ page }) => {
  const key = await inCall(page, "off");
  await work(page, key, true);
  await setHidden(page, true);
  await page.waitForTimeout(800);
  expect(await playing(page)).toBe(false);
  expect(await watched(page)).toEqual({ fetched: [], cadence: [] });
});

/** A sound file's level as the page's audio decodes it, over the whole of it, in dB of full scale: its RMS and its peak;
 *  null where this browser does not decode the format. */
function decodedLevel(page, file) {
  return page.evaluate(async (file) => {
    try {
      const bytes = await (await fetch(`/voice/sounds/thinking/${file}`)).arrayBuffer();
      const samples = (await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(bytes)).getChannelData(0);
      let sum = 0, peak = 0;
      for (const sample of samples) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
      return { rms: 20 * Math.log10(Math.sqrt(sum / samples.length)), peak: 20 * Math.log10(peak) };
    } catch { return null; }
  }, file);
}

test("the soft heartbeat plays 5 dB under the level it was approved at (RMS −14 dB, peak −1 dBFS), in the file this browser decodes", async ({ page }) => {
  // The page plays a sound's file at the person's offset, 0 dB by default; the iOS app plays the same file (its m4a).
  await page.goto("/voice/");
  const levels = [await decodedLevel(page, "soft-heartbeat.webm"), await decodedLevel(page, "soft-heartbeat.m4a")].filter(Boolean);
  expect(levels.length).toBeGreaterThan(0);
  for (const level of levels) {
    expect(level.rms).toBeCloseTo(-14 - 5, 0);
    expect(level.peak).toBeCloseTo(-1 - 5, 0);
  }
});
