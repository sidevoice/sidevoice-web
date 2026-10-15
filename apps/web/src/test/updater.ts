import { vi } from "vitest";
import type { AppUpdater, UpdateMode, UpdaterStatus } from "../features/updates/useUpdates";

type Method = Exclude<keyof AppUpdater, "status">;

/** The desktop app's updater (sidevoice-desktop #56) as a test drives it: each method a mock answering from its status
 *  and mode, the status pushed to its listeners with `push` (inside act()), any method left out with `without`. */
export function fakeUpdater({ status = { state: "idle" }, mode = "automatic", without = [] }: { status?: UpdaterStatus; mode?: UpdateMode; without?: Method[] } = {}) {
  let now = status;
  let kept = mode;
  const listeners = new Set<(status: UpdaterStatus) => void>();
  const updater = {
    settings: vi.fn(async () => ({ mode: kept })),
    setMode: vi.fn(async (next: UpdateMode) => { kept = next; return { mode: kept }; }),
    status: vi.fn(async () => now),
    subscribe: vi.fn((listener: (status: UpdaterStatus) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }),
    check: vi.fn(async () => now),
    download: vi.fn(async () => now),
    cancel: vi.fn(async () => undefined),
    restart: vi.fn(async () => undefined),
  };
  for (const name of without) delete (updater as Partial<typeof updater>)[name];
  return {
    updater,
    push(next: UpdaterStatus) {
      now = next;
      for (const listener of [...listeners]) listener(next);
    },
  };
}

/** The desktop host this page finds: `host` (its local host, its build…) with `updater`, or none (a nightly, a
 *  development build, an app older than the updater). */
export function withUpdater(updater: Partial<AppUpdater> | undefined, host: Record<string, unknown> = {}) {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { ...host, ...(updater ? { updater } : {}) } } });
}
