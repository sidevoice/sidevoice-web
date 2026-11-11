import { host, type LocalHostBridge, type LocalHostVersion } from "../host";

/* This device's service as the app's bridge reports it (`localHost.version()`), kept fresh for every place that says it:
 * the card on This device, its row in Updates. One question at a time, shared: every 2 seconds while the service is
 * updating or waiting for a call to end (a bar that moves, a badge that changes the moment the call does), otherwise every
 * minute, and again when the window is focused or shown. Nobody listening, nothing is asked. An app with no `version()`
 * (a browser, an older app) says nothing: no report. */

/** How often the report is read: while the service updates or waits for a call, and otherwise. */
export const POLL_BUSY_MS = 2_000;
export const POLL_IDLE_MS = 60_000;

interface Snapshot { bridge: LocalHostBridge | null; report: LocalHostVersion | null }
let snapshot: Snapshot = { bridge: null, report: null };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let asking = false;
let askAgain = false;

const busy = (report: LocalHostVersion | null) => report?.update === "updating" || report?.update === "waiting-call";
function set(next: Snapshot) {
  if (next.bridge === snapshot.bridge && next.report === snapshot.report) return;
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

function schedule() {
  clearTimeout(timer);
  if (listeners.size) timer = setTimeout(() => void refresh(), busy(snapshot.report) ? POLL_BUSY_MS : POLL_IDLE_MS);
}

/** Asks the bridge now (a question already out is followed by one more, so what changed meanwhile is not missed). */
export async function refresh() {
  if (asking) { askAgain = true; return; }
  const bridge = host().localHost;
  if (!bridge || typeof bridge.version !== "function") { set({ bridge, report: null }); return; }
  asking = true;
  try {
    const report = await bridge.version();
    set({ bridge, report: report && typeof report === "object" ? report : null });
  } catch {
    set({ bridge, report: null });
  } finally {
    asking = false;
    if (askAgain) { askAgain = false; void refresh(); } else schedule();
  }
}

const refocus = () => { if (document.visibilityState !== "hidden") void refresh(); };

export function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("focus", refocus);
    document.addEventListener("visibilitychange", refocus);
    void refresh();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    clearTimeout(timer);
    window.removeEventListener("focus", refocus);
    document.removeEventListener("visibilitychange", refocus);
  };
}

/** The last report, for `bridge` (the page's now): none before the first answer, or for a bridge that has gone. */
export function getReport(bridge: LocalHostBridge | null): LocalHostVersion | null {
  return snapshot.bridge === bridge ? snapshot.report : null;
}

/** Forgets the report (tests). */
export function resetLocalService() {
  clearTimeout(timer);
  asking = false;
  askAgain = false;
  snapshot = { bridge: null, report: null };
}
