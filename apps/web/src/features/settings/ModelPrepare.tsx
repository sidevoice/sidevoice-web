import { useEffect, useId, useState, type ReactNode } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { DownloadsIcon } from "../../components/ui/Icons";
import { translator } from "../../i18n/translator";
import type { ModelBuild } from "@sidevoice/engine";
import { sizeText } from "./ModelSetup";
import { buildSummary, HardwareChip, ModelFacts, modelFacts, sizeFacts, useModelSummary } from "./model-facts";
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
  /** A line about the choice: its languages, a quality note. */
  meta?: ReactNode;
  /** Under that line, what to know about the choice (that it does not speak the language in use), in a region of its
   *  own that stays as models are chosen, so choosing one says it. Hidden, as the line, while a download runs. */
  notice?: ReactNode;
  /** Bytes to download, when known; none for a provider's model. */
  size?: number | null;
  /** The build of this device's model it runs as (ModelSetup's `build`): what it takes and where it runs, said with
   *  "Advanced: how it runs" closed (model-facts.tsx). None for a provider's model: nothing is said of it. */
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

export function ModelPrepare({ pending, runtime, status, model, pickers, meta, notice, size = null, build = null, fraction = null, error, errorDetails, readyAction, readyPanel, onDownload, onCancel, onRetry, id, actionIds }: ModelPrepareProps) {
  const actionId = (name: string) => actionIds ? actionIds + "-" + name : undefined;
  const t = translator();
  const hintId = useId();
  const summary = useModelSummary();
  const sized = size ? sizeText(size) : "";
  const locked = status === "downloading";
  const stalled = useStalled(locked, fraction);
  const percent = fraction == null ? null : Math.round(fraction * 100);
  // Its hardware as a chip beside Not downloaded or Ready: "chip", and "chipadvanced" in a block with no Advanced line
  // to carry it (the end of turn's).
  const stateChip = !!build && (summary === "chip" || (summary === "chipadvanced" && runtime === undefined));
  // Beside Not downloaded or Ready: its size (once ready, on this device). A model of this device says all its facts
  // there ("status"), or only that it is here, its facts having a row of their own ("facts", "chipfacts"), or its
  // sizes, its hardware being a chip ("chip", "chipadvanced").
  const note = (ready: boolean): ReactNode => {
    if (build && summary === "status") {
      const facts = modelFacts(build, ready, t);
      if (facts) return <span className="model-prepare-note model-prepare-facts">{facts}</span>;
    }
    if (build && (summary === "facts" || summary === "chipfacts")) return ready && <span className="model-prepare-note">{t("runtime.onDisk")}</span>;
    if (build && (summary === "chip" || summary === "chipadvanced")) {
      const sizes = sizeFacts(build, ready, t);
      return <>{stateChip && <HardwareChip build={build} expected={!ready} t={t} />}{sizes && <span className="model-prepare-note model-prepare-facts">{sizes}</span>}</>;
    }
    return ready ? <span className="model-prepare-note">{sized ? t("voice.prepare.onDevice", { size: sized }) : t("voice.prepare.noDownload")}</span>
      : sized && <span className="model-prepare-note">{sized}</span>;
  };
  return (
    <div className="model-prepare" id={id} data-status={status}>
      {pickers && <div className="model-prepare-pickers" aria-describedby={locked ? hintId : undefined}>{pickers(locked)}</div>}
      {locked && pickers && <p className="model-prepare-meta" id={hintId}>{t("voice.prepare.lockedHint")}</p>}
      {!locked && meta && <p className="model-prepare-meta">{meta}</p>}
      {!locked && notice}
      {build && status && summary === "facts" && <ModelFacts build={build} t={t} />}
      {build && status && summary === "chipfacts" && <ModelFacts build={build} chip expected={status !== "ready"} t={t} />}
      {/* A block with no "Advanced: how it runs" (the end of turn's) says its line where that would be ("advanced"). */}
      {runtime ?? (build && summary === "advanced" && <p className="model-prepare-meta model-prepare-summary">{buildSummary(build, t)}</p>)}
      {status && <div className="model-prepare-status" role={status === "failed" ? undefined : "status"} aria-live="polite">
        {status === "absent" && <>
          <div className="model-prepare-state" data-chip={stateChip || undefined}><Badge>{t("voice.prepare.badge.absent")}</Badge>{note(false)}</div>
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
          <div className="model-prepare-state" data-chip={stateChip || undefined}>
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
