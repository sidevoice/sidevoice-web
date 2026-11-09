import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { PresenceSound } from "./PresenceSound";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { writeCallPreferences, type PresenceSound as PresenceChoice } from "../../services/call-preferences";
import { resetThinkingSoundForTests } from "../../services/thinking-sound";

/* The thinking sound through the app's own player (host.cue, iOS), with the real player: "only with the screen off" holds the
 * app's cue for as long as the agent works, locked or not, with `whileLocked`, and the app plays it only while the screen is
 * locked (a page may be suspended once it locks, and could not start it then). "Always" asks for it at once, as before. */

vi.mock("../../services/room-session-controller.js", () => ({}));

const KEY = "node|t1";
const person = { thread_id: "t1", node: "node", title: "sidevoice-web", available: true, reach: { state: "listening" } };
const ALL = ["sound", "gainDb", "intervalScale", "whileLocked"];

/** A phone app with the cue's player (its options as given) and a screen that is not locked. */
function asPhone(options: string[]) {
  const cue = { start: vi.fn(), stop: vi.fn(), options };
  const screen = { locked: vi.fn(async () => false) };
  Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: { cue, screen } } });
  return { cue, screen };
}

/** The page in a call on the conversation, the person's choice set first (in act: a page already drawn hears of it). */
function inCall(presence: PresenceChoice) {
  act(() => { writeCallPreferences({ presence }); });
  const store = createRoomStore();
  const { unmount } = render(<RoomProvider store={store}><PresenceSound /></RoomProvider>);
  act(() => store.patch({ ws: {}, people: [person], callNode: "node", roomBinding: { thread_id: "t1" }, sessionId: "s" } as never));
  const work = (busy: boolean) => act(() => store.patch((busy
    ? { harness: { [KEY]: true }, workingSince: { [KEY]: 0 }, now: 60_000 } : { harness: { [KEY]: false }, workingSince: {} }) as never));
  return { store, work, unmount };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); Reflect.deleteProperty(window, "__sidevoiceHost"); resetThinkingSoundForTests(); vi.unstubAllGlobals(); });

test("screen off: while the agent works, the app's cue is held with whileLocked, the screen unlocked, and stopped when the work ends", async () => {
  const { cue, screen } = asPhone(ALL);
  const { work } = inCall("hidden");
  expect(cue.start).not.toHaveBeenCalled();
  work(true);
  expect(cue.start).toHaveBeenCalledTimes(1);
  expect(cue.start).toHaveBeenCalledWith("thinking", { sound: "soft-heartbeat", gainDb: 0, intervalScale: 1, whileLocked: true });
  // The app decides by the lock: the page does not ask the screen for it.
  await act(async () => { await Promise.resolve(); });
  expect(screen.locked).not.toHaveBeenCalled();
  // A volume or a frequency changed while it is held keeps it held for the lock.
  act(() => { writeCallPreferences({ soundIntervalScale: 2 }); });
  expect(cue.start).toHaveBeenLastCalledWith("thinking", { sound: "soft-heartbeat", gainDb: 0, intervalScale: 2, whileLocked: true });
  work(false);
  expect(cue.stop).toHaveBeenCalledWith("thinking");
});

test("screen off: the call ended, or the setting changed, stops the held cue; Always asks for it at once, with no whileLocked", () => {
  const { cue } = asPhone(ALL);
  const { store, work, unmount } = inCall("hidden");
  work(true);
  act(() => store.patch({ ws: null, reconnecting: false } as never));
  expect(cue.stop).toHaveBeenCalledTimes(1);
  unmount();

  const again = inCall("hidden");
  again.work(true);
  expect(cue.start).toHaveBeenCalledTimes(2);
  act(() => { writeCallPreferences({ presence: "always" }); });
  expect(cue.stop).toHaveBeenCalledTimes(2);
  expect(cue.start).toHaveBeenCalledTimes(3);
  expect(cue.start.mock.calls.at(-1)).toEqual(["thinking", { sound: "soft-heartbeat", gainDb: 0, intervalScale: 1 }]);
  act(() => { writeCallPreferences({ presence: "off" }); });
  expect(cue.stop).toHaveBeenCalledTimes(3);
});

test("always: the app's cue at once, never whileLocked", () => {
  const { cue } = asPhone(ALL);
  const { work } = inCall("always");
  work(true);
  expect(cue.start).toHaveBeenCalledTimes(1);
  expect(cue.start.mock.calls[0][1]).not.toHaveProperty("whileLocked");
  work(false);
  expect(cue.stop).toHaveBeenCalledTimes(1);
});

test("an app whose cue does not hold for the lock (before whileLocked): screen off waits for the screen, as before", async () => {
  vi.useFakeTimers();
  try {
    const { cue, screen } = asPhone(["sound", "gainDb", "intervalScale"]);
    const { work } = inCall("hidden");
    work(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.locked).toHaveBeenCalled();
    expect(cue.start).not.toHaveBeenCalled();
    screen.locked.mockImplementation(async () => true);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(cue.start).toHaveBeenCalledWith("thinking", { sound: "soft-heartbeat", gainDb: 0, intervalScale: 1 });
  } finally { vi.useRealTimers(); }
});

/** The page's Web Audio, enough to see its copy of the sound start and stop: each play's start and stops, by source. */
function fakeWebAudio() {
  const plays: { stops: number }[] = [];
  const param = () => ({ value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  class Context {
    state = "running";
    currentTime = 0;
    destination = {};
    resume = async () => undefined;
    suspend = async () => undefined;
    close = async () => undefined;
    createGain() { return { gain: param(), connect: (next: unknown) => next, disconnect: () => undefined }; }
    createDynamicsCompressor() {
      return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: (next: unknown) => next, disconnect: () => undefined };
    }
    createBufferSource() {
      const play = { stops: 0 };
      return { buffer: null, onended: null, connect: () => undefined, disconnect: () => undefined, start: () => { plays.push(play); }, stop: () => { play.stops++; } };
    }
    async decodeAudioData() { return { duration: 0.6 }; }
  }
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  return plays;
}

test("the app's cue offered after a working call is back: the page's copy stops and the cue is held for the lock", async () => {
  vi.useFakeTimers();
  try {
    const plays = fakeWebAudio();
    // An iPhone whose bridge has not had the app's answer yet: no cue, a screen that is locked.
    let cue: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; options: string[] } | null = null;
    const screen = { locked: vi.fn(async () => true) };
    Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: { screen, get cue() { return cue; } } } });
    const { work } = inCall("hidden");
    work(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    // Until then, the screen decides and the page plays its own copy.
    expect(screen.locked).toHaveBeenCalled();
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.some((play) => play.stops === 0)).toBe(true);
    // The app answers: its cue is offered, and the page hands the sound over to it.
    cue = { start: vi.fn(), stop: vi.fn(), options: ALL };
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(cue.start).toHaveBeenCalledTimes(1);
    expect(cue.start).toHaveBeenCalledWith("thinking", { sound: "soft-heartbeat", gainDb: 0, intervalScale: 1, whileLocked: true });
    expect(plays.every((play) => play.stops > 0)).toBe(true);
    // From then on the app decides by the lock: the screen is not asked, and the page plays nothing of its own.
    const asked = screen.locked.mock.calls.length;
    const played = plays.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.locked).toHaveBeenCalledTimes(asked);
    expect(plays).toHaveLength(played);
    work(false);
    expect(cue.stop).toHaveBeenCalledWith("thinking");
  } finally { vi.useRealTimers(); }
});

test("in a browser nothing is watched for: no app, no cue to come", () => {
  const timers = vi.spyOn(globalThis, "setTimeout");
  const { work } = inCall("hidden");
  work(true);
  expect(timers.mock.calls.filter(([, ms]) => ms === 250)).toHaveLength(0);
  timers.mockRestore();
});
