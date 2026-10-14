import { useState, useSyncExternalStore } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { cn } from "../../lib/cn";
import { localHostBridge, type LocalHostInstallProgress } from "../../services/desktop-host";
import {
  isVisibleLocalHostInstall,
  localHostInstallController,
  type LocalHostInstallController,
} from "../../services/local-host-install";
import { translator, type MessageKey } from "../../i18n/translator";
import { localHostBridgeError } from "../settings/local-host-status";
import "./pairing.css";
import { uiLocale } from "../../i18n/locale";

const stepKeys: Record<string, MessageKey> = {
  download: "localInstall.step.download",
  verification: "localInstall.step.verification",
  verify: "localInstall.step.verification",
  staging: "localInstall.step.staging",
  "service-start": "localInstall.step.serviceStart",
  service_start: "localInstall.step.serviceStart",
  pairing: "localInstall.step.pairing",
  wait: "localInstall.step.pairing",
};

function formatMegabytes(bytes: number) {
  return new Intl.NumberFormat(uiLocale(), { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024));
}

/** Whether a screen may offer to prepare this computer: `supported` when this app can (the desktop app's install),
 *  `offered` while no preparation is on screen either — its panel then stands where the offer was. For screens that
 *  place the offer among their own actions (the no-machine screen, the first-run setup's footer). */
export function useLocalInstallOffer(controller: LocalHostInstallController = localHostInstallController) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const supported = typeof localHostBridge()?.install === "function";
  return { supported, offered: supported && !isVisibleLocalHostInstall(snapshot) };
}

export function LocalHostInstallEntry({
  showCta,
  controller = localHostInstallController,
  className = "",
  holdSuccess = false,
  source = "machines",
  anotherMachine = true,
}: {
  showCta: boolean;
  /** Whether it offers connecting to another machine instead; not in the setup's This computer path, where Back does. */
  anotherMachine?: boolean;
  controller?: LocalHostInstallController;
  className?: string;
  holdSuccess?: boolean;
  source?: "no-machine" | "machines";
}) {
  const t = translator();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const bridge = localHostBridge();
  const supportsInstall = typeof bridge?.install === "function";
  const showingAttempt = isVisibleLocalHostInstall(snapshot, source);
  const attemptActive = isVisibleLocalHostInstall(snapshot);
  const [note, setNote] = useState("");

  if ((!supportsInstall && !showingAttempt) || (!showCta && !showingAttempt) || (snapshot.phase === "succeeded" && !holdSuccess)) return null;

  function start() {
    setNote("");
    controller.start(source);
  }

  async function connectAnotherMachine() {
    if (snapshot.phase !== "installing") controller.clear();
    window.sidevoiceActions?.openPairing();
  }

  async function copyDetails() {
    if (snapshot.phase !== "failed") return;
    const details = JSON.stringify(snapshot.error, null, 2);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(details);
      setNote(t("localInstall.detailsCopied"));
    } catch {
      setNote(t("localInstall.detailsCopyFailed"));
    }
  }

  const progress: LocalHostInstallProgress | null = snapshot.phase === "installing" && snapshot.step
    ? { step: snapshot.step, done: snapshot.done, total: snapshot.total }
    : null;
  const byteProgress = progress && progress.done !== null && progress.total !== null;
  const error = snapshot.phase === "failed" ? snapshot.error : null;
  const errorMessage = error ? localHostBridgeError(error, t) : null;
  const errorStep = error?.step || (snapshot.phase === "failed" ? snapshot.step : null);
  const displayStep = snapshot.phase === "installing" && snapshot.step ? snapshot.step : errorStep;
  const mappedStep = displayStep ? stepKeys[displayStep] ?? "localInstall.step.unknown" : null;

  return (
    <div className={cn("local-install-entry", className)}>
      {showCta && !attemptActive && (
        <div className="local-install-cta">
          <Button variant="primary" onClick={start}>{t("localInstall.cta")}</Button>
          <p className="muted">{t("localInstall.description")}</p>
        </div>
      )}
      {showingAttempt && (
        <section className="local-install-panel" aria-labelledby="local-install-title" aria-live="polite" data-phase={snapshot.phase}>
          <div className="local-install-head">
            {snapshot.phase === "installing" && <span className="ui-spinner ui-spinner--inline" aria-hidden />}
            <h4 id="local-install-title">{t("localInstall.panelTitle")}</h4>
          </div>
          {snapshot.phase === "installing" && <>
            <p className="local-install-status" role="status">{t("localInstall.preparing")}</p>
            {mappedStep && <p className="muted">{t(mappedStep)}</p>}
            {byteProgress && <div className="local-install-progress">
              <ProgressBar label={t("localInstall.progressLabel")} value={Math.min(progress!.done!, progress!.total!) / Math.max(1, progress!.total!)} />
              <p className="muted">{t("localInstall.progressBytes", {
                done: formatMegabytes(progress!.done!), total: formatMegabytes(progress!.total!),
              })}</p>
            </div>}
            {snapshot.cancelling && <p className="muted" role="status">{t("localInstall.cancelling")}</p>}
            {snapshot.cancelState === "too-late" && <p className="muted" role="status">{t("localInstall.cancelTooLate")}</p>}
            {snapshot.cancelState === "failed" && <p className="muted" role="status">{t("localInstall.cancelFailed")}</p>}
          </>}
          {snapshot.phase === "failed" && <Alert tone="danger" live className="local-install-error" title={errorMessage?.text} details={errorMessage?.details}>
            {mappedStep ? t("hosts.failureStep", { step: t(mappedStep) }) : undefined}
          </Alert>}
          {snapshot.phase === "cancelled" && <p className="local-install-status" role="status">{t("localInstall.cancelled")}</p>}
          {snapshot.phase === "succeeded" && <p className="local-install-status" role="status">{t("localInstall.selecting")}</p>}
          <div className="local-install-actions">
            {snapshot.phase === "installing" && snapshot.cancellable && <Button variant="ghost" tone="neutral" size="sm" disabled={snapshot.cancelling}
              onClick={() => void controller.cancel()}>{t("localInstall.cancel")}</Button>}
            {(snapshot.phase === "failed" || snapshot.phase === "cancelled") && <Button variant="primary" size="sm" onClick={start}>{t("localInstall.retry")}</Button>}
            {snapshot.phase === "failed" && <Button size="sm" onClick={() => void copyDetails()}>{t("localInstall.copyDetails")}</Button>}
            {anotherMachine && <Button variant="ghost" size="sm" onClick={() => void connectAnotherMachine()}>{t("localInstall.connectAnother")}</Button>}
          </div>
          {note && <p className="muted" role="status">{note}</p>}
        </section>
      )}
    </div>
  );
}
