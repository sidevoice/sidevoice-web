import { expect, test } from "vitest";
import { createRoomSessionStore } from "./room-session-state.js";

test("what a conversation thinks with reaches the models panel and each conversation's own row exactly as its harness reports it", () => {
  const store = createRoomSessionStore();
  store.patch({
    roomBinding: { thread_id: "t-1", binding_id: "b-1", title: "Sidevoice" },
    people: [
      { thread_id: "t-1", title: "Sidevoice", available: true, engine: { model: "claude-fable-5-1", effort: "xhigh", thinking: null } },
      { thread_id: "t-2", title: "Astra", available: true, engine: { model: "gpt-5.6-terra" } },
      { thread_id: "t-3", title: "Sin modelo", available: true },
    ],
  });
  expect(store.getState().participants.map((row) => row.model)).toEqual(["claude-fable-5-1", "gpt-5.6-terra", null]);
  const thinks = store.getState().enginePanel.find((row) => row.id === "agent")!;
  expect(thinks.label).toBe("LLM");
  expect(thinks.value).toBe("claude-fable-5-1 · xhigh");
});

test("no row for what no harness has said", () => {
  const store = createRoomSessionStore();
  store.patch({
    roomBinding: { thread_id: "t-1", binding_id: "b-1", title: "Sidevoice" },
    people: [{ thread_id: "t-1", title: "Sidevoice", available: true }],
  });
  expect(store.getState().enginePanel.some((row) => row.id === "agent")).toBe(false);
});
