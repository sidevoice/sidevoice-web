import { beforeEach, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import { PresenceSound, breathPlays } from "./PresenceSound";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { writeCallPreferences, type PresenceSound as PresenceChoice } from "../../services/call-preferences";

vi.mock("../../services/room-session-controller.js", () => ({}));
const player = vi.hoisted(() => ({ playing: 0, plays: 0 }));
vi.mock("../../services/thinking-sound", () => ({
  playThinkingSound: () => { player.playing++; player.plays++; return () => { player.playing--; }; },
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

beforeEach(() => { player.playing = 0; player.plays = 0; localStorage.clear(); setHidden(false); });

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
