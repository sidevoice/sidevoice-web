import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CallCard, CLICK_GUARD_MS, SHOW_DELAY_MS } from "./CallCard";
import type { CallControlsHost, CallControlsState, CallSnapshot } from "./host";
import { translator } from "./i18n";

// The desktop card in call model B, the voice switch (contract gap #38, G9): there while the voice is on, with Mute agents
// and its count, a neutral "Turn off voice", one name for the microphone, and the marks in the picker.
const t = translator("en");
const row = (threadId: string, extra: Record<string, unknown> = {}) => ({
  threadId, title: threadId, selected: false, available: true, switching: false, unread: 0, reach: "listening" as const,
  stateLabel: "", subtitle: "", working: false, machine: "daimon", harness: "claude", ...extra,
});
function snapshot(overrides: Partial<CallSnapshot> = {}): CallSnapshot {
  return {
    version: 2, ready: true, joined: true, busy: false, micEnabled: false, micDisabled: false, title: "web", agent: "idle",
    youTalking: false, canSkip: false, since: Date.now() - 60_000, devices: null,
    participants: [row("web", { selected: true }), row("docs", { mark: "waiting-for-you" }), row("release", { mark: "wants-to-talk" })],
    callModel: "voice-switch", voiceOn: true, agentsMuted: false, wantToTalk: 2, voiceOffReason: null, ...overrides,
  };
}
function fakeHost(call: CallSnapshot) {
  let listener: ((state: CallControlsState) => void) | null = null;
  let state: CallControlsState = { call, level: 0, pointerInside: null, alwaysExpanded: true, muteShortcut: "" };
  const host: CallControlsHost & { push(next: Partial<CallSnapshot>): void } = {
    subscribe(fn) { listener = fn; fn(state); return () => { listener = null; }; },
    run: vi.fn(), layout: vi.fn(), drag: vi.fn(),
    push(next) { state = { ...state, call: { ...state.call, ...next } }; act(() => listener?.(state)); },
  };
  return host;
}
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { vi.useRealTimers(); });
const ready = () => act(() => { vi.advanceTimersByTime(SHOW_DELAY_MS + CLICK_GUARD_MS + 20); });

test("shown while the voice is on, hidden once it is off — the room's window says why", () => {
  const host = fakeHost(snapshot());
  render(<CallCard host={host} t={t} />);
  expect(document.querySelector(".call-card")).toBeInTheDocument();
  host.push({ voiceOn: false, voiceOffReason: "idle" });
  expect(document.querySelector(".call-card")).toBeNull();
});

test("its controls: the microphone by one name, Mute agents with the count, skip, and a neutral Turn off voice — no hang-up", () => {
  const host = fakeHost(snapshot());
  render(<CallCard host={host} t={t} />);
  ready();
  const mic = screen.getByRole("button", { name: "Mute microphone" });
  expect(mic).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("button", { name: "Hang up" })).toBeNull();
  const agents = screen.getByRole("button", { name: "Mute agents" });
  expect(agents).toHaveAttribute("aria-pressed", "false");
  expect(agents.querySelector(".card-agents-badge")).toBeNull();
  fireEvent.click(agents);
  expect(host.run).toHaveBeenLastCalledWith({ command: "toggle-agents" });
  host.push({ agentsMuted: true });
  expect(screen.getByRole("button", { name: "Mute agents" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Mute agents" }).querySelector(".card-agents-badge")).toHaveTextContent("2");
  expect(screen.getByRole("button", { name: "Mute agents" })).toHaveAccessibleDescription("2 conversations want to talk");
  const off = screen.getByRole("button", { name: "Turn off voice" });
  expect(off).toHaveClass("card-voice-off");
  fireEvent.click(off);
  expect(host.run).toHaveBeenLastCalledWith({ command: "voice-off" });
});

test("the picker marks the conversations with something unheard, in words and with an amber dot", () => {
  const host = fakeHost(snapshot());
  render(<CallCard host={host} t={t} />);
  ready();
  fireEvent.click(document.querySelector(".card-title")!);
  const rows = [...document.querySelectorAll(".card-panel .participant-row")];
  expect(rows[1]).toHaveTextContent("waiting for you");
  expect(rows[2]).toHaveTextContent("wants to talk");
  expect(rows[1].querySelector(".card-mark")).toHaveAttribute("data-mark", "waiting-for-you");
  expect(rows[0].querySelector(".card-mark")).toBeNull();
});

test("a room that runs the call model A keeps today's card, though its snapshot carries the voice's fields too", () => {
  // The room projects voiceOn in both models: guessing B from it gave an A room B's card.
  const host = fakeHost(snapshot({ callModel: "call", voiceOn: false }));
  render(<CallCard host={host} t={t} />);
  ready();
  expect(screen.getByRole("button", { name: "Hang up" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mute agents" })).toBeNull();
  expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
});
