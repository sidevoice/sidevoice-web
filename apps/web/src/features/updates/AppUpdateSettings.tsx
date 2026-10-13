import { useContext, useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Segmented } from "../../components/ui/Tabs";
import { desktopBuild } from "../../services/desktop-host";
import { RoomStoreContext } from "../../state/room-store";
import { updaterFailure } from "../settings/error-message";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import { UPDATE_PLACE, useAppUpdate, type UpdateMode, type UpdaterStatus } from "./useUpdates";
import "./updates.css";

/** A check under a minute old is "just now"; an older one, its date and time. */
const JUST_NOW_MS = 60 * 1000;
const when = (at: number, t: HostTranslate) => Date.now() - at < JUST_NOW_MS ? t("updates.justNow")
  : new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium", timeStyle: "short" }).format(at);
const percent = (progress: number) => new Intl.NumberFormat(document.documentElement.lang || undefined, { style: "percent" }).format(progress);

/** Whether the app's update, as `status` says it, has a button in its row: Download (manual, or a download that
 *  failed, as Retry) or Restart to update (ready, either mode). */
function hasAction(status: UpdaterStatus | null, mode: UpdateMode | null, can: ReturnType<typeof useAppUpdate>["can"]) {
  if (status?.state === "ready") return can.restart;
  return status?.state === "available" && can.download && (mode === "manual" || status.error?.code === "update-download-failed");
}

/** The desktop app's updates, in Settings › Updates under its version (a release's updater only; none, nothing
 *  shows): Updates, automatic or manual, as the app keeps it; Check for updates beside one muted line — Checking… while
 *  the person's check runs; else when it last checked (just now, under a minute ago) and, a check gone through with
 *  nothing waiting, Up to date (never beside Not checked yet or a failure) — a check that finds one with a button
 *  landing on it; a check that failed, with Retry. Then, once one is found, its row with its action right there
 *  (UPDATE_PLACE `app`, where a landing focuses), saying the app's version and the new one: available, Download in
 *  manual mode (automatic fetches it by itself: a check never downloads in manual); downloading, its progress; ready,
 *  Restart to update, in either mode, only ever pressed by the person; a download or an install that failed, said
 *  there, with Retry download. What the person's own check found shows each step (automatic's: found, downloading,
 *  ready); one the app found by itself shows only where the room's chip shows it (`inView`: automatic, once ready).
 *  Each part shows where the app has the method for it. Restart to update Sidevoice restarts with `onRestart` first;
 *  `idle` shows in the update's place while it shows none (its service's). `current`: whether the line says Up to
 *  date — by default, the app's updater idle and its last check not failed; Updates says it for the app and its service
 *  together. A check that finds none says so to a
 *  screen reader too. Up to date is never a colour: those are for what waits. */
export function AppUpdateSettings({ idle, onRestart, current }: { idle?: ReactNode; onRestart?: () => void; current?: boolean } = {}) {
  const t = hostTranslator();
  const store = useContext(RoomStoreContext);
  const update = useAppUpdate();
  const [busy, setBusy] = useState<"check" | "download" | "restart" | null>(null);
  const [modeFailed, setModeFailed] = useState(false);
  // A call of this page's that failed; and whether the person's own check found nothing.
  const [failure, setFailure] = useState<unknown>(null);
  const [upToDate, setUpToDate] = useState(false);
  const { status, mode, can, checkedAt, inView } = update;
  // What the app says next replaces what a call of this page's said.
  useEffect(() => { setFailure(null); }, [status?.state]);
  // "Just now" turns into its date once the check is a minute old.
  const [, setAged] = useState(0);
  useEffect(() => {
    const left = checkedAt == null ? 0 : checkedAt + JUST_NOW_MS - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(() => setAged((n) => n + 1), left + 50);
    return () => clearTimeout(timer);
  }, [checkedAt]);
  if (!update.updater) return <>{idle}</>;

  function change(next: UpdateMode) {
    setModeFailed(false);
    void update.setMode(next).catch(() => setModeFailed(true));
  }
  async function act(action: "check" | "download" | "restart") {
    if (busy) return;
    setFailure(null); setUpToDate(false);
    setBusy(action);
    try {
      if (action === "restart") { onRestart?.(); await update.restart(); return; }
      const next = action === "check" ? await update.check() : await update.download();
      if (action !== "check" || !next || next.error) return;
      if (next.state === "idle") setUpToDate(true);
      // Found one with a button in its row: there, in view and focused.
      else if (hasAction(next, mode, can)) store?.patch({ settingsFocus: UPDATE_PLACE.app });
    } catch (reason) { setFailure(reason); }
    finally { setBusy(null); }
  }
  // An update the app is fetching by itself, unasked, says nothing here — nor what failed of it; a failed check does.
  const unseen = !!status && status.state !== "idle" && !inView;
  const said = status?.error && (!unseen || status.error.code === "update-check-failed") ? status.error : null;
  const error = failure ?? said ?? null;
  const code = (error as { code?: unknown } | null)?.code;
  const found = inView;
  // A download or an install that failed is its row's to say; a check that failed, the check's.
  const rowError = found && (code === "update-download-failed" || code === "update-install-failed") ? error : null;
  const checkError = rowError ? null : error;
  const retry = code === "update-check-failed" && can.check ? "check" : code === "update-download-failed" && can.download ? "download" : null;
  const settings = (can.mode && mode) || can.check || !!checkError;
  if (!found && !settings) return <>{idle}</>;
  // In order: Automatic or Manual; when it last checked (Up to date, nothing waiting), and Check for updates; then where
  // the update stands, with its action right there (Sidevoice 0.3.0 · 0.4.0 available · Download, its progress,
  // Restart to update).
  const standing = found ? <AppUpdateRow status={found} mode={mode} can={can} busy={busy} error={rowError} act={(action) => void act(action)}
    installed={desktopBuild()?.version || null} asked={update.asked} t={t} /> : idle;
  // Up to date only once a check went through and nothing waits: never beside Not checked yet, never after a failure.
  const upToDateNow = current ?? (status?.state === "idle" && !status.error);
  const checked = checkedAt ? t("updates.lastChecked", { when: when(checkedAt, t) }) : null;
  const checkLine = busy === "check" ? t("updates.checking") : !checked ? t("updates.neverChecked")
    : upToDateNow && !checkError ? t("updates.checkedUpToDate", { checked }) : checked;
  return <>
    {settings && <div className="app-update-settings">
      {can.mode && mode && <div className="app-update-setting">
        <span className="app-update-setting-copy"><span className="host-status-login-label">{t("updates.mode")}</span>
          <span className="muted">{t(mode === "manual" ? "updates.mode.manualHint" : "updates.mode.automaticHint")}</span>
          {modeFailed && <span className="host-status-error" role="alert">{t("updates.modeFailed")}</span>}</span>
        <Segmented size="sm" label={t("updates.mode")} value={mode} onChange={change}
          items={[{ value: "automatic", label: t("updates.mode.automatic") }, { value: "manual", label: t("updates.mode.manual") }]} />
      </div>}
      {can.check && <div className="app-update-setting">
        <span className="app-update-setting-copy muted">{checkLine}
          {/* The line says it as it changes; a screen reader is told the check's finding. */}
          {/* Only while nothing was found since: one the app found by itself later is not up to date. */}
          {upToDate && status?.state === "idle" && <span role="status" className="sr-only">{t("updates.upToDate")}</span>}</span>
        <Button size="sm" variant="secondary" loading={busy === "check"} onClick={() => void act("check")}>{t("updates.check")}</Button>
      </div>}
      {!!checkError && <div className="app-update-failure" role="alert">
        <ErrorText message={updaterFailure(checkError, { t })} />
        {retry && <Button size="sm" variant="ghost" loading={busy === retry} onClick={() => void act(retry)}>{t("updates.retry")}</Button>}
      </div>}
    </div>}
    {standing}
  </>;
}

/** The row's words: Sidevoice and the version it runs (`installed`), then where the new one stands — 0.4.0 available;
 *  0.4.0 found · Downloading… (automatic, what the person's check found: it downloads by itself); Downloading 0.4.0…;
 *  0.4.0 ready. Where the app says no number of its own or of the new one, what it can. */
function rowWords(status: UpdaterStatus, installed: string | null, foundByCheck: boolean, downloadFailed: boolean, t: HostTranslate) {
  const version = status.version ?? "";
  const step = status.state === "ready" ? version ? t("updates.row.ready", { version }) : t("updates.row.readyOne")
    : foundByCheck && !downloadFailed ? version ? t("updates.row.found", { version }) : t("updates.row.foundOne")
      : status.state === "downloading" ? version ? t("updates.row.downloading", { version }) : t("updates.row.downloadingOne")
        : version ? t("updates.row.available", { version }) : t("updates.row.availableOne");
  return `${installed ? t("updates.row.current", { version: installed }) : t("updates.row.app")} · ${step}`;
}

/** The app's update once found, its action right there: Sidevoice 0.3.0 · 0.4.0 available · Download (or Retry
 *  download), its words its description; Sidevoice 0.3.0 · Downloading 0.4.0… with its progress (automatic, what the
 *  person's check found: Sidevoice 0.3.0 · 0.4.0 found · Downloading…); Sidevoice 0.3.0 · 0.4.0 ready · Restart to
 *  update Sidevoice; what failed under it. The row is where a landing goes. */
function AppUpdateRow({ status, mode, can, busy, error, act, installed, asked, t }: { status: UpdaterStatus; mode: UpdateMode | null;
  can: ReturnType<typeof useAppUpdate>["can"]; busy: "check" | "download" | "restart" | null; error: unknown; act: (action: "download" | "restart") => void;
  installed: string | null; asked: boolean; t: HostTranslate }) {
  const downloadFailed = (error as { code?: unknown } | null)?.code === "update-download-failed" || status.error?.code === "update-download-failed";
  const progress = status.progress == null ? null : Math.max(0, Math.min(1, status.progress));
  const copyId = useId();
  // Automatic, what the person's check found: found, and downloading by itself from then on.
  const foundByCheck = asked && mode !== "manual" && status.state !== "ready";
  const moving = status.state === "downloading" || (foundByCheck && !downloadFailed);
  const button = status.state === "ready" ? can.restart && <Button size="sm" variant="primary" loading={busy === "restart"} onClick={() => act("restart")}>
      {t("updates.action.restartAll")}</Button>
    : status.state === "available" && hasAction(status, mode, can) ? <Button size="sm" variant={downloadFailed ? "secondary" : "primary"} loading={busy === "download"}
        aria-describedby={copyId} onClick={() => act("download")}>{t(downloadFailed ? "updates.action.retryDownload" : "updates.action.download")}</Button>
      : null;
  const copy = rowWords(status, installed, foundByCheck, downloadFailed, t);
  return (
    <div id={UPDATE_PLACE.app} className="update-action-row" data-settings-row="" data-state={status.state}>
      <div className="update-action">
        <span id={copyId} className="update-action-copy">{copy}
          {status.state === "downloading" && progress != null && <span className="app-update-percent">{percent(progress)}</span>}</span>
        {button}
      </div>
      {moving && <ProgressBar value={status.state === "downloading" ? progress : null} label={copy} />}
      {!!error && <ErrorText className="app-update-error" role="alert" message={updaterFailure(error, { t })} />}
    </div>
  );
}
