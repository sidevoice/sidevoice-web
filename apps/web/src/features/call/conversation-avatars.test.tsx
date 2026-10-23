import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { RoomStoreContext, createRoomStore, type RoomStore } from "../../state/room-store";
import { cardFacts, type SessionFacts } from "../../state/room-session-state.js";
import { BORED_AFTER_MS } from "../avatar/avatar-state";
import { MOTION_KEY, startMotion } from "../../lib/motion";
import { useConversationAvatar, useConversationAvatars, useMovingCopy } from "./conversation-avatars";

const KEY = "fp-1|t-login";
const facts: Partial<SessionFacts> = {
  machinesReady: true, pairings: [{ fp: "fp-1", host: "Laptop", urls: [], device_id: "d", paired_at: 1, revoked: false }] as never,
  machineLinks: { "fp-1": { reach: "ok", via: "node" } }, callNode: "fp-1", ws: {} as never, sessionId: "s1",
  roomBinding: { thread_id: "t-login", title: "Fix the slow login", binding_id: "b1" } as never,
  people: [{ thread_id: "t-login", title: "Fix the slow login", available: true, reach: { state: "listening" }, node: "fp-1", machine: { host: "Laptop", id: "m1" }, harness: "claude" }] as never,
};
const wrap = (store: RoomStore) => ({ children }: { children: ReactNode }) => createElement(RoomStoreContext.Provider, { value: store }, children);

beforeEach(() => { vi.useFakeTimers({ now: 1_800_000_000_000 }); localStorage.setItem(MOTION_KEY, "gpu"); startMotion(); });
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); });

test("the room stamps when its figure's rest began, the card receives it with its facts and stamps nothing of its own", () => {
  const room = createRoomStore();
  act(() => room.patch(facts));
  const inRoom = renderHook(() => { useMovingCopy(KEY); return useConversationAvatar(KEY); }, { wrapper: wrap(room) });
  const stamp = room.getState().facts.figures[KEY].restStart;
  expect(stamp).toBe(Date.now());
  expect(room.getState().facts.restRelayed).toBe(false);

  // The card's store, patched as card-room.ts does, a while later.
  vi.advanceTimersByTime(3_000);
  const card = createRoomStore();
  act(() => card.patch({ restRelayed: true }));
  act(() => card.patch(cardFacts(room.getState().facts) as unknown as Partial<SessionFacts>));
  const inCard = renderHook(() => { useMovingCopy(KEY); return useConversationAvatar(KEY); }, { wrapper: wrap(card) });
  expect(card.getState().facts.figures[KEY].restStart).toBe(stamp);
  // Nothing it noticed on its own changes the stamp: not even a later look.
  act(() => card.patch({ micEnabled: false }));
  expect(card.getState().facts.figures[KEY].restStart).toBe(stamp);

  // Both count the rest from the room's stamp: the same moment for the animations and the same step at any time.
  expect(inCard.result.current.since).toBe(inRoom.result.current.since);
  expect(inRoom.result.current.since).toBe(stamp);
  const seen = new Set<string | undefined>();
  for (let step = 0; step < 40; step += 1) {
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(inCard.result.current).toEqual(inRoom.result.current);
    seen.add(inRoom.result.current.idle);
  }
  // They were not just quiet: a pastime came up in both.
  expect([...seen].some((idle) => idle !== "quiet")).toBe(true);
});

test("a relay that hears the room before the room has stamped never shows the card a new mood with the old stamp", () => {
  const room = createRoomStore(), card = createRoomStore();
  act(() => room.patch(facts));
  act(() => card.patch({ restRelayed: true }));
  // The relay subscribes first, as the desktop's host does: it hears every publication, the mood's before the stamp's.
  room.subscribe((state) => card.patch(cardFacts(state.facts) as unknown as Partial<SessionFacts>));
  act(() => card.patch(cardFacts(room.getState().facts) as unknown as Partial<SessionFacts>));
  const inRoom = renderHook(() => { useMovingCopy(KEY); return useConversationAvatar(KEY); }, { wrapper: wrap(room) });
  const inCard = renderHook(() => { useMovingCopy(KEY); return useConversationAvatar(KEY); }, { wrapper: wrap(card) });
  act(() => { vi.advanceTimersByTime(5_000); });
  act(() => room.patch({ userLive: true, userTurn: { id: "u1", segment: "turn:u1", thread: KEY }, pendingPhase: "listening" } as Partial<SessionFacts>));
  expect(inRoom.result.current).toMatchObject({ mood: "listening", enter: "idle" });
  expect(inCard.result.current).toEqual(inRoom.result.current);
});

const mount = (store: RoomStore) => renderHook(() => { useMovingCopy(KEY); return useConversationAvatar(KEY); }, { wrapper: wrap(store) });
const link = (room: RoomStore, card: RoomStore) => {
  act(() => card.patch({ restRelayed: true }));
  room.subscribe((state) => card.patch(cardFacts(state.facts) as unknown as Partial<SessionFacts>));
  act(() => card.patch(cardFacts(room.getState().facts) as unknown as Partial<SessionFacts>));
};
const BUSY = { harness: { [KEY]: true }, workingSince: { [KEY]: 0 }, now: 1_000_000 } as Partial<SessionFacts>;

test("held under its balloon, a working agent speaks in the card too, and works again when the balloon goes", () => {
  const room = createRoomStore(), card = createRoomStore();
  act(() => room.patch({ ...facts, ...BUSY }));
  link(room, card);
  const inRoom = mount(room), inCard = mount(card);
  const avatars = renderHook(() => useConversationAvatars(), { wrapper: wrap(room) }).result.current;
  expect(inCard.result.current.mood).toBe("working");
  act(() => avatars.hold(KEY, true));
  expect(inRoom.result.current.mood).toBe("speaking");
  expect(inCard.result.current).toEqual(inRoom.result.current);
  act(() => avatars.hold(KEY, false));
  expect(inRoom.result.current.mood).toBe("working");
  expect(inCard.result.current).toEqual(inRoom.result.current);
});

test("a card that mounts, or hears facts, between the room's updates acts out the room's one fact, never a mood of its own with a stamp", () => {
  const room = createRoomStore(), card = createRoomStore();
  act(() => room.patch(facts));
  const inRoom = mount(room);
  vi.advanceTimersByTime(5_000);
  // The card's facts say the person is talking; the room's fact about the figure (still idle) has not changed yet.
  act(() => card.patch({ restRelayed: true }));
  act(() => card.patch({ ...cardFacts(room.getState().facts), userLive: true, userTurn: { id: "u1", segment: "turn:u1", thread: KEY }, pendingPhase: "listening" } as unknown as Partial<SessionFacts>));
  const inCard = mount(card);
  expect(inCard.result.current).toEqual(inRoom.result.current);
  expect(inCard.result.current.mood).toBe("idle");
});
