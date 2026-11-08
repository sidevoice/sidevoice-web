import { useSyncExternalStore } from "react";

/* Whether a conversation's thumbnail moves as the creature on the stage does (developer option, operator 2026-10-21): drawn as
 * GPU layers (features/avatar/layers.ts, only where lib/motion.ts says the drawings may move) and lip-syncing with the voice.
 * Off by default, where a thumbnail is a still drawing and a light (ConversationAvatar). Kept on this device, as the other
 * developer switches are, so the operator can try it in a nightly before it becomes a setting, or not. */

/** What keeps it on, on this device. */
export const ANIMATED_THUMBNAILS_KEY = "sidevoiceAnimatedThumbnails";

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export function animatedThumbnails(): boolean {
  try { return storage()?.getItem(ANIMATED_THUMBNAILS_KEY) === "1"; } catch { return false; }
}

const listeners = new Set<() => void>();

export function setAnimatedThumbnails(on: boolean) {
  try {
    if (on) storage()?.setItem(ANIMATED_THUMBNAILS_KEY, "1");
    else storage()?.removeItem(ANIMATED_THUMBNAILS_KEY);
  } catch { /* storage refused: it stays as it was */ }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another window of the app changing it.
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === ANIMATED_THUMBNAILS_KEY) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

/** Whether the thumbnails move, following it as it changes. */
export function useAnimatedThumbnails(): boolean {
  return useSyncExternalStore(subscribe, animatedThumbnails, () => false);
}
