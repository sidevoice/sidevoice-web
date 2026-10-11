import { useId, type ReactNode } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { DownloadsIcon } from "../../components/ui/Icons";
import { hostTranslator } from "./host-i18n";
import { sizeText } from "./ModelSetup";

/* A chosen model made ready on this device, the same block wherever a model is chosen (the first-run setup, Settings):
 * the pickers on top, a line about the choice, then where it stands — to download (its size, said before anything is
 * fetched), downloading (how far, and cancel), being checked and loaded, ready, failed (why, and retry), or a
 * provider's model without its key. The status area keeps its height across states, so nothing below it jumps.
 *
 * It only draws a state; what moves it on is the caller's. A download is an act on this device, not part of what Save
 * keeps; but while the block is not ready, the caller's Save or Continue stays blocked (`Button`'s `blockedBy`). */

export type PrepareStatus = "absent" | "downloading" | "verifying" | "loading" | "ready" | "failed" | "needs-key";

export interface ModelPrepareProps {
  status: PrepareStatus;
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
  onDownload?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  onAddKey?: () => void;
  id?: string;
}

export function ModelPrepare({ status, model, pickers, meta, size = null, fraction = null, error, readyAction, onDownload, onCancel, onRetry, onAddKey, id }: ModelPrepareProps) {
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
      <div className="model-prepare-status" role={status === "failed" ? undefined : "status"} aria-live="polite">
        {status === "absent" && <>
          <div className="model-prepare-state"><Badge>{t("voice.prepare.badge.absent")}</Badge>{sized && <span className="model-prepare-note">{sized}</span>}</div>
          <Button size="sm" onClick={onDownload}><DownloadsIcon />{t("voice.prepare.download")}</Button>
        </>}
        {status === "downloading" && <>
          <div className="model-prepare-progress">
            <div className="model-prepare-progress-line">
              <strong>{percent == null ? t("voice.prepare.downloading") : t("voice.prepare.downloadingAt", { percent })}</strong>
              {size && fraction != null && <span className="model-prepare-note">{t("voice.prepare.progress", { done: sizeText(size * fraction), size: sized })}</span>}
            </div>
            <ProgressBar value={fraction} label={t("voice.prepare.downloading")} />
          </div>
          <Button size="sm" variant="ghost" tone="neutral" onClick={onCancel}>{t("voice.prepare.cancel")}</Button>
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
          <Button size="sm" variant="ghost" onClick={onAddKey}>{t("voice.prepare.addKey")}</Button>
        </>}
        {status === "failed" && <Alert tone="danger" live className="model-prepare-alert" title={t("voice.prepare.failed", { model })}
          action={<Button size="sm" onClick={onRetry}>{t("voice.prepare.retry")}</Button>}>{error}</Alert>}
      </div>
    </div>
  );
}
