import { expect, test } from "vitest";
import { createRoomSessionStore } from "./room-session-state.js";

// The card's view comes from the room's own facts (the desktop bridge relays it as is): these drive the real store.
const people = [
  { thread_id: "a", title: "Call A", available: true },
  { thread_id: "b", title: "Transcript B", available: false },
];
const base = { ws: {}, sessionId: "s", roomBinding: { thread_id: "a", title: "Call A" }, people };

test("the agent and the person are independent: both speaking at once", () => {
  const store = createRoomSessionStore({ ...base, userLive: true, botLive: true } as never);
  const view = store.getState().callCard;
  expect([view.agent, view.youTalking]).toEqual(["speaking", true]);
  expect(store.getState().session.speaker).toBe("user"); // the room's single speaker gives the person the floor
});

test("the agent works while the person's turn is transcribed, even when its harness says it is idle", () => {
  const store = createRoomSessionStore({ ...base, pendingPhase: "transcribing", harness: { a: false } } as never);
  expect(store.getState().callCard.agent).toBe("working");
  store.patch({ pendingPhase: "" });
  expect(store.getState().callCard.agent).toBe("idle");
});

test("a reply that has started playing is the agent speaking, and something to skip", () => {
  const store = createRoomSessionStore({ ...base, activeSpeech: { started: true } } as never);
  expect(store.getState().callCard).toMatchObject({ agent: "speaking", canSkip: true });
});

test("the card names the conversation the call is on, not a transcript being browsed", () => {
  const store = createRoomSessionStore({ ...base, viewedThread: "b" } as never);
  expect(store.getState().title).toBe("Transcript B");
  expect(store.getState().callCard).toMatchObject({ conversation: "a", title: "Call A" });
});
