import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CallCard, CLICK_GUARD_MS } from "./CallCard";
import { createCardRoom } from "./card-room";
import type { CallControlsHost, CallControlsState } from "./host";
import { RoomProvider } from "../app/RoomProvider";
import { createRoomStore } from "../state/room-store";
import { cardFacts, WORKING_SHOWN_AFTER_MS, type SessionFacts } from "../state/room-session-state.js";
import { FLOATING_CARD_KEY } from "../state/floating-card";
import { CARD_MARGIN } from "./card-shell";
import { translator } from "../i18n/translator";
import { litPart } from "../features/call/lit-part";
import { PAGE_MS } from "../features/call/PagedText";
import { SENT_LEAVING_MS } from "../features/call/speech-reading";

vi.mock("../services/room-session-controller.js", () => ({}));

/* The floating card's formats, drawn as its page draws them: the room's facts relayed through the host (CallCardView
 * .facts) into the card's own store (card-room.ts), the room's own components on it. */

const REPLY = "Okay. I'll start with the login and then look at the cart tests.";
const LOGIN = "fp-1|t-login";
const ROOM: Partial<SessionFacts> = {
  ws: {}, sessionId: "s1", callNode: "fp-1", roomBinding: { thread_id: "t-login", title: "Fix the slow login", binding_id: "b1" },
  people: [{ thread_id: "t-login", title: "Fix the slow login", available: true, node: "fp-1", reach: { state: "listening" } }],
  machineLinks: { "fp-1": { reach: "ok", via: "node" } }, pairings: [{ fp: "fp-1", host: "Laptop", urls: [], device_id: "d", paired_at: 1, revoked: false }] as never,
  botLive: true, karaokeState: { segment: "h-2", from: 20, to: 20 },
  history: [{ segment: "h-2", thread: LOGIN, role: "assistant", text: REPLY, name: "Fix the slow login", time: 1, session: "s1", audio: "playing" }] as never,
};

function page(format: string, extra: Partial<CallControlsState> = {}, roomExtra: Record<string, unknown> = {}, hostExtra: Partial<CallControlsHost> = {}) {
  localStorage.setItem(FLOATING_CARD_KEY, JSON.stringify({ format, size: "m" }));
  const room = createRoomStore();
  act(() => room.patch({ ...ROOM, ...roomExtra }));
  let state: CallControlsState = { call: { ...room.getState().callCard, version: 2, since: 1 }, level: 0, pointerInside: null, alwaysExpanded: false,
    muteShortcut: "", ...extra };
  let push: ((next: CallControlsState) => void) | null = null;
  const host: CallControlsHost = { subscribe: (listener) => { push = listener; listener(state); return () => undefined; }, run: vi.fn(), layout: vi.fn(), drag: vi.fn(), ...hostExtra };
  const card = createCardRoom((command) => host.run(command));
  const wrapped: CallControlsHost = { ...host, subscribe: (listener) => host.subscribe((next) => { card.apply(next); listener(next); }) };
  render(<RoomProvider store={card.store} runtime={false}><CallCard host={wrapped} t={translator("en")} /></RoomProvider>);
  // What the room says next (the call going on): the facts patched, the app relaying the new snapshot to the card.
  return Object.assign(host, { say(next: Record<string, unknown>) {
    act(() => room.patch(next));
    state = { ...state, call: { ...room.getState().callCard, version: 2, since: 1 } };
    act(() => push?.(state));
  } });
}

afterEach(() => { localStorage.removeItem(FLOATING_CARD_KEY); vi.useRealTimers(); });

test("the picture is the room's own stage tile and call bar, on the facts the room relays", () => {
  vi.useFakeTimers();
  const host = page("pip");
  expect(document.querySelector(".picture-card .stage-tile[data-card]")).toHaveAttribute("data-mood", "speaking");
  expect(litPart(document.querySelector(".stage-voice .vcap.agent:not(.meas)")!).played).toBe("Okay. I'll start with");
  expect(screen.getByText("Laptop")).toBeInTheDocument();
  // The room's call bar, without its ⋮; what it asks the room for goes to the app as the card's commands.
  expect(document.querySelector(".picture-card #call-menu")).toBeNull();
  expect(screen.getByRole("button", { name: "Hide captions" })).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(CLICK_GUARD_MS + 10); });
  fireEvent.click(screen.getByRole("button", { name: "Skip what is playing" }));
  expect(host.run).toHaveBeenCalledWith({ command: "skip-reply" });
});

test("just the avatar: its voice text is the stage's white card, docked under it in the screen's upper half, over it in the lower half", () => {
  vi.useFakeTimers();
  page("avatar");
  expect(document.querySelector(".floating-card")).toHaveAttribute("data-open", "down");
  const card = document.querySelector(".avatar-card > .avatar-voice.docked-voice > .vcap.card.agent")!;
  expect(card).not.toBeNull();
  expect(litPart(card as HTMLElement).played).toBe("Okay. I'll start with");
  expect(document.querySelector(".avatar-card")).toHaveAttribute("data-voice");
  // No balloon: no bubble, no tail, no gloss.
  expect(document.querySelector(".speech-bubble, .balloon-tail, .balloon-shine")).toBeNull();
  // Its controls come out of a handle, shown by the pointer on the creature only.
  expect(document.querySelector(".avatar-dock")).toBeNull();
  cleanup();
  page("avatar", { place: { vertical: "lower", horizontal: "left" } });
  expect(document.querySelector(".floating-card")).toHaveAttribute("data-open", "up");
  expect(document.querySelector(".avatar-voice .vcap.card.agent")).not.toBeNull();
});

test("the title card: its captions are the stage's voice text, docked after it: the reply lit as it is heard, never plain lines", () => {
  vi.useFakeTimers();
  page("card");
  const column = document.querySelector(".floating-card > .docked-voice.card-voice")!;
  expect(column).not.toBeNull();
  expect(column.previousElementSibling).toHaveClass("title-card");
  const card = column.querySelector<HTMLElement>(":scope > .vcap.card.agent")!;
  expect(litPart(card).played).toBe("Okay. I'll start with");
  // The stage's reading: three lines a page, the words said in the ink and the rest quiet.
  expect(card.querySelector(".paged-text[data-turn=page] .lit-text")).not.toBeNull();
  expect(document.querySelector(".caption-line, .card-captions-lines, .speech-bubble")).toBeNull();
  // It is the card's own look, in the window's margin: the stage's own would be cut by the window's edge (card-shadow.test.ts).
  expect(card).toHaveAttribute("translate", "no");
});

test("with captions off, neither the title card nor the avatar docks any voice text; the stage's tile keeps the room's own switch", () => {
  localStorage.setItem("sidevoice.captions", "off");
  try {
    page("card");
    expect(document.querySelector(".docked-voice")).toBeNull();
    cleanup();
    page("avatar");
    expect(document.querySelector(".docked-voice")).toBeNull();
    expect(document.querySelector(".avatar-card")).not.toHaveAttribute("data-voice");
  } finally { localStorage.removeItem("sidevoice.captions"); }
});

test("nothing said, nothing docked: the column is empty (and out of the flow) between turns", () => {
  page("card", {}, { botLive: false, karaokeState: null, history: [] });
  const column = document.querySelector(".docked-voice")!;
  expect(column).toBeEmptyDOMElement();
  cleanup();
  page("avatar", {}, { botLive: false, karaokeState: null, history: [] });
  expect(document.querySelector(".avatar-voice")).toBeEmptyDOMElement();
  expect(document.querySelector(".avatar-card")).not.toHaveAttribute("data-voice");
});

/** The person's turn, as the room's facts say it at each step (stage-phone-balloon's states). */
const KEY = LOGIN;
const draft = { segment: "u", thread: KEY, role: "user", text: "", name: "", time: 5, session: "s1", seq: 5, draft: true };
const speaks = { botLive: false, karaokeState: null, userLive: true, userTurn: { id: "u", segment: "u", thread: KEY }, pendingPhase: "listening", history: [draft] };
const transcribes = { ...speaks, userLive: false, pendingPhase: "transcribing" };
const sends = { userLive: false, userTurn: null, pendingPhase: "", pendingText: "",
  history: [{ ...draft, segment: "u-sent", text: "Run the tests and tell me what fails.", draft: false, delivery: "delivered" }] };

test.each(["card", "avatar"])("%s: the person's turn is the stage's pill, then \"Transcribing\", then what was sent; the reply it cuts in on lifts away", (format) => {
  vi.useFakeTimers();
  const host = page(format);
  const column = () => document.querySelector(".docked-voice")!;
  const reply = () => column().querySelector(".vcap.card.agent")!;
  expect(reply()).not.toHaveAttribute("data-leaving");
  // They speak: the pill (the microphone and the voice's bars) in the reply's place, which lifts away.
  host.say(speaks);
  const pill = column().querySelector(".vcap.card.person.pill")!;
  expect(pill).toHaveAttribute("data-phase", "listening");
  expect(pill.querySelector(".turn-bars")).not.toBeNull();
  expect(reply()).toHaveAttribute("data-leaving");
  // Lifted away, it is gone: faded in the column's one cell, it would keep the room of its three lines and its width, and the pill beside it
  // would be as tall as it (a circle) and as wide.
  act(() => { vi.advanceTimersByTime(SENT_LEAVING_MS); });
  expect(column().querySelector(".vcap.card.agent")).toBeNull();
  expect(column().children).toHaveLength(1);
  // Cancel sending: the card's command, from the pill's ×.
  fireEvent.click(screen.getByRole("button", { name: "Cancel sending" }));
  expect(host.run).toHaveBeenCalledWith({ command: "cancel-input" });
});

test("just the avatar: a press on its voice text moves nothing, a press on the creature drags", () => {
  vi.useFakeTimers();
  const host = page("avatar");
  const voice = document.querySelector(".avatar-voice")!;
  fireEvent.pointerDown(voice, { button: 0, pointerId: 1, screenX: 100, screenY: 100 });
  fireEvent.pointerMove(voice, { pointerId: 1, screenX: 140, screenY: 110 });
  expect(host.drag).not.toHaveBeenCalled();
  fireEvent.pointerUp(voice, { pointerId: 1, screenX: 140, screenY: 110 });
  const figure = document.querySelector(".avatar-figure")!;
  fireEvent.pointerDown(figure, { button: 0, pointerId: 2, screenX: 100, screenY: 100 });
  fireEvent.pointerMove(figure, { pointerId: 2, screenX: 140, screenY: 110 });
  expect(host.drag).toHaveBeenCalledWith("start");
});

test("the title card: a press on its voice text drags the card, as a press anywhere on it does", () => {
  vi.useFakeTimers();
  const host = page("card");
  const reply = document.querySelector(".docked-voice")!;
  fireEvent.pointerDown(reply, { button: 0, pointerId: 1, screenX: 100, screenY: 100 });
  fireEvent.pointerMove(reply, { pointerId: 1, screenX: 140, screenY: 110 });
  expect(host.drag).toHaveBeenCalledWith("start");
});

test.each(["card", "avatar"])("%s: transcribing is the pill's bars, pulsing, without a word, and what was sent pops out of it as a white card for 3s, then leaves", (format) => {
  vi.useFakeTimers();
  const host = page(format, {}, { botLive: false, karaokeState: null, history: [] });
  host.say(speaks);
  host.say(transcribes);
  const pill = document.querySelector(".docked-voice .vcap.card.person.pill")!;
  expect(pill).toHaveAttribute("data-phase", "transcribing");
  expect(pill.querySelector(".turn-bars")).toHaveAttribute("data-phase", "transcribing");
  // One announcer, a live region with the text; the bars are labelled and not live.
  expect(pill.querySelectorAll("[role=status]")).toHaveLength(1);
  expect(pill.querySelector("[role=status]")).toHaveTextContent("Transcribing what you said");
  expect(pill.querySelector(".turn-bars")).toHaveAttribute("role", "img");
  expect(pill.textContent).toBe("Transcribing what you said");
  host.say(sends);
  expect(document.querySelector(".docked-voice .vcap.pill")).toBeNull();
  const sent = document.querySelector<HTMLElement>(".docked-voice .vcap.card.person.sent")!;
  expect(sent).toHaveTextContent("Run the tests and tell me what fails.");
  act(() => { vi.advanceTimersByTime(PAGE_MS - 1); });
  expect(sent).not.toHaveAttribute("data-leaving");
  act(() => { vi.advanceTimersByTime(1); });
  expect(sent).toHaveAttribute("data-leaving");
  act(() => { vi.advanceTimersByTime(SENT_LEAVING_MS); });
  expect(document.querySelector(".docked-voice .vcap")).toBeNull();
  expect(document.querySelector(".docked-voice")).toBeEmptyDOMElement();
});

test("the facts relayed are plain data: the socket as whether there is one, nothing browsed, only the call's history and others' unseen replies", () => {
  const facts = cardFacts({ ...createRoomStore().getState().facts, ...ROOM, viewedThread: "fp-1|t-other", roomSeen: { "fp-1|t-other": 1 },
    history: [...ROOM.history!, { segment: "o-1", thread: "fp-1|t-other", role: "assistant", text: "seen", time: 2, session: "s1", seq: 1 },
      { segment: "o-2", thread: "fp-1|t-other", role: "assistant", text: "new", time: 3, session: "s1", seq: 2 }] } as SessionFacts);
  expect(facts.ws).toBe(true);
  expect(facts.viewedThread).toBeNull();
  expect(facts.history.map((record) => record.segment)).toEqual(["h-2", "o-2"]);
  expect(() => JSON.stringify(facts)).not.toThrow();
});

test("the picture may be resized freely: a resized window of any shape is laid out as it is", () => {
  const resize = vi.fn();
  page("pip", { size: { width: 700, height: 420 } }, {}, { resize });
  // Width and height both come from the window: not 16:9 of the width.
  const card = document.querySelector<HTMLElement>(".floating-card")!;
  expect(card.style.getPropertyValue("--card-w")).toBe(700 - 2 * CARD_MARGIN + "px");
  expect(card.style.getPropertyValue("--card-h")).toBe(420 - 2 * CARD_MARGIN + "px");
  expect(document.querySelector(".picture-card")).toHaveAttribute("data-sized");
});

test("the picture has no working badge over the creature: the stage's working line is the room's, not the card's", () => {
  page("pip", {}, { harness: { "fp-1|t-login": true }, history: [], karaokeState: null, botLive: false, workingSince: { "fp-1|t-login": 0 }, now: WORKING_SHOWN_AFTER_MS });
  expect(document.querySelector(".picture-card .stage-tile[data-card]")).toHaveAttribute("data-mood", "working");
  expect(screen.queryByText("Working…")).toBeNull();
  expect(document.querySelector(".picture-card [role=status]")).toBeNull();
});

const expanded = () => document.querySelector(".floating-card")!.hasAttribute("data-expanded");

test("just the avatar: no handle; the compact card is there for Tab, with A1's first row, its state line and its controls row only", () => {
  page("avatar");
  expect(document.querySelector(".avatar-handle, .avatar-dock")).toBeNull();
  const card = document.querySelector(".avatar-compact .call-card.title-card.compact-card")!;
  expect(card).not.toBeNull();
  expect(expanded()).toBe(false);
  expect(card.querySelector(".card-face, .card-sub, .your-wave")).toBeNull();
  expect(card.querySelector(".card-who > .card-state")).not.toBeNull();
  expect(card.querySelector(".card-row > .card-who > .card-title > .card-title-text")).not.toBeNull();
  expect(card.querySelector(".card-conversations-button")).not.toBeNull();
  expect([...card.querySelectorAll(".card-actions button")].map((button) => button.getAttribute("aria-label"))).toEqual(["Open Sidevoice", "Floating card settings", "Hide for this call"]);
  expect([...card.querySelectorAll(".card-controls > *")].map((node) => node.className)).toEqual(["card-mic", "card-captions", "card-skip", "card-hangup"]);
});

test("just the avatar: the pointer on the creature opens the card after 120ms, away it folds after 500ms; its voice text is not the creature", () => {
  vi.useFakeTimers();
  page("avatar");
  fireEvent.pointerOver(document.querySelector(".avatar-voice")!);
  act(() => { vi.advanceTimersByTime(700); });
  expect(expanded()).toBe(false);
  fireEvent.pointerOver(document.querySelector(".avatar-figure")!);
  act(() => { vi.advanceTimersByTime(110); });
  expect(expanded()).toBe(false);
  act(() => { vi.advanceTimersByTime(20); });
  expect(expanded()).toBe(true);
  expect(document.querySelector(".floating-card")).toHaveAttribute("data-flow");
  // Away: it folds after the usual delay and, once faded, its box leaves the window's flow.
  fireEvent.pointerLeave(document.querySelector(".avatar-card")!);
  act(() => { vi.advanceTimersByTime(480); });
  expect(expanded()).toBe(true);
  act(() => { vi.advanceTimersByTime(40); });
  expect(expanded()).toBe(false);
  act(() => { vi.advanceTimersByTime(300); });
  expect(document.querySelector(".floating-card")).not.toHaveAttribute("data-flow");
});

test("just the avatar: a control clicked with the pointer holds nothing; the keyboard's focus does, and Tab opens, Escape folds", () => {
  vi.useFakeTimers();
  page("avatar");
  fireEvent.pointerOver(document.querySelector(".avatar-figure")!);
  act(() => { vi.advanceTimersByTime(130); });
  const captions = document.querySelector<HTMLElement>(".avatar-compact .card-captions")!;
  act(() => { vi.advanceTimersByTime(CLICK_GUARD_MS + 10); });
  // Focus from the mouse is not :focus-visible.
  const matches = Element.prototype.matches;
  const visible = vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) { return selector === ":focus-visible" ? false : matches.call(this, selector); });
  act(() => captions.focus());
  fireEvent.pointerLeave(document.querySelector(".avatar-card")!);
  act(() => { vi.advanceTimersByTime(700); });
  expect(expanded()).toBe(false);
  visible.mockRestore();
  // Tab: focus-visible inside the folded card opens it at once.
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) { return selector === ":focus-visible" ? true : matches.call(this, selector); });
  act(() => document.querySelector<HTMLElement>(".avatar-compact .card-mute")!.focus());
  expect(expanded()).toBe(true);
  // It holds as long as that focus stays, whatever the pointer does.
  act(() => { vi.advanceTimersByTime(900); });
  expect(expanded()).toBe(true);
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(expanded()).toBe(false);
  expect(document.activeElement).toBe(document.body);
  vi.restoreAllMocks();
});

test("just the avatar: dragging puts the card away at once and keeps its box until the drop; dropped on the creature it returns after 120ms", () => {
  vi.useFakeTimers();
  const host = page("avatar");
  const figure = document.querySelector(".avatar-figure")!;
  fireEvent.pointerOver(figure);
  act(() => { vi.advanceTimersByTime(130); });
  expect(expanded()).toBe(true);
  fireEvent.pointerDown(figure, { button: 0, pointerId: 1, screenX: 100, screenY: 100 });
  fireEvent.pointerMove(figure, { pointerId: 1, screenX: 120, screenY: 110 });
  expect(host.drag).toHaveBeenCalledWith("start");
  expect(expanded()).toBe(false);
  expect(document.querySelector(".floating-card")).toHaveAttribute("data-dragging");
  // Nothing opens it mid-drag; its box stays in the flow.
  fireEvent.pointerOver(figure);
  act(() => { vi.advanceTimersByTime(700); });
  expect(expanded()).toBe(false);
  expect(document.querySelector(".floating-card")).toHaveAttribute("data-flow");
  // Dropped on the creature (jsdom has no layout: the creature is what is under the point).
  document.elementFromPoint = vi.fn().mockReturnValue(figure);
  const under = vi.mocked(document.elementFromPoint);
  fireEvent.pointerUp(figure, { pointerId: 1, screenX: 120, screenY: 110 });
  expect(host.drag).toHaveBeenLastCalledWith("end");
  expect(document.querySelector(".floating-card")).not.toHaveAttribute("data-dragging");
  act(() => { vi.advanceTimersByTime(130); });
  expect(expanded()).toBe(true);
  // Dropped elsewhere: folded, the box out of the flow.
  fireEvent.pointerDown(figure, { button: 0, pointerId: 2, screenX: 100, screenY: 100 });
  fireEvent.pointerMove(figure, { pointerId: 2, screenX: 140, screenY: 110 });
  under.mockReturnValue(document.body);
  fireEvent.pointerUp(figure, { pointerId: 2, screenX: 140, screenY: 110 });
  act(() => { vi.advanceTimersByTime(300); });
  expect(expanded()).toBe(false);
  expect(document.querySelector(".floating-card")).not.toHaveAttribute("data-flow");
  vi.restoreAllMocks();
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
});

test("just the avatar: with the controls always shown the card is out, and comes back on the drop", () => {
  vi.useFakeTimers();
  const host = page("avatar", { alwaysExpanded: true });
  expect(expanded()).toBe(true);
  const figure = document.querySelector(".avatar-figure")!;
  fireEvent.pointerDown(figure, { button: 0, pointerId: 1, screenX: 100, screenY: 100 });
  fireEvent.pointerMove(figure, { pointerId: 1, screenX: 120, screenY: 110 });
  expect(expanded()).toBe(false);
  fireEvent.pointerUp(figure, { pointerId: 1, screenX: 120, screenY: 110 });
  expect(host.drag).toHaveBeenLastCalledWith("end");
  expect(expanded()).toBe(true);
});

test("just the avatar: once open, the card holds while the pointer is within 16px of the creature and the card, and folds after leaving that", () => {
  vi.useFakeTimers();
  page("avatar");
  fireEvent.pointerOver(document.querySelector(".avatar-figure")!);
  act(() => { vi.advanceTimersByTime(130); });
  expect(expanded()).toBe(true);
  const rect = (left: number, right: number, top: number, bottom: number) => ({ left, right, top, bottom, width: right - left, height: bottom - top }) as DOMRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("compact-card") ? rect(100, 400, 150, 230) : this.classList.contains("avatar-figure") ? rect(180, 320, 0, 140) : rect(0, 0, 0, 0);
  });
  // Between them, and within the hull's 16px of the card: still on the card, so it holds.
  overAt(document.querySelector(".avatar-voice")!, 90, 200);
  act(() => { vi.advanceTimersByTime(700); });
  expect(expanded()).toBe(true);
  // Beyond it: it folds after the usual delay.
  overAt(document.querySelector(".avatar-voice")!, 60, 200);
  act(() => { vi.advanceTimersByTime(520); });
  expect(expanded()).toBe(false);
  vi.restoreAllMocks();
});

/** A pointerover at a point (jsdom has no PointerEvent, so the coordinates are put on the event). */
function overAt(node: Element, clientX: number, clientY: number) {
  const event = createEvent.pointerOver(node);
  Object.defineProperty(event, "clientX", { value: clientX });
  Object.defineProperty(event, "clientY", { value: clientY });
  fireEvent(node, event);
}

// ---------- an offline agent (R3): the creature's still grey face, and the state, in every format ----------

const OFFLINE = { botLive: false, karaokeState: null, history: [],
  people: [{ thread_id: "t-login", title: "Fix the slow login", available: false, node: "fp-1", reach: { state: "offline" } }] };

test.each(["avatar", "pip", "card"])("%s: an offline agent shows its creature, in its offline look, and says it is offline", (format) => {
  vi.useFakeTimers();
  page(format, {}, OFFLINE);
  const creature = document.querySelector(".floating-card .sv-avatar")!;
  expect(creature).toHaveAttribute("data-offline");
  expect(creature).toHaveAttribute("data-avatar-state", "offline");
  // The state line, with its icon, where the format has it (the avatar's is on its compact card).
  const line = document.querySelector(".floating-card .card-state")!;
  expect(line).toHaveAttribute("data-mood", "offline");
  expect(line).toHaveTextContent(translator("en")("state.offline"));
  expect(line.querySelector("svg")).not.toBeNull();
});

test("the other formats' state line is the same for a listening agent", () => {
  vi.useFakeTimers();
  page("pip");
  expect(document.querySelector(".card-heading .card-state")).toHaveAttribute("data-mood", "speaking");
});

// ---------- the avatar's column: its voice text centred on the creature (R13), the creature where it rests ----------

/** The card's layout in jsdom has no boxes: the creature, the voice text and the compact card get the widths the test says. */
function boxes(figure: number, voice: number, compact = 300) {
  const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get");
  width.mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("avatar-figure") ? figure : this.classList.contains("avatar-voice") ? voice : this.classList.contains("avatar-compact") ? compact : 0;
  });
  return width;
}
const column = () => {
  const card = document.querySelector<HTMLElement>(".avatar-card")!;
  return { figure: card.style.getPropertyValue("--figure-x"), voice: card.style.getPropertyValue("--voice-x"), compact: card.style.getPropertyValue("--compact-x") };
};

test.each([["person's pill", speaks], ["agent's balloon", {}]] as const)("just the avatar: the %s is centred on the creature, wider than it and with room all round", (_name, facts) => {
  vi.useFakeTimers();
  const width = boxes(160, 300);
  try {
    page("avatar", { room: { left: 500, right: 500 } }, facts);
    expect(column()).toEqual({ figure: "70px", voice: "0px", compact: "" });
    expect(document.querySelector(".avatar-voice .vcap")).not.toBeNull();
  } finally { width.mockRestore(); }
});

test("just the avatar: near an edge the creature keeps its place and the voice text slides in by what is missing; a host that cannot say centres it", () => {
  vi.useFakeTimers();
  const width = boxes(160, 300);
  try {
    // Centred it would reach 70px past the creature on each side; only 20px of room on the left: the window reaches 20 there.
    page("avatar", { room: { left: 20, right: 400 } });
    expect(column()).toMatchObject({ figure: "20px", voice: "0px" });
    cleanup();
    // Against the right edge: nothing past the creature on the right (the app would move the window in, and the creature with it).
    page("avatar", { room: { left: 400, right: 0 } });
    expect(column()).toMatchObject({ figure: "140px", voice: "0px" });
    cleanup();
    page("avatar");
    expect(column()).toMatchObject({ figure: "70px", voice: "0px" });
  } finally { width.mockRestore(); }
});

test("just the avatar: the compact card coming out against the right edge sits beside the creature, never moving it", () => {
  // The operator's report (2026-11-07): docked right, the call's card came out and the creature moved.
  vi.useFakeTimers();
  const width = boxes(160, 100);
  try {
    page("avatar", { room: { left: 600, right: 0 }, alwaysExpanded: true });
    expect(expanded()).toBe(true);
    // The voice text (100px here) centred on the creature, the 300px card flush with its right side: the window grows only to the left.
    expect(column()).toEqual({ figure: "140px", voice: "170px", compact: "0px" });
    cleanup();
    page("avatar", { room: { left: 600, right: 600 }, alwaysExpanded: true });
    expect(column()).toMatchObject({ figure: "70px", compact: "0px" });
  } finally { width.mockRestore(); }
});

test("just the avatar: where the creature and its room are narrower than the text, the text is capped to that width and placed after the cap", () => {
  vi.useFakeTimers();
  // The boxes report the text's width as the cap leaves it: 300px wide, wrapped to what the card set.
  const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get");
  width.mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("avatar-figure")) return 160;
    if (!this.classList.contains("avatar-voice")) return 0;
    const cap = parseFloat(this.closest<HTMLElement>(".avatar-card")!.style.getPropertyValue("--voice-max"));
    return Number.isNaN(cap) ? 300 : Math.min(300, cap);
  });
  try {
    // 20px a side: 200px to be in, so the 300px text wraps to 200 and is centred (nothing left to slide).
    page("avatar", { room: { left: 20, right: 20 } });
    const card = document.querySelector<HTMLElement>(".avatar-card")!;
    expect(card.style.getPropertyValue("--voice-max")).toBe("200px");
    expect(column()).toMatchObject({ figure: "20px", voice: "0px" });
    cleanup();
    // A host that cannot say: no cap.
    page("avatar");
    expect(document.querySelector<HTMLElement>(".avatar-card")!.style.getPropertyValue("--voice-max")).toBe("");
  } finally { width.mockRestore(); }
});
