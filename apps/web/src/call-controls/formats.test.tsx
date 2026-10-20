import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CallCard, CLICK_GUARD_MS } from "./CallCard";
import { createCardRoom } from "./card-room";
import type { CallControlsHost, CallControlsState } from "./host";
import { RoomProvider } from "../app/RoomProvider";
import { createRoomStore } from "../state/room-store";
import { cardFacts, WORKING_SHOWN_AFTER_MS, type SessionFacts } from "../state/room-session-state.js";
import { FLOATING_CARD_KEY } from "../state/floating-card";
import { translator } from "../i18n/translator";

vi.mock("../services/room-session-controller.js", () => ({}));

/* The floating card's formats, drawn as its page draws them: the room's facts relayed through the host (CallCardView
 * .facts) into the card's own store (card-room.ts), the room's own components on it. */

const REPLY = "Okay. I'll start with the login and then look at the cart tests.";
const LOGIN = "fp-1|t-login";
const ROOM: Partial<SessionFacts> = {
  ws: {}, sessionId: "s1", callNode: "fp-1", roomBinding: { thread_id: "t-login", title: "Fix the slow login", binding_id: "b1" },
  people: [{ thread_id: "t-login", title: "Fix the slow login", available: true, node: "fp-1", reach: { state: "listening" } }],
  machineLinks: { "fp-1": { reach: "ok", via: "node" } }, pairings: [{ fp: "fp-1", host: "Laptop", urls: [], rv: null, device_id: "d", paired_at: 1, revoked: false }] as never,
  botLive: true, karaokeState: { segment: "h-2", from: 20, to: 20 },
  history: [{ segment: "h-2", thread: LOGIN, role: "assistant", text: REPLY, name: "Fix the slow login", time: 1, session: "s1", audio: "playing" }] as never,
};

function page(format: string, extra: Partial<CallControlsState> = {}, roomExtra: Record<string, unknown> = {}) {
  localStorage.setItem(FLOATING_CARD_KEY, JSON.stringify({ format, size: "m" }));
  const room = createRoomStore();
  act(() => room.patch({ ...ROOM, ...roomExtra }));
  const state: CallControlsState = { call: { ...room.getState().callCard, version: 2, since: 1 }, level: 0, pointerInside: null, alwaysExpanded: false,
    muteShortcut: "", ...extra };
  const host: CallControlsHost = { subscribe: (listener) => { listener(state); return () => undefined; }, run: vi.fn(), layout: vi.fn(), drag: vi.fn() };
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
  expect(document.querySelector(".stage-bubble .karaoke-played")?.textContent).toBe("Okay. I'll start with");
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

test("the picture has no working badge over the creature: the stage's working line is the room's, not the card's", () => {
  page("pip", {}, { harness: { "fp-1|t-login": true }, history: [], karaokeState: null, botLive: false, workingSince: { "fp-1|t-login": 0 }, now: WORKING_SHOWN_AFTER_MS });
  expect(document.querySelector(".picture-card .stage-tile[data-card]")).toHaveAttribute("data-mood", "working");
  expect(screen.queryByText("Working…")).toBeNull();
  expect(document.querySelector(".picture-card [role=status]")).toBeNull();
});

test("just the avatar: the pointer on the creature shows a handle, on the handle it unfolds into the card, away it folds back", () => {
  vi.useFakeTimers();
  page("avatar");
  expect(document.querySelector(".avatar-handle")).toBeNull();
  // A balloon is not the creature: it brings nothing out.
  fireEvent.pointerOver(document.querySelector(".avatar-balloons")!);
  act(() => { vi.advanceTimersByTime(700); });
  expect(document.querySelector(".avatar-handle")).toBeNull();
  fireEvent.pointerOver(document.querySelector(".avatar-figure")!);
  act(() => { vi.advanceTimersByTime(130); });
  const handle = screen.getByRole("button", { name: "Call controls" });
  expect(document.querySelector(".floating-card")).toHaveAttribute("data-handle");
  expect(document.querySelector(".floating-card")).not.toHaveAttribute("data-expanded");
  expect(handle).toHaveAttribute("aria-expanded", "false");
  fireEvent.pointerOver(handle);
  act(() => { vi.advanceTimersByTime(130); });
  expect(document.querySelector(".floating-card")).toHaveAttribute("data-expanded");
  expect(handle).toHaveAttribute("aria-expanded", "true");
  expect(document.querySelector(".avatar-dock")).not.toBeNull();
  // Away: the card folds into the handle after the usual delay, and the handle goes once the pointer has left.
  fireEvent.pointerOver(document.querySelector(".avatar-figure")!);
  act(() => { vi.advanceTimersByTime(520); });
  expect(document.querySelector(".floating-card")).not.toHaveAttribute("data-expanded");
  expect(document.querySelector(".floating-card")).toHaveAttribute("data-folding");
  fireEvent.pointerLeave(document.querySelector(".avatar-card")!);
  act(() => { vi.advanceTimersByTime(800); });
  expect(document.querySelector(".avatar-handle")).toBeNull();
});

test("just the avatar: Enter on the handle opens the card with focus on its first control; Escape folds it back, focus on the handle", () => {
  vi.useFakeTimers();
  page("avatar");
  fireEvent.pointerOver(document.querySelector(".avatar-figure")!);
  act(() => { vi.advanceTimersByTime(130); });
  fireEvent.click(screen.getByRole("button", { name: "Call controls" }));
  act(() => { vi.advanceTimersByTime(10); });
  expect(document.querySelector(".floating-card")).toHaveAttribute("data-expanded");
  const first = document.querySelector<HTMLElement>(".avatar-dock button:not(:disabled)")!;
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "Escape" });
  act(() => { vi.advanceTimersByTime(10); });
  expect(document.querySelector(".floating-card")).not.toHaveAttribute("data-expanded");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Call controls" }));
});
