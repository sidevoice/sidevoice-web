import { useEffect, useSyncExternalStore } from "react";

/* The creature host (creature/host.ts: three.js and the rig) is its own chunk. It loads the first time a creature is
 * drawn, so the room does not wait for it. A load that fails (the network dropped the chunk) is not kept. The next
 * creature mounted asks again, and while any creature is on the page the load is tried again after a while (1 s, doubling
 * up to 30 s). A passing failure does not lose the agent for the rest of the page's life. While the host cannot be had, a
 * creature shows its fallback (creature/fallback.ts). */

export type CreatureHost = typeof import("./creature/host");

const FIRST_RETRY_MS = 1000, LAST_RETRY_MS = 30_000;

interface Loading { host: CreatureHost | null; failed: boolean }
let state: Loading = { host: null, failed: false };
let pending: Promise<CreatureHost> | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let wait = FIRST_RETRY_MS;
const watchers = new Set<() => void>();

function set(next: Loading) {
  state = next;
  for (const watcher of watchers) watcher();
}

/** The host, loaded once. A failed load is not kept, so the next call tries again. */
export function loadCreatureHost(): Promise<CreatureHost> {
  if (state.host) return Promise.resolve(state.host);
  return (pending ??= import("./creature/host").then((host) => {
    pending = null;
    wait = FIRST_RETRY_MS;
    clearTimeout(retry);
    retry = undefined;
    set({ host, failed: false });
    return host;
  }, (error: unknown) => {
    pending = null;
    console.warn("[creature] cannot load the creatures:", error instanceof Error ? error.message : error);
    // The creatures on the page wait for it: tried again in a while, for as long as any is there.
    if (retry === undefined) retry = setTimeout(() => { retry = undefined; if (watchers.size) void loadCreatureHost().catch(() => {}); }, wait);
    wait = Math.min(LAST_RETRY_MS, wait * 2);
    if (!state.failed) set({ host: null, failed: true });
    throw error;
  }));
}

const watch = (watcher: () => void) => {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
    // No creature waits for it any more: no retry is kept running. The next one mounted asks again.
    if (!watchers.size && retry !== undefined) { clearTimeout(retry); retry = undefined; }
  };
};
const now = () => state;

/** The creature host once it has loaded (null until then) and whether its last load failed. A component that mounts asks
 *  for it, and asks again if the last load failed. */
export function useCreatureHost(): Loading {
  const loading = useSyncExternalStore(watch, now);
  useEffect(() => { if (!state.host) loadCreatureHost().catch(() => {}); }, []);
  return loading;
}
