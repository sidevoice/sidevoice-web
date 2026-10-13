import { useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Segmented } from "../../components/ui/Tabs";
import { RoomStoreContext } from "../../state/room-store";
import { updaterFailure } from "../settings/error-message";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import { UPDATE_PLACE, useAppUpdate, type UpdateMode, type UpdaterStatus } from "./useUpdates";
import "./updates.css";

const when = (at: number) => new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium", timeStyle: "short" }).format(at);
const percent = (progress: number) => new Intl.NumberFormat(document.documentElement.lang || undefined, { style: "percent" }).format(progress);

/** Whether the app's update, as `status` says it, has a button in its row: Download (manual, or a download that
 *  failed, as Retry) or Restart to update (ready, either mode). */
function hasAction(status: UpdaterStatus | null, mode: UpdateMode | null, can: ReturnType<typeof useAppUpdate>["can"]) {
  if (status?.state === "ready") return can.restart;
  return status?.state === "available" && can.download && (mode === "manual" || status.error?.code === "update-download-failed");
}

/** The desktop app's updates, in Settings › Updates under its version (a release's updater only; none, nothing
 *  shows). First, once one is found, its row with its action right there (UPDATE_PLACE `app`, where a landing
 *  focuses): available, Download in manual mode (automatic fetches it by itself); downloading, its progress, in either
 *  mode; ready, Restart to update, in either mode; a download or an install that failed, said there, with Retry for a
 *  download. Then Updates, automatic or manual, as the app keeps it; Check for updates, busy while it checks, and when
 *  it last checked — a check that finds one with a button lands on it; and a check that failed, with Retry. Each part
 *  shows where the app has the method for it. Its buttons say what they update (`words`): the app (two rows), or
 *  Sidevoice (one row, which restarts with `onRestart` first, and shows `idle` in the update's place while the app has
 *  none: its service's). Where its card already says it is up to date, a check that finds none says so to a screen
 *  reader only. */
export function AppUpdateSettings({ words = "app", idle, onRestart }: { words?: "app" | "all"; idle?: ReactNode; onRestart?: () => void } = {}) {
  const t = hostTranslator();
  const store = useContext(RoomStoreContext);
  const update = useAppUpdate();
  const [busy, setBusy] = useState<"check" | "download" | "restart" | null>(null);
  const [modeFailed, setModeFailed] = useState(false);
  // A call of this page's that failed; and whether the person's own check found nothing.
  const [failure, setFailure] = useState<unknown>(null);
  const [upToDate, setUpToDate] = useState(false);
  const { status, mode, can, checkedAt } = update;
  // What the app says next replaces what a call of this page's said.
  useEffect(() => { setFailure(null); }, [status?.state]);
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
  const error = failure ?? status?.error ?? null;
  const code = (error as { code?: unknown } | null)?.code;
  const found = status && status.state !== "idle" ? status : null;
  // A download or an install that failed is its row's to say; a check that failed, the check's.
  const rowError = found && (code === "update-download-failed" || code === "update-install-failed") ? error : null;
  const checkError = rowError ? null : error;
  const retry = code === "update-check-failed" && can.check ? "check" : code === "update-download-failed" && can.download ? "download" : null;
  const settings = (can.mode && mode) || can.check || !!checkError;
  if (!found && !settings) return <>{idle}</>;
  // In order: Automatic or Manual; when it last checked, and Check for updates; then where the update stands, with its
  // action right there (Up to date, Version X available · Update, its progress, Restart to update).
  const standing = found ? <AppUpdateRow status={found} mode={mode} can={can} busy={busy} error={rowError} act={(action) => void act(action)} words={words} t={t} />
    : idle ?? <div id={UPDATE_PLACE.app} className="update-action-row" data-state="idle"><div className="update-action">
        <span className="update-action-copy">{t("settings.updates.upToDate")}</span></div></div>;
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
        <span className="app-update-setting-copy muted">{checkedAt ? t("updates.lastChecked", { when: when(checkedAt) }) : t("updates.neverChecked")}
          {/* The card's version line says Up to date already: the check's finding is for a screen reader. */}
          {upToDate && !found && <span role="status" className="sr-only">{t("updates.upToDate")}</span>}</span>
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

/** The app's update once found, its action right there: Version X available · Update the app (or Retry), Downloading…
 *  with its progress, Version X ready · Restart to update the app (one row: Update Sidevoice, Restart to update
 *  Sidevoice); what failed under it. The row is where a landing goes. */
function AppUpdateRow({ status, mode, can, busy, error, act, words, t }: { status: UpdaterStatus; mode: UpdateMode | null; can: ReturnType<typeof useAppUpdate>["can"];
  busy: "check" | "download" | "restart" | null; error: unknown; act: (action: "download" | "restart") => void; words: "app" | "all"; t: HostTranslate }) {
  const version = status.version ?? "";
  const downloadFailed = (error as { code?: unknown } | null)?.code === "update-download-failed";
  const progress = status.progress == null ? null : Math.max(0, Math.min(1, status.progress));
  const all = words === "all";
  const button = status.state === "ready" ? can.restart && <Button size="sm" variant="primary" loading={busy === "restart"} onClick={() => act("restart")}>
      {t(all ? "updates.action.restartAll" : "updates.action.restartApp")}</Button>
    : status.state === "available" && hasAction(status, mode, can) ? <Button size="sm" variant={downloadFailed ? "secondary" : "primary"} loading={busy === "download"} onClick={() => act("download")}>
        {t(downloadFailed ? all ? "updates.action.retryAll" : "updates.action.retryApp" : all ? "updates.action.updateAll" : "updates.action.updateApp")}</Button>
      : null;
  const copy = status.state === "ready" ? version ? t("updates.ready", { version }) : t("updates.readyOne")
    : status.state === "downloading" ? version ? t("updates.downloading", { version }) : t("updates.downloadingOne")
      : version ? t("updates.available", { version }) : t("updates.availableOne");
  return (
    <div id={UPDATE_PLACE.app} className="update-action-row" data-settings-row="" data-state={status.state}>
      <div className="update-action">
        <span className="update-action-copy">{copy}
          {status.state === "downloading" && progress != null && <span className="app-update-percent">{percent(progress)}</span>}</span>
        {button}
      </div>
      {status.state === "downloading" && <ProgressBar value={progress} label={copy} />}
      {!!error && <ErrorText className="app-update-error" role="alert" message={updaterFailure(error, { t })} />}
    </div>
  );
}
