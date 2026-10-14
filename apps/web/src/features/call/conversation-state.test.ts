import { expect, test } from "vitest";
import type { ParticipantView } from "../../state/room-types";
import { translator } from "../../i18n/translator";
import { conversationState, machineGroups, moodText, personMood, smallAvatarMood, stageMood, stateText } from "./conversation-state";

const row = (threadId: string, extra: Partial<ParticipantView> = {}): ParticipantView => ({
  threadId, title: threadId, selected: false, available: true, switching: false, unread: 0, reach: "listening",
  working: false, machine: "Laptop", machineId: "m1", ...extra,
});
const en = translator("en");

test("a conversation's state: the call's own, working, waiting for you, or out of reach", () => {
  expect(conversationState(row("a", { selected: true }), true)).toBe("in-call");
  expect(conversationState(row("a", { selected: true, working: true }), true)).toBe("in-call");
  expect(conversationState(row("a", { working: true }), true)).toBe("working");
  expect(conversationState(row("a"), true)).toBe("waiting");
  // Busy but unable to receive is still busy; idle is only for one that cannot hear you and has nothing in hand.
  expect(conversationState(row("a", { reach: "holding", working: true }), true)).toBe("working");
  expect(conversationState(row("a", { reach: "holding" }), true)).toBe("idle");
  expect(conversationState(row("a", { available: false, reach: "offline" }), true)).toBe("idle");
  // The call's own that stopped hearing it is not "in call".
  expect(conversationState(row("a", { selected: true, reach: "offline" }), true)).toBe("idle");
});

test("the room's binding before a join or after a hang-up is not a call: no conversation is in call then", () => {
  const bound = row("a", { selected: true, unread: 2 });
  expect(conversationState(bound, false)).toBe("waiting");
  expect(smallAvatarMood(bound)).toBe("idle");
  expect(stateText(bound, false, en)).toBe("Waiting for you · 2 new");
  expect(stateText(bound, true, en)).toBe("In call");
});

test("a small avatar is offline, working or idle: waiting for you is idle, and the dot says it hears you", () => {
  expect(smallAvatarMood(row("a", { working: true }))).toBe("working");
  expect(smallAvatarMood(row("a"))).toBe("idle");
  expect(smallAvatarMood(row("a", { selected: true }))).toBe("idle");
  expect(smallAvatarMood(row("a", { selected: true, working: true }))).toBe("working");
  expect(smallAvatarMood(row("a", { reach: "holding" }))).toBe("idle");
  expect(smallAvatarMood(row("a", { reach: "holding", working: true }))).toBe("working");
  // Offline beats everything: the room cannot reach it, so it sleeps.
  expect(smallAvatarMood(row("a", { available: false, reach: "offline" }))).toBe("offline");
  expect(smallAvatarMood(row("a", { reach: "offline", working: true, unread: 3 }))).toBe("offline");
});

test("the stage's agent, by priority: offline, speaking, listening, working, idle", () => {
  const call = { inCall: true, isTarget: true, canHear: true, reach: "listening" as const, speaking: false, personSpeaking: false, working: false };
  expect(stageMood({ ...call, reach: "offline", canHear: false, speaking: true, personSpeaking: true, working: true })).toBe("offline");
  expect(stageMood({ ...call, speaking: true, personSpeaking: true, working: true })).toBe("speaking");
  expect(stageMood({ ...call, personSpeaking: true, working: true })).toBe("listening");
  expect(stageMood({ ...call, working: true })).toBe("working");
  // What used to be "waiting for you" is idle now.
  expect(stageMood(call)).toBe("idle");
  // Offline shows whether or not the page is in the call: the poster is the conversation's, not the call's.
  expect(stageMood({ ...call, inCall: false, reach: "offline", canHear: false })).toBe("offline");
  expect(stageMood({ ...call, inCall: false, speaking: true })).toBe("idle");
  expect(stageMood({ ...call, isTarget: false, speaking: true, personSpeaking: true })).toBe("idle");
});

test("it listens only while the person talks to it and it can hear them: holding, it does not react", () => {
  const call = { inCall: true, isTarget: true, canHear: true, reach: "listening" as const, speaking: false, personSpeaking: true, working: false };
  expect(stageMood(call)).toBe("listening");
  expect(stageMood({ ...call, reach: "holding", canHear: false })).toBe("idle");
  expect(stageMood({ ...call, reach: "holding", canHear: false, working: true })).toBe("idle");
  // Bound to the call but not listed by the room yet, it hears the call.
  expect(stageMood({ ...call, reach: null })).toBe("listening");
  expect(stageMood({ ...call, personSpeaking: false })).toBe("idle");
});

test("the person in the picture-in-picture keeps their own moves; the stage says its agent's in words", () => {
  expect(personMood({ inCall: true, speaking: true })).toBe("speaking");
  expect(personMood({ inCall: true, speaking: false })).toBe("present");
  expect(personMood({ inCall: false, speaking: true })).toBe("idle");
  expect(["offline", "speaking", "listening", "working", "idle"].map((mood) => moodText(mood as never, en)))
    .toEqual(["Offline", "Speaking", "Listening to you", "Working", "Resting"]);
});

test("the state line says the state in words, with what is unread beside a conversation that is not in the call", () => {
  expect(stateText(row("a", { selected: true, unread: 2 }), true, en)).toBe("In call");
  expect(stateText(row("a", { working: true }), true, en)).toBe("Working");
  expect(stateText(row("a", { unread: 2 }), true, en)).toBe("Waiting for you · 2 new");
  expect(stateText(row("a", { reach: "holding" }), true, en)).toBe("Can't receive");
  expect(stateText(row("a", { available: false, reach: "offline" }), true, en)).toBe("Offline");
  expect(stateText(row("a", { working: true }), true, translator("es"))).toBe("Trabajando");
});

test("conversations are grouped by the machine they run on — by its id, since two may share a name or have none", () => {
  const groups = machineGroups([
    row("a"), row("b", { machine: "Server", machineId: "m2" }), row("c"),
    row("d", { machine: "Laptop", machineId: "m3" }), row("e", { machine: null, machineId: "m4" }), row("f", { machine: null, machineId: "m5" }),
    row("g", { machine: null, machineId: null }),
  ]);
  expect(groups.map((group) => [group.machine, group.rows.map((item) => item.threadId)])).toEqual([
    ["Laptop", ["a", "c"]], ["Server", ["b"]], ["Laptop", ["d"]], [null, ["e"]], [null, ["f"]], [null, ["g"]],
  ]);
  expect(new Set(groups.map((group) => group.key)).size).toBe(groups.length);
});
