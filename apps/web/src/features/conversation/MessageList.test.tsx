import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ChatMessage, ConversationView } from "../../state/room-types";
import { translator } from "../../i18n/translator";
import { audioNote } from "../../state/room-session-state.js";
import { dayLabel, MessageList } from "./MessageList";

const base = 1_700_000_000_000;
const message = (overrides: Partial<ChatMessage>): ChatMessage => ({ segment: crypto.randomUUID(), thread: "one", session: "call", role: "assistant", text: "Hola", name: "Agente", time: base, ...overrides });
const view = (messages: ChatMessage[], pendingText = ""): ConversationView => ({ messages, pendingText, pendingCancellable: !!pendingText });

afterEach(() => { delete window.sidevoiceActions; });

test("renders consecutive incoming messages as one chat-style run, its face once at the foot and no names", () => {
  const { container } = render(<MessageList conversation={view([message({ segment: "a" }), message({ segment: "b", text: "Sigo", time: base + 1_000 }), message({ segment: "c", role: "user", name: "Tú", text: "Vale", time: base + 2_000 })])} />);
  expect(container.querySelectorAll(".message-group")).toHaveLength(2);
  const rows = container.querySelectorAll('.message-group[data-role="assistant"] .chat-message-row');
  expect(rows[0].firstElementChild).toHaveClass("chat-avatar-spacer");
  expect(rows[1].firstElementChild).toHaveClass("ui-avatar");
  expect(container.querySelectorAll('.message-group[data-role="assistant"] .ui-avatar')).toHaveLength(1);
  expect(container.querySelector('.message-group[data-role="user"] .ui-avatar, .message-group[data-role="user"] .chat-avatar-spacer')).toBeNull();
  // The run's foot is its tight corner; the name is only for screen readers.
  expect(rows[1].querySelector(".chat-bubble")).toHaveAttribute("data-position", "last");
  expect(screen.queryByText("Agente")).toBeNull();
  expect(screen.getByRole("article", { name: "Agente: Sigo" })).toBeInTheDocument();
});

test("a day's first run is headed by its day: today and yesterday by name, older days by date", () => {
  const now = Date.now();
  const { container } = render(<MessageList conversation={view([
    message({ segment: "old", time: now - 3 * 86_400_000 }),
    message({ segment: "y", time: now - 86_400_000 }),
    message({ segment: "t1", time: now - 1_000 }),
    message({ segment: "t2", role: "user", name: "Tú", time: now }),
  ])} />);
  const days = [...container.querySelectorAll(".message-day")].map((day) => day.textContent);
  expect(days).toHaveLength(3);
  expect(days.slice(1)).toEqual(["Yesterday", "Today"]);
  expect(days[0]).not.toMatch(/Today|Yesterday/);
});

test("a day further back reads as its date, with its year only when it is not this one", () => {
  const t = translator("en");
  const now = new Date(2026, 5, 15, 12).getTime();
  expect(dayLabel(new Date(2026, 5, 15, 8).getTime(), t, now)).toBe("Today");
  expect(dayLabel(new Date(2026, 5, 14, 23).getTime(), t, now)).toBe("Yesterday");
  expect(dayLabel(new Date(2026, 5, 10).getTime(), t, now)).toBe(new Date(2026, 5, 10).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }));
  expect(dayLabel(new Date(2025, 11, 31).getTime(), t, now)).toContain("2025");
});

test("the thinking dots start the agent's next run, wearing its face", () => {
  const { container } = render(<MessageList conversation={{ ...view([message({ segment: "u", role: "user", name: "Tú", text: "¿Y ahora?" })]), working: true }} />);
  const thinking = container.querySelector(".chat-bubble.thinking")!;
  expect(thinking).toHaveAccessibleName("The conversation is working on your message");
  expect(thinking.previousElementSibling).toHaveClass("ui-avatar", "chat-character");
});

test("an interrupted reply says so to a screen reader too", () => {
  render(<MessageList conversation={view([message({ segment: "i", text: "Te decía que", interrupted: true })])} />);
  expect(screen.getByRole("article", { name: "Agente, interrupted: Te decía que" })).toHaveAttribute("data-interrupted", "true");
});

test("T01/T06/T12 marks use confirmed scalar extent and never infer hearing from reading text", () => {
  const rows = [
    message({segment: "partial", text: "é🐙ab", interrupted: true, hearing: "partial", heard_chars: 2}),
    message({segment: "unknown", text: "unknown", interrupted: true, hearing: null, hearing_unconfirmed: true, heard_chars: null}),
    message({segment: "unplayed", text: "unplayed", audio: "text_only", audio_reason: "voice_off", hearing: "not_heard"}),
    message({segment: "newer", text: "never started", audio: "interrupted", interrupted: true, audio_reason: "newer_turn", hearing: "not_heard", heard_chars: 0}),
    message({segment: "skipped", text: "skipped", audio: "interrupted", hearing: "heard"}),
  ];
  const {container} = render(<MessageList conversation={view(rows)} />);
  expect([...container.querySelectorAll(".audio-fate-mark")].map(node=>node.textContent))
    .toEqual(["2 of 4 characters heard", "Hearing not confirmed", "Not heard", "Not heard"]);
});
test("T14 partial and unknown playback failures explain failure without claiming silence", () => {
  const failed = (heard_chars: number | null) => ({audio: "failed", audio_reason: "playback_failed", heard_chars,
    hearing: heard_chars == null ? null : "partial" as const, hearing_unconfirmed: heard_chars == null});
  const {container} = render(<MessageList conversation={view([
    message({segment: "partial-failure", text: "é🐙ab", ...failed(2), audioNote: audioNote(failed(2))}),
    message({segment: "unknown-failure", text: "Unknown", ...failed(null), audioNote: audioNote(failed(null))}),
  ])} />);
  expect([...container.querySelectorAll(".audio-fate-mark")].map(node => node.textContent)).toEqual(["2 of 4 characters heard", "Hearing not confirmed"]);
  expect([...container.querySelectorAll(".chat-audio-note")].map(node => node.textContent)).toEqual(["Playback failed", "Playback failed"]);
});
test("F8 core admission reasons for inactive and disconnected audiences are explained", () => {
  const rows = ["inactive_conversation", "disconnected"].map((audio_reason) => {
    const core = { audio: "text_only", audio_reason, globally_heard: false };
    return message({ ...core, text: audio_reason, audioNote: audioNote(core) });
  });
  const { container } = render(<MessageList conversation={view(rows)} />);
  expect([...container.querySelectorAll(".chat-audio-note")].map(node => node.textContent)).toEqual([
    "No audio · You were in another conversation", "No audio · The call was disconnected",
  ]);
});

test("F9 a manually heard text-only reply no longer claims it was not played", () => {
  const core = { audio: "text_only", audio_reason: "voice_off", heard_chars: 6, hearing: "heard" as const, globally_heard: true, replayable: false };
  const { container } = render(<MessageList conversation={view([message({ segment: "manual-heard", text: "Answer", ...core, audioNote: audioNote(core) })])} />);
  expect(container.querySelector(".audio-fate-mark")).toBeNull();
  expect(container.querySelector(".chat-audio-note")).toBeNull();
  expect(screen.getByRole("article", { name: "Agente: Answer" })).toBeInTheDocument();
});

test("keeps a live user draft visible beside a newly queued reply and renders karaoke declaratively", () => {
  const { container } = render(<MessageList conversation={view([message({ segment: "voice", text: "Respuesta activa ahora", playback: "playing", karaoke: { from: 10, to: 16 } })], "Sigo hablando…")} />);
  expect(screen.getByText("Sigo hablando…")).toBeInTheDocument();
  expect(container.querySelector(".karaoke-played")?.textContent).toBe("Respuesta activa");
  expect(container.querySelector("mark")).toBeNull();
  expect(container.querySelector(".karaoke-upcoming")?.textContent).toBe(" ahora");
  expect(screen.getByRole("button", { name: "Cancel sending" })).toBeInTheDocument();
});

test("marks an assistant message as visually pending before playback starts", () => {
  const { container } = render(<MessageList conversation={view([message({ segment: "voice", text: "Todavía sin reproducir", playback: "pending" })])} />);
  expect(container.querySelector('.karaoke-text')?.getAttribute('data-playback')).toBe('pending');
});

test("keeps the active transcribed draft cancellable after listening text disappears", () => {
  const cancelInput = vi.fn().mockResolvedValue(undefined);
  window.sidevoiceActions = {
    cancelInput,
    editVoice: vi.fn(),
    saveProviderKey: vi.fn().mockResolvedValue(undefined),
    loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined),
    replayReply: vi.fn().mockResolvedValue(undefined),
    toggleMic: vi.fn(),
    toggleCall: vi.fn().mockResolvedValue(undefined),
    selectParticipant: vi.fn(),
    closeParticipant: vi.fn(),
    forgetMachine: vi.fn(),
    pairDevice: vi.fn(),
    openPairing: vi.fn(),
    skipReply: vi.fn(),
    closePairing: vi.fn(),
  };
  render(<MessageList conversation={view([message({ segment: "call:user-turn:4", role: "user", name: "Tú", text: "Una frase todavía abierta", draft: true, cancellable: true })])} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel sending" }));
  expect(cancelInput).toHaveBeenCalledOnce();
});

test("the open turn is the stage's person balloon, with cancelling in its own row inside it", () => {
  const { container } = render(<MessageList conversation={{ messages: [], pendingText: "", pendingCancellable: true, pendingPhase: "listening" }} />);
  const bubble = container.querySelector(".person-turns[data-inline] > .speech-bubble.person-bubble[data-live]");
  expect(bubble?.querySelector(".voice-wave canvas")).toBeInTheDocument();
  expect(bubble?.querySelector(".person-live-actions .cancel-input")?.textContent).toBe("Cancel sending");
  expect(bubble?.querySelector(".balloon-tail")).toBeInTheDocument();
  expect(container.querySelector(".chat-bubble")).toBeNull();
  expect(container.querySelector(".empty")).toBeNull();
});

test("transcribing keeps one bubble and says so, so both phases stay apart", () => {
  const { container } = render(<MessageList conversation={{ messages: [], pendingText: "", pendingCancellable: true, pendingPhase: "transcribing" }} />);
  expect(container.querySelectorAll(".person-bubble")).toHaveLength(1);
  expect(container.querySelector(".voice-wave")?.getAttribute("data-phase")).toBe("transcribing");
  expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Transcribing what you said");
});

test("once the transcript arrives the bubble becomes the text and the waveform goes", () => {
  const { container } = render(<MessageList conversation={{ messages: [], pendingText: "Estoy diciendo esto", pendingCancellable: true, pendingPhase: "listening" }} />);
  expect(container.querySelector(".voice-wave")).toBeNull();
  expect(container.querySelector(".person-bubble")).toBeNull();
  expect(screen.getByText("Estoy diciendo esto")).toBeInTheDocument();
});

test("offers listening again only for a reply whose audio the room still holds", () => {
  const replayReply = vi.fn().mockResolvedValue(undefined);
  window.sidevoiceActions = { ...window.sidevoiceActions!, replayReply };
  const { container, rerender } = render(<MessageList conversation={view([message({ segment: "a:voice:1", role: "assistant", text: "Con audio", replayable: true })])} />);
  const button = container.querySelector<HTMLButtonElement>(".listen-again");
  expect(button).not.toBeNull();
  button!.click();
  expect(replayReply).toHaveBeenCalledWith("a:voice:1");
  rerender(<MessageList conversation={view([message({ segment: "a:voice:1", role: "assistant", text: "Sin audio" })])} />);
  expect(container.querySelector(".listen-again")).toBeNull();
});

test("at the end, the list stays there when the text box takes its height; scrolled away, it is left alone", () => {
  const callbacks: (() => void)[] = [];
  const original = globalThis.ResizeObserver;
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class { constructor(callback: () => void) { callbacks.push(callback); } observe() {} unobserve() {} disconnect() {} } });
  try {
    const { container } = render(<MessageList conversation={view([message({ segment: "a" })])} />);
    const list = container.querySelector<HTMLElement>("#messages")!;
    Object.defineProperties(list, { scrollHeight: { configurable: true, value: 900 }, clientHeight: { configurable: true, value: 300 } });
    const scrollTo = vi.fn();
    Object.defineProperty(list, "scrollTo", { configurable: true, value: scrollTo });
    callbacks.forEach((callback) => callback());
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: "instant" });
    scrollTo.mockClear();
    list.scrollTop = 100;
    fireEvent.scroll(list);
    callbacks.forEach((callback) => callback());
    expect(scrollTo).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: original });
  }
});

test("scrolling away keeps a neutral way back without announcing new messages", () => {
  const { container, rerender } = render(<MessageList conversation={view([message({ segment: "a" })])} />);
  const list = container.querySelector<HTMLElement>("#messages")!;
  Object.defineProperties(list, { scrollHeight: { configurable: true, value: 900 }, clientHeight: { configurable: true, value: 300 } });
  const scrollTo = vi.fn();
  Object.defineProperty(list, "scrollTo", { configurable: true, value: scrollTo });
  list.scrollTop = 100;
  fireEvent.scroll(list);
  expect(screen.getByRole("button", { name: "Go to the end of the conversation" }).textContent).toBe("");
  rerender(<MessageList conversation={view([message({ segment: "a" }), message({ segment: "b", text: "Another reply" })])} />);
  expect(scrollTo).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Go to the end of the conversation" }).textContent).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Go to the end of the conversation" }));
  expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: "smooth" });
  expect(screen.queryByRole("button", { name: "Go to the end of the conversation" })).toBeNull();
});

test("a delivery status this version does not know shows no mark, never the warning of one that failed (core#112)", () => {
  const { container } = render(<MessageList conversation={view([
    message({ segment: "u1", role: "user", name: "Tú", text: "Uno", delivery: "queued_offline" }),
    message({ segment: "u2", role: "user", name: "Tú", text: "Dos", delivery: "not_sent", time: base + 1_000 }),
    message({ segment: "u3", role: "user", name: "Tú", text: "Tres", delivery: "read", time: base + 2_000 }),
  ])} />);
  const marks = [...container.querySelectorAll(".receipt.delivery")].map((mark) => mark.getAttribute("data-state"));
  expect(marks).toEqual(["not_sent", "read"]);
  expect(screen.getByRole("article", { name: /Uno/ }).querySelector(".receipt")).toBeNull();
});

test("a reply whose audio status this version does not know is drawn as plain text, and listening again stays the room's call (core#112)", () => {
  const { container } = render(<MessageList conversation={view([message({ segment: "a:voice:9", text: "Nueva", replayable: true, playback: undefined })])} />);
  expect(container.querySelector(".karaoke-text")?.getAttribute("data-playback")).toBe("complete");
  expect(screen.getByRole("button", { name: translator()("messages.listenAgain") })).toBeInTheDocument();
});
