import { useEffect, useState } from "react";
import { localHostBridge, type LocalHostVersion } from "../../services/desktop-host";
import { useRoomStore } from "../../state/room-store";

/* What wants updating, from three places: this page (a newer build the room serves: out of a call the page reloads
 * itself, in one Reload loads it when the person says), the desktop app (its updater, behind the host's `updater`
 * seam: a release's only), and this computer's machine (the bridge's `version()`). A paired machine elsewhere reports
 * no version to this page today, so it cannot be listed. */

export type UpdateKind = "web" | "machine";
export interface UpdateItem { id: string; kind: UpdateKind; version: string; required: boolean; machine?: string }

export type UpdateMode = "automatic" | "manual";
export type UpdaterFailure = "update-check-failed" | "update-download-failed" | "update-install-failed";
export interface UpdaterStatus {
  state: "idle" | "available" | "downloading" | "ready";
  version?: string;
  /** While downloading: 0 to 1. */
  progress?: number;
  error?: { code: UpdaterFailure };
}
/** The desktop app's updater (sidevoice-desktop #56; a release's only: a nightly, a development build or an older app
 *  has none, and then nothing of it shows). Each method is looked for before it is used. Automatic downloads an update
 *  by itself; manual says one exists and `download` fetches it. `restart` installs a ready one at once. */
export interface AppUpdater {
  settings?(): Promise<{ mode: UpdateMode }>;
  setMode?(mode: UpdateMode): Promise<{ mode: UpdateMode }>;
  status(): Promise<UpdaterStatus>;
  subscribe?(listener: (status: UpdaterStatus) => void): () => void;
  check?(): Promise<UpdaterStatus>;
  download?(): Promise<UpdaterStatus>;
  restart?(): Promise<void>;
}
export function appUpdater(): AppUpdater | null {
  const host = (globalThis.window as unknown as { __sidevoiceDesktop?: { host?: { updater?: AppUpdater } } } | undefined)?.__sidevoiceDesktop?.host;
  return host?.updater && typeof host.updater.status === "function" ? host.updater : null;
}

/* When the app last checked successfully: the seam does not say, so this page keeps it — a check it asked for that did
 * not fail, or an update the app's own check found while the page listened. */
const CHECKED_KEY = "sidevoice.updates-checked-at";
const CHANGED = "sidevoice-app-update";
function readCheckedAt(): number | null {
  try { const at = Number(localStorage.getItem(CHECKED_KEY)); return at > 0 ? at : null; } catch { return null; }
}
function checkedNow() {
  try { localStorage.setItem(CHECKED_KEY, String(Date.now())); } catch { /* For this visit only. */ }
  window.dispatchEvent(new Event(CHANGED));
}
/** The mode as each app's updater last answered it, for every place that shows its update. */
const knownModes = new WeakMap<AppUpdater, UpdateMode>();
function modeKnown(updater: AppUpdater, mode: UpdateMode) {
  knownModes.set(updater, mode);
  window.dispatchEvent(new Event(CHANGED));
}

/** The desktop app's update, wherever it shows (the sidebar's foot, This device): its status as the app pushes it, its
 *  mode, when it last checked, and its actions. Without an updater, `updater` is null and nothing else is used. */
export function useAppUpdate() {
  const [updater] = useState(appUpdater);
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [mode, setModeShown] = useState<UpdateMode | null>(() => updater ? knownModes.get(updater) ?? null : null);
  const [checkedAt, setCheckedAt] = useState(readCheckedAt);

  useEffect(() => {
    const changed = () => { setCheckedAt(readCheckedAt()); if (updater && knownModes.has(updater)) setModeShown(knownModes.get(updater)!); };
    window.addEventListener(CHANGED, changed);
    return () => window.removeEventListener(CHANGED, changed);
  }, [updater]);
  useEffect(() => {
    if (!updater) return;
    let current = true;
    let last: UpdaterStatus["state"] | null = null;
    const show = (next: UpdaterStatus) => {
      if (!current || !next || typeof next.state !== "string") return;
      // An update found while this page listened: the app's own check went through.
      if (last === "idle" && next.state !== "idle") checkedNow();
      last = next.state;
      setStatus(next);
    };
    void updater.status().then(show).catch(() => undefined);
    // An app that cannot say its mode is on its default, automatic.
    if (typeof updater.settings === "function") void updater.settings().then((value) => { if (current) modeKnown(updater, value.mode === "manual" ? "manual" : "automatic"); })
      .catch(() => { if (current && !knownModes.has(updater)) modeKnown(updater, "automatic"); });
    const stop = typeof updater.subscribe === "function" ? updater.subscribe(show) : undefined;
    return () => { current = false; stop?.(); };
  }, [updater]);

  /** Asks the app to check; its answer is the status. A check that did not fail is when it last checked. */
  async function check() {
    if (typeof updater?.check !== "function") return null;
    try {
      const next = await updater.check();
      if (next?.error?.code !== "update-check-failed") checkedNow();
      if (next && typeof next.state === "string") setStatus(next);
      return next;
    } catch (error) {
      throw failedAs("update-check-failed", error);
    }
  }
  async function download() {
    if (typeof updater?.download !== "function") return null;
    try {
      const next = await updater.download();
      if (next && typeof next.state === "string") setStatus(next);
      return next;
    } catch (error) {
      throw failedAs("update-download-failed", error);
    }
  }
  /** Restarts into the ready update, now, whether a call is on or not. */
  async function restart() {
    if (typeof updater?.restart !== "function") return;
    try { await updater.restart(); } catch (error) { throw failedAs("update-install-failed", error); }
  }
  async function setMode(next: UpdateMode) {
    if (typeof updater?.setMode !== "function") return;
    const before = knownModes.get(updater) ?? "automatic";
    // Shown at once; then what the app answers, or back as it was.
    modeKnown(updater, next);
    try { modeKnown(updater, (await updater.setMode(next)).mode === "manual" ? "manual" : "automatic"); } catch (error) { modeKnown(updater, before); throw error; }
  }
  return {
    updater, status, mode: updater ? mode : null, checkedAt, check, download, restart, setMode,
    can: {
      mode: typeof updater?.settings === "function" && typeof updater.setMode === "function",
      check: typeof updater?.check === "function",
      download: typeof updater?.download === "function",
      restart: typeof updater?.restart === "function",
    },
  };
}

/** A rejected call, as the app's failure for it: its own code when it has one, the call's otherwise. */
function failedAs(code: UpdaterFailure, error: unknown) {
  const own = (error as { code?: unknown } | null)?.code;
  if (typeof own === "string" && own) return error;
  return Object.assign(new Error(error instanceof Error ? error.message : String(error ?? "")), { code });
}

/** What the sidebar's foot says of the app's update. Automatic: nothing until it is ready to restart into. Manual: that
 *  one is available, then its download, then ready. A download or install that failed is said there too; a failed
 *  check is This device's to say. */
export function appUpdateShown(status: UpdaterStatus | null, mode: UpdateMode | null): UpdaterStatus | null {
  if (!status) return null;
  if (status.state === "ready") return status;
  if (mode !== "manual") return null;
  return status.state === "available" || status.state === "downloading" ? status : null;
}

/** The page's and this computer's machine's updates waiting (`items`), and the desktop app's as the sidebar shows it
 *  (`app`, with its actions in `appUpdate`). */
export function useUpdates() {
  const web = useRoomStore((state) => state.facts.webUpdate);
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const appUpdate = useAppUpdate();
  const [machine, setMachine] = useState<LocalHostVersion | null>(null);

  useEffect(() => {
    const bridge = localHostBridge();
    if (typeof bridge?.version !== "function") return;
    let current = true;
    void bridge.version().then((answer) => { if (current) setMachine(answer); }).catch(() => undefined);
    return () => { current = false; };
  }, [status.state, status.core?.version]);

  const items: UpdateItem[] = [];
  if (web) items.push({ id: "web", kind: "web", version: web, required: false });
  if (machine?.update === "available") items.push({ id: "machine:local", kind: "machine", version: typeof machine.bundled?.version === "string" ? machine.bundled.version : "", required: false });
  return { items, app: appUpdateShown(appUpdate.status, appUpdate.mode), appUpdate };
}
