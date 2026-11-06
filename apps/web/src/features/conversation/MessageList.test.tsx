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

test("renders consecutive incoming messages as one chat-style run, its face once over its foot and no names", () => {
  const { container } = render(<MessageList conversation={view([message({ segment: "a" }), message({ segment: "b", text: "Sigo", time: base + 1_000 }), message({ segment: "c", role: "user", name: "Tú", text: "Vale", time: base + 2_000 })])} />);
  expect(container.querySelectorAll(".message-group")).toHaveLength(2);
  const rows = container.querySelectorAll('.message-group[data-role="assistant"] .chat-message-row');
  // The face takes no room (T41): every row of the run starts at one edge, the face floats over the run, once.
  for (const row of rows) expect(row.children).toHaveLength(1);
  expect(container.querySelectorAll('.message-group[data-role="assistant"] > .chat-face')).toHaveLength(1);
  expect(container.querySelector('.message-group[data-role="assistant"] > .chat-face .sv-avatar[data-style="creature"]')).not.toBeNull();
  expect(container.querySelector('.message-group[data-role="user"] .chat-face')).toBeNull();
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

test("working is a quiet row starting the agent's next run, wearing its face, in place of the thinking dots", () => {
  const { container } = render(<MessageList conversation={{ ...view([message({ segment: "u", role: "user", name: "Tú", text: "¿Y ahora?" })]), working: true }} />);
  const working = container.querySelector(".chat-bubble.working")!;
  expect(working).toHaveAccessibleName("The conversation is working on your message");
  expect(working.textContent).toBe("Working...");
  // Led by the working glyph (three dots), as the conversations' state says it, not by a dot of the creature's accent.
  expect(working.querySelector(".working-label > svg")).toHaveClass("state-glyph", "state-glyph-working");
  expect(working.querySelector(".working-label > i")).toBeNull();
  const run = working.closest(".message-group")!;
  expect(run).toHaveAttribute("data-role", "assistant");
  expect(run.querySelector(":scope > .chat-face")).not.toBeNull();
  expect(container.querySelector(".thinking-dots")).toBeNull();
});

test("out of the call the thinking dots are not shown, and the empty state is", () => {
  const { container } = render(<MessageList inCall={false} conversation={{ ...view([]), working: true }} />);
  expect(container.querySelector(".chat-bubble.working")).toBeNull();
  expect(container.querySelector(".messages-empty")).not.toBeNull();
});

test("an interrupted reply says so to a screen reader too", () => {
  render(<MessageList conversation={view([message({ segment: "i", text: "Te decía que", interrupted: true })])} />);
  expect(screen.getByRole("article", { name: "Agente, interrupted: Te decía que" })).toHaveAttribute("data-interrupted", "true");
});

test("T01/T06/T12 marks use confirmed scalar extent and never infer hearing from reading text", () => {
  const rows = [
    message({segment: "partial", text: "é🐙 ab", interrupted: true, hearing: "partial", heard_chars: 2}),
    message({segment: "unknown", text: "unknown", interrupted: true, hearing: null, heard_chars: null}),
    message({segment: "unplayed", text: "unplayed", audio: "text_only", audio_reason: "voice_off", hearing: "not_heard"}),
    message({segment: "newer", text: "never started", audio: "interrupted", interrupted: true, audio_reason: "newer_turn", hearing: "not_heard", heard_chars: 0}),
    message({segment: "skipped", text: "skipped", audio: "interrupted", hearing: "heard"}),
  ];
  const {container} = render(<MessageList conversation={view(rows)} />);
  // Cut at the extent in characters (a pictogram is one) and carried to the end of its word; never-played replies are marks.
  expect(container.querySelector(".cut-heard")?.textContent).toBe("é🐙");
  expect(container.querySelectorAll(".unheard")).toHaveLength(2);
});
test("an interrupted reply has no caption: the chip and the dimmed text say it", () => {
  expect(audioNote({ audio: "interrupted", audio_reason: "user_interrupted", heard_chars: 2, hearing: "partial", interrupted: true })).toBe("");
});
test("T14 partial and unknown playback failures explain failure without claiming silence", () => {
  const failed = (heard_chars: number | null) => ({audio: "failed", audio_reason: "playback_failed", heard_chars,
    hearing: heard_chars == null ? null : "partial" as const});
  const {container} = render(<MessageList conversation={view([
    message({segment: "partial-failure", text: "é🐙ab", ...failed(2), audioNote: audioNote(failed(2))}),
    message({segment: "unknown-failure", text: "Unknown", ...failed(null), audioNote: audioNote(failed(null))}),
  ])} />);
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
  expect(container.querySelector(".chat-audio-note")).toBeNull();
  expect(screen.getByRole("article", { name: "Agente: Answer" })).toBeInTheDocument();
});

test("a transcript that is closed does not light the words the voice says, and lights them as it opens", () => {
  const conversation = view([message({ segment: "voice", text: "Respuesta activa ahora", playback: "playing", karaoke: { from: 10, to: 16 } })]);
  const { container, rerender } = render(<MessageList conversation={conversation} visible={false} />);
  expect(container.querySelector(".karaoke-played")?.textContent).toBe("");
  expect(container.querySelector(".karaoke-upcoming")?.textContent).toBe("Respuesta activa ahora");
  rerender(<MessageList conversation={conversation} visible />);
  expect(container.querySelector(".karaoke-played")?.textContent).toBe("Respuesta activa");
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

test("the open turn, without streaming, is a pill: the microphone, its bars and the round × that takes it back", () => {
  const { container } = render(<MessageList conversation={{ messages: [], pendingText: "", pendingCancellable: true, pendingPhase: "listening" }} />);
  const pill = container.querySelector(".message-group[data-role=user] .chat-bubble.turn-pill[data-phase=listening]");
  expect(pill?.querySelectorAll(".turn-bars i")).toHaveLength(5);
  // Its microphone wears the colour of listening (the state's icon); the word is never tinted.
  expect(pill?.querySelector(".turn-lead > svg")).toHaveClass("state-glyph-listening");
  // The bars are labelled, not live: the turn is announced once, by the stage (TurnAnnouncer).
  expect(screen.getByRole("img", { name: "Listening" })).toBeInTheDocument();
  expect(screen.queryByRole("status")).toBeNull();
  const cancel = screen.getByRole("button", { name: "Cancel sending" });
  expect(cancel).toHaveClass("turn-cancel");
  expect(cancel.textContent).toBe("");
  expect(container.querySelectorAll(".chat-bubble")).toHaveLength(1);
  expect(container.querySelector(".messages-empty")).toBeNull();
});

test("transcribing keeps one pill: the bars pulse, no word, announced once", () => {
  const { container } = render(<MessageList conversation={{ messages: [], pendingText: "", pendingCancellable: true, pendingPhase: "transcribing" }} />);
  expect(container.querySelectorAll(".turn-pill")).toHaveLength(1);
  expect(container.querySelector(".turn-pill")?.getAttribute("data-phase")).toBe("transcribing");
  // The bars stay (marked transcribing, which pulses them), the microphone and the word go.
  expect(container.querySelector(".turn-bars")).toHaveAttribute("data-phase", "transcribing");
  expect(container.querySelector(".turn-lead > svg")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("img", { name: "Transcribing what you said" })).toBe(container.querySelector(".turn-bars"));
  expect(container.querySelector(".turn-pill")).not.toHaveTextContent(/\S/);
});

test("once the transcript arrives the bubble becomes the text and the waveform goes", () => {
  const { container } = render(<MessageList conversation={{ messages: [], pendingText: "Estoy diciendo esto", pendingCancellable: true, pendingPhase: "listening" }} />);
  expect(container.querySelector(".turn-pill")).toBeNull();
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
  const marks = [...container.querySelectorAll(".chat-receipt.delivery")].map((mark) => mark.getAttribute("data-state"));
  expect(marks).toEqual(["not_sent", "read"]);
  expect(screen.getByRole("article", { name: /Uno/ }).querySelector(".chat-receipt")).toBeNull();
});

test("a reply whose audio status this version does not know is drawn as plain text, and listening again stays the room's call (core#112)", () => {
  const { container } = render(<MessageList conversation={view([message({ segment: "a:voice:9", text: "Nueva", replayable: true, playback: undefined })])} />);
  expect(container.querySelector(".karaoke-text")?.getAttribute("data-playback")).toBe("complete");
  expect(screen.getByRole("button", { name: translator()("messages.listenAgain") })).toBeInTheDocument();
});

const LONG = "I fixed the clock fixture and the suite passes. Tell me if you want it in its own commit.";
const CUT_AT = "I fixed the clock fixture".length;

test("a reply cut part-way shows what was heard, the mark at the cut, the rest it never got to and the Interrupted tag", () => {
  const { container } = render(<MessageList conversation={view([message({ segment: "cut", text: LONG, hearing: "partial", heard_chars: CUT_AT, interrupted: true })])} />);
  const cut = container.querySelector(".cut-text")!;
  expect(cut.querySelector(".cut-heard")?.textContent).toBe("I fixed the clock fixture");
  // The mark sits exactly where it was cut, between what was heard and the rest; the rest is there, quiet (CSS), to read.
  expect(cut.querySelector(".cut-heard + .cut-point + .cut-rest")).not.toBeNull();
  expect(cut.querySelector(".cut-point")).toHaveAttribute("aria-hidden", "true");
  expect(cut.querySelector(".cut-rest")?.textContent).toBe(" and the suite passes. Tell me if you want it in its own commit.");
  expect(cut.querySelector(".cut-tag")?.textContent).toBe("Interrupted");
  expect(screen.queryByRole("button", { name: /Interrupted/ })).toBeNull();
});

test("a cut inside a word is carried to its end, and a cut with nothing left unheard is a whole reply", () => {
  const { container, rerender } = render(<MessageList conversation={view([message({ segment: "word", text: LONG, hearing: "partial", heard_chars: 4 })])} />);
  expect(container.querySelector(".cut-heard")?.textContent).toBe("I fixed");
  rerender(<MessageList conversation={view([message({ segment: "word", text: LONG, hearing: "partial", heard_chars: [...LONG].length })])} />);
  expect(container.querySelector(".cut-tag")).toBeNull();
});

test("a reply that never played is a folded grey bubble at the run's foot that opens to its words, its badge, time and replay", () => {
  const { container } = render(<MessageList conversation={view([
    message({ segment: "a", text: "Heard first", hearing: "heard", heard_chars: 11 }),
    message({ segment: "b", text: LONG, hearing: "not_heard", heard_chars: 0, time: base + 1_000, replayable: true }),
  ])} />);
  expect(container.querySelectorAll(".message-group")).toHaveLength(1);
  const folded = container.querySelector(".chat-bubble.unheard")!;
  // The run's foot, so it is tucked and the face floats over it, once.
  expect(folded).toHaveAttribute("data-position", "last");
  expect(container.querySelector(".chat-bubble:not(.unheard)")).toHaveAttribute("data-position", "first");
  expect(container.querySelectorAll(".chat-face")).toHaveLength(1);
  // Folded: the struck circle and its first line, nothing else (no time, no replay, no badge).
  expect(folded.querySelector(".unheard-snippet")?.textContent).toBe(LONG);
  expect(folded.querySelector(".chat-meta, .unheard-badge, .listen-again")).toBeNull();
  // A click anywhere on it opens it, the arrow's button says what it does.
  fireEvent.click(folded.querySelector(".unheard-snippet")!);
  expect(folded).toHaveAttribute("data-open");
  expect(folded.querySelector(".unheard-badge")?.textContent).toBe("Not played");
  expect(folded.querySelector(".chat-meta time")).not.toBeNull();
  expect(folded.querySelector(".chat-meta .listen-again")).not.toBeNull();
  expect(screen.getByRole("article", { name: `Agente: ${LONG}` })).toBe(folded);
  fireEvent.click(screen.getByRole("button", { name: "Not played · Hide the reply" }));
  expect(folded).not.toHaveAttribute("data-open");
  expect(screen.getByRole("button", { name: "Not played · Show the reply" })).toHaveAttribute("aria-expanded", "false");
});

test("a reply that is playing keeps its whole balloon with the karaoke, whatever its earlier hearing says", () => {
  const { container } = render(<MessageList conversation={view([message({ segment: "now", text: LONG, hearing: "not_heard", playback: "playing", karaoke: { from: 5, to: 5 } })])} />);
  expect(container.querySelector(".unheard")).toBeNull();
  expect(container.querySelector(".karaoke-text")).toHaveAttribute("data-playback", "playing");
});

test("a cut in Chinese falls on a word boundary the platform knows, not on whitespace that is not there", () => {
  const text = "你好世界。下一句话。";
  const { container } = render(<MessageList conversation={view([message({ segment: "zh", text, hearing: "partial", heard_chars: 2 })])} />);
  expect(typeof Intl.Segmenter).toBe("function");
  expect(container.querySelector(".cut-tag")).not.toBeNull();
  expect(container.querySelector(".cut-heard")?.textContent).toBe("你好");
});

test("a cut in the middle of a Latin word is carried to the word's end", () => {
  const { container } = render(<MessageList conversation={view([message({ segment: "mid", text: "The migration is ready now", hearing: "partial", heard_chars: 8 })])} />);
  expect(container.querySelector(".cut-heard")?.textContent).toBe("The migration");
  expect(container.querySelector(".cut-rest")?.textContent).toBe(" is ready now");
});

test("a never-played reply's opened mark keeps listen again, and says nothing under its date and replay", () => {
  const replayReply = vi.fn();
  window.sidevoiceActions = { replayReply } as never;
  const failed = { audio: "failed", audio_reason: "playback_failed", heard_chars: 0, hearing: "not_heard" as const };
  render(<MessageList conversation={view([message({ segment: "nf", text: "Never started", replayable: true, ...failed, audioNote: audioNote(failed) })])} />);
  expect(screen.queryByRole("button", { name: "Listen again" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Not played/ }));
  expect(screen.queryByText("Playback failed")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Listen again" }));
  expect(replayReply).toHaveBeenCalledWith("nf");
});

test("a reply nobody was there for opens with no 'No audio' subtitle, whatever the reason it did not play", () => {
  const reasons = ["call_ended", "focus_changed", "voice_off", "agents_muted"].map((audio_reason) => ({ audio: "text_only", audio_reason, heard_chars: 0, hearing: "not_heard" as const }));
  // The state still words each of them: it is the opened mark that does not show it.
  expect(audioNote(reasons[0])).toBe("No audio · You were not in the call");
  const { container } = render(<MessageList conversation={view(reasons.map((core) => message({ segment: core.audio_reason, text: `Reply ${core.audio_reason}`, replayable: true, ...core, audioNote: audioNote(core) })))} />);
  const marks = [...container.querySelectorAll<HTMLElement>(".chat-bubble.unheard")];
  expect(marks).toHaveLength(reasons.length);
  for (const mark of marks) {
    fireEvent.click(mark.querySelector(".unheard-snippet")!);
    expect(mark).toHaveAttribute("data-open");
    expect(mark.querySelector(".unheard-badge")?.textContent).toBe("Not played");
    expect(mark.querySelector(".chat-meta time")).not.toBeNull();
    expect(mark.querySelector(".chat-meta .listen-again")).not.toBeNull();
    expect(mark.querySelector(".chat-audio-note")).toBeNull();
    expect(mark.textContent).not.toMatch(/No audio|not in the call/i);
  }
});
