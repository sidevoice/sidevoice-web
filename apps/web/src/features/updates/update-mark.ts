import { useEffect, useSyncExternalStore } from "react";
import { useAppUpdate } from "./useUpdates";

/* The mark that says, outside Settings › Updates, that the desktop app has an update (the room's UpdateNotice says it
 * over the stage; this is the quiet sign on Settings' gear and on the Updates entry): the app's update as the notice
 * has it (`noticed`), until the person has seen the Updates section for that version or the update is gone (installed).
 * What was seen is this device's: the version, so a newer one marks again. The plain web has no updater: no mark. */

const KEY = "sidevoice.updateSeen";
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
let cache: string | null | undefined;
function read(): string | null {
  if (cache === undefined) { try { cache = localStorage.getItem(KEY); } catch { cache = null; } }
  return cache;
}
function write(version: string) {
  cache = version;
  try { localStorage.setItem(KEY, version); } catch { /* Kept for this load only. */ }
  for (const listener of [...listeners]) listener();
}

/** The version of the app's update the notice says, else null. An update without a version is "". */
function useNoticedVersion(): string | null {
  const { noticed } = useAppUpdate();
  return noticed ? noticed.version ?? "" : null;
}

/** Whether the app has an update the person has not yet seen in Updates. */
export function useUpdateMark(): boolean {
  const version = useNoticedVersion();
  const seen = useSyncExternalStore(subscribe, read, read);
  return version !== null && version !== seen;
}

/** Called by Settings while its Updates section is in view (`inView`): that version is seen. */
export function useSeeUpdates(inView: boolean) {
  const version = useNoticedVersion();
  useEffect(() => { if (inView && version !== null && version !== read()) write(version); }, [inView, version]);
}

/** Forgets what was seen (tests). */
export function resetUpdateSeen() {
  cache = undefined;
  try { localStorage.removeItem(KEY); } catch { /* Nothing to forget. */ }
  for (const listener of [...listeners]) listener();
}
