import { useSyncExternalStore } from "react";

/* Captions: what is said, shown on the call's stage (the balloons) and on the desktop app's floating card. On unless the
 * person turns them off, from the call's bar or the card (sidevoice-web#239); one choice for both, kept on this device.
 * The room and the card are pages of one origin, so the card hears a change through the storage event. */

export const CAPTIONS_KEY = "sidevoice.captions";

const listeners = new Set<() => void>();

export function readCaptions(): boolean {
  try { return globalThis.localStorage?.getItem(CAPTIONS_KEY) !== "off"; } catch { return true; }
}

export function setCaptions(on: boolean) {
  try {
    if (on) globalThis.localStorage?.removeItem(CAPTIONS_KEY);
    else globalThis.localStorage?.setItem(CAPTIONS_KEY, "off");
  } catch { /* Kept for this page only. */ }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const fromAnotherPage = (event: StorageEvent) => { if (event.key === null || event.key === CAPTIONS_KEY) listener(); };
  window.addEventListener("storage", fromAnotherPage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", fromAnotherPage); };
}

/** Whether captions show, following every change, here or in another page of this device. */
export function useCaptions(): boolean {
  return useSyncExternalStore(subscribe, readCaptions, () => true);
}
