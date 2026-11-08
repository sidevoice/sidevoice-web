import { beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import { PresenceSound, SCREEN_POLL_MS, breathPlays } from "./PresenceSound";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { writeCallPreferences, type PresenceSound as PresenceChoice } from "../../services/call-preferences";

vi.mock("../../services/room-session-controller.js", () => ({}));
const player = vi.hoisted(() => ({ playing: 0, plays: 0, choices: [] as { sound: string; gainDb: number }[], gains: [] as number[] }));
vi.mock("../../services/thinking-sound", () => ({
  playThinkingSound: (choice: { sound: string; gainDb: number }) => {
    player.playing++; player.plays++; player.choices.push(choice);
    let stopped = false;
    return { setGain: (gainDb: number) => { player.gains.push(gainDb); }, stop: () => { if (!stopped) { stopped = true; player.playing--; } } };
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

beforeEach(() => { player.playing = 0; player.plays = 0; player.choices = []; player.gains = []; localStorage.clear(); setHidden(false); });

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

test("it plays the chosen sound at the volume set: the default at its own level until one is chosen", () => {
  const { work } = inCall("always");
  work(true);
  expect(player.choices).toEqual([{ sound: "soft-heartbeat", gainDb: 0 }]);
});

test("another sound chosen while it plays starts that one; another volume applies to the one that plays", () => {
  const { work } = inCall("always");
  act(() => { writeCallPreferences({ sound: "deep-heartbeat", soundGainDb: -3 }); });
  work(true);
  expect(player.choices).toEqual([{ sound: "deep-heartbeat", gainDb: -3 }]);
  act(() => { writeCallPreferences({ soundGainDb: 4 }); });
  expect(player.gains).toEqual([4]);
  expect(player.plays).toBe(1);
  act(() => { writeCallPreferences({ sound: "single-beat" }); });
  expect(player.plays).toBe(2);
  expect(player.playing).toBe(1);
  expect(player.choices.at(-1)).toEqual({ sound: "single-beat", gainDb: 4 });
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
  asApp({ callControls, screen: { locked: async () => { throw new Error("no session"); } } });
  const { work } = inCall("hidden");
  work(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(SCREEN_POLL_MS); });
  expect(player.plays).toBe(0);
});

test("a phone or a browser (no floating card): the page in the background is the screen off, as before", () => {
  asApp({ callSurface: { active: () => true, still() {}, forget() {} } });
  const { work } = inCall("hidden");
  work(true);
  act(() => setHidden(true));
  expect(player.playing).toBe(1);
});
