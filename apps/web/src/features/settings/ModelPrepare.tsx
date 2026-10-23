import { useEffect, useId, useState, type ReactNode } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { DownloadsIcon } from "../../components/ui/Icons";
import { translator } from "../../i18n/translator";
import type { ModelBuild } from "@sidevoice/engine";
import { sizeText } from "./ModelSetup";
import { ModelSheet } from "./model-facts";
import "./model-prepare.css";

/* A chosen model made ready on this device, the same block wherever a model is chosen (the first-run setup, Settings):
 * the pickers on top, a line about the choice, then where it stands — to download (its size, said before anything is
 * fetched), downloading (how far, and cancel), being checked and loaded, ready (and its try, all of it in the block),
 * failed (why, and retry). The status area keeps its height across states, so
 * nothing below it jumps.
 *
 * It only draws a state; what moves it on is the caller's. In Settings a model chosen before it is ready waits, the one in
 * use staying (`pending` says so) and switching once it is; the first-run setup's Continue waits for it. */

export type PrepareStatus = "absent" | "downloading" | "verifying" | "loading" | "ready" | "failed";

/** How long a download may show no new bytes before it reads as stalled. The engine gives up on its own after a minute
 * without bytes (sidevoice-engine's download-failed), so this comes first. */
export const STALL_AFTER_MS = 15_000;

/** True once a running download's `fraction` has not moved for STALL_AFTER_MS. Any movement, or the download ending,
 * clears it. */
export function useStalled(running: boolean, fraction: number | null): boolean {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    setStalled(false);
    if (!running) return;
    const timer = setTimeout(() => setStalled(true), STALL_AFTER_MS);
    return () => clearTimeout(timer);
  }, [running, fraction]);
  return stalled;
}

export interface ModelPrepareProps {
  /** A line under the status: here, that the model in use stays until this one is ready ("Will switch when ready"). */
  pending?: string;
  /** How it runs (ModelRuntime): after the model is chosen and before its download, since it changes what is downloaded. */
  runtime?: ReactNode;
  /** None while no model is chosen (or the chosen one is not listed): the pickers and their note alone. */
  status: PrepareStatus | null;
  /** The model's name, for what is said about it. */
  model: string;
  /** The family and model pickers; disabled by the block while a download runs. */
  pickers?: (locked: boolean) => ReactNode;
  /** A line about the choice: a note on it (why it does not run here, its quality). */
  meta?: ReactNode;
  /** The languages it supports (ModelLanguages), when it lists some: on the line about the choice, or the spec sheet's
   *  Languages row. */
  languages?: ReactNode;
  /** That it does not speak the language in use, in a region of its own that stays as models are chosen, so choosing
   *  one says it: under the line, hidden with it while a download runs; or at the end of the spec sheet's Languages row. */
  notice?: ReactNode;
  /** Bytes to download, when known; none for a provider's model. */
  size?: number | null;
  /** The build of this device's model it runs as (ModelSetup's `build`): what it takes and where it runs, in its spec
   *  sheet (model-facts.tsx). None for a provider's model, or one with nothing that runs here: it has no sheet. */
  build?: ModelBuild | null;
  /** How far the download is, 0–1; none while not known. */
  fraction?: number | null;
  /** Why it failed, in one sentence; and what was raw about it, behind Details (error-message.ts). */
  error?: string;
  errorDetails?: string;
  /** What a ready model offers beside its state: its try. */
  readyAction?: ReactNode;
  /** Under a ready model's state, in the block: how its try goes and how it went. */
  readyPanel?: ReactNode;
  onDownload?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  id?: string;
  /** Its actions' ids: `<prefix>-download`, `-cancel`, `-retry`. */
  actionIds?: string;
}

export function ModelPrepare({ pending, runtime, status, model, pickers, meta, languages, notice, size = null, build = null, fraction = null, error, errorDetails, readyAction, readyPanel, onDownload, onCancel, onRetry, id, actionIds }: ModelPrepareProps) {
  const actionId = (name: string) => actionIds ? actionIds + "-" + name : undefined;
  const t = translator();
  const hintId = useId();
  const sized = size ? sizeText(size) : "";
  const locked = status === "downloading";
  const stalled = useStalled(locked, fraction);
  const percent = fraction == null ? null : Math.round(fraction * 100);
  // A model of this device that runs here has a spec sheet (sidevoice-web#340): Advanced under the pickers, then one
  // block with its languages, hardware and sizes, its status row saying the state alone. Any other keeps the line about
  // the choice, and its size beside the state.
  const sheet = !!build;
  const note = (ready: boolean): ReactNode => {
    if (sheet) return null;
    return ready ? <span className="model-prepare-note">{sized ? t("voice.prepare.onDevice", { size: sized }) : t("voice.prepare.noDownload")}</span>
      : sized && <span className="model-prepare-note">{sized}</span>;
  };
  return (
    <div className="model-prepare" id={id} data-status={status}>
      {pickers && <div className="model-prepare-pickers" aria-describedby={locked ? hintId : undefined}>{pickers(locked)}</div>}
      {locked && pickers && <p className="model-prepare-meta" id={hintId}>{t("voice.prepare.lockedHint")}</p>}
      {sheet ? <>
        {runtime}
        {/* The note and the sheet stay while a download runs: the pickers' hint is a line of its own. A note is not a
            language: it is a line of its own, above the sheet. */}
        {meta && <p className="model-prepare-meta">{meta}</p>}
        {status && <ModelSheet build={build!} languages={languages} notice={notice} expected={status !== "ready"} t={t} />}
      </> : <>
        {!locked && (meta || languages) && <p className="model-prepare-meta">{meta}{meta && languages && " · "}{languages}</p>}
        {!locked && notice}
        {runtime}
      </>}
      {status && <div className="model-prepare-status" role={status === "failed" ? undefined : "status"} aria-live="polite">
        {status === "absent" && <>
          <div className="model-prepare-state"><Badge>{t("voice.prepare.badge.absent")}</Badge>{note(false)}</div>
          <Button size="sm" id={actionId("download")} onClick={onDownload}><DownloadsIcon />{t("voice.prepare.download")}</Button>
        </>}
        {status === "downloading" && <>
          <div className="model-prepare-progress">
            <div className="model-prepare-progress-line">
              <strong>{percent == null ? t("voice.prepare.downloading") : t("voice.prepare.downloadingAt", { percent })}</strong>
              {stalled ? <span className="model-prepare-note model-prepare-stalled">{t("voice.prepare.stalled")}</span>
                : size && fraction != null && <span className="model-prepare-note">{t("voice.prepare.progress", { done: sizeText(size * fraction), size: sized })}</span>}
            </div>
            <ProgressBar value={fraction} label={t("voice.prepare.downloading")} />
          </div>
          <Button size="sm" variant="ghost" tone="neutral" id={actionId("cancel")} onClick={onCancel}>{t("voice.prepare.cancel")}</Button>
        </>}
        {(status === "verifying" || status === "loading") && <div className="model-prepare-state">
          <span className="ui-spinner ui-spinner--inline" aria-hidden />
          <span className="model-prepare-working">{t(status === "verifying" ? "voice.prepare.verifying" : "voice.prepare.loading")}</span>
        </div>}
        {status === "ready" && <>
          <div className="model-prepare-state">
            <Badge tone="positive" dot>{t("voice.prepare.badge.ready")}</Badge>
            {note(true)}
          </div>
          {readyAction}
        </>}
        {status === "failed" && <Alert tone="danger" live className="model-prepare-alert" title={t("voice.prepare.failed", { model })}
          details={errorDetails}
          action={<Button size="sm" id={actionId("retry")} onClick={onRetry}>{t("voice.prepare.retry")}</Button>}>{error}</Alert>}
      </div>}
      {status === "ready" && readyPanel}
      {pending && status !== "ready" && <p className="model-prepare-pending" role="status">{pending}</p>}
    </div>
  );
}
