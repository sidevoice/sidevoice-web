import { useId, type ReactNode } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { DownloadsIcon } from "../../components/ui/Icons";
import { hostTranslator } from "./host-i18n";
import { sizeText } from "./ModelSetup";
import "./model-prepare.css";

/* A chosen model made ready on this device, the same block wherever a model is chosen (the first-run setup, Settings):
 * the pickers on top, a line about the choice, then where it stands — to download (its size, said before anything is
 * fetched), downloading (how far, and cancel), being checked and loaded, ready (and its try, all of it in the block),
 * failed (why, and retry), or a provider's model without its key. The status area keeps its height across states, so
 * nothing below it jumps.
 *
 * It only draws a state; what moves it on is the caller's. In Settings a model chosen before it is ready waits, the one in
 * use staying (`pending` says so) and switching once it is; the first-run setup's Continue waits for it. */

export type PrepareStatus = "absent" | "downloading" | "verifying" | "loading" | "ready" | "failed" | "needs-key";

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
  /** Bytes to download, when known; none for a provider's model. */
  size?: number | null;
  /** How far the download is, 0–1; none while not known. */
  fraction?: number | null;
  /** Why it failed, in one sentence. */
  error?: string;
  /** What a ready model offers beside its state: its try. */
  readyAction?: ReactNode;
  /** Under a ready model's state, in the block: how its try goes and how it went. */
  readyPanel?: ReactNode;
  onDownload?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  onAddKey?: () => void;
  id?: string;
  /** Its actions' ids: `<prefix>-download`, `-cancel`, `-retry`. */
  actionIds?: string;
}

export function ModelPrepare({ pending, runtime, status, model, pickers, meta, size = null, fraction = null, error, readyAction, readyPanel, onDownload, onCancel, onRetry, onAddKey, id, actionIds }: ModelPrepareProps) {
  const actionId = (name: string) => actionIds ? actionIds + "-" + name : undefined;
  const t = hostTranslator();
  const hintId = useId();
  const sized = size ? sizeText(size) : "";
  const locked = status === "downloading";
  const percent = fraction == null ? null : Math.round(fraction * 100);
  return (
    <div className="model-prepare" id={id} data-status={status}>
      {pickers && <div className="model-prepare-pickers" aria-describedby={locked ? hintId : undefined}>{pickers(locked)}</div>}
      {locked && pickers && <p className="model-prepare-meta" id={hintId}>{t("voice.prepare.lockedHint")}</p>}
      {!locked && meta && <p className="model-prepare-meta">{meta}</p>}
      {runtime}
      {status && <div className="model-prepare-status" role={status === "failed" ? undefined : "status"} aria-live="polite">
        {status === "absent" && <>
          <div className="model-prepare-state"><Badge>{t("voice.prepare.badge.absent")}</Badge>{sized && <span className="model-prepare-note">{sized}</span>}</div>
          <Button size="sm" id={actionId("download")} onClick={onDownload}><DownloadsIcon />{t("voice.prepare.download")}</Button>
        </>}
        {status === "downloading" && <>
          <div className="model-prepare-progress">
            <div className="model-prepare-progress-line">
              <strong>{percent == null ? t("voice.prepare.downloading") : t("voice.prepare.downloadingAt", { percent })}</strong>
              {size && fraction != null && <span className="model-prepare-note">{t("voice.prepare.progress", { done: sizeText(size * fraction), size: sized })}</span>}
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
            <span className="model-prepare-note">{sized ? t("voice.prepare.onDevice", { size: sized }) : t("voice.prepare.noDownload")}</span>
          </div>
          {readyAction}
        </>}
        {status === "needs-key" && <>
          <div className="model-prepare-state"><Badge tone="warning" dot>{t("voice.prepare.badge.needsKey")}</Badge></div>
          {onAddKey && <Button size="sm" variant="ghost" onClick={onAddKey}>{t("voice.prepare.addKey")}</Button>}
        </>}
        {status === "failed" && <Alert tone="danger" live className="model-prepare-alert" title={t("voice.prepare.failed", { model })}
          action={<Button size="sm" id={actionId("retry")} onClick={onRetry}>{t("voice.prepare.retry")}</Button>}>{error}</Alert>}
      </div>}
      {status === "ready" && readyPanel}
      {pending && status !== "ready" && <p className="model-prepare-pending" role="status">{pending}</p>}
    </div>
  );
}
