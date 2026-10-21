import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
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
  const state: CallControlsState = { call: { ...room.getState().callCard, version: 2, since: 1 }, level: 0, pointerInside: null, alwaysExpanded: false,
    muteShortcut: "", ...extra };
  const host: CallControlsHost = { subscribe: (listener) => { listener(state); return () => undefined; }, run: vi.fn(), layout: vi.fn(), drag: vi.fn(), ...hostExtra };
  const card = createCardRoom((command) => host.run(command));
  const wrapped: CallControlsHost = { ...host, subscribe: (listener) => host.subscribe((next) => { card.apply(next); listener(next); }) };
  render(<RoomProvider store={card.store} runtime={false}><CallCard host={wrapped} t={translator("en")} /></RoomProvider>);
  return host;
}

afterEach(() => { localStorage.removeItem(FLOATING_CARD_KEY); vi.useRealTimers(); });

test("the picture is the room's own stage tile and call bar, on the facts the room relays", () => {
  vi.useFakeTimers();
  const host = page("pip");
  expect(document.querySelector(".picture-card .stage-tile[data-card]")).toHaveAttribute("data-mood", "speaking");
  expect(litPart(document.querySelector(".stage-bubble")!).played).toBe("Okay. I'll start with");
  expect(screen.getByText("Laptop")).toBeInTheDocument();
  // The room's call bar, without its ⋮; what it asks the room for goes to the app as the card's commands.
  expect(document.querySelector(".picture-card #call-menu")).toBeNull();
  expect(screen.getByRole("button", { name: "Hide captions" })).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(CLICK_GUARD_MS + 10); });
  fireEvent.click(screen.getByRole("button", { name: "Skip what is playing" }));
  expect(host.run).toHaveBeenCalledWith({ command: "skip-reply" });
});

test("just the avatar: its balloons below it in the screen's upper half point their tails up at it, above it in the lower half down", () => {
  page("avatar");
  expect(document.querySelector(".avatar-balloons")).toHaveClass("balloon--tail-up");
  expect(document.querySelector(".avatar-balloons .stage-bubble")).not.toBeNull();
  // Its controls come out of a handle, shown by the pointer on the creature only.
  expect(document.querySelector(".avatar-dock")).toBeNull();
});

test("just the avatar in the lower half: balloons above, tails down", () => {
  page("avatar", { place: { vertical: "lower", horizontal: "left" } });
  expect(document.querySelector(".floating-card")).toHaveAttribute("data-open", "up");
  expect(document.querySelector(".avatar-balloons")).not.toHaveClass("balloon--tail-up");
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

test("just the avatar: no handle; the compact card is there for Tab, with A1's first row and controls row only", () => {
  page("avatar");
  expect(document.querySelector(".avatar-handle, .avatar-dock")).toBeNull();
  const card = document.querySelector(".avatar-compact .call-card.title-card.compact-card")!;
  expect(card).not.toBeNull();
  expect(expanded()).toBe(false);
  expect(card.querySelector(".card-face, .card-sub, .card-state, .your-wave")).toBeNull();
  expect(card.querySelector(".card-row > .card-who > .card-title > .card-title-text")).not.toBeNull();
  expect(card.querySelector(".card-conversations-button")).not.toBeNull();
  expect([...card.querySelectorAll(".card-actions button")].map((button) => button.getAttribute("aria-label"))).toEqual(["Open Sidevoice", "Floating card settings", "Hide for this call"]);
  expect([...card.querySelectorAll(".card-controls > *")].map((node) => node.className)).toEqual(["card-mic", "card-captions", "card-skip", "card-hangup"]);
});

test("just the avatar: the pointer on the creature opens the card after 120ms, away it folds after 500ms; a balloon is not the creature", () => {
  vi.useFakeTimers();
  page("avatar");
  fireEvent.pointerOver(document.querySelector(".avatar-balloons")!);
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
  overAt(document.querySelector(".avatar-balloons")!, 90, 200);
  act(() => { vi.advanceTimersByTime(700); });
  expect(expanded()).toBe(true);
  // Beyond it: it folds after the usual delay.
  overAt(document.querySelector(".avatar-balloons")!, 60, 200);
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
