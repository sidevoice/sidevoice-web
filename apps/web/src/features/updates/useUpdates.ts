import { useEffect, useState, useSyncExternalStore } from "react";
import { host, type AppUpdater, type UpdateMode, type UpdaterFailure, type UpdaterStatus } from "../../host";
import { getReport, subscribe } from "../../services/local-service";
import { remoteKind } from "../../services/service-version";
import { useRoomStore } from "../../state/room-store";
import type { MachineView } from "../../state/room-types";

/* What wants updating, from three places: this page (a newer build the room serves: out of a call the page reloads
 * itself, in one Reload loads it when the person says), the desktop app (its updater, behind the host's `updater`
 * seam: a release's only), and each paired machine elsewhere whose Sidevoice is out of date against the minor this page
 * works with (services/service-version.ts). This computer's service is not one of them: the app updates it itself, in
 * the background, and its card says where it stands. */

export type UpdateKind = "web";
export interface UpdateItem { id: string; kind: UpdateKind; version: string; required: boolean }

/** Where each update is acted on in Settings › Updates, by the id a landing asks for (`settingsFocus`): the app's
 *  action row. */
export const UPDATE_PLACE = {
  app: "updates-app",
};

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
/* Whether the person's own check is under way, and whether what the app's updater has now is what that check found:
 * the seam says neither (sidevoice-desktop #56 pushes the status alone, whoever checked), so this page keeps both
 * while it is open, set by its own `check()` (Check for updates). While the person's check runs, neither the room's
 * notice nor Updates' row says a found update (Updates says Checking…); what it found shows each of its steps in
 * Updates — automatic's download too — while one the app found by itself (at launch, every 6 h) shows only as
 * appUpdateInView says. A check that found nothing forgets it; one that failed leaves it as it was. */
const checking = new WeakSet<AppUpdater>();
const asked = new WeakSet<AppUpdater>();
function flag(set: WeakSet<AppUpdater>, updater: AppUpdater, on: boolean) {
  if (on) set.add(updater); else set.delete(updater);
  window.dispatchEvent(new Event(CHANGED));
}
/** The version whose download the person cancelled, per app updater ("" where the app names none): the app does not
 *  download it again by itself, so it reads as available with its Download, in either mode, until it moves on. */
const cancelledVersions = new WeakMap<AppUpdater, string>();
/** The mode as each app's updater last answered it, for every place that shows its update. */
const knownModes = new WeakMap<AppUpdater, UpdateMode>();
function modeKnown(updater: AppUpdater, mode: UpdateMode) {
  knownModes.set(updater, mode);
  window.dispatchEvent(new Event(CHANGED));
}

/** The desktop app's update, wherever it shows (the sidebar's foot, the rail, Updates): its status as the app pushes
 *  it, its mode, when it last checked, and its actions. Without an updater, `updater` is null and nothing else is
 *  used. */
export function useAppUpdate() {
  const [updater] = useState(() => host().updater);
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [mode, setModeShown] = useState<UpdateMode | null>(() => updater ? knownModes.get(updater) ?? null : null);
  const [cancelledVersion, setCancelledVersion] = useState(() => updater ? cancelledVersions.get(updater) ?? null : null);
  const [checkedAt, setCheckedAt] = useState(readCheckedAt);
  const [person, setPerson] = useState(() => ({ checking: !!updater && checking.has(updater), asked: !!updater && asked.has(updater) }));

  useEffect(() => {
    const changed = () => {
      setCheckedAt(readCheckedAt());
      if (updater && knownModes.has(updater)) setModeShown(knownModes.get(updater)!);
      if (updater) setCancelledVersion(cancelledVersions.get(updater) ?? null);
      if (updater) setPerson((was) => was.checking === checking.has(updater) && was.asked === asked.has(updater) ? was
        : { checking: checking.has(updater), asked: asked.has(updater) });
    };
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

  /** Asks the app to check, as the person asked; its answer is the status. A check that did not fail is when it last
   *  checked. What the app says while it checks is this check's finding. */
  async function check() {
    if (typeof updater?.check !== "function") return null;
    const before = asked.has(updater);
    flag(asked, updater, true);
    flag(checking, updater, true);
    try {
      const next = await updater.check();
      const failed = next?.error?.code === "update-check-failed";
      if (!failed) checkedNow();
      flag(asked, updater, failed || !next ? before : next.state !== "idle");
      if (next && typeof next.state === "string") setStatus(next);
      return next;
    } catch (error) {
      flag(asked, updater, before);
      throw failedAs("update-check-failed", error);
    } finally {
      flag(checking, updater, false);
    }
  }
  async function download() {
    if (typeof updater?.download !== "function") return null;
    cancelledVersions.delete(updater);
    window.dispatchEvent(new Event(CHANGED));
    try {
      const next = await updater.download();
      if (next && typeof next.state === "string") setStatus(next);
      return next;
    } catch (error) {
      throw failedAs("update-download-failed", error);
    }
  }
  /** Stops the download in progress; the app's answer is the status, `available` again. The cancellation is kept
   *  before the call: the app pushes `available` before it answers, and that status is already a cancelled one. */
  async function cancel() {
    if (!updater) return;
    cancelledVersions.set(updater, status?.version ?? "");
    window.dispatchEvent(new Event(CHANGED));
    try {
      await updater.cancel();
    } catch (error) {
      cancelledVersions.delete(updater);
      window.dispatchEvent(new Event(CHANGED));
      throw failedAs("update-cancel-failed", error);
    }
    // The status is pushed too; asked for here for an app that does not push it.
    try { const next = await updater.status(); if (next && typeof next.state === "string") setStatus(next); } catch { /* The pushed status stands. */ }
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
  const shownMode = updater ? mode : null;
  const cancelled = status?.state === "available" && cancelledVersion === (status.version ?? "");
  return {
    updater, status, mode: shownMode, cancelled, checkedAt, check, download, cancel, restart, setMode,
    /** Whether the person's own check is under way; whether it found what the app has now. */
    checking: !!updater && person.checking,
    asked: !!updater && person.asked,
    /** The app's update as Settings › Updates shows it (appUpdateInView), and as the room's notice says it
     *  (appUpdateShown). */
    /** Whether This device says the app's update is pending (appUpdatePending): not Settings' visibility. */
    pending: appUpdatePending(status, shownMode, !!updater && person.asked, !!updater && person.checking),
    inView: appUpdateInView(status, shownMode, !!updater && person.asked, !!updater && person.checking, cancelled),
    noticed: appUpdateShown(status, shownMode, !!updater && person.checking, cancelled),
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

/** What the room's notice says of the app's update: manual, that one is available (with Download) once a check found
 *  one; in either mode, a download in progress (with Cancel; its progress is Updates' to show) and, once downloaded,
 *  that it is ready to restart into — and nothing while the person's own check runs. Automatic says nothing of an
 *  update available: it downloads by itself — unless the person cancelled that download (`cancelled`): it is not
 *  fetched again by itself, so it is said available, as manual's. A download that failed is said with its Retry
 *  (manual), an install that failed with ready; a failed check is Updates' to say. */
export function appUpdateShown(status: UpdaterStatus | null, mode: UpdateMode | null, checking = false, cancelled = false): UpdaterStatus | null {
  if (!status || checking) return null;
  if (status.state === "ready" || status.state === "downloading") return status;
  return (mode === "manual" || cancelled) && status.state === "available" ? status : null;
}

/** What Settings › Updates shows of the app's update: every step of what the person's own check found (`asked`); else
 *  what the app found by itself as its mode has it — manual, at once and its download after Download; automatic, a
 *  download in progress (to cancel) and once ready, and a download the person cancelled (`cancelled`), available again
 *  — and nothing while the person's check runs (Updates says Checking…). */
export function appUpdateInView(status: UpdaterStatus | null, mode: UpdateMode | null, asked: boolean, checking = false, cancelled = false): UpdaterStatus | null {
  if (!status || status.state === "idle" || checking) return null;
  return asked || status.state !== "available" || cancelled || mode === "manual" ? status : null;
}

/** Whether the app's update is pending as This device says it: what the person's own check found (`asked`); else
 *  manual's as soon as found, automatic's once ready — a download the app runs by itself, or an update it is about to
 *  download, is neither pending nor current; nothing while the person's check runs. Settings › Updates shows more
 *  (`appUpdateInView`: a download to cancel) without This device saying more. */
export function appUpdatePending(status: UpdaterStatus | null, mode: UpdateMode | null, asked: boolean, checking = false): boolean {
  if (!status || status.state === "idle" || checking) return false;
  return asked || status.state === "ready" || mode === "manual";
}

/** The paired machines whose Sidevoice is out of date against the minor this page works with (an older minor, or an older
 *  patch of it where this device's service knows the newest): only those still paired here, so a machine forgotten while
 *  it was behind is not listed. */
export function useOutdatedMachines(): { machine: MachineView; version: string | null }[] {
  const machines = useRoomStore((state) => state.machines);
  const status = useRoomStore((state) => state.facts.remoteHostStatus);
  const bridge = host().localHost;
  const latest = useSyncExternalStore(subscribe, () => getReport(bridge)?.latest ?? null, () => null);
  return machines.flatMap((machine) => {
    const version = !machine.local && machine.pairingId ? status?.[machine.pairingId]?.version ?? null : null;
    return remoteKind(version, latest) === "behind" ? [{ machine, version }] : [];
  });
}

/** The page's updates waiting (`items`), and the desktop app's as the room's notice says it (`app`, with its actions in
 *  `appUpdate`). Each paired machine, once connected, is asked for its Sidevoice's version (loadMachineInfo), which is how
 *  one out of date is found. This computer's service is the app's to update by itself: it has no notice. */
export function useUpdates() {
  const web = useRoomStore((state) => state.facts.webUpdate);
  const appUpdate = useAppUpdate();
  const connected = useRoomStore((state) => state.machines.filter((item) => !item.local && item.pairingId && item.state === "connected").map((item) => item.pairingId).join(" "));
  useEffect(() => { for (const fp of connected.split(" ").filter(Boolean)) void window.sidevoiceActions?.loadMachineInfo?.(fp); }, [connected]);

  const items: UpdateItem[] = [];
  if (web) items.push({ id: "web", kind: "web", version: web, required: false });
  return { items, app: appUpdate.noticed, appUpdate };
}
