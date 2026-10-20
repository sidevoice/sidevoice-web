import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CallCard, CLICK_GUARD_MS } from "./CallCard";
import { createCardRoom } from "./card-room";
import type { CallControlsHost, CallControlsState } from "./host";
import { RoomProvider } from "../app/RoomProvider";
import { createRoomStore } from "../state/room-store";
import { cardFacts, type SessionFacts } from "../state/room-session-state.js";
import { FLOATING_CARD_KEY } from "../state/floating-card";
import { CARD_MARGIN } from "./card-shell";
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
  // The dock comes near the pointer only.
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
