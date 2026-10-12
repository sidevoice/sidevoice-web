import { act } from "@testing-library/react";
import { vi } from "vitest";
import type { CallControlsHost, CallControlsState, CallSnapshot } from "../call-controls/host";
import type { ParticipantView } from "../state/room-types";

/* The desktop card's tests: a conversation row, a snapshot as the room projects it (callCardView) with the host's
 * stamps, and a host that records what the card asks of it. */

export function row(threadId: string, extra: Partial<ParticipantView> = {}): ParticipantView {
  return {
    threadId, title: threadId, selected: false, available: true, switching: false, unread: 0, reach: "listening",
    stateLabel: "", subtitle: "", working: false, machine: "daimon", harness: "claude", ...extra,
  };
}

/** A call (A) on its first row, set up, everything quiet; `overrides` on top. */
export function cardSnapshot(overrides: Partial<CallSnapshot> = {}): CallSnapshot {
  const participants = overrides.participants ?? [row("a", { title: "Sidevoice: mini call", selected: true })];
  const active = participants.find((candidate) => candidate.selected) ?? null;
  return {
    version: 2, ready: true, joined: true, busy: false, micEnabled: true, micDisabled: false, title: active?.title ?? "",
    agent: "idle", youTalking: false, canSkip: false, conversation: active?.threadId ?? null, since: Date.now() - 60_000,
    participants, devices: null,
    voiceOn: false, agentsMuted: false, wantToTalk: 0, voiceOffReason: null, voiceOffDetail: "",
    setupDone: true, callModel: "call", mood: "idle", turn: null, idleWarning: false, ended: null, micReason: null,
    busyReason: null, switchingTo: null, theme: "dark", language: "en", micSilent: false,
    ...overrides,
  };
}

export type FakeHost = CallControlsHost & {
  run: ReturnType<typeof vi.fn>; layout: ReturnType<typeof vi.fn>; drag: ReturnType<typeof vi.fn>;
  /** The app sends a new state: the fields given, over the last one. */
  push(next: Partial<CallControlsState>): void;
  /** The app sends a new snapshot: the call's fields given, over the last one. */
  call(next: Partial<CallSnapshot>): void;
};

export function fakeHost(initial: Partial<CallControlsState> = {}): FakeHost {
  let listener: ((state: CallControlsState) => void) | null = null;
  let state: CallControlsState = { call: cardSnapshot(), level: 0, pointerInside: null, alwaysExpanded: false, muteShortcut: "⌃⌥M", ...initial };
  const host: FakeHost = {
    subscribe(fn) { listener = fn; fn(state); return () => { listener = null; }; },
    run: vi.fn(), layout: vi.fn(), drag: vi.fn(),
    push(next) { state = { ...state, ...next }; act(() => listener?.(state)); },
    call(next) { state = { ...state, call: { ...state.call, ...next } }; act(() => listener?.(state)); },
  };
  return host;
}
