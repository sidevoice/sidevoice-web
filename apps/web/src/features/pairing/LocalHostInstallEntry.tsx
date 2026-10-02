import { useState, useSyncExternalStore } from "react";
import { Button } from "../../components/ui/Button";
import { localHostBridge, type LocalHostInstallProgress } from "../../services/desktop-host";
import {
  isVisibleLocalHostInstall,
  localHostInstallController,
  type LocalHostInstallController,
} from "../../services/local-host-install";
import { hostTranslator } from "../settings/host-i18n";
import type { HostMessageKey } from "../settings/messages/en";
import { localHostBridgeErrorText } from "../settings/local-host-status";

const stepKeys: Record<string, HostMessageKey> = {
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
  return new Intl.NumberFormat(navigator.language, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024));
}

export function LocalHostInstallEntry({
  showCta,
  controller = localHostInstallController,
  className = "",
  holdSuccess = false,
  source = "machines",
}: {
  showCta: boolean;
  controller?: LocalHostInstallController;
  className?: string;
  holdSuccess?: boolean;
  source?: "no-machine" | "machines";
}) {
  const t = hostTranslator();
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
  const errorMessage = error ? localHostBridgeErrorText(error, t) : "";
  const errorStep = error?.step || (snapshot.phase === "failed" ? snapshot.step : null);
  const displayStep = snapshot.phase === "installing" && snapshot.step ? snapshot.step : errorStep;
  const mappedStep = displayStep ? stepKeys[displayStep] ?? "localInstall.step.unknown" : null;

  return (
    <div className={`local-install-entry ${className}`.trim()}>
      {showCta && !attemptActive && (
        <div className="local-install-cta">
          <Button variant="primary" onClick={start}>{t("localInstall.cta")}</Button>
          <p className="muted">{t("localInstall.description")}</p>
        </div>
      )}
      {showingAttempt && (
        <section className="local-install-panel" aria-labelledby="local-install-title" aria-live="polite">
          <h4 id="local-install-title">{t("localInstall.panelTitle")}</h4>
          {snapshot.phase === "installing" && <>
            <p className="local-install-status" role="status">{t("localInstall.preparing")}</p>
            {mappedStep && <p className="muted">{t(mappedStep)}</p>}
            {byteProgress && <>
              <progress aria-label={t("localInstall.progressLabel")} max={progress!.total!} value={Math.min(progress!.done!, progress!.total!)} />
              <p className="muted">{t("localInstall.progressBytes", {
                done: formatMegabytes(progress!.done!), total: formatMegabytes(progress!.total!),
              })}</p>
            </>}
            {snapshot.cancelling && <p className="muted" role="status">{t("localInstall.cancelling")}</p>}
            {snapshot.cancelState === "too-late" && <p className="muted" role="status">{t("localInstall.cancelTooLate")}</p>}
            {snapshot.cancelState === "failed" && <p className="muted" role="status">{t("localInstall.cancelFailed")}</p>}
          </>}
          {snapshot.phase === "failed" && <div className="local-install-error" role="alert">
            <p>{errorMessage}</p>
            {mappedStep && <p className="muted">{t("hosts.failureStep", { step: t(mappedStep) })}</p>}
          </div>}
          {snapshot.phase === "cancelled" && <p className="local-install-status" role="status">{t("localInstall.cancelled")}</p>}
          {snapshot.phase === "succeeded" && <p className="local-install-status" role="status">{t("localInstall.selecting")}</p>}
          <div className="local-install-actions">
            {snapshot.phase === "installing" && snapshot.cancellable && <Button variant="ghost" disabled={snapshot.cancelling}
              onClick={() => void controller.cancel()}>{t("localInstall.cancel")}</Button>}
            {(snapshot.phase === "failed" || snapshot.phase === "cancelled") && <Button variant="primary" onClick={start}>{t("localInstall.retry")}</Button>}
            {snapshot.phase === "failed" && <Button variant="ghost" onClick={() => void copyDetails()}>{t("localInstall.copyDetails")}</Button>}
            <Button variant="ghost" onClick={() => void connectAnotherMachine()}>{t("localInstall.connectAnother")}</Button>
          </div>
          {note && <p className="muted" role="status">{note}</p>}
        </section>
      )}
    </div>
  );
}
