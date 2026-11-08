import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createRoomSessionStore, recordReceipt, recordReply, WORKING_SHOWN_AFTER_MS, type SessionStore } from "../state/room-session-state.js";
import { followWorking } from "./working-clock";

/* Working waits WORKING_SHOWN_AFTER_MS (3 s, the operator's 2026-10-14) of work without a break before it shows: the
 * session's word, each row's state and light, the stage's and the card's avatar, the transcript's working bubble. Driven
 * here through the real store, with the runtime's clock following it, on fake timers. */

const people = [{ thread_id: "a", node: "n", title: "A", available: true }, { thread_id: "b", node: "n", title: "B", available: true }];
const base = { ws: {}, sessionId: "s", callNode: "n", roomBinding: { thread_id: "a", title: "A" }, people };
let store: SessionStore;
let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 });
  store = createRoomSessionStore(base as never);
  stop = followWorking(store);
});
afterEach(() => { stop(); vi.useRealTimers(); });

const harness = (thread: string, working: boolean) => store.patch({ harness: { ...store.getState().facts.harness, ["n|" + thread]: working } });
/** Everything that says the call's conversation is working, at once. */
const shown = () => {
  const state = store.getState();
  return { session: state.session.working, row: state.participants.find((row) => row.threadId === "n|a")!.working,
    card: state.callCard.mood, transcript: state.conversation.working };
};
const NOT = { session: false, row: false, card: "idle", transcript: false };
const YES = { session: true, row: true, card: "working", transcript: true };

test("one wait, the decided one: 3 s", () => {
  expect(WORKING_SHOWN_AFTER_MS).toBe(3000);
});

test("the harness working shows nowhere at once, and everywhere once it has worked 3 s straight", () => {
  harness("a", true);
  expect(shown()).toEqual(NOT);
  vi.advanceTimersByTime(WORKING_SHOWN_AFTER_MS - 1);
  expect(shown()).toEqual(NOT);
  vi.advanceTimersByTime(1);
  expect(shown()).toEqual(YES);
  // Done: it goes at once, and nothing is left waiting.
  harness("a", false);
  expect(shown()).toEqual(NOT);
  expect(vi.getTimerCount()).toBe(0);
});

test("a plain back-and-forth never flashes Working; a break starts the wait again", () => {
  for (let turn = 0; turn < 4; turn++) {
    harness("a", true);
    vi.advanceTimersByTime(2_000);
    expect(shown()).toEqual(NOT);
    harness("a", false);
    vi.advanceTimersByTime(1_500);
    expect(shown()).toEqual(NOT);
  }
  harness("a", true);
  vi.advanceTimersByTime(2_999);
  expect(shown()).toEqual(NOT);
  vi.advanceTimersByTime(1);
  expect(shown()).toEqual(YES);
});

test("work known from the turn's receipts waits too, from when it is known; the reply ends it", () => {
  const facts = store.getState().facts;
  store.patch({ now: Date.now(), turns: recordReceipt(facts, "s:user-turn:1", "read", Date.now()) });
  expect(shown()).toEqual(NOT);
  vi.advanceTimersByTime(WORKING_SHOWN_AFTER_MS);
  expect(shown()).toEqual(YES);
  store.patch({ turns: recordReply(store.getState().facts, { session_id: "s", thread_id: "a", revision: 1 }) });
  expect(shown()).toEqual(NOT);
});

test("each conversation waits on its own start", () => {
  harness("a", true);
  vi.advanceTimersByTime(2_000);
  harness("b", true);
  vi.advanceTimersByTime(1_000);
  const rows = () => store.getState().participants.map((row) => row.working);
  expect(rows()).toEqual([true, false]);
  vi.advanceTimersByTime(2_000);
  expect(rows()).toEqual([true, true]);
});

test("stopped, it leaves no timer behind", () => {
  harness("a", true);
  expect(vi.getTimerCount()).toBe(1);
  stop();
  expect(vi.getTimerCount()).toBe(0);
});
