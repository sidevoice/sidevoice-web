import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
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

function inCall(presence: PresenceChoice) {
  writeCallPreferences({ presence });
  const store = createRoomStore();
  render(<RoomProvider store={store}><PresenceSound /></RoomProvider>);
  act(() => store.patch({ ws: {}, people: [person], callNode: "node", roomBinding: { thread_id: "t1" }, sessionId: "s" } as never));
  const work = (busy: boolean) => act(() => store.patch((busy
    ? { harness: { [KEY]: true }, workingSince: { [KEY]: 0 }, now: 60_000 } : { harness: { [KEY]: false }, workingSince: {} }) as never));
  return { store, work };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { Reflect.deleteProperty(window, "__sidevoiceHost"); resetThinkingSoundForTests(); });

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
  const { store, work } = inCall("hidden");
  work(true);
  act(() => store.patch({ ws: null, reconnecting: false } as never));
  expect(cue.stop).toHaveBeenCalledTimes(1);

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
