import { expect, test } from "vitest";
import { createRoomSessionStore } from "./room-session-state.js";

// The card's view comes from the room's own facts (the desktop bridge relays it as is): these drive the real store.
// The page knows a conversation by its machine and thread ("n|a"); the room's binding keeps the bare thread.
const people = [
  { thread_id: "a", node: "n", title: "Call A", available: true, engine: { model: "opus", effort: "high" } },
  { thread_id: "b", node: "n", title: "Transcript B", available: false },
];
const base = { ws: {}, sessionId: "s", callNode: "n", roomBinding: { thread_id: "a", title: "Call A" }, people };
const card = (facts: Record<string, unknown>) => createRoomSessionStore({ ...base, ...facts } as never).getState().callCard;

test("the agent and the person are independent: both speaking at once", () => {
  const store = createRoomSessionStore({ ...base, userLive: true, botLive: true } as never);
  const view = store.getState().callCard;
  expect([view.agent, view.youTalking]).toEqual(["speaking", true]);
  expect(store.getState().session.speaker).toBe("user"); // the room's single speaker gives the person the floor
});

test("the agent works while the person's turn is transcribed, even when its harness says it is idle", () => {
  const store = createRoomSessionStore({ ...base, pendingPhase: "transcribing", harness: { "n|a": false } } as never);
  expect(store.getState().callCard.agent).toBe("working");
  store.patch({ pendingPhase: "" });
  expect(store.getState().callCard.agent).toBe("idle");
});

test("a reply sounding is the agent speaking, and Skip can stop it (FC3: it was never enabled)", () => {
  expect(card({ botLive: true })).toMatchObject({ agent: "speaking", canSkip: true });
  expect(card({})).toMatchObject({ canSkip: false });
});

test("the card names the conversation the call is on, not a transcript being browsed", () => {
  const store = createRoomSessionStore({ ...base, viewedThread: "n|b" } as never);
  expect(store.getState().title).toBe("Transcript B");
  expect(store.getState().callCard).toMatchObject({ conversation: "n|a", title: "Call A" });
});

test("FC0: the store's callCard is the card's whole snapshot but the host's stamps — rows with every field, devices in the card's words", () => {
  const view = card({ audioDevices: { inputs: [{ id: "mbp", label: "MacBook Pro" }, { id: "usb", label: "" }], outputs: [], input: "mbp", output: null, outputSelectable: false } });
  expect(view).toMatchObject({ ready: true, joined: true, busy: false, micEnabled: true, micDisabled: false, callModel: "call", setupDone: false });
  expect(view).not.toHaveProperty("version");
  expect(view).not.toHaveProperty("since");
  // The model and effort reach the card with the rows (the desktop bridge's field list dropped them).
  expect(view.participants[0]).toMatchObject({ threadId: "n|a", model: "opus", effort: "high", machineId: "n" });
  expect(view.devices).toEqual({
    inputs: [{ id: "", label: "", system: true }, { id: "mbp", label: "MacBook Pro" }, { id: "usb", label: "", number: 2 }],
    outputs: [{ id: "", label: "", system: true }], inputId: "mbp", outputId: "", available: true, outputAvailable: false, busy: false,
  });
  expect(card({}).devices).toBeNull();
});

test("FC1, FC2, FC12: setup done, the call model and the page's theme and language, as the facts say them", () => {
  expect(card({ setupDone: true, callModel: "voice-switch", pageTheme: "dark", pageLanguage: "es" }))
    .toMatchObject({ setupDone: true, callModel: "voice-switch", theme: "dark", language: "es" });
  expect(card({})).toMatchObject({ callModel: "call", theme: "light", language: "en" });
});

test("FC4: the avatar acts out what the stage's would — listening while the turn is open, working, speaking, offline", () => {
  const turn = { userTurn: { id: "t", segment: "t", thread: "n|a" } };
  expect(card({ ...turn, pendingPhase: "listening" })).toMatchObject({ mood: "listening", turn: "listening" });
  // The stage shows listening while the turn is transcribed (the old agent field said working).
  expect(card({ ...turn, pendingPhase: "transcribing" })).toMatchObject({ mood: "listening", turn: "transcribing", agent: "working" });
  expect(card({ ...turn, pendingPhase: "listening", cancelledInput: true })).toMatchObject({ turn: null });
  expect(card({ harness: { "n|a": true } }).mood).toBe("working");
  expect(card({ botLive: true, ...turn, pendingPhase: "listening" }).mood).toBe("speaking"); // barge-in: speaking wins
  expect(card({ people: [{ ...people[0], available: false, reach: { state: "offline" } }] }).mood).toBe("offline");
  expect(card({ ws: null, reconnecting: false }).mood).toBe("idle");
  // The preview's forced mood shows on the card as on the stage.
  expect(card({ botLive: true, avatarPreview: { mood: "working" } }).mood).toBe("working");
});

test("FC4 in call model B: the active conversation, heard or not; its agent works whatever the voice", () => {
  const b = { callModel: "voice-switch", voiceOn: true };
  expect(card({ ...b, people: [{ ...people[0], working: true }] })).toMatchObject({ mood: "working", conversation: "n|a" });
  // Picked though it cannot hear (offline): the binding left it, the card still names it.
  const picked = card({ ...b, roomBinding: null, viewedThread: "n|b" });
  expect(picked).toMatchObject({ conversation: "n|b", title: "Transcript B", mood: "offline", micReason: "cantHear", micDisabled: true });
  expect(card({ ...b, roomBinding: null })).toMatchObject({ conversation: null, micReason: "noConversation" });
  expect(card({ ...b, voiceOn: false, botLive: true }).mood).toBe("idle");
});

test("FC6 and FC7: the idle warning in each model, and why a call ended by itself (A only: B says it in voiceOffReason)", () => {
  expect(card({ callIdleWarning: true }).idleWarning).toBe(true);
  expect(card({ voiceIdleWarning: true }).idleWarning).toBe(false);
  expect(card({ callModel: "voice-switch", voiceIdleWarning: true }).idleWarning).toBe(true);
  expect(card({ callEnded: { reason: "idle", detail: "" } }).ended).toEqual({ reason: "idle", detail: "" });
  expect(card({ callModel: "voice-switch", voiceOffReason: "micLost", voiceOffDetail: "" })).toMatchObject({ ended: null, voiceOffReason: "micLost" });
});

test("FC10 and FC11: why B's microphone cannot be used, and what busy is — reconnecting, or switching and to whom", () => {
  expect(card({ reconnectShown: true })).toMatchObject({ busy: true, busyReason: "reconnecting", switchingTo: null });
  expect(card({ switching: true, viewedThread: "n|b" })).toMatchObject({ busy: true, busyReason: "switching", switchingTo: "Transcript B" });
  expect(card({ movingTo: "n|b" })).toMatchObject({ busyReason: "switching", switchingTo: "Transcript B" });
  expect(card({ callModel: "voice-switch", voiceOn: true, switching: true, viewedThread: "n|a" })).toMatchObject({ micReason: "connecting" });
  expect(card({}).micReason).toBeNull();
});

test("FC13: the microphone silent though not muted — another app holds it", () => {
  expect(card({ voiceState: { listening: "listening", recognising: 0, playback: "idle", microphone: "muted" } }).micSilent).toBe(true);
  expect(card({ micEnabled: false, voiceState: { listening: "muted", recognising: 0, playback: "idle", microphone: "muted" } }).micSilent).toBe(false);
});
