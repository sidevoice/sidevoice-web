import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { localHostBridge, type LocalHostBridgeError, type LocalHostStatus, type LocalHostVersion } from "../../services/desktop-host";
import { normalizeLocalHostBridgeError } from "../../services/local-host-install";
import { hostTranslator } from "../settings/host-i18n";
import { localHostBridgeError, safeLocalHostCount } from "../settings/local-host-status";

/* This computer's service, updated from the app: its Update where the app says a newer one is bundled; what stands in
 * the way otherwise (calls on, a newer core, an incompatible one). This device's card (VARIANTS `updates-section` A)
 * or the Updates section (B) mounts it. */
export function LocalHostUpdateControl({ status }: { status: LocalHostStatus }) {
  const t = hostTranslator();
  const [report, setReport] = useState<LocalHostVersion | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LocalHostBridgeError | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let current = true;
    const bridge = localHostBridge();
    if (typeof bridge?.version !== "function" || typeof bridge.update !== "function") {
      setReport(null);
      setChecking(false);
      return () => { current = false; };
    }
    setChecking(true);
    void bridge.version().then((next) => { if (current) setReport(next); })
      .catch(() => { if (current) setReport(null); })
      .finally(() => { if (current) setChecking(false); });
    return () => { current = false; };
  }, [status.state, status.core?.version, status.core?.api]);

  const bridge = localHostBridge();
  if (checking || typeof bridge?.version !== "function" || typeof bridge.update !== "function") return null;

  async function refreshVersion() {
    const nextBridge = localHostBridge();
    if (typeof nextBridge?.version !== "function") return;
    try { setReport(await nextBridge.version()); } catch { setReport(null); }
  }

  async function update() {
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
  return (
    <div className="host-update-control" aria-live="polite">
      {waitingForCalls && <p className="muted">{t("hosts.update.waitCalls", { calls })}</p>}
      {error && <div className="local-install-error" role="alert">
        <ErrorText message={localHostBridgeError(error, t)} />
        <div className="local-install-actions">
          <Button variant="ghost" onClick={() => void copyErrorDetails()}>{t("localInstall.copyDetails")}</Button>
          {note && <span className="muted" role="status">{note}</span>}
        </div>
      </div>}
      <Button variant="primary" disabled={busy || waitingForCalls} onClick={() => void update()}>
        {busy ? t("hosts.update.working") : error ? t("hosts.update.retry") : t("hosts.update.button")}
      </Button>
    </div>
  );
}
