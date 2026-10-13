import { createContext, useContext } from "react";
import { createRoomSessionStore } from "./room-session-state.js";
import { useStore } from "zustand";
import { createMicLevelChannel } from "./mic-level";

export type RoomViewState = import('./room-session-state.js').SessionSnapshot;
export type RoomStore = import('./room-session-state.js').SessionStore;

export function createRoomStore(): RoomStore {
  return createRoomSessionStore();
}

export const RoomStoreContext = createContext<RoomStore | null>(null);

export function useRoomStore<T>(selector: (state: RoomViewState) => T): T {
  const store = useContext(RoomStoreContext);
  if (!store) throw new Error("useRoomStore must be used inside RoomProvider");
  return useStore(store, selector);
}

export function installRoomBridge(store: RoomStore) {
  window.sidevoiceUI = {
    store,
    // A sentence already worded for people, or a failure as error-message.ts words it.
    setBootError: (value) => store.patch({ bootError: !value ? null : typeof value === "string" ? { text: value } : value }),
    micLevel: createMicLevelChannel(),
  };
}
