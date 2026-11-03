import { createContext, useContext } from "react";
import { createRoomSessionStore, speakWith } from "./room-session-state.js";
import { translator } from "../i18n/translator";
import { useStore } from "zustand";
import { createMicLevelChannel } from "./mic-level";
import { playbackLevel } from "./playback-level";
import { openSettings } from "../features/settings/open-settings";
import { startCallSurface } from "./call-surface-publisher";
import type { CallLayoutStore } from "./call-layout";

export type RoomViewState = import('./room-session-state.js').SessionSnapshot;
export type RoomStore = import('./room-session-state.js').SessionStore;

// The projections speak the interface's language, whichever it is when they are made.
speakWith((key, params) => translator()(key, params));

export function createRoomStore(): RoomStore {
  return createRoomSessionStore();
}

export const RoomStoreContext = createContext<RoomStore | null>(null);

export function useRoomStore<T>(selector: (state: RoomViewState) => T): T {
  const store = useContext(RoomStoreContext);
  if (!store) throw new Error("useRoomStore must be used inside RoomProvider");
  return useStore(store, selector);
}

let stopSurface: (() => void) | null = null;

export function installRoomBridge(store: RoomStore, layout: CallLayoutStore | null = null) {
  playbackLevel.clear();
  // What a native call surface reads by the clock; it does nothing until the host has one.
  stopSurface?.();
  stopSurface = startCallSurface(store);
  window.sidevoiceUI = {
    store,
    // A sentence already worded for people, or a failure as error-message.ts words it.
    setBootError: (value) => store.patch({ bootError: !value ? null : typeof value === "string" ? { text: value } : value }),
    micLevel: createMicLevelChannel(),
    playbackLevel,
    // The desktop app opens Settings at a section from outside the page: its floating card's gear (Floating card).
    openSettings: (section) => openSettings({ section }, store),
    // A phone app's call surface (its Lock Screen card, its notification) opens the app on its conversations: put them in
    // front, as the header's own button does.
    openConversations: () => layout?.getState().showConversations(),
  };
}
