import { expect, test } from "vitest";
import { initialSessionFacts, type SessionFacts } from "../../state/room-session-state.js";
import type { ParticipantView } from "../../state/room-types";
import { callTranslator } from "./call-i18n";
import { voiceSwitchHeader, voiceSwitchStageMood, voiceSwitchState, voiceSwitchStateText } from "./conversation-state";
import { hearActionKey, voiceJoinLine, voiceMicReason, voiceNote, voiceNoteText, voicePosition, waitingBadge } from "./voice-view";
import { composerPlaceholder } from "../conversation/composer-view";
import { conversationTranslator } from "../conversation/conversation-i18n";

// What call model B's bar, line, rows, header, stage and box say, from the facts and the rows alone.
const t = callTranslator("en");
const row = (threadId: string, extra: Partial<ParticipantView> = {}): ParticipantView => ({
  threadId, title: threadId.slice(2).toUpperCase(), selected: false, available: true, switching: false, unread: 0, reach: "listening",
  stateLabel: "", subtitle: "", working: false, agentWorking: false, mark: null, ...extra,
});
const facts = (extra: Partial<SessionFacts> = {}): SessionFacts => ({
  ...initialSessionFacts(), ws: {}, sessionId: "s", callNode: "m", roomBinding: { thread_id: "a", binding_id: "b" }, ...extra,
});

test("a row says the first state that applies: unreachable, a mark, speaking, working, ready", () => {
  expect(voiceSwitchState(row("m|a", { available: false, reach: "offline", mark: "waiting-for-you" }))).toBe("idle");
  expect(voiceSwitchState(row("m|a", { mark: "waiting-for-you", speaking: true }))).toBe("waiting-for-you");
  expect(voiceSwitchState(row("m|a", { mark: "wants-to-talk", agentWorking: true }))).toBe("wants-to-talk");
  expect(voiceSwitchState(row("m|a", { speaking: true, agentWorking: true }))).toBe("speaking");
  expect(voiceSwitchState(row("m|a", { agentWorking: true }))).toBe("working");
  expect(voiceSwitchState(row("m|a"))).toBe("ready");
  expect(voiceSwitchStateText(row("m|a"), t)).toBe("Ready");
  expect(voiceSwitchStateText(row("m|a", { mark: "waiting-for-you", unread: 2 }), t)).toBe("Waiting for you · 2 new");
  expect(voiceSwitchStateText(row("m|a", { reach: "holding" }), t)).toBe("Can't receive");
  expect(voiceSwitchStateText(row("m|a", { reach: "offline", available: false }), t)).toBe("Offline");
  // In Spanish, the idle-but-reachable state is "Lista": never "Esperándote", which is a mark.
  expect(voiceSwitchStateText(row("m|a"), callTranslator("es"))).toBe("Lista");
});

test("a phone's header ranks waiting for you, then wanting to talk, then working — more unread first — never the stage's", () => {
  const rows = [row("m|ready"), row("m|working", { agentWorking: true }), row("m|wants", { mark: "wants-to-talk" }),
    row("m|waits", { mark: "waiting-for-you" }), row("m|waits2", { mark: "waiting-for-you", unread: 3 }), row("m|stage", { mark: "waiting-for-you" })];
  expect(voiceSwitchHeader(rows, "m|stage", 4).map((candidate) => candidate.threadId)).toEqual(["m|waits2", "m|waits", "m|wants", "m|working"]);
  expect(voiceSwitchHeader(rows, "m|stage", 9, true).map((candidate) => candidate.threadId).at(-1)).toBe("m|ready");
  expect(voiceSwitchHeader(rows, "m|stage", 9).map((candidate) => candidate.threadId)).not.toContain("m|ready");
});

test("the stage: offline, then speaking and listening with the voice on, then working whatever the voice, else idle", () => {
  const base = { voiceOn: true, reach: "listening" as const, canHear: true, speaking: false, personSpeaking: false, working: false };
  expect(voiceSwitchStageMood({ ...base, reach: "offline", speaking: true })).toBe("offline");
  expect(voiceSwitchStageMood({ ...base, speaking: true, working: true })).toBe("speaking");
  expect(voiceSwitchStageMood({ ...base, personSpeaking: true })).toBe("listening");
  expect(voiceSwitchStageMood({ ...base, voiceOn: false, working: true })).toBe("working");
  expect(voiceSwitchStageMood({ ...base, voiceOn: false, speaking: true })).toBe("idle");
});

test("the switch and its note: one note at a time, until the voice is on again; failures to act on are alerts", () => {
  expect(voicePosition({ voiceOn: false, voiceStarting: true })).toBe("starting");
  expect(voicePosition({ voiceOn: true, voiceStarting: false })).toBe("on");
  const note = (extra: Partial<SessionFacts>) => voiceNote(facts(extra));
  expect(note({})).toBeNull(); // turned off by the person: nothing to say
  expect(note({ voiceOffReason: "idle" })).toEqual({ kind: "idle", role: "status" });
  expect(note({ voiceOffReason: "micBlocked" })).toEqual({ kind: "micBlocked", role: "alert" });
  expect(note({ voiceOffReason: "failed" })?.role).toBe("alert");
  expect(note({ voiceOffReason: "micLost", voiceStarting: true })).toBeNull();
  expect(note({ voiceOn: true, voiceIdleWarning: true })).toEqual({ kind: "idle-warning", role: "status" });
  expect(note({ voiceOn: true })).toBeNull();
  expect(voiceNoteText("idle", "", t)).toBe("Voice turned off after 15 minutes without activity.");
  expect(voiceNoteText("failed", "That model is not in the voice's catalogue.", t)).toBe("Voice couldn't start: That model is not in the voice's catalogue.");
  expect(voiceNoteText("idle-warning", "", t)).toBe("Still there? Voice turns off in 1 minute.");
});

test("the microphone says why it cannot be used only with the voice on", () => {
  const rows = [row("m|a"), row("m|b", { reach: "holding" })];
  expect(voiceMicReason(facts({ voiceOn: false, roomBinding: null }), rows, t)).toBeNull(); // a preference with the voice off
  expect(voiceMicReason(facts({ voiceOn: true }), rows, t)).toBeNull();
  expect(voiceMicReason(facts({ voiceOn: true, roomBinding: null }), rows, t)).toBe("Choose a conversation to talk to");
  expect(voiceMicReason(facts({ voiceOn: true, roomBinding: null, viewedThread: "m|b" }), rows, t)).toBe("B can't hear you right now");
  expect(voiceMicReason(facts({ voiceOn: true, switching: true }), rows, t)).toBe("Connecting to A…");
  expect(voiceMicReason(facts({ voiceOn: true, roomBinding: null, viewedThread: "m|a" }), rows, t)).toBe("Connecting to A…");
});

test("the line above the bar: the voice getting ready, a move, a reconnection, a refusal, the reach note — never joining", () => {
  const rows = [row("m|a"), row("n|c")];
  expect(voiceJoinLine(facts(), rows, t)).toBeNull();
  expect(voiceJoinLine(facts({ voiceStarting: true }), rows, t)).toEqual({ text: "Preparing voice", state: "busy" });
  expect(voiceJoinLine(facts({ voiceStarting: true, joinProgress: 34.2 }), rows, t)?.text).toBe("Preparing voice (34 %)");
  expect(voiceJoinLine(facts({ movingTo: "n|c" }), rows, t)).toEqual({ text: "Switching to C…", state: "busy" });
  expect(voiceJoinLine(facts({ reconnectShown: true }), rows, t)?.text).toBe("Reconnecting to the room…");
  expect(voiceJoinLine(facts({ joinFailure: "The room is full." }), rows, t)).toEqual({ text: "The room is full.", state: "failed" });
  // A step the room session went through by itself is not said: the session opens silently.
  expect(voiceJoinLine(facts({ joinStep: "room" }), rows, t)).toBeNull();
  const unpaired = voiceJoinLine(facts({ ws: null, connecting: false, machinesReady: true, pairings: [] }), rows, t);
  expect(unpaired?.state).toBe("note");
});

test("Hear it's name says each step it takes first, and always contains 'Hear it'", () => {
  expect(hearActionKey({ voiceOn: true, voiceStarting: false, agentsMuted: false })).toBe("hear.it");
  expect(hearActionKey({ voiceOn: false, voiceStarting: false, agentsMuted: false })).toBe("hear.itVoice");
  expect(hearActionKey({ voiceOn: true, voiceStarting: false, agentsMuted: true })).toBe("hear.itUnmute");
  expect(hearActionKey({ voiceOn: false, voiceStarting: false, agentsMuted: true })).toBe("hear.itBoth");
  for (const key of ["hear.it", "hear.itVoice", "hear.itUnmute", "hear.itBoth"] as const) expect(t(key)).toMatch(/hear it/i);
  expect([waitingBadge(3), waitingBadge(9), waitingBadge(10)]).toEqual(["3", "9", "9+"]);
});

test("the box writes whenever the active conversation can receive, voice or not; else it says why", () => {
  const c = conversationTranslator("en");
  const say = (extra: Partial<SessionFacts>, rows: ParticipantView[]) => { const { key, title } = composerPlaceholder(facts(extra), rows); return c(key, { title }); };
  expect(say({ voiceOn: false }, [row("m|a")])).toBe("Send a message");
  expect(say({ roomBinding: null }, [row("m|a")])).toBe("Choose a conversation to write to");
  expect(say({ viewedThread: "m|b" }, [row("m|a"), row("m|b", { reach: "holding" })])).toBe("B can't receive messages right now");
  expect(say({ viewedThread: "m|b" }, [row("m|a"), row("m|b", { available: false, reach: "offline" })])).toBe("B can't receive messages right now");
  expect(say({ movingTo: "n|c" }, [row("m|a"), row("n|c")])).toBe("Switching to C…");
});
