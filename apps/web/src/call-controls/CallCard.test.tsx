import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CallCard, CLICK_GUARD_MS, duration, SHOW_DELAY_MS } from "./CallCard";
import type { CallControlsHost, CallControlsState, CallSnapshot } from "./host";
import { cardLanguage, translator } from "./i18n";

const t = translator("en");

function snapshot(overrides: Partial<CallSnapshot> = {}): CallSnapshot {
  return {
    version: 2, ready: true, joined: true, busy: false, micEnabled: true, micDisabled: false, title: "Sidevoice: mini call",
    agent: "idle", youTalking: false, canSkip: false, since: Date.now() - 754_000,
    participants: [
      { threadId: "a", title: "Sidevoice: mini call", selected: true, available: true, switching: false, unread: 0, reach: "listening",
        stateLabel: "", subtitle: "", working: false, machine: "daimon", harness: "claude" },
      { threadId: "b", title: "brand/web", selected: false, available: true, switching: false, unread: 2, reach: "listening",
        stateLabel: "", subtitle: "2 unread", working: true, machine: "daimon", harness: "claude" },
    ],
    devices: { inputs: [{ id: "default", label: "Predeterminado del sistema" }, { id: "mbp", label: "MacBook Pro Microphone" }],
      outputs: [{ id: "default", label: "Predeterminado del sistema" }], inputId: "default", outputId: "default",
      available: true, outputAvailable: true, busy: false },
    ...overrides,
  };
}

function fakeHost(initial: Partial<CallControlsState> = {}) {
  let listener: ((state: CallControlsState) => void) | null = null;
  let state: CallControlsState = { call: snapshot(), level: 0, pointerInside: null, alwaysExpanded: false, muteShortcut: "⌃⌥M", ...initial };
  const host: CallControlsHost & { push(next: Partial<CallControlsState>): void } = {
    subscribe(fn) { listener = fn; fn(state); return () => { listener = null; }; },
    run: vi.fn(),
    layout: vi.fn(),
    drag: vi.fn(),
    push(next) { state = { ...state, ...next }; act(() => listener?.(state)); },
  };
  return host;
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { vi.useRealTimers(); });

function hoverAndWait() {
  const card = document.querySelector(".call-card")!;
  fireEvent.pointerEnter(card);
  act(() => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
  act(() => { vi.advanceTimersByTime(CLICK_GUARD_MS + 10); });
}

test("at rest: the agent, the conversation, who is on it and for how long, and your wave — no controls", () => {
  render(<CallCard host={fakeHost()} t={t} />);
  expect(screen.getByRole("button", { name: /Sidevoice: mini call/ })).toBeInTheDocument();
  expect(screen.getByText("daimon")).toBeInTheDocument();
  expect(screen.getByText("Claude Code")).toBeInTheDocument();
  expect(screen.getByText("12:34")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "The agent is idle" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Your microphone" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Hang up" })).not.toBeInTheDocument();
});

test("the avatar shows only the agent, the wave only you: muted crosses the wave, not the avatar", () => {
  const host = fakeHost();
  render(<CallCard host={host} t={t} />);
  host.push({ call: snapshot({ agent: "speaking", micEnabled: false }) });
  expect(screen.getByRole("img", { name: "The agent is speaking" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "You are muted" })).toHaveAttribute("data-muted", "true");
  expect(document.querySelector(".agent-mark")).toHaveAttribute("data-state", "speaking");
});

test("reconnecting overrides both and is written", () => {
  const host = fakeHost();
  render(<CallCard host={host} t={t} />);
  host.push({ call: snapshot({ busy: true, agent: "working" }) });
  expect(screen.getAllByText("Reconnecting…").length).toBeGreaterThan(0);
  expect(document.querySelector(".agent-mark")).toHaveAttribute("data-state", "reconnecting");
});

test("near the pointer the call controls appear; they carry the room's commands to the app", () => {
  const host = fakeHost({ call: snapshot({ canSkip: true }) });
  render(<CallCard host={host} t={t} />);
  hoverAndWait();
  fireEvent.click(screen.getByRole("button", { name: "Mute" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip what is playing" }));
  fireEvent.click(screen.getByRole("button", { name: "Hang up" }));
  fireEvent.click(screen.getByRole("button", { name: "Open Sidevoice" }));
  expect(vi.mocked(host.run).mock.calls.map(([c]) => c.command)).toEqual(["toggle-mute", "skip-reply", "hang-up", "open-app"]);
  expect(screen.getByRole("button", { name: "Mute" })).toHaveAttribute("title", "Mute (⌃⌥M)");
});

test("the app's own view of the pointer wins over the card's hover events", () => {
  const host = fakeHost({ pointerInside: false });
  render(<CallCard host={host} t={t} />);
  fireEvent.pointerEnter(document.querySelector(".call-card")!);
  act(() => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
  expect(screen.queryByRole("button", { name: "Hang up" })).not.toBeInTheDocument();
  host.push({ pointerInside: true });
  act(() => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
  expect(screen.getByRole("button", { name: "Hang up" })).toBeInTheDocument();
});

test("right after the controls appear, their buttons ignore a click", () => {
  const host = fakeHost();
  render(<CallCard host={host} t={t} />);
  fireEvent.pointerEnter(document.querySelector(".call-card")!);
  act(() => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
  fireEvent.click(screen.getByRole("button", { name: "Hang up" }));
  expect(host.run).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(CLICK_GUARD_MS + 10); });
  fireEvent.click(screen.getByRole("button", { name: "Hang up" }));
  expect(host.run).toHaveBeenCalledWith({ command: "hang-up" });
});

test("always expanded: the controls stay without hover", () => {
  render(<CallCard host={fakeHost({ alwaysExpanded: true })} t={t} />);
  expect(screen.getByRole("button", { name: "Hang up" })).toBeInTheDocument();
});

test("the title opens the room's conversation list (without its menu); picking one switches through the app", () => {
  const host = fakeHost();
  render(<CallCard host={host} t={t} />);
  hoverAndWait();
  fireEvent.click(screen.getByRole("button", { name: /Sidevoice: mini call/ }));
  expect(screen.getByText("brand/web")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Opciones de/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("brand/web"));
  expect(host.run).toHaveBeenCalledWith({ command: "select-participant", threadId: "b" });
  expect(screen.queryByText("brand/web")).not.toBeInTheDocument();
});

test("the microphone's chevron opens the devices: the system default in the card's words, and the room's choice", () => {
  const host = fakeHost();
  render(<CallCard host={host} t={t} />);
  hoverAndWait();
  fireEvent.click(screen.getByRole("button", { name: "Microphone and speaker" }));
  fireEvent.click(screen.getByRole("button", { name: /Microphone.*System default/ }));
  fireEvent.click(screen.getByRole("option", { name: /MacBook Pro Microphone/ }));
  expect(host.run).toHaveBeenCalledWith({ command: "select-audio-device", kind: "input", id: "mbp" });
});

test("a press that moves is a drag of the window, not a click", () => {
  const host = fakeHost();
  render(<CallCard host={host} t={t} />);
  hoverAndWait();
  const title = screen.getByRole("button", { name: /Sidevoice: mini call/ });
  fireEvent.pointerDown(title, { button: 0, pointerId: 1, screenX: 100, screenY: 100 });
  fireEvent.pointerMove(title, { pointerId: 1, screenX: 110, screenY: 104 });
  fireEvent.pointerUp(title, { pointerId: 1, screenX: 120, screenY: 108 });
  fireEvent.click(title);
  expect(vi.mocked(host.drag).mock.calls.map(([phase]) => phase)).toEqual(["start", "move", "end"]);
  expect(screen.queryByText("brand/web")).not.toBeInTheDocument();
  // Buttons never start one.
  fireEvent.pointerDown(screen.getByRole("button", { name: "Hang up" }), { button: 0, pointerId: 2, screenX: 0, screenY: 0 });
  fireEvent.pointerMove(screen.getByRole("button", { name: "Hang up" }), { pointerId: 2, screenX: 50, screenY: 0 });
  expect(host.drag).toHaveBeenCalledTimes(3);
});

test("the window is sized to the card plus its margin, and never to nothing", () => {
  const host = fakeHost();
  const box = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
  box.mockReturnValue({ width: 0, height: 0 } as DOMRect);
  render(<CallCard host={host} t={t} />);
  expect(host.layout).not.toHaveBeenCalled();
  cleanup();
  box.mockReturnValue({ width: 320, height: 54 } as DOMRect);
  render(<CallCard host={host} t={t} />);
  expect(host.layout).toHaveBeenCalledWith({ width: 344, height: 78 });
  box.mockRestore();
});

test("nothing outside a call", () => {
  const { container } = render(<CallCard host={fakeHost({ call: snapshot({ joined: false }) })} t={t} />);
  expect(container).toBeEmptyDOMElement();
});

test("Spanish when the system speaks it; English for any other language", () => {
  expect(cardLanguage(["es-ES"])).toBe("es");
  expect(cardLanguage(["de-DE"])).toBe("en");
  expect(translator("es")("card.hangUp")).toBe("Colgar");
  expect(translator("de")("card.hangUp")).toBe("Hang up");
});

test("the call's duration reads like a clock", () => {
  expect(duration(1_000, 1_000 + 65_000)).toBe("1:05");
  expect(duration(0, 5_000)).toBe("");
  expect(duration(1_000, 1_000 + 3_725_000)).toBe("1:02:05");
});
