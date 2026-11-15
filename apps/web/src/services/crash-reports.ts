import { useSyncExternalStore } from "react";
import { host, onHostMember, type CrashReportsBridge, type CrashReportsMode } from "../host";

/* Crash reports as the page shows them: what the app does when something fails (Settings → Crash reports), and whether the
 * person has been told the app sends them (the first-run notice).
 *
 * The setting is the app's (`host().crashReports`, host/types.ts): the app keeps the mode, holds to it before any page has loaded,
 * and answers it (`get`), takes the person's choice (`set`) and says when it changes elsewhere (`subscribe`). The page keeps
 * no copy of it and tells the app nothing on its own: it reads, shows what it was told, and passes on the person's choice. So a
 * page that lost its storage can never turn sending back on; the worst it loses is the notice's flag, and the notice shows once
 * more. A browser sends no crash reports and has neither the setting nor the notice.
 *
 * Until the app has answered, the mode is unknown (`null`) and nothing claims a choice. The app is read while something shows it
 * (Settings, the notice), and let go when nothing does.
 *
 * Only the notice's flag is the page's, stored under `sidevoice.crash-reports` as `{ "noticeSeen": boolean }`; whatever else is
 * there (a text that is broken, a field from another build) reads as not seen. */

export const CRASH_REPORTS_KEY = "sidevoice.crash-reports";

export interface CrashReportsState {
  /** The app sends crash reports (offers the setting). False in a browser, and until an app that offers it late does. */
  offered: boolean;
  /** What the app holds; `null` while it has not said (or could not). */
  mode: CrashReportsMode | null;
  /** The one-line notice that crash reports are sent was shown and put away (closed, or Settings opened from it): it never
   *  shows again. Also what an updating device lacks, which is why it sees the notice once. */
  noticeSeen: boolean;
}

const UNKNOWN: CrashReportsState = { offered: false, mode: null, noticeSeen: false };

// ----- the notice's flag: the page's own, kept on this device

const rawValue = () => { try { return globalThis.localStorage?.getItem(CRASH_REPORTS_KEY) ?? null; } catch { return null; } };

function parseSeen(raw: string | null): boolean {
  try { return (JSON.parse(raw || "{}") as { noticeSeen?: unknown } | null)?.noticeSeen === true; } catch { return false; }
}

/** For this visit only when the storage refuses (a blocked browser): the flag still holds until the page goes. */
let heldSeen: boolean | null = null;
const noticeSeen = () => heldSeen ?? parseSeen(rawValue());

/** The notice's flag: put away for good. */
export function markCrashReportsNoticeSeen() {
  if (noticeSeen()) return;
  heldSeen = true;
  try { globalThis.localStorage?.setItem(CRASH_REPORTS_KEY, JSON.stringify({ noticeSeen: true })); heldSeen = null; } catch { /* Kept for this visit only. */ }
  emit();
}

/** The notice's flag forgotten, so it shows again: for a test, or the storyboard between frames. */
export function resetCrashReportsNotice() {
  heldSeen = null;
  try { globalThis.localStorage?.removeItem(CRASH_REPORTS_KEY); } catch { /* Nothing stored to forget. */ }
  emit();
}

// ----- the setting: the app's, read while something shows it

let offered = false;
let mode: CrashReportsMode | null = null;
/** Bumped by everything the app says or is told (a read, a push, a choice): a read asked before the latest of them is stale. */
let epoch = 0;
let bound: { bridge: CrashReportsBridge; stop: () => void } | null = null;
let detach: (() => void) | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

const valid = (value: unknown): CrashReportsMode | null => value === "auto" || value === "never" ? value : null;

function setMode(next: CrashReportsMode | null) {
  if (next === mode) return;
  mode = next;
  emit();
}

/** Reads what the app holds. An app that cannot say (rejects, answers something else) leaves what was known: nothing is
 *  guessed, and the next time something shows the setting it is asked again. */
async function read() {
  const bridge = bound?.bridge;
  if (!bridge) return;
  const mine = ++epoch;
  let answer: CrashReportsMode | null = null;
  try { answer = valid(await bridge.get()); } catch { /* Unknown stays unknown. */ }
  if (mine !== epoch || bound?.bridge !== bridge || !answer) return;
  setMode(answer);
}

/** Takes up the app's member once it is there. */
function bind() {
  const bridge = host().crashReports;
  if (!bridge || bound?.bridge === bridge) return;
  bound?.stop();
  let stop: (() => void) | void = undefined;
  try {
    stop = bridge.subscribe?.((next) => {
      const said = valid(next);
      if (!said || bound?.bridge !== bridge) return;
      epoch++;
      setMode(said);
    });
  } catch { /* An app whose subscription fails is read again at the next mount. */ }
  bound = { bridge, stop: typeof stop === "function" ? stop : () => undefined };
  offered = true;
  emit();
  void read();
}

function attach() {
  const stopWatching = onHostMember("crashReports", bind);
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === CRASH_REPORTS_KEY) emit(); };
  globalThis.addEventListener?.("storage", onStorage);
  detach = () => {
    stopWatching();
    globalThis.removeEventListener?.("storage", onStorage);
    try { bound?.stop(); } catch { /* Nothing more to do with an app's failing unsubscribe. */ }
    bound = null;
    offered = false;
    mode = null;
    epoch++;
    detach = null;
  };
}

/** Be told when the setting or the notice's flag changes. The first one watching reads the app (and keeps looking for a
 *  member the app offers late); each later one reads it again, since an app without `subscribe` cannot say when it changed. */
export function subscribeCrashReports(changed: () => void) {
  listeners.add(changed);
  if (!detach) attach();
  else void read();
  return () => {
    listeners.delete(changed);
    if (!listeners.size) detach?.();
  };
}

// A snapshot that is the same object while nothing in it changes, as a store read by React must be. The member is looked for
// at the first read, so the first render already knows whether the host offers it.
let snapshot: CrashReportsState = UNKNOWN;
function getSnapshot(): CrashReportsState {
  const isOffered = offered || host().crashReports !== null;
  const seen = noticeSeen();
  if (snapshot.offered !== isOffered || snapshot.mode !== mode || snapshot.noticeSeen !== seen) snapshot = { offered: isOffered, mode, noticeSeen: seen };
  return snapshot;
}

/** What the app holds and the notice's flag, followed as they change. */
export function useCrashReports(): CrashReportsState {
  return useSyncExternalStore(subscribeCrashReports, getSnapshot, () => UNKNOWN);
}

/** Whether the app sends crash reports: for what shows only there (the Settings section), without following the rest. */
export function useCrashReportsOffered(): boolean {
  return useSyncExternalStore(subscribeCrashReports, () => getSnapshot().offered, () => false);
}

/** Changes the setting: shown at once, passed to the app, and given back as it was if the app did not take it (so what the page
 *  says is what the app does). Answers whether it holds. One change at a time, in the order made. */
let queue: Promise<unknown> = Promise.resolve();
export function chooseCrashReports(next: CrashReportsMode): Promise<boolean> {
  const bridge = host().crashReports;
  if (!bridge) return Promise.resolve(false);
  const before = mode;
  if (before === next) return Promise.resolve(true);
  epoch++;
  setMode(next);
  const run = async () => {
    try { await bridge.set(next); return true; }
    catch {
      // A later choice made meanwhile is the person's last word; only the one that failed is undone, and what the app holds is
      // read again to be sure of it.
      if (mode === next) { epoch++; setMode(before); void read(); }
      return false;
    }
  };
  const result = queue.then(run, run);
  queue = result;
  return result;
}
