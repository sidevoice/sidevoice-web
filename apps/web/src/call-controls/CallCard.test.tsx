import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CallCard, CLICK_GUARD_MS, duration, PANEL_CLOSE_MS, SHOW_DELAY_MS, WAVE_SAMPLE_MS } from "./CallCard";
import type { CallControlsHost, CallControlsState, CallSnapshot } from "./host";
import { cardLanguage, translator } from "./i18n";

const t = translator("en");

function snapshot(overrides: Partial<CallSnapshot> = {}): CallSnapshot {
  return {
    version: 2, ready: true, joined: true, busy: false, micEnabled: true, micDisabled: false, title: "Sidevoice: mini call",
    agent: "idle", youTalking: false, canSkip: false, since: SINCE,
    participants: [
      { threadId: "a", title: "Sidevoice: mini call", selected: true, available: true, switching: false, unread: 0, reach: "listening",
        stateLabel: "Escuchando", subtitle: "", working: false, machine: "daimon", harness: "claude" },
      { threadId: "b", title: "brand/web", selected: false, available: true, switching: false, unread: 2, reach: "listening",
        stateLabel: "2 nuevas", subtitle: "2 nuevas", working: true, machine: "daimon", harness: "claude" },
      { threadId: "c", title: "landing", selected: false, available: false, switching: false, unread: 0, reach: "offline",
        stateLabel: "Desconectada", subtitle: "Desconectada", working: false, machine: "portátil", harness: "cursor" },
    ],
    devices: { inputs: [{ id: "default", label: "Predeterminado del sistema", system: true }, { id: "mbp", label: "MacBook Pro Microphone" },
      { id: "x", label: "Micrófono 2", number: 2 }, { id: "gone", label: "Dispositivo seleccionado · desconectado", missing: true }],
      outputs: [{ id: "default", label: "Predeterminado del sistema", system: true }], inputId: "default", outputId: "default",
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

// One call's start for the whole test: the card is the same card for as long as the call (its `since`) is the same.
let SINCE = 0;
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); SINCE = Date.now() - 754_000; });
afterEach(() => { vi.useRealTimers(); });

const card = () => document.querySelector(".call-card")!;
function hoverAndWait() {
  fireEvent.pointerEnter(card());
  act(() => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
  act(() => { vi.advanceTimersByTime(CLICK_GUARD_MS + 10); });
}
const waveHeights = () => [...document.querySelectorAll(".your-wave i")].map((bar) => (bar as HTMLElement).style.height);

test("at rest: the agent, the conversation, who is on it and for how long, and your wave — no controls", () => {
  render(<CallCard host={fakeHost()} t={t} />);
  expect(screen.getByRole("button", { name: /Sidevoice: mini call/ })).toBeInTheDocument();
  expect(screen.getByText("daimon")).toBeInTheDocument();
  expect(screen.getByText("Claude Code")).toBeInTheDocument();
  expect(screen.getByText("12:34")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "The agent is idle" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Your microphone" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Hang up" })).not.toBeInTheDocument();
  // "Open Sidevoice" and the title's chevron keep their places at rest, so nothing moves when they appear.
  expect(document.querySelector(".card-open")).toBeInTheDocument();
  expect(document.querySelector(".card-title-chevron")).toBeInTheDocument();
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

test("the wave samples the level over time: silence drains it, muting flattens it", () => {
  const host = fakeHost();
  render(<CallCard host={host} t={t} />);
  for (const level of [50, 60, 70, 80, 90]) {
    host.push({ level });
    act(() => { vi.advanceTimersByTime(WAVE_SAMPLE_MS); });
  }
  expect(waveHeights().every((h) => h !== "3px")).toBe(true);
  host.push({ level: 0 });
  act(() => { vi.advanceTimersByTime(WAVE_SAMPLE_MS * 5); });
  expect(waveHeights()).toEqual(["3px", "3px", "3px", "3px", "3px"]);
  host.push({ level: 80 });
  act(() => { vi.advanceTimersByTime(WAVE_SAMPLE_MS * 5); });
  expect(waveHeights().every((h) => h !== "3px")).toBe(true); // a sustained level stays up
  host.push({ call: snapshot({ micEnabled: false }) });
  host.push({ call: snapshot({ micEnabled: true }), level: 0 });
  expect(waveHeights()).toEqual(["3px", "3px", "3px", "3px", "3px"]); // unmuting never shows old peaks
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
  fireEvent.pointerEnter(card());
  act(() => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
  expect(screen.queryByRole("button", { name: "Hang up" })).not.toBeInTheDocument();
  host.push({ pointerInside: true });
  act(() => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
  expect(screen.getByRole("button", { name: "Hang up" })).toBeInTheDocument();
});

test("right after the controls appear, and after any change of the card's size, buttons ignore a click", () => {
  const host = fakeHost();
  const box = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 320, height: 54 } as DOMRect);
  render(<CallCard host={host} t={t} />);
  fireEvent.pointerEnter(card());
  act(() => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
  fireEvent.click(screen.getByRole("button", { name: "Hang up" }));
  expect(host.run).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(CLICK_GUARD_MS + 10); });
  fireEvent.click(screen.getByRole("button", { name: "Hang up" }));
  expect(host.run).toHaveBeenCalledWith({ command: "hang-up" });
  box.mockRestore();
});

test("always expanded: the controls stay without hover", () => {
  render(<CallCard host={fakeHost({ alwaysExpanded: true })} t={t} />);
  expect(screen.getByRole("button", { name: "Hang up" })).toBeInTheDocument();
});

test("the title opens the conversations below the controls, in the card's words; only one that is there can be chosen", () => {
  const host = fakeHost();
  render(<CallCard host={host} t={t} />);
  hoverAndWait();
  fireEvent.click(screen.getByRole("button", { name: /Sidevoice: mini call/ }));
  const controls = document.querySelector(".card-controls")!;
  const panel = document.querySelector(".card-panel.conversations")!;
  expect(controls.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText(/nuevas|Desconectada|Escuchando/)).not.toBeInTheDocument();
  expect(document.querySelector(".card-badge")).toHaveTextContent("2");
  expect(screen.getByText(/offline/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /landing/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /brand\/web/ }));
  expect(host.run).toHaveBeenCalledWith({ command: "select-participant", threadId: "b" });
  expect(screen.queryByText("brand/web")).not.toBeInTheDocument();
});

test("a panel closes on a press elsewhere in the card, on a click outside it, and after the pointer leaves", () => {
  const host = fakeHost({ outsideClicks: 0 });
  render(<CallCard host={host} t={t} />);
  hoverAndWait();
  const open = () => fireEvent.click(screen.getByRole("button", { name: /Sidevoice: mini call/ }));
  open();
  fireEvent.pointerDown(document.querySelector(".card-avatar")!, { button: 0 });
  expect(screen.queryByText("brand/web")).not.toBeInTheDocument();
  open();
  host.push({ outsideClicks: 1 });
  expect(screen.queryByText("brand/web")).not.toBeInTheDocument();
  open();
  fireEvent.pointerLeave(card());
  act(() => { vi.advanceTimersByTime(PANEL_CLOSE_MS + 10); });
  expect(screen.queryByText("brand/web")).not.toBeInTheDocument();
});

test("a new call starts with a clean card: no panel left open from the last one", () => {
  const host = fakeHost();
  render(<CallCard host={host} t={t} />);
  hoverAndWait();
  fireEvent.click(screen.getByRole("button", { name: /Sidevoice: mini call/ }));
  expect(screen.getByText("brand/web")).toBeInTheDocument();
  host.push({ call: snapshot({ joined: false, since: null }) });
  host.push({ call: snapshot({ since: SINCE + 60_000 }) });
  expect(screen.queryByText("brand/web")).not.toBeInTheDocument();
});

test("the devices: the system's choice and unnamed or missing devices in the card's words; a refusal is said", () => {
  const host = fakeHost();
  render(<CallCard host={host} t={t} />);
  hoverAndWait();
  fireEvent.click(screen.getByRole("button", { name: "Microphone and speaker" }));
  fireEvent.click(screen.getByRole("button", { name: /Microphone.*System default/ }));
  expect(screen.getByRole("option", { name: /Microphone 2/ })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /Selected device · disconnected/ })).toBeInTheDocument();
  expect(screen.queryByText(/Micrófono 2|Predeterminado/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: /MacBook Pro Microphone/ }));
  expect(host.run).toHaveBeenCalledWith({ command: "select-audio-device", kind: "input", id: "mbp" });
  const devices = snapshot().devices!;
  host.push({ call: snapshot({ devices: { ...devices, busy: true, inputId: "mbp" } }) });
  host.push({ call: snapshot({ devices: { ...devices, busy: false, inputId: "default" } }) });
  expect(screen.getByRole("status")).toHaveTextContent("The room kept the previous device");
});

test("devices the room cannot choose stay listed, disabled, with where to choose them", () => {
  const host = fakeHost();
  const devices = { ...snapshot().devices!, outputAvailable: false };
  host.push({ call: snapshot({ devices }) });
  render(<CallCard host={host} t={t} />);
  hoverAndWait();
  fireEvent.click(screen.getByRole("button", { name: "Microphone and speaker" }));
  expect(screen.getByRole("button", { name: /Speaker/ })).toBeDisabled();
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
