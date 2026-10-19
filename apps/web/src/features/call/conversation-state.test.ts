import { expect, test } from "vitest";
import type { ParticipantView } from "../../state/room-types";
import { translator } from "../../i18n/translator";
import { conversationState, machineGroups, moodText, personMood, stageMood, hasUnread, stateText } from "./conversation-state";

const row = (threadId: string, extra: Partial<ParticipantView> = {}): ParticipantView => ({
  threadId, title: threadId, selected: false, available: true, switching: false, unread: 0, reach: "listening",
  working: false, machine: "Laptop", machineId: "m1", ...extra,
});
const en = translator("en");

test("a conversation's state: working, the call's own, waiting for you, or out of reach", () => {
  expect(conversationState(row("a", { selected: true }), true)).toBe("in-call");
  // The call's own conversation at work says so (desktop trial, item 11): "In call" no longer hides it.
  expect(conversationState(row("a", { selected: true, working: true }), true)).toBe("working");
  expect(stateText(row("a", { selected: true, working: true }), true, en)).toBe("Working");
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
  expect(stateText(bound, false, en)).toBe("Waiting for you");
  expect(stateText(bound, true, en)).toBe("In call");
  expect(stateText({ ...bound, working: true }, true, en)).toBe("Working");
});

test("working is the conversation's own: it works whoever it talks to, in the call or out of it, holding or not (#166)", () => {
  const other = { inCall: true, isTarget: false, canHear: true, reach: "listening" as const, speaking: false, personSpeaking: false, working: true };
  expect(stageMood(other)).toBe("working");
  expect(stageMood({ ...other, working: false })).toBe("idle");
  expect(stageMood({ ...other, isTarget: true, inCall: false })).toBe("working");
  expect(stageMood({ ...other, isTarget: true, reach: "holding", canHear: false })).toBe("working");
  // Offline beats everything: the room cannot reach it, so it sleeps.
  expect(stageMood({ ...other, reach: "offline", canHear: false })).toBe("offline");
});

test("the stage's agent, by priority: offline, speaking, listening, working, idle", () => {
  const call = { inCall: true, isTarget: true, canHear: true, reach: "listening" as const, speaking: false, personSpeaking: false, working: false };
  expect(stageMood({ ...call, reach: "offline", canHear: false, personSpeaking: true, working: true })).toBe("offline");
  // A reply it is saying plays to its end whatever happens to the link: the poster waits for it (#220).
  expect(stageMood({ ...call, reach: "offline", canHear: false, speaking: true, personSpeaking: true, working: true })).toBe("speaking");
  expect(stageMood({ ...call, reach: "offline", canHear: false, isTarget: false, speaking: true })).toBe("offline");
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
  // It does not react to the person, but its work goes on (#166).
  expect(stageMood({ ...call, reach: "holding", canHear: false, working: true })).toBe("working");
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

test("the unread mark: never on the focused or the call's conversation, one on another, gone once focused", () => {
  const other = row("b", { unread: 2 });
  expect(hasUnread(other, "a")).toBe(true);
  expect(hasUnread(other, "b")).toBe(false);
  expect(hasUnread(row("a", { selected: true, unread: 2 }), "b")).toBe(false);
  expect(hasUnread(row("b"), "a")).toBe(false);
  // Nothing about it is a count.
  expect(stateText(other, true, en)).toBe("Waiting for you");
});

test("the state line says the state in words", () => {
  expect(stateText(row("a", { selected: true, unread: 2 }), true, en)).toBe("In call");
  expect(stateText(row("a", { working: true }), true, en)).toBe("Working");
  expect(stateText(row("a", { unread: 2 }), true, en)).toBe("Waiting for you");
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
