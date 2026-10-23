import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { RoomStoreContext, createRoomStore, type RoomStore } from "../../state/room-store";
import { cardFacts, type SessionFacts } from "../../state/room-session-state.js";
import { BORED_AFTER_MS } from "../avatar/avatar-state";
import { MOTION_KEY, startMotion } from "../../lib/motion";
import { useConversationAvatar, useMovingCopy } from "./conversation-avatars";

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
  const stamp = room.getState().facts.restStart[KEY];
  expect(stamp).toBe(Date.now());
  expect(room.getState().facts.restRelayed).toBe(false);

  // The card's store, patched as card-room.ts does, a while later.
  vi.advanceTimersByTime(3_000);
  const card = createRoomStore();
  act(() => card.patch({ restRelayed: true }));
  act(() => card.patch(cardFacts(room.getState().facts) as unknown as Partial<SessionFacts>));
  const inCard = renderHook(() => { useMovingCopy(KEY); return useConversationAvatar(KEY); }, { wrapper: wrap(card) });
  expect(card.getState().facts.restStart[KEY]).toBe(stamp);
  // Nothing it noticed on its own changes the stamp: not even a later look.
  act(() => card.patch({ micEnabled: false }));
  expect(card.getState().facts.restStart[KEY]).toBe(stamp);

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
