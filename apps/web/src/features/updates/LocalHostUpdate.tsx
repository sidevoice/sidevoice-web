import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { localHostBridge, type LocalHostBridgeError, type LocalHostStatus, type LocalHostVersion } from "../../services/desktop-host";
import { normalizeLocalHostBridgeError } from "../../services/local-host-install";
import { translator } from "../../i18n/translator";
import { localHostBridgeError, safeLocalHostCount } from "../settings/local-host-status";
import { UPDATE_PLACE } from "./useUpdates";

/* This computer's service, updated from the app (Settings › Updates: Sidevoice's row, the step after the app's): its
 * Update where the app says a newer one is bundled; what stands in the way otherwise (calls on, a newer core, an
 * incompatible one). */

/* One report for every place that says it (Updates' row, This device's line), so they never disagree: asked of this
 * bridge once per state of its service (its state, its core's version and API), and set again by an Update. */
type LocalBridge = NonNullable<ReturnType<typeof localHostBridge>>;
const shared: { bridge: LocalBridge | null; key: string | null; report: LocalHostVersion | null; checking: boolean; at: number } = { bridge: null, key: null, report: null, checking: false, at: 0 };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function setShared(fields: Partial<typeof shared>) {
  Object.assign(shared, fields, { at: shared.at + 1 });
  for (const listener of [...listeners]) listener();
}
function ask(bridge: LocalBridge, key: string) {
  if (shared.bridge === bridge && shared.key === key) return;
  setShared({ bridge, key, report: shared.bridge === bridge ? shared.report : null, checking: true });
  const asked = (fields: Partial<typeof shared>) => { if (shared.bridge === bridge && shared.key === key) setShared({ ...fields, checking: false }); };
  void bridge.version!().then((report) => asked({ report }), () => asked({ report: null }));
}

/** What the bridge says of this computer's service against the one the app bundles, asked again as the service changes;
 *  `status` null (no service here, or one this app does not update), nothing. `shown`: whether there is anything to
 *  say of it — an Update, or what stands in the way — so its place shows only then. */
export function useLocalHostUpdate(status: LocalHostStatus | null) {
  useSyncExternalStore(subscribe, () => shared.at, () => shared.at);
  const bridge = localHostBridge();
  const usable = !!status && typeof bridge?.version === "function" && typeof bridge.update === "function";
  const key = usable ? [status.state, status.core?.version, status.core?.api].join("|") : null;
  useEffect(() => { if (key && bridge) ask(bridge, key); }, [key, bridge]);
  const mine = usable && shared.bridge === bridge && shared.key === key && !shared.checking;
  const report = mine ? shared.report : null;
  const shown = report?.update === "available" || report?.update === "newer-installed" || report?.update === "incompatible";
  const setReport = (next: LocalHostVersion | null) => { if (bridge) setShared({ bridge, report: next }); };
  return { report, setReport, shown };
}

/** This computer's service behind the one the app bundles, as `useLocalHostUpdate` found it, on Sidevoice's update line
 *  (Sidevoice's version said once, above it; the service's own is not said): Update available, and Update Sidevoice (UPDATE_PLACE `thisComputer`, where a landing focuses), disabled while calls are on; a failure with its
 *  details to copy; or why there is none. `continuing` (after the app restarted into its update): it runs by itself
 *  once nothing stands in the way, and `onContinued` says it is done or not needed. */
export function LocalHostUpdateControl({ status, update, continuing = false, onContinued }: { status: LocalHostStatus; update: ReturnType<typeof useLocalHostUpdate>;
  continuing?: boolean; onContinued?: () => void }) {
  const t = translator();
  const { report, setReport } = update;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LocalHostBridgeError | null>(null);
  const [note, setNote] = useState("");
  const calls = safeLocalHostCount(status.calls);
  const waitingForCalls = calls !== undefined && calls > 0;
  // Sidevoice's second step, after the app's: once the service says whether it is behind, it is updated by itself (no call on), or there
  // is nothing to continue.
  useEffect(() => {
    if (!continuing || !report || busy) return;
    if (report.update !== "available") { onContinued?.(); return; }
    if (waitingForCalls || error) return;
    onContinued?.();
    void run();
  }, [continuing, report?.update, waitingForCalls, busy, error]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const label = t(busy ? "updates.action.updatingAll" : error ? "updates.action.retryAll" : "updates.action.updateAll");
  // Sidevoice's version is said above it, once; the service's new one is not the app's, so it is not said.
  const copy = t("updates.row.availableOne");
  return (
    <div className="host-update-control update-action-row" data-settings-row="" aria-live="polite">
      <div className="update-action">
        <span className="update-action-copy">{copy}</span>
        <Button id={UPDATE_PLACE.thisComputer} size="sm" variant="primary" disabled={busy || waitingForCalls} onClick={() => void run()}>{label}</Button>
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
