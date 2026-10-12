import { expect, test } from "vitest";
import { audioReasonKey, conversationView, createRoomSessionStore, initialSessionFacts, participantsView, speechOf, voiceOffReasonFor, wantToTalk } from "./room-session-state.js";

// Call model B's projections (briefs/CALL-MODEL-B-SPEC.md): the room's rows with the agents' working state (contract gap
// #33) and what the person did not hear (gap #34), the session's speech (gap #32), and the desktop card's facts (#38).
const person = (thread_id: string, extra: Record<string, unknown> = {}) =>
  ({ thread_id, title: thread_id.toUpperCase(), available: true, reach: { state: "listening" }, node: "m", ...extra });
const facts = (extra: Record<string, unknown> = {}) => ({
  ...initialSessionFacts(), ws: {}, sessionId: "s", callNode: "m", roomBinding: { thread_id: "a", binding_id: "b1" },
  machineLinks: { m: { reach: "ok", via: "node" } }, ...extra,
}) as never;
const row = (rows: ReturnType<typeof participantsView>, key: string) => rows.find((candidate) => candidate.threadId === key)!;

test("every row says whether its agent works: the call's own conversation as it reports, the others as the room lists them", () => {
  const rows = participantsView(facts({
    people: [person("a", { working: false }), person("b", { working: true }), person("c", { working: null }), person("d")],
    harness: { "m|a": true },
  }));
  expect(row(rows, "m|a").agentWorking).toBe(true); // the live report wins over the listing's
  expect(row(rows, "m|b").agentWorking).toBe(true);
  expect(row(rows, "m|c").agentWorking).toBeNull();
  expect(row(rows, "m|d").agentWorking).toBeNull(); // a room without the field: nobody says
  // A's own `working` is unchanged: only the call's conversation.
  expect(rows.map((candidate) => candidate.working)).toEqual([true, false, false, false]);
});

test("a mark is waiting for you while its agent is idle, wants to talk while it works or nobody knows", () => {
  const unheard = { count: 2, since: 1000 };
  const rows = participantsView(facts({
    people: [person("a"), person("b", { unheard, working: false }), person("c", { unheard, working: true }), person("d", { unheard }), person("e", { unheard: { count: 0, since: 0 } })],
  }));
  expect(row(rows, "m|b")).toMatchObject({ mark: "waiting-for-you", unheard });
  expect(row(rows, "m|c").mark).toBe("wants-to-talk");
  expect(row(rows, "m|d").mark).toBe("wants-to-talk");
  expect(row(rows, "m|e")).toMatchObject({ mark: null, unheard: null });
  expect(wantToTalk(rows)).toBe(3);
  // One that cannot be reached is not counted: nobody could hear it.
  expect(wantToTalk(participantsView(facts({ people: [person("b", { unheard, available: false })] })))).toBe(0);
});

test("the active conversation's mark hides while the person's turn to it is open or it speaks (D9)", () => {
  const people = [person("a", { unheard: { count: 1, since: 5 }, working: false })];
  expect(row(participantsView(facts({ people })), "m|a").mark).toBe("waiting-for-you");
  expect(row(participantsView(facts({ people, botLive: true })), "m|a")).toMatchObject({ mark: null, speaking: true });
  expect(row(participantsView(facts({ people, userTurn: { id: "t", segment: "s:user-turn:t", thread: "m|a" } })), "m|a").mark).toBeNull();
  // Another conversation's mark stays whatever the active one does.
  const other = [...people, person("b", { unheard: { count: 1, since: 5 }, working: false })];
  expect(row(participantsView(facts({ people: other, botLive: true })), "m|b").mark).toBe("waiting-for-you");
});

test("a Hear it in progress is said on its row", () => {
  const rows = participantsView(facts({ people: [person("a"), person("b")], hearing: { thread: "m|b", state: "asking" } }));
  expect(rows.map((candidate) => candidate.hearing)).toEqual([null, "asking"]);
});

test("the room is told this session's speech: on only with the voice on and the agents audible", () => {
  expect(speechOf({ voiceOn: false, agentsMuted: false })).toEqual({ on: false, reason: "voice_off" });
  expect(speechOf({ voiceOn: false, agentsMuted: true })).toEqual({ on: false, reason: "voice_off" });
  expect(speechOf({ voiceOn: true, agentsMuted: true })).toEqual({ on: false, reason: "agents_muted" });
  expect(speechOf({ voiceOn: true, agentsMuted: false })).toEqual({ on: true });
});

test("the voice's failures by code are the reasons its note says", () => {
  expect(voiceOffReasonFor("microphone-lost")).toBe("micLost");
  expect(voiceOffReasonFor("microphone-denied")).toBe("micBlocked");
  expect(voiceOffReasonFor("microphone-unavailable")).toBe("micUnavailable");
  expect(voiceOffReasonFor("model-unfit")).toBe("failed");
});

test("a reply unheard for B's reasons says why in the transcript's own words, after its 'no audio'", () => {
  const reply = { role: "assistant" as const, audio: "text_only", audio_reason: "agents_muted" };
  expect(audioReasonKey(reply)).toBe("agentsMuted");
  expect(audioReasonKey({ ...reply, audio: "interrupted", audio_reason: "voice_off" })).toBe("voiceOff");
  expect(audioReasonKey({ ...reply, audio_reason: "focus_changed" })).toBeNull();
  expect(audioReasonKey({ ...reply, audio: "playback_finished" })).toBeNull();
  const view = conversationView(facts({
    history: [{ segment: "r1", thread: "m|a", role: "assistant", text: "Done.", name: "A", time: 1, audio: "text_only", audio_reason: "voice_off" }],
  }));
  expect(view.messages[0]).toMatchObject({ audioNote: "Sin audio", audioReason: "voiceOff" });
});

test("the desktop card's view carries the voice switch's facts (gap #38)", () => {
  const store = createRoomSessionStore(facts({
    voiceOn: true, agentsMuted: true, voiceOffReason: null,
    people: [person("a"), person("b", { unheard: { count: 1, since: 1 }, working: true })],
  }));
  expect(store.getState().callCard).toMatchObject({ voiceOn: true, agentsMuted: true, wantToTalk: 1, voiceOffReason: null });
  expect(store.getState().participants.find((candidate) => candidate.threadId === "m|b")?.mark).toBe("wants-to-talk");
});
