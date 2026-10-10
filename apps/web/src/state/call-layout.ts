import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

/* How the call view is laid out on this device, apart from what the session says: whether the transcript is open,
 * whether the desktop sidebar is collapsed (kept across reloads), and whether a phone's conversations panel is down.
 * Only the collapsed sidebar is remembered, and only its own toggle changes it; the rest starts closed. On a phone the
 * panel and the transcript are both dialogs over the call, and one opening puts the other away. */

export const SIDEBAR_COLLAPSED_KEY = "sidevoice.sidebar-collapsed";
/** Below this width the conversations live in the header, and the transcript is a sheet. Matches styles/call.css. */
export const NARROW_QUERY = "(max-width: 899px)";
/** Below this width a desktop has no room for the open sidebar beside the docked transcript: the sidebar is its rail. */
export const RAIL_WITH_TRANSCRIPT_QUERY = "(max-width: 1199px)";

export interface CallLayoutState {
  transcriptOpen: boolean;
  sidebarCollapsed: boolean;
  conversationsOpen: boolean;
  toggleTranscript(): void;
  closeTranscript(): void;
  toggleSidebar(): void;
  openConversations(): void;
  closeConversations(): void;
  /** Put the conversations in front of the person: a phone brings its panel down; a desktop has them beside the call,
   *  and only makes room when the docked transcript has squeezed them into the rail. The saved choice stays. */
  showConversations(): void;
}

export type CallLayoutStore = StoreApi<CallLayoutState>;
type LayoutStorage = Pick<Storage, "getItem" | "setItem">;

function localStorageOrNull(): LayoutStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function createCallLayoutStore(storage: LayoutStorage | null = localStorageOrNull()): CallLayoutStore {
  let collapsed = false;
  try { collapsed = storage?.getItem(SIDEBAR_COLLAPSED_KEY) === "1"; } catch { /* A storage that cannot be read is an expanded sidebar. */ }
  return createStore<CallLayoutState>((set, get) => ({
    transcriptOpen: false,
    sidebarCollapsed: collapsed,
    conversationsOpen: false,
    toggleTranscript: () => set(get().transcriptOpen ? { transcriptOpen: false }
      : isNarrow() ? { transcriptOpen: true, conversationsOpen: false } : { transcriptOpen: true }),
    closeTranscript: () => set({ transcriptOpen: false }),
    toggleSidebar: () => {
      const next = !get().sidebarCollapsed;
      set({ sidebarCollapsed: next });
      try { storage?.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0"); } catch { /* Remembered for this page only. */ }
    },
    openConversations: () => set(isNarrow() ? { conversationsOpen: true, transcriptOpen: false } : { conversationsOpen: true }),
    closeConversations: () => set({ conversationsOpen: false }),
    showConversations: () => {
      if (isNarrow()) get().openConversations();
      else if (get().transcriptOpen && matches(RAIL_WITH_TRANSCRIPT_QUERY)) set({ transcriptOpen: false });
    },
  }));
}

export const CallLayoutContext = createContext<CallLayoutStore | null>(null);

export function useCallLayout<T>(selector: (state: CallLayoutState) => T): T {
  const store = useContext(CallLayoutContext);
  if (!store) throw new Error("useCallLayout must be used inside RoomProvider");
  return useStore(store, selector);
}

function matches(query: string) {
  return !!globalThis.window?.matchMedia?.(query).matches;
}

/** The page is laid out for a phone: conversations in the header, the transcript as a sheet. */
export function isNarrow() {
  return matches(NARROW_QUERY);
}

/** Whether `query` matches now, re-rendering when that changes. */
export function useMedia(query: string) {
  const subscribe = useCallback((notify: () => void) => {
    const list = globalThis.window?.matchMedia?.(query);
    list?.addEventListener?.("change", notify);
    return () => list?.removeEventListener?.("change", notify);
  }, [query]);
  return useSyncExternalStore(subscribe, () => matches(query), () => false);
}
