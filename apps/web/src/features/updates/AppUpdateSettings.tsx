import { useContext, useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Segmented } from "../../components/ui/Tabs";
import { desktopBuild } from "../../services/desktop-host";
import { RoomStoreContext } from "../../state/room-store";
import { updaterFailure } from "../settings/error-message";
import { useDeveloperModeGesture } from "../settings/developer-mode";
import { translator, type Translate } from "../../i18n/translator";
import { UPDATE_PLACE, useAppUpdate, type UpdateMode, type UpdaterStatus } from "./useUpdates";
import "./updates.css";
import { uiLocale } from "../../i18n/locale";

const percent = (progress: number) => new Intl.NumberFormat(uiLocale(), { style: "percent" }).format(progress);

/** Whether the app's update, as `status` says it, has a button in its row: Download (an update available, as the app
 *  says it: whichever mode, so a download the app stopped is never left without one), Cancel (downloading) or Restart
 *  to update (ready). */
function hasAction(status: UpdaterStatus | null, can: ReturnType<typeof useAppUpdate>["can"]) {
  if (status?.state === "ready") return can.restart;
  return status?.state === "available" && can.download;
}

/** Sidevoice on this computer, in Settings › Updates (a release's updater; none, `service` alone), top to bottom:
 *  Updates, automatic or manual, as the app keeps it; the Sidevoice installed — Sidevoice 0.3.0, with Up to date once a
 *  check says so (`current`: a check went through, the app idle and its service as the app bundles it), Checking…
 *  while the person's check runs — and Check for updates; then, only while a newer version waits, one line with just
 *  the new version and its one action (UPDATE_PLACE `app`, where a landing focuses): Sidevoice 0.4.0 available ·
 *  Download (a check never downloads in manual; automatic's download starts by itself), Sidevoice 0.4.0 ·
 *  Downloading… with its progress in the line and a Cancel, Sidevoice 0.4.0 ready · Restart to update, in either mode, only ever
 *  pressed by the person; a download or an install that failed, said under it, with Retry download. Each version is
 *  said once: the installed one on its line, the new one on its own. What the person's own check found shows each step;
 *  one the app found by itself shows only as `inView` has it (automatic: downloading, to cancel, and ready). Its service is folded into it: the
 *  app's update found, it follows the app's restart; else, behind the one the app bundles, its Update Sidevoice is that
 *  line (`service`), as is what stands in the way. Each part shows where the app has the method for it. Restart to
 *  update restarts with `onRestart` first. A check that finds none says so to a screen reader too. Up to date is never
 *  a colour: those are for what waits. */
export function AppUpdateSettings({ service, onRestart, current }: { service?: ReactNode; onRestart?: () => void; current?: boolean } = {}) {
  const t = translator();
  const store = useContext(RoomStoreContext);
  const update = useAppUpdate();
  const [busy, setBusy] = useState<"check" | "download" | "cancel" | "restart" | null>(null);
  const [modeFailed, setModeFailed] = useState(false);
  // A call of this page's that failed; and whether the person's own check found nothing.
  const [failure, setFailure] = useState<unknown>(null);
  const [upToDate, setUpToDate] = useState(false);
  // Ten clicks on the installed version turn a nightly's developer mode on or off (developer-mode.ts).
  const developer = useDeveloperModeGesture();
  const { status, mode, can, checkedAt, inView } = update;
  // What the app says next replaces what a call of this page's said.
  useEffect(() => { setFailure(null); }, [status?.state]);
  if (!update.updater) return <>{service}</>;

  function change(next: UpdateMode) {
    setModeFailed(false);
    void update.setMode(next).catch(() => setModeFailed(true));
  }
  async function act(action: "check" | "download" | "cancel" | "restart") {
    if (busy) return;
    setFailure(null); setUpToDate(false);
    setBusy(action);
    try {
      if (action === "restart") { onRestart?.(); await update.restart(); return; }
      if (action === "cancel") { await update.cancel(); return; }
      const next = action === "check" ? await update.check() : await update.download();
      if (action !== "check" || !next || next.error) return;
      if (next.state === "idle") setUpToDate(true);
      // Found one with a button in its line: there, in view and focused.
      else if (hasAction(next, can)) store?.patch({ settingsFocus: UPDATE_PLACE.app });
    } catch (reason) { setFailure(reason); }
    finally { setBusy(null); }
  }
  // An update the app is fetching by itself, unasked, says nothing here — nor what failed of it; a failed check does.
  const unseen = !!status && status.state !== "idle" && !inView;
  const said = status?.error && (!unseen || status.error.code === "update-check-failed") ? status.error : null;
  const error = failure ?? said ?? null;
  const code = (error as { code?: unknown } | null)?.code;
  const found = inView;
  // A download or an install that failed is its line's to say; a check that failed, the check's.
  const rowError = found && (code === "update-download-failed" || code === "update-install-failed" || code === "update-cancel-failed") ? error : null;
  const checkError = rowError ? null : error;
  const checking = busy === "check" || update.checking;
  // Up to date once a check went through, while nothing waits and nothing failed: the app idle, its service current.
  const upToDateNow = (current ?? (status?.state === "idle" && !status.error && checkedAt != null)) && !checkError;
  const installed = desktopBuild()?.version || null;
  const name = installed ? t("updates.row.current", { version: installed }) : t("updates.row.app");
  return <>
    {can.mode && mode && <div className="app-update-setting">
      <span className="app-update-setting-copy"><span className="host-status-login-label">{t("updates.mode")}</span>
        <span className="muted">{t(mode === "manual" ? "updates.mode.manualHint" : "updates.mode.automaticHint")}</span>
        {modeFailed && <span className="host-status-error" role="alert">{t("updates.modeFailed")}</span>}</span>
      <Segmented size="sm" label={t("updates.mode")} value={mode} onChange={change}
        items={[{ value: "automatic", label: t("updates.mode.automatic") }, { value: "manual", label: t("updates.mode.manual") }]} />
    </div>}
    <div className="app-update-settings">
      {/* The Sidevoice installed: where a landing goes while no newer one waits. */}
      <div id={found ? undefined : UPDATE_PLACE.app} className="app-update-setting app-update-installed" data-settings-row="">
        <span className="update-action-copy" {...developer.props}>{checking ? `${name} · ${t("updates.checking")}` : upToDateNow ? `${name} · ${t("settings.updates.upToDate")}` : name}
          {developer.note && <><span aria-hidden>{" · "}{developer.note}</span><span role="status" className="sr-only">{developer.note}</span></>}
          {/* Only while nothing was found since: one the app found by itself later is not up to date. */}
          {upToDate && status?.state === "idle" && <span role="status" className="sr-only">{t("updates.upToDate")}</span>}</span>
        {can.check && <Button size="sm" variant="secondary" loading={checking} onClick={() => void act("check")}>{t("updates.check")}</Button>}
      </div>
      {!!checkError && <div className="app-update-failure" role="alert"><ErrorText message={updaterFailure(checkError, { t })} /></div>}
      {/* A newer version: the app's, its service following its restart; else what its service waits for. */}
      {found ? <AppUpdateRow status={found} can={can} busy={busy} error={rowError} act={(action) => void act(action)} t={t} /> : service}
    </div>
  </>;
}

/** The new version's line: Sidevoice 0.4.0 available; Sidevoice 0.4.0 · Downloading… (manual's after Download, or
 *  automatic's, what the person's check found: it downloads by itself); Sidevoice 0.4.0 ready. Where the app says no
 *  number for it, what it can. */
function rowWords(status: UpdaterStatus, moving: boolean, t: Translate) {
  const version = status.version ?? "";
  if (status.state === "ready") return version ? t("updates.row.ready", { version }) : t("updates.row.readyOne");
  if (moving) return version ? t("updates.row.downloading", { version }) : t("updates.row.downloadingOne");
  return version ? t("updates.row.available", { version }) : t("updates.row.availableOne");
}

/** The app's update once found, on one line with its one action: Sidevoice 0.4.0 available · Download (or Retry
 *  download), its words its description; Sidevoice 0.4.0 · Downloading… with its progress in the line and a Cancel,
 *  after which it is available again, with its Download, in either mode; Sidevoice 0.4.0 ready · Restart to update; what failed under it. The line is where a
 *  landing goes. */
function AppUpdateRow({ status, can, busy, error, act, t }: { status: UpdaterStatus;
  can: ReturnType<typeof useAppUpdate>["can"]; busy: "check" | "download" | "cancel" | "restart" | null; error: unknown;
  act: (action: "download" | "cancel" | "restart") => void;
  t: Translate }) {
  const downloadFailed = (error as { code?: unknown } | null)?.code === "update-download-failed" || status.error?.code === "update-download-failed";
  const progress = status.progress == null ? null : Math.max(0, Math.min(1, status.progress));
  const copyId = useId();
  const moving = status.state === "downloading";
  const button = status.state === "ready" ? can.restart && <Button size="sm" variant="primary" loading={busy === "restart"} aria-describedby={copyId}
      onClick={() => act("restart")}>{t("updates.action.restartAll")}</Button>
    : status.state === "available" && hasAction(status, can) ? <Button size="sm" variant={downloadFailed ? "secondary" : "primary"} loading={busy === "download"}
        aria-describedby={copyId} onClick={() => act("download")}>{t(downloadFailed ? "updates.action.retryDownload" : "updates.action.download")}</Button>
      : status.state === "downloading" ? <Button size="sm" variant="secondary" loading={busy === "cancel"} aria-describedby={copyId}
        onClick={() => act("cancel")}>{t("updates.action.cancelDownload")}</Button>
      : null;
  const copy = rowWords(status, moving, t);
  const shownProgress = status.state === "downloading" ? progress : null;
  return (
    <div id={UPDATE_PLACE.app} className="update-action-row" data-settings-row="" data-state={status.state}>
      <div className="update-action">
        <span id={copyId} className="update-action-copy">{copy}</span>
        {moving && <ProgressBar className="app-update-progress" value={shownProgress} label={copy} />}
        {moving && shownProgress != null && <span className="app-update-percent">{percent(shownProgress)}</span>}
        {button}
      </div>
      {!!error && <ErrorText className="app-update-error" role="alert" message={updaterFailure(error, { t })} />}
    </div>
  );
}
