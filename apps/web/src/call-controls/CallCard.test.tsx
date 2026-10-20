import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CallCard, CLICK_GUARD_MS, duration, PANEL_CLOSE_MS, SHOW_DELAY_MS, WAVE_SAMPLE_MS } from "./CallCard";
import type { CallControlsHost, CallControlsState, CallSnapshot } from "./host";
import { translator } from "../i18n/translator";
import { cardLanguage } from "./i18n";
import { cardSnapshot } from "../test/call-card";
import { RoomProvider } from "../app/RoomProvider";
import { createRoomStore } from "../state/room-store";
import { useState } from "react";
import { FLOATING_CARD_KEY } from "../state/floating-card";
import { useWave } from "./card-shell";

vi.mock("../services/room-session-controller.js", () => ({}));

/** The card as its page draws it: inside a room store of its own (card-room.ts), the title card (these tests choose it: the picture is the default). */
function Card({ host }: { host: CallControlsHost }) {
  const [store] = useState(createRoomStore);
  return <RoomProvider store={store} runtime={false}><CallCard host={host} t={t} /></RoomProvider>;
}

const t = translator("en");

function snapshot(overrides: Partial<CallSnapshot> = {}): CallSnapshot {
  return cardSnapshot({
    version: 2, ready: true, joined: true, busy: false, micEnabled: true, micDisabled: false, title: "Sidevoice: mini call",
    agent: "idle", youTalking: false, canSkip: false, since: SINCE,
    participants: [
      { threadId: "a", title: "Sidevoice: mini call", selected: true, available: true, switching: false, unread: 0, reach: "listening",
        working: false, machine: "daimon", harness: "claude" },
      { threadId: "b", title: "brand/web", selected: false, available: true, switching: false, unread: 2, reach: "listening",
        working: true, machine: "daimon", harness: "claude" },
      { threadId: "c", title: "landing", selected: false, available: false, switching: false, unread: 0, reach: "offline",
        working: false, machine: "portátil", harness: "cursor" },
    ],
    devices: { inputs: [{ id: "default", label: "Predeterminado del sistema", system: true }, { id: "mbp", label: "MacBook Pro Microphone" },
      { id: "x", label: "Micrófono 2", number: 2 }, { id: "gone", label: "Dispositivo seleccionado · desconectado", missing: true }],
      outputs: [{ id: "default", label: "Predeterminado del sistema", system: true }], inputId: "default", outputId: "default",
      available: true, outputAvailable: true, busy: false },
    conversation: "a",
    ...overrides,
  });
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
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); SINCE = Date.now() - 754_000; localStorage.setItem(FLOATING_CARD_KEY, JSON.stringify({ format: "card", size: "m" })); });
afterEach(() => { vi.useRealTimers(); localStorage.removeItem(FLOATING_CARD_KEY); });

const card = () => document.querySelector(".call-card")!;
function hoverAndWait() {
  fireEvent.pointerEnter(card());
  act(() => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
  act(() => { vi.advanceTimersByTime(CLICK_GUARD_MS + 10); });
}
/** Each bar's drawn height (--h, 3 at rest). */
const waveHeights = () => [...document.querySelectorAll(".your-wave i")].map((bar) => `${(bar as HTMLElement).style.getPropertyValue("--h") || 3}px`);

test("at rest: the agent, the conversation, where it runs, what is happening, and your wave — no controls, no clock", () => {
  render(<Card host={fakeHost()} />);
  expect(screen.getByText("Sidevoice: mini call")).toBeInTheDocument();
  // The way to the other conversations: their mark, how many, ▾.
  expect(screen.getByRole("button", { name: "Conversations (3), 1 with unread replies" })).toHaveAttribute("aria-expanded", "false");
  // The unread cue is the list's "!", decorative; its meaning is in the control's name (and tooltip).
  expect(document.querySelector(".card-conversations-button .card-unread-bang")).toHaveAttribute("aria-hidden", "true");
  expect(document.querySelector(".card-conversations-button")).toHaveAttribute("title", "Conversations (3), 1 with unread replies");
  expect(document.querySelector(".card-conversations-button .card-unread")).toBeNull();
  expect(screen.getByText("daimon")).toBeInTheDocument();
  // The harness is its mark, never its name in words.
  expect(screen.queryByText("Claude Code")).toBeNull();
  expect(document.querySelector(".card-harness .ui-logo")).toBeInTheDocument();
  expect(screen.queryByText("12:34")).toBeNull();
  expect(screen.getByRole("img", { name: "Sidevoice: mini call · Resting" })).toBeInTheDocument();
  expect(document.querySelector(".card-state")).toHaveTextContent("Resting");
  expect(screen.getByRole("img", { name: "Your microphone" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Hang up" })).not.toBeInTheDocument();
  // × always; the gear and "open Sidevoice" are drawn at rest too, shown only near the pointer, so nothing moves.
  expect(screen.getByRole("button", { name: "Hide for this call" })).toBeInTheDocument();
  expect(document.querySelector(".card-actions-hover")).toBeInTheDocument();
});

test("×, the gear and open carry their commands; captions turn off from the controls, for the room too", () => {
  localStorage.removeItem("sidevoice.captions");
  const host = fakeHost({ alwaysExpanded: true });
  render(<Card host={host} />);
  act(() => { vi.advanceTimersByTime(CLICK_GUARD_MS + 10); });
  fireEvent.click(screen.getByRole("button", { name: "Hide for this call" }));
  fireEvent.click(screen.getByRole("button", { name: "Floating card settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Open Sidevoice" }));
  expect(vi.mocked(host.run).mock.calls).toEqual([[{ command: "hide" }], [{ command: "open-settings" }], [{ command: "open-app" }]]);
  fireEvent.click(screen.getByRole("button", { name: "Hide captions" }));
  expect(localStorage.getItem("sidevoice.captions")).toBe("off");
  expect(screen.getByRole("button", { name: "Show captions" })).toHaveAttribute("aria-pressed", "false");
  localStorage.removeItem("sidevoice.captions");
});

test("the avatar shows only the agent, the wave only you: muted crosses the wave, not the avatar", () => {
  const host = fakeHost();
  render(<Card host={host} />);
  host.push({ call: snapshot({ agent: "speaking", mood: "speaking", micEnabled: false }) });
  expect(screen.getByRole("img", { name: "Sidevoice: mini call · Speaking" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "You are muted" })).toHaveAttribute("data-muted", "true");
  expect(document.querySelector(".card-state")).toHaveAttribute("data-mood", "muted");
});

test("a mood this version does not know reads as resting, never a raw key (core#112)", () => {
  const host = fakeHost();
  render(<Card host={host} />);
  host.push({ call: snapshot({ mood: "dreaming" as unknown as CallSnapshot["mood"] }) });
  expect(document.querySelector(".card-state")).toHaveTextContent("Resting");
  expect(document.body.innerHTML).not.toContain("state.");
});

test("reconnecting overrides both and is written", () => {
  const host = fakeHost();
  render(<Card host={host} />);
  host.push({ call: snapshot({ busy: true, agent: "working" }) });
  expect(screen.getAllByText("Reconnecting…").length).toBeGreaterThan(0);
  expect(document.querySelector(".card-state")).toHaveAttribute("data-mood", "reconnecting");
});

test("reconnecting is only said: muting and hanging up stay at hand", () => {
  const host = fakeHost({ alwaysExpanded: true, call: snapshot({ busy: true }) });
  render(<Card host={host} />);
  act(() => { vi.advanceTimersByTime(CLICK_GUARD_MS + 10); });
  expect(screen.getByRole("button", { name: "Mute" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Hang up" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Mute" }));
  expect(host.run).toHaveBeenCalledWith({ command: "toggle-mute" });
});

test("the wave samples the level over time: silence drains it, muting flattens it", () => {
  const host = fakeHost();
  render(<Card host={host} />);
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

test("in silence, once drained, the wave holds its samples: no render ten times a second for nothing (desktop#149)", () => {
  let renders = 0;
  function Wave({ level }: { level: number }) {
    renders += 1;
    useWave(level, false);
    return null;
  }
  // One sample at a time, as the card lives them (one act would batch them into one render).
  const samples = (count: number) => { for (let i = 0; i < count; i += 1) act(() => { vi.advanceTimersByTime(WAVE_SAMPLE_MS); }); };
  const { rerender } = render(<Wave level={40} />);
  samples(3);
  rerender(<Wave level={0} />);
  samples(10);
  const drained = renders;
  samples(20);
  // React may render once more to find nothing changed; never once a sample.
  expect(renders - drained).toBeLessThanOrEqual(1);
});

test("near the pointer the call controls appear; they carry the room's commands to the app", () => {
  const host = fakeHost({ call: snapshot({ canSkip: true }) });
  render(<Card host={host} />);
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
  render(<Card host={host} />);
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
  render(<Card host={host} />);
  fireEvent.pointerEnter(card());
  act(() => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
  fireEvent.click(screen.getByRole("button", { name: "Hang up" }), { detail: 1 });
  expect(host.run).not.toHaveBeenCalled();
  // The guard is for a pointer landing on controls that just appeared: a key press (detail 0) is never that.
  fireEvent.click(screen.getByRole("button", { name: "Hang up" }));
  expect(host.run).toHaveBeenCalledTimes(1);
  vi.mocked(host.run).mockClear();
  act(() => { vi.advanceTimersByTime(CLICK_GUARD_MS + 10); });
  fireEvent.click(screen.getByRole("button", { name: "Hang up" }), { detail: 1 });
  expect(host.run).toHaveBeenCalledWith({ command: "hang-up" });
  box.mockRestore();
});

test("always expanded: the controls stay without hover", () => {
  render(<Card host={fakeHost({ alwaysExpanded: true })} />);
  expect(screen.getByRole("button", { name: "Hang up" })).toBeInTheDocument();
});

test("the conversations control opens them below the controls, in the card's words; only one that is there can be chosen", () => {
  const host = fakeHost();
  render(<Card host={host} />);
  hoverAndWait();
  fireEvent.click(screen.getByRole("button", { name: "Conversations (3), 1 with unread replies" }));
  const controls = document.querySelector(".card-controls")!;
  const panel = document.querySelector(".card-panel.conversations")!;
  expect(controls.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText(/nuevas|Desconectada|Escuchando/)).not.toBeInTheDocument();
  expect(document.querySelectorAll(".card-conversations .card-unread")).toHaveLength(1);
  expect(document.querySelector(".card-conversations .card-unread")).toHaveAccessibleName("Unread message");
  expect(screen.getByText(/offline/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /landing/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /brand\/web/ }));
  expect(host.run).toHaveBeenCalledWith({ command: "select-participant", threadId: "b" });
  expect(screen.queryByText("brand/web")).not.toBeInTheDocument();
});

test("a panel closes on a press elsewhere in the card, on a click outside it, and after the pointer leaves", () => {
  const host = fakeHost({ outsideClicks: 0 });
  render(<Card host={host} />);
  hoverAndWait();
  const open = () => fireEvent.click(screen.getByRole("button", { name: "Conversations (3), 1 with unread replies" }));
  open();
  fireEvent.pointerDown(document.querySelector(".card-face")!, { button: 0 });
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
  render(<Card host={host} />);
  hoverAndWait();
  fireEvent.click(screen.getByRole("button", { name: "Conversations (3), 1 with unread replies" }));
  expect(screen.getByText("brand/web")).toBeInTheDocument();
  host.push({ call: snapshot({ joined: false, since: null }) });
  host.push({ call: snapshot({ since: SINCE + 60_000 }) });
  expect(screen.queryByText("brand/web")).not.toBeInTheDocument();
});

test("the devices: the system's choice and unnamed or missing devices in the card's words; a refusal is said", () => {
  const host = fakeHost();
  render(<Card host={host} />);
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
  expect(screen.getByRole("status")).toHaveTextContent("The call kept the previous device");
  expect(screen.getByRole("group", { name: "Microphone and speaker" })).toBeInTheDocument();
});

test("the devices panel closes once the room confirms the chosen device", () => {
  const host = fakeHost();
  render(<Card host={host} />);
  hoverAndWait();
  fireEvent.click(screen.getByRole("button", { name: "Microphone and speaker" }));
  fireEvent.click(screen.getByRole("button", { name: /Microphone.*System default/ }));
  fireEvent.click(screen.getByRole("option", { name: /MacBook Pro Microphone/ }));
  const devices = snapshot().devices!;
  host.push({ call: snapshot({ devices: { ...devices, busy: true, inputId: "default" } }) });
  expect(screen.getByRole("group", { name: "Microphone and speaker" })).toBeInTheDocument();
  host.push({ call: snapshot({ devices: { ...devices, busy: false, inputId: "mbp" } }) });
  expect(screen.queryByRole("group", { name: "Microphone and speaker" })).not.toBeInTheDocument();
});

test("devices the room cannot choose stay listed, disabled, with where to choose them", () => {
  const host = fakeHost();
  const devices = { ...snapshot().devices!, outputAvailable: false };
  host.push({ call: snapshot({ devices }) });
  render(<Card host={host} />);
  hoverAndWait();
  fireEvent.click(screen.getByRole("button", { name: "Microphone and speaker" }));
  expect(screen.getByRole("button", { name: /Speaker/ })).toBeDisabled();
});

test("a press that moves is a drag of the window, not a click", () => {
  const host = fakeHost();
  render(<Card host={host} />);
  hoverAndWait();
  const title = screen.getByText("Sidevoice: mini call");
  fireEvent.pointerDown(title, { button: 0, pointerId: 1, screenX: 100, screenY: 100 });
  fireEvent.pointerMove(title, { pointerId: 1, screenX: 110, screenY: 104 });
  fireEvent.pointerUp(title, { pointerId: 1, screenX: 120, screenY: 108 });
  fireEvent.click(title);
  expect(vi.mocked(host.drag).mock.calls).toEqual([["start"], ["move"], ["end"]]);
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
  render(<Card host={host} />);
  expect(host.layout).not.toHaveBeenCalled();
  cleanup();
  box.mockReturnValue({ left: 0, top: 0, width: 320, height: 54 } as DOMRect);
  render(<Card host={host} />);
  // The card's body is where the host keeps it as the window grows around it (captions, a list).
  expect(host.layout).toHaveBeenCalledWith({ width: 344, height: 78, card: { x: 12, y: 12, width: 320, height: 54 } });
  box.mockRestore();
});

test("nothing outside a call", () => {
  const { container } = render(<Card host={fakeHost({ call: snapshot({ joined: false }) })} />);
  expect(container).toBeEmptyDOMElement();
});

test("the card speaks the language this device's settings chose, else the system's; English for any other", () => {
  expect(cardLanguage(["es-ES"])).toBe("es");
  expect(cardLanguage(["de-DE"])).toBe("de");
  expect(cardLanguage(["zh-CN"])).toBe("zh-Hans");
  expect(cardLanguage(["ko-KR"])).toBe("en");
  expect(translator("es")("card.hangUp")).toBe("Colgar");
  expect(translator("ko")("card.hangUp")).toBe("Hang up");
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "pl" }));
  try {
    expect(cardLanguage()).toBe("pl");
  } finally {
    localStorage.removeItem("sidevoice.settings");
  }
});

test("the call's duration reads like a clock", () => {
  expect(duration(1_000, 1_000 + 65_000)).toBe("1:05");
  expect(duration(0, 5_000)).toBe("");
  expect(duration(1_000, 1_000 + 3_725_000)).toBe("1:02:05");
});

test("the conversations list is inside the avatar's compact card, against its control, and in a resized picture under its header", () => {
  localStorage.setItem(FLOATING_CARD_KEY, JSON.stringify({ format: "avatar", size: "m" }));
  const host = fakeHost({ alwaysExpanded: true });
  const { unmount } = render(<Card host={host} />);
  fireEvent.click(screen.getByRole("button", { name: "Conversations (3), 1 with unread replies" }));
  expect(document.querySelector(".avatar-compact > .card-panel-card .card-panel.conversations")).not.toBeNull();
  unmount();
  localStorage.setItem(FLOATING_CARD_KEY, JSON.stringify({ format: "pip", size: "m" }));
  const sized = fakeHost({ size: { width: 700, height: 600 } });
  render(<Card host={sized} />);
  fireEvent.click(screen.getByRole("button", { name: "Conversations (3), 1 with unread replies" }));
  expect(document.querySelector(".card-heading > .card-panel-card")).not.toBeNull();
});
