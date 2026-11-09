import { beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import { PresenceSound, SCREEN_POLL_MS, breathPlays } from "./PresenceSound";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { writeCallPreferences, type PresenceSound as PresenceChoice } from "../../services/call-preferences";

vi.mock("../../services/room-session-controller.js", () => ({}));
type Choice = { sound: string; gainDb: number; intervalScale?: number };
const player = vi.hoisted(() => ({ playing: 0, plays: 0, choices: [] as Choice[], gains: [] as number[], scales: [] as number[] }));
vi.mock("../../services/thinking-sound", () => ({
  playThinkingSound: (choice: Choice) => {
    player.playing++; player.plays++; player.choices.push(choice);
    let stopped = false;
    return {
      setGain: (gainDb: number) => { player.gains.push(gainDb); },
      setIntervalScale: (scale: number) => { player.scales.push(scale); },
      stop: () => { if (!stopped) { stopped = true; player.playing--; } },
    };
  },
}));

const KEY = "node|t1";
const person = { thread_id: "t1", node: "node", title: "sidevoice-web", available: true, reach: { state: "listening" } };

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** The page in a call on the conversation, its agent working or not, with the person's choice. */
function inCall(presence: PresenceChoice) {
  writeCallPreferences({ presence });
  const store = createRoomStore();
  render(<RoomProvider store={store}><PresenceSound /></RoomProvider>);
  act(() => store.patch({ ws: {}, people: [person], callNode: "node", roomBinding: { thread_id: "t1" }, sessionId: "s" } as never));
  const work = (busy: boolean) => act(() => store.patch((busy
    ? { harness: { [KEY]: true }, workingSince: { [KEY]: 0 }, now: 60_000 } : { harness: { [KEY]: false }, workingSince: {} }) as never));
  return { store, work };
}

beforeEach(() => { player.playing = 0; player.plays = 0; player.choices = []; player.gains = []; player.scales = []; localStorage.clear(); setHidden(false); });

test("when the breath plays, by the choice: never, only with the screen off, always", () => {
  for (const screenOff of [false, true]) {
    expect(breathPlays({ inCall: true, working: true, presence: "off", screenOff })).toBe(false);
    expect(breathPlays({ inCall: true, working: true, presence: "always", screenOff })).toBe(true);
    expect(breathPlays({ inCall: true, working: false, presence: "always", screenOff })).toBe(false);
    expect(breathPlays({ inCall: false, working: true, presence: "always", screenOff })).toBe(false);
  }
  expect(breathPlays({ inCall: true, working: true, presence: "hidden", screenOff: false })).toBe(false);
  expect(breathPlays({ inCall: true, working: true, presence: "hidden", screenOff: true })).toBe(true);
});

test("always: the breath plays while the agent works, shown or hidden, and stops when it is done", () => {
  const { work } = inCall("always");
  expect(player.playing).toBe(0);
  work(true);
  expect(player.playing).toBe(1);
  act(() => setHidden(true));
  expect(player.playing).toBe(1);
  expect(player.plays).toBe(1);
  work(false);
  expect(player.playing).toBe(0);
});

test("screen off: the breath plays only while the page is hidden", () => {
  const { work } = inCall("hidden");
  work(true);
  expect(player.playing).toBe(0);
  act(() => setHidden(true));
  expect(player.playing).toBe(1);
  act(() => setHidden(false));
  expect(player.playing).toBe(0);
});

test("never: no breath, shown or hidden; a change of the choice applies at once", () => {
  const { work } = inCall("off");
  work(true);
  act(() => setHidden(true));
  expect(player.plays).toBe(0);
  act(() => { writeCallPreferences({ presence: "always" }); });
  expect(player.playing).toBe(1);
  act(() => { writeCallPreferences({ presence: "off" }); });
  expect(player.playing).toBe(0);
});

test("out of a call, no breath however long the agent works", () => {
  const { store, work } = inCall("always");
  work(true);
  act(() => store.patch({ ws: null, reconnecting: false } as never));
  expect(player.playing).toBe(0);
});

test("it plays the chosen sound at the volume and frequency set: the default at its own level and cadence until one is chosen", () => {
  const { work } = inCall("always");
  work(true);
  expect(player.choices).toEqual([{ sound: "soft-heartbeat", gainDb: 0, intervalScale: 1 }]);
});

test("another sound chosen while it plays starts that one; another volume applies to the one that plays", () => {
  const { work } = inCall("always");
  act(() => { writeCallPreferences({ sound: "deep-heartbeat", soundGainDb: -3 }); });
  work(true);
  expect(player.choices).toEqual([{ sound: "deep-heartbeat", gainDb: -3, intervalScale: 1 }]);
  act(() => { writeCallPreferences({ soundGainDb: 4 }); });
  expect(player.gains).toEqual([4]);
  expect(player.plays).toBe(1);
  act(() => { writeCallPreferences({ sound: "single-beat" }); });
  expect(player.plays).toBe(2);
  expect(player.playing).toBe(1);
  expect(player.choices.at(-1)).toEqual({ sound: "single-beat", gainDb: 4, intervalScale: 1 });
});

test("another frequency applies to the sound that plays, and to the next one chosen", () => {
  const { work } = inCall("always");
  act(() => { writeCallPreferences({ soundIntervalScale: 1.5 }); });
  work(true);
  expect(player.choices).toEqual([{ sound: "soft-heartbeat", gainDb: 0, intervalScale: 1.5 }]);
  act(() => { writeCallPreferences({ soundIntervalScale: 0.5 }); });
  expect(player.scales).toEqual([0.5]);
  expect(player.plays).toBe(1);
  act(() => { writeCallPreferences({ sound: "slow-breath" }); });
  expect(player.choices.at(-1)).toEqual({ sound: "slow-breath", gainDb: 0, intervalScale: 0.5 });
});

/* The desktop app shows the call in its floating card while its window is hidden or minimised: a hidden page is not the
 * screen off there. The app says whether the screen is locked (host.screen); an app before it never counts as off. */
function asApp(members: Record<string, unknown>) {
  Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: members } });
  onTestFinished(() => { Reflect.deleteProperty(window, "__sidevoiceHost"); });
}
const callControls = { settings: async () => ({ alwaysShown: false }), setAlwaysShown: async () => ({ alwaysShown: false }) };

test("desktop, the floating card in view: the window hidden is not the screen off, and the sound does not play", () => {
  asApp({ callControls });
  const { work } = inCall("hidden");
  work(true);
  act(() => setHidden(true));
  expect(player.plays).toBe(0);
  // "Always" is as it was: it plays, shown or hidden.
  act(() => { writeCallPreferences({ presence: "always" }); });
  expect(player.playing).toBe(1);
});

test("desktop, an app that says the screen is locked: the sound plays while it is, whatever the window, and is asked only while it matters", async () => {
  vi.useFakeTimers();
  onTestFinished(() => { vi.useRealTimers(); });
  let locked = false;
  const screen = { locked: vi.fn(async () => locked) };
  asApp({ callControls, screen });
  const { work } = inCall("hidden");
  // Not working yet: nothing to ask.
  await act(async () => { await vi.advanceTimersByTimeAsync(SCREEN_POLL_MS * 2); });
  expect(screen.locked).not.toHaveBeenCalled();
  work(true);
  act(() => setHidden(true));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(player.playing).toBe(0);
  locked = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(SCREEN_POLL_MS); });
  expect(player.playing).toBe(1);
  locked = false;
  await act(async () => { await vi.advanceTimersByTimeAsync(SCREEN_POLL_MS); });
  expect(player.playing).toBe(0);
  // Done working: no more asking.
  work(false);
  const asked = screen.locked.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(SCREEN_POLL_MS * 3); });
  expect(screen.locked).toHaveBeenCalledTimes(asked);
});

test("desktop, an app whose answer fails: the screen counts as on", async () => {
  vi.useFakeTimers();
  onTestFinished(() => { vi.useRealTimers(); });
  let fails = false;
  const screen = { locked: vi.fn(async () => { if (fails) throw new Error("no session"); return true; }) };
  asApp({ callControls, screen });
  const { work } = inCall("hidden");
  work(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(player.playing).toBe(1);
  fails = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(SCREEN_POLL_MS); });
  expect(screen.locked).toHaveBeenCalledTimes(2);
  expect(player.playing).toBe(0);
});

test("desktop, an app slow to answer is asked once at a time, and a late answer never overtakes a later one", async () => {
  vi.useFakeTimers();
  onTestFinished(() => { vi.useRealTimers(); });
  const answers: ((locked: boolean) => void)[] = [];
  const screen = { locked: vi.fn(() => new Promise<boolean>((resolve) => { answers.push(resolve); })) };
  asApp({ callControls, screen });
  const { work } = inCall("hidden");
  work(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(SCREEN_POLL_MS * 5); });
  expect(screen.locked).toHaveBeenCalledTimes(1);
  await act(async () => { answers[0](true); await vi.advanceTimersByTimeAsync(0); });
  expect(player.playing).toBe(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(SCREEN_POLL_MS); });
  expect(screen.locked).toHaveBeenCalledTimes(2);
  await act(async () => { answers[1](false); await vi.advanceTimersByTimeAsync(0); });
  expect(player.playing).toBe(0);
  // Done working while a question is out: its answer changes nothing.
  await act(async () => { await vi.advanceTimersByTimeAsync(SCREEN_POLL_MS); });
  work(false);
  await act(async () => { answers[2](true); await vi.advanceTimersByTimeAsync(SCREEN_POLL_MS * 2); });
  expect(player.playing).toBe(0);
  expect(screen.locked).toHaveBeenCalledTimes(3);
});

test("a phone whose app says the screen is locked: the page hidden asks at once, and the sound starts without waiting for the poll", async () => {
  vi.useFakeTimers();
  onTestFinished(() => { vi.useRealTimers(); });
  // The app's answer, as a phone's: locked once the screen goes off, which hides the page.
  const screen = { locked: vi.fn(async () => document.hidden) };
  asApp({ screen });
  const { work } = inCall("hidden");
  work(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.locked).toHaveBeenCalledTimes(1);
  expect(player.playing).toBe(0);
  // Hidden: asked now, and playing well before the next poll would have asked.
  await act(async () => { setHidden(true); await vi.advanceTimersByTimeAsync(10); });
  expect(screen.locked).toHaveBeenCalledTimes(2);
  expect(player.playing).toBe(1);
  // The poll goes on from that answer.
  await act(async () => { await vi.advanceTimersByTimeAsync(SCREEN_POLL_MS); });
  expect(screen.locked).toHaveBeenCalledTimes(3);
  expect(player.playing).toBe(1);
  // Shown again: the screen is on at once, without asking; an answer still out when it is shown changes nothing.
  let answer: (locked: boolean) => void = () => undefined;
  screen.locked.mockImplementationOnce(() => new Promise<boolean>((resolve) => { answer = resolve; }));
  await act(async () => { await vi.advanceTimersByTimeAsync(SCREEN_POLL_MS); });
  expect(screen.locked).toHaveBeenCalledTimes(4);
  act(() => setHidden(false));
  expect(player.playing).toBe(0);
  await act(async () => { answer(true); await vi.advanceTimersByTimeAsync(0); });
  expect(player.playing).toBe(0);
  expect(screen.locked).toHaveBeenCalledTimes(4);
  await act(async () => { await vi.advanceTimersByTimeAsync(SCREEN_POLL_MS); });
  expect(screen.locked).toHaveBeenCalledTimes(5);
  expect(player.playing).toBe(0);
});

test("a phone or a browser (no floating card): the page in the background is the screen off, as before", () => {
  asApp({ callSurface: { active: () => true, still() {}, forget() {} } });
  const { work } = inCall("hidden");
  work(true);
  act(() => setHidden(true));
  expect(player.playing).toBe(1);
});
