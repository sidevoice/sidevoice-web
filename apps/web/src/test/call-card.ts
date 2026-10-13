import type { CallSnapshot } from "../call-controls/host";
import type { ParticipantView } from "../state/room-types";

/* The desktop card's tests: a conversation row, and a snapshot as the room projects it (callCardView) with the host's
 * stamps. */

export function row(threadId: string, extra: Partial<ParticipantView> = {}): ParticipantView {
  return {
    threadId, title: threadId, selected: false, available: true, switching: false, unread: 0, reach: "listening",
    stateLabel: "", subtitle: "", working: false, machine: "daimon", harness: "claude", ...extra,
  };
}

/** A call on its first row, set up, everything quiet; `overrides` on top. */
export function cardSnapshot(overrides: Partial<CallSnapshot> = {}): CallSnapshot {
  const participants = overrides.participants ?? [row("a", { title: "Sidevoice: mini call", selected: true })];
  const active = participants.find((candidate) => candidate.selected) ?? null;
  return {
    version: 2, ready: true, joined: true, busy: false, micEnabled: true, micDisabled: false, title: active?.title ?? "",
    agent: "idle", youTalking: false, canSkip: false, conversation: active?.threadId ?? null, since: Date.now() - 60_000,
    participants, devices: null,
    setupDone: true, mood: "idle", turn: null, idleWarning: false, ended: null,
    busyReason: null, switchingTo: null, theme: "dark", language: "en", micSilent: false,
    ...overrides,
  };
}
