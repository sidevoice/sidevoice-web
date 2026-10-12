import { expect, test } from "vitest";
import { cardSnapshot, row } from "../test/call-card";
import { cardView, elsewhere, exitText, gateOpen, hearIt, idleWarning, micControl, rowView, stripOrder } from "./card-view";
import { translator } from "./i18n";

// What the floating card's options show (briefs/FLOATING-CARD-SPEC.md §2), from the host's state alone.
const t = translator("en");
const es = translator("es");
const B = { callModel: "voice-switch" as const, voiceOn: true };
const active = (extra = {}) => row("a", { title: "Claude", selected: true, ...extra });

test("§2.1 the gate: setup done, and the call on (A) or the voice on (B)", () => {
  expect(gateOpen(cardSnapshot())).toBe(true);
  expect(gateOpen(cardSnapshot({ setupDone: false }))).toBe(false);
  expect(gateOpen(cardSnapshot({ joined: false }))).toBe(false);
  // B: the voice, not the room (which is always open).
  expect(gateOpen(cardSnapshot({ ...B, voiceOn: false }))).toBe(false);
  expect(gateOpen(cardSnapshot({ ...B, joined: true }))).toBe(true);
});

test("O6's words: why the call or the voice ended by itself; nothing when the person ended it", () => {
  expect(exitText(cardSnapshot({ ended: { reason: "idle", detail: "" } }), t)).toBe("The call ended after 15 minutes without activity.");
  expect(exitText(cardSnapshot({ ended: { reason: "offline", detail: "Claude" } }), t)).toBe("The call ended: Claude went offline.");
  expect(exitText(cardSnapshot({ ended: { reason: "failed", detail: "the room closed it" } }), es)).toBe("La llamada terminó: the room closed it");
  expect(exitText(cardSnapshot({ ...B, voiceOffReason: "micLost" }), t)).toBe("Voice turned off: your microphone was disconnected.");
  expect(exitText(cardSnapshot({ ...B, voiceOffReason: "failed", voiceOffDetail: "no engine" }), t)).toBe("Voice stopped: no engine");
  expect(exitText(cardSnapshot({ ...B, voiceOffReason: "micUnavailable" }), t)).toBeNull();
  expect(exitText(cardSnapshot(), t)).toBeNull();
  expect(exitText(cardSnapshot({ ...B }), t)).toBeNull();
});

test("§2.2 the states, in priority order, with their words", () => {
  const at = (extra: Parameters<typeof cardSnapshot>[0] = {}, rowExtra = {}) => {
    const call = cardSnapshot({ participants: [active(rowExtra)], conversation: "a", title: "Claude", ...extra });
    return cardView(call, t);
  };
  expect(cardView(cardSnapshot({ ...B, conversation: null, participants: [row("x")] }), t)).toMatchObject({ state: "S0", line: "Choose a conversation", mood: null });
  expect(at({ busy: true, busyReason: "reconnecting", mood: "speaking" })).toMatchObject({ state: "S3", line: "Reconnecting…", whole: true });
  expect(at({ busy: true, busyReason: "switching", switchingTo: "Codex" })).toMatchObject({ state: "S3", line: "Switching to Codex…" });
  expect(at({ mood: "offline" }, { reach: "offline", available: false })).toMatchObject({ state: "S1", line: "Claude · Offline" });
  expect(at({}, { reach: "holding" })).toMatchObject({ state: "S2", line: "Claude · Can't receive" });
  expect(at({ mood: "speaking", turn: "listening" })).toMatchObject({ state: "S4", line: "Claude · Speaking" });
  expect(at({ mood: "listening", turn: "listening" })).toMatchObject({ state: "S5", line: "Claude · Listening to you" });
  expect(at({ mood: "listening", turn: "transcribing" })).toMatchObject({ state: "S6", line: "Claude · Listening to you" });
  expect(at({ ...B }, { mark: "waiting-for-you" })).toMatchObject({ state: "S8", line: "Claude · Waiting for you", mark: "waiting-for-you" });
  expect(at({ ...B, mood: "working" }, { mark: "wants-to-talk" })).toMatchObject({ state: "S8", line: "Claude · Wants to talk" });
  // A has no marks: the same row reads as working.
  expect(at({ mood: "working" }, { mark: "wants-to-talk" })).toMatchObject({ state: "S7", line: "Claude · Working" });
  expect(at({})).toMatchObject({ state: "S9", line: "Claude · Ready", stateWords: "Ready" });
  // "Ready" in both models: "waiting" means only the mark (D1).
  expect(at({ ...B })).toMatchObject({ state: "S9", line: "Claude · Ready" });
  expect(cardView(cardSnapshot({ participants: [active()], conversation: "a", title: "Claude" }), es).line).toBe("Claude · Lista");
});

test("O4: B counts the marks elsewhere (an amber hand); otherwise what is unread elsewhere (a dot)", () => {
  const rows = [active({ mark: "waiting-for-you" }), row("b", { mark: "wants-to-talk" }), row("c", { mark: "waiting-for-you", available: false }), row("d", { unread: 3 })];
  expect(elsewhere(cardSnapshot({ ...B, participants: rows, conversation: "a" }), t)).toEqual({ kind: "hand", count: 1, text: "Another conversation wants to talk" });
  expect(elsewhere(cardSnapshot({ ...B, participants: [...rows, row("e", { mark: "wants-to-talk" })], conversation: "a" }), t)?.text).toBe("2 other conversations want to talk");
  expect(elsewhere(cardSnapshot({ participants: rows, conversation: "a" }), t)).toEqual({ kind: "dot", count: 3, text: "3 unread" });
  expect(elsewhere(cardSnapshot({ participants: [active()], conversation: "a" }), t)).toBeNull();
});

test("the microphone: A flips its name and is disabled as today; B keeps one name and says why it cannot be used", () => {
  expect(micControl(cardSnapshot(), "⌃⌥M", t)).toEqual({ name: "Mute", title: "Mute (⌃⌥M)", pressed: false, disabled: false, reason: null });
  expect(micControl(cardSnapshot({ micEnabled: false, micDisabled: true }), "", t)).toMatchObject({ name: "Unmute", pressed: true, disabled: true });
  expect(micControl(cardSnapshot({ ...B, micEnabled: false }), "⌃⌥M", t)).toMatchObject({ name: "Mute microphone", pressed: true, disabled: false, reason: null });
  expect(micControl(cardSnapshot({ ...B, micDisabled: true, micReason: "cantHear", title: "Claude" }), "", t))
    .toMatchObject({ name: "Mute microphone", disabled: false, reason: "Claude can't hear you right now", title: "Claude can't hear you right now" });
  expect(micControl(cardSnapshot({ ...B, micReason: "connecting", title: "Claude", switchingTo: "Codex" }), "", t).reason).toBe("Connecting to Codex…");
  expect(micControl(cardSnapshot({ ...B, micReason: "noConversation" }), "", t).reason).toBe("Choose a conversation to talk to");
});

test("Hear it (B): the active conversation's, with a mark it can hear; asking; no answer; its name says unmuting first", () => {
  const call = cardSnapshot({ ...B });
  expect(hearIt(call, active({ mark: "waiting-for-you" }), t)).toEqual({ state: "mark", visible: "Hear it", name: "Hear it" });
  expect(hearIt(cardSnapshot({ ...B, agentsMuted: true }), active({ mark: "waiting-for-you" }), t)?.name).toBe("Unmute agents and hear it");
  expect(hearIt(call, active({ hearing: "asking" }), t)).toEqual({ state: "asking", visible: "Asking…", name: "Asking Claude…" });
  expect(hearIt(call, active({ hearing: "no-answer" }), t)).toMatchObject({ state: "no-answer", visible: "Didn't answer by voice" });
  expect(hearIt(call, active({ mark: "waiting-for-you", reach: "holding" }), t)).toBeNull();
  expect(hearIt(call, active(), t)).toBeNull();
  expect(hearIt(cardSnapshot(), active({ mark: "waiting-for-you" }), t)).toBeNull();
});

test("O5: the idle warning and its Keep, in each model's words", () => {
  expect(idleWarning(cardSnapshot({ idleWarning: true }), t)).toEqual({ text: "Still there? The call ends in 1 minute.", keep: "Stay in the call" });
  expect(idleWarning(cardSnapshot({ ...B, idleWarning: true }), t)).toEqual({ text: "Still there? Voice turns off in 1 minute.", keep: "Keep voice on" });
  expect(idleWarning(cardSnapshot(), t)).toBeNull();
});

test("the strip's rows: their mood, dot and words; A cannot call one that cannot hear, B can pick any but while switching", () => {
  const a = cardSnapshot();
  expect(rowView(a, row("b", { title: "Codex", reach: "offline", available: false }), t))
    .toMatchObject({ mood: "offline", dot: "idle", name: "Codex · Offline", disabled: true, reason: "Codex can't hear you right now" });
  expect(rowView(a, row("b", { title: "Codex", working: true }), t)).toMatchObject({ mood: "working", dot: "working", name: "Codex · Working", disabled: false });
  expect(rowView(a, row("b", { title: "Codex" }), t)).toMatchObject({ dot: "waiting", name: "Codex · Ready" });
  const b = cardSnapshot({ ...B });
  expect(rowView(b, row("b", { title: "Codex", reach: "holding" }), t)).toMatchObject({ name: "Codex · Can't receive", disabled: false, reason: null });
  expect(rowView(b, row("b", { title: "Codex", mark: "waiting-for-you", agentWorking: false }), t)).toMatchObject({ dot: "waiting-for-you", marked: true, name: "Codex · Waiting for you" });
  expect(rowView(b, row("b", { switching: true }), t).disabled).toBe(true);
});

test("the strip's order: B by mark, working, the rest (more unread first); A by unread, working; held while the pointer is over it", () => {
  const rows = [active(), row("rest"), row("work", { agentWorking: true, working: true }), row("wants", { mark: "wants-to-talk" }),
    row("unread", { unread: 2 }), row("waits", { mark: "waiting-for-you" }), row("more", { unread: 5 })];
  const ids = (list: { threadId: string }[]) => list.map((r) => r.threadId);
  expect(ids(stripOrder(cardSnapshot({ ...B, participants: rows, conversation: "a" })))).toEqual(["waits", "wants", "work", "more", "unread", "rest"]);
  expect(ids(stripOrder(cardSnapshot({ participants: rows, conversation: "a" })))).toEqual(["unread", "more", "work", "rest", "wants", "waits"]);
  const kept = ["rest", "gone", "work"];
  expect(ids(stripOrder(cardSnapshot({ ...B, participants: rows, conversation: "a" }), kept))).toEqual(["rest", "work", "wants", "unread", "waits", "more"]);
});
