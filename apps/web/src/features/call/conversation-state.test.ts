import { expect, test } from "vitest";
import type { ParticipantView } from "../../state/room-types";
import { callTranslator } from "./call-i18n";
import { conversationState, headerConversations, machineGroups, personMood, smallAvatarMood, stageMood, stateText } from "./conversation-state";

const row = (threadId: string, extra: Partial<ParticipantView> = {}): ParticipantView => ({
  threadId, title: threadId, selected: false, available: true, switching: false, unread: 0, reach: "listening",
  stateLabel: "", subtitle: "", working: false, machine: "Laptop", machineId: "m1", ...extra,
});
const en = callTranslator("en");

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
  expect(smallAvatarMood(bound, false)).toBe("waiting");
  expect(stateText(bound, false, en)).toBe("Waiting for you · 2 new");
  expect(stateText(bound, true, en)).toBe("In call");
  // Out of the call it may sit in the header like any other conversation waiting for you.
  expect(headerConversations([bound, row("b", { working: true })], null, false).map((item) => item.threadId)).toEqual(["a", "b"]);
});

test("state maps to the avatars' moves: small ones breathe, sway or dim; the stage acts the call out", () => {
  expect(smallAvatarMood(row("a", { working: true }), true)).toBe("working");
  expect(smallAvatarMood(row("a"), true)).toBe("waiting");
  expect(smallAvatarMood(row("a", { available: false, reach: "offline" }), true)).toBe("idle");
  expect(smallAvatarMood(row("a", { selected: true }), true)).toBe("waiting");
  expect(smallAvatarMood(row("a", { selected: true, working: true }), true)).toBe("working");

  const call = { inCall: true, isTarget: true, canHear: true, speaking: false, working: false };
  expect(stageMood({ ...call, speaking: true, working: true })).toBe("speaking");
  expect(stageMood({ ...call, working: true })).toBe("working");
  expect(stageMood(call)).toBe("waiting");
  expect(stageMood({ ...call, inCall: false })).toBe("idle");
  expect(stageMood({ ...call, isTarget: false, speaking: true })).toBe("idle");
  expect(stageMood({ ...call, canHear: false, working: true })).toBe("idle");

  expect(personMood({ inCall: true, speaking: true })).toBe("speaking");
  expect(personMood({ inCall: true, speaking: false })).toBe("present");
  expect(personMood({ inCall: false, speaking: true })).toBe("idle");
});

test("a phone's header shows at most two others: waiting for you first, then working; never idle ones or the stage's", () => {
  const rows = [
    row("stage", { selected: true }),
    row("busy-1", { working: true }),
    row("off", { available: false, reach: "offline" }),
    row("busy-2", { working: true }),
    row("waits", {}),
  ];
  expect(headerConversations(rows, "stage", true).map((item) => item.threadId)).toEqual(["waits", "busy-1"]);
  expect(headerConversations(rows.filter((item) => item.threadId !== "waits"), "stage", true).map((item) => item.threadId)).toEqual(["busy-1", "busy-2"]);
  // Within a state, the one with more to read comes first; otherwise the room's order.
  const waiting = [row("w1"), row("w2", { unread: 3 }), row("w3", { unread: 1 })];
  expect(headerConversations(waiting, null, true).map((item) => item.threadId)).toEqual(["w2", "w3"]);
  expect(headerConversations([row("stage", { selected: true }), row("off", { reach: "holding" })], "stage", true)).toEqual([]);
});

test("the state line says the state in words, with what is unread beside a conversation that is not in the call", () => {
  expect(stateText(row("a", { selected: true, unread: 2 }), true, en)).toBe("In call");
  expect(stateText(row("a", { working: true }), true, en)).toBe("Working");
  expect(stateText(row("a", { unread: 2 }), true, en)).toBe("Waiting for you · 2 new");
  expect(stateText(row("a", { reach: "holding" }), true, en)).toBe("Can't receive");
  expect(stateText(row("a", { available: false, reach: "offline" }), true, en)).toBe("Offline");
  expect(stateText(row("a", { working: true }), true, callTranslator("es"))).toBe("Trabajando");
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
