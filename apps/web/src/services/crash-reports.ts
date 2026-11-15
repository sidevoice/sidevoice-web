import { useSyncExternalStore } from "react";
import { host, onHostMember, type CrashReportsMode } from "../host";

/* What the person chose for crash reports, and whether they have been told the app sends them. Kept on this device, like
 * the other preferences of the page (call-preferences.ts, the appearance), and applied at once (Settings → Crash
 * reports). Crash reports are on by default and never asked for: the choice is `auto` until the person says `never`.
 *
 * The page owns the value. An app that sends crash reports (`host().crashReports`) is told it at every start of the page
 * and at each change, and keeps its own copy to hold to it before the page has loaded; a browser sends none and has
 * neither the setting nor the notice.
 *
 * Stored under `sidevoice.crash-reports` as `{ "mode": "auto" | "never", "noticeSeen": boolean }`; whatever else is
 * there (a value from another build, a broken text) reads as the default. */

export const CRASH_REPORTS_KEY = "sidevoice.crash-reports";
const CHANGED = "sidevoice-crash-reports";

export interface CrashReportsPreferences {
  mode: CrashReportsMode;
  /** The one-line notice that crash reports are sent was shown and put away (closed, or Settings opened from it): it never
   *  shows again. Also what an updating device lacks, which is why it sees the notice once. */
  noticeSeen: boolean;
}

export const DEFAULT_CRASH_REPORTS: CrashReportsPreferences = { mode: "auto", noticeSeen: false };

function parse(raw: string | null): CrashReportsPreferences {
  try {
    const stored = JSON.parse(raw || "{}") as Partial<CrashReportsPreferences> | null;
    return {
      mode: stored?.mode === "never" ? "never" : "auto",
      noticeSeen: stored?.noticeSeen === true,
    };
  } catch { return { ...DEFAULT_CRASH_REPORTS }; }
}

const rawValue = () => { try { return globalThis.localStorage?.getItem(CRASH_REPORTS_KEY) ?? null; } catch { return null; } };

export function readCrashReports(): CrashReportsPreferences {
  return parse(rawValue());
}

/** For this visit only when the storage refuses (a blocked browser): the choice still applies until the page goes. */
let held: CrashReportsPreferences | null = null;
const current = () => held ?? readCrashReports();

export function writeCrashReports(patch: Partial<CrashReportsPreferences>): CrashReportsPreferences {
  const next = { ...current(), ...patch };
  held = next;
  try { globalThis.localStorage?.setItem(CRASH_REPORTS_KEY, JSON.stringify(next)); held = null; } catch { /* Kept for this visit only. */ }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return next;
}

export function subscribeCrashReports(changed: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === CRASH_REPORTS_KEY) changed(); };
  globalThis.addEventListener?.(CHANGED, changed);
  globalThis.addEventListener?.("storage", onStorage);
  return () => { globalThis.removeEventListener?.(CHANGED, changed); globalThis.removeEventListener?.("storage", onStorage); };
}

// A snapshot that is the same object while the stored text is the same, as a store read by React must be.
let snapshot: { raw: string | null; held: CrashReportsPreferences | null; value: CrashReportsPreferences } | null = null;
function getSnapshot(): CrashReportsPreferences {
  const raw = rawValue();
  if (!snapshot || snapshot.raw !== raw || snapshot.held !== held) snapshot = { raw, held, value: held ?? parse(raw) };
  return snapshot.value;
}

/** The choice and the notice's flag, followed as they change (here, or in another tab). */
export function useCrashReports(): CrashReportsPreferences {
  return useSyncExternalStore(subscribeCrashReports, getSnapshot, () => DEFAULT_CRASH_REPORTS);
}

/** Tells the app the choice; a refusal rejects. Nothing to tell where the host sends no crash reports. */
async function tell(mode: CrashReportsMode) {
  await host().crashReports?.set(mode);
}

/** Changes the choice: seen at once, told to the app, and given back as it was if the app did not take it (so what the
 *  page says is what the app does). Answers whether it holds. One change at a time, in the order made. */
let queue: Promise<unknown> = Promise.resolve();
export function chooseCrashReports(mode: CrashReportsMode): Promise<boolean> {
  const before = current().mode;
  if (before === mode) return Promise.resolve(true);
  writeCrashReports({ mode });
  const run = async () => {
    try { await tell(mode); return true; }
    catch {
      // A later choice made meanwhile is the person's last word; only the one that failed is undone.
      if (current().mode === mode) writeCrashReports({ mode: before });
      return false;
    }
  };
  const result = queue.then(run, run);
  queue = result;
  return result;
}

/** The notice's flag: put away for good. */
export function markCrashReportsNoticeSeen() {
  if (!current().noticeSeen) writeCrashReports({ noticeSeen: true });
}

/** At the page's start: tells the app the choice kept (again, when the app offers its member after the page's script, or
 *  another tab changes it); a refusal is tried again at the next start, since nothing was asked of the person. Returns how
 *  to stop. */
export function startCrashReports(): () => void {
  const say = () => { void tell(current().mode).catch(() => undefined); };
  const stopWatching = onHostMember("crashReports", say);
  const onStorage = (event: StorageEvent) => { if (event.key === CRASH_REPORTS_KEY) say(); };
  globalThis.addEventListener?.("storage", onStorage);
  return () => { stopWatching(); globalThis.removeEventListener?.("storage", onStorage); };
}
