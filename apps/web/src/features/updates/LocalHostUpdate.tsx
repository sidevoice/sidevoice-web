import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { localHostBridge, type LocalHostBridgeError, type LocalHostStatus, type LocalHostVersion } from "../../services/desktop-host";
import { normalizeLocalHostBridgeError } from "../../services/local-host-install";
import { hostTranslator } from "../settings/host-i18n";
import { localHostBridgeError, safeLocalHostCount } from "../settings/local-host-status";
import { UPDATE_PLACE } from "./useUpdates";

/* This computer's service, updated from the app (Settings › Updates, "Sidevoice on this computer"): its Update where
 * the app says a newer one is bundled; what stands in the way otherwise (calls on, a newer core, an incompatible one). */

/** What the bridge says of this computer's service against the one the app bundles, asked again as the service changes;
 *  `status` null (no service here, or one this app does not update), nothing. `shown`: whether there is anything to
 *  say of it — an Update, or what stands in the way — so its place shows only then. */
export function useLocalHostUpdate(status: LocalHostStatus | null) {
  const [report, setReport] = useState<LocalHostVersion | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    let current = true;
    const bridge = localHostBridge();
    if (!status || typeof bridge?.version !== "function" || typeof bridge.update !== "function") {
      setReport(null);
      setChecking(false);
      return () => { current = false; };
    }
    setChecking(true);
    void bridge.version().then((next) => { if (current) setReport(next); })
      .catch(() => { if (current) setReport(null); })
      .finally(() => { if (current) setChecking(false); });
    return () => { current = false; };
  }, [!!status, status?.state, status?.core?.version, status?.core?.api]); // eslint-disable-line react-hooks/exhaustive-deps
  const bridge = localHostBridge();
  const usable = !!status && typeof bridge?.version === "function" && typeof bridge.update === "function";
  const shown = usable && !checking && (report?.update === "available" || report?.update === "newer-installed" || report?.update === "incompatible");
  return { report: usable && !checking ? report : null, setReport, shown };
}

/** This computer's update, as `useLocalHostUpdate` found it: "Version X available" and Update (UPDATE_PLACE
 *  `thisComputer`, where a landing focuses), disabled while calls are on; a failure with its details to copy; or why
 *  there is none. */
export function LocalHostUpdateControl({ status, update }: { status: LocalHostStatus; update: ReturnType<typeof useLocalHostUpdate> }) {
  const t = hostTranslator();
  const { report, setReport } = update;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LocalHostBridgeError | null>(null);
  const [note, setNote] = useState("");

  async function refreshVersion() {
    const nextBridge = localHostBridge();
    if (typeof nextBridge?.version !== "function") return;
    try { setReport(await nextBridge.version()); } catch { setReport(null); }
  }

  async function run() {
    const nextBridge = localHostBridge();
    if (report?.update !== "available" || typeof nextBridge?.version !== "function" || typeof nextBridge.update !== "function" || busy) return;
    setBusy(true);setError(null);setNote("");
    try {
      const current = await nextBridge.version();
      setReport(current);
      if (current.update !== "available") return;
      await nextBridge.update();
      await refreshVersion();
    }
    catch (reason) { setError(normalizeLocalHostBridgeError(reason)); }
    finally { setBusy(false); }
  }

  async function copyErrorDetails() {
    if (!error) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(JSON.stringify(error, null, 2));
      setNote(t("localInstall.detailsCopied"));
    } catch { setNote(t("localInstall.detailsCopyFailed")); }
  }

  if (!report) return null;
  if (report.update === "newer-installed") return <p className="host-update-guidance" role="status">{t("hosts.update.newerInstalled")}</p>;
  if (report.update === "incompatible") return <p className="host-update-guidance" role="status">{report.core_api == null
    ? t("hosts.update.incompatibleUnknown") : t("hosts.update.incompatible", { api: report.core_api })}</p>;
  if (report.update !== "available") return null;

  const calls = safeLocalHostCount(status.calls);
  const waitingForCalls = calls !== undefined && calls > 0;
  const bundled = typeof report.bundled?.version === "string" ? report.bundled.version : "";
  return (
    <div className="host-update-control update-action-row" aria-live="polite">
      <div className="update-action">
        <span className="update-action-copy">{bundled ? t("updates.available", { version: bundled }) : t("updates.availableOne")}</span>
        <Button id={UPDATE_PLACE.thisComputer} size="sm" variant="primary" disabled={busy || waitingForCalls} onClick={() => void run()}>
          {busy ? t("hosts.update.working") : error ? t("hosts.update.retry") : t("hosts.update.button")}
        </Button>
      </div>
      {waitingForCalls && <p className="muted">{t("hosts.update.waitCalls", { calls })}</p>}
      {error && <div className="local-install-error" role="alert">
        <ErrorText message={localHostBridgeError(error, t)} />
        <div className="local-install-actions">
          <Button variant="ghost" size="sm" onClick={() => void copyErrorDetails()}>{t("localInstall.copyDetails")}</Button>
          {note && <span className="muted" role="status">{note}</span>}
        </div>
      </div>}
    </div>
  );
}
