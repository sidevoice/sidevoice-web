import { expect, test } from "vitest";
import { createRoomSessionStore } from "./room-session-state.js";

test("T14 another device's completed hearing clears global attention without local replay", () => {
  const participant = { node: "machine", thread_id: "thread", title: "Agent", available: true,
    reach: { state: "listening" }, epoch: 1, unheard: { count: 1, since: 10 }, working: false };
  const store = createRoomSessionStore({
    ws: {}, sessionId: "call", callNode: "machine", roomBinding: { thread_id: "thread", binding_id: "focus" },
    people: [participant], history: [{ segment: "reply", thread: "machine|thread", role: "assistant", text: "Answer",
      time: 10, audio: "interrupted", heard_chars: 2, globally_heard: false, replayable: true }],
  } as never);
  expect(store.getState().participants[0].unheard).toBe(1);
  expect(store.getState().conversation.messages[0].replayable).toBe(true);

  store.patch({ people: [{ ...participant, unheard: null }],
    history: [{ segment: "reply", thread: "machine|thread", role: "assistant", text: "Answer", time: 10,
      audio: "playback_finished", heard_chars: 6, globally_heard: true, replayable: false }] } as never);
  expect(store.getState().participants[0].unheard).toBe(0);
  expect(store.getState().conversation.messages[0].replayable).toBe(false);
  expect(store.getState().conversation.messages[0].playback).toBe("complete");
});
