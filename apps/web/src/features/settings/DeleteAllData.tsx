import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Group, Row } from "../../components/ui/Card";
import { useRoomStore } from "../../state/room-store";
import { desktopResetBridge, type DesktopResetBridge } from "../../services/desktop-host";
import { translator, type MessageKey } from "../../i18n/translator";

const steps: Record<string, MessageKey> = {
  "app-data": "data.step.app", models: "data.step.models", webview: "data.step.webview",
  cache: "data.step.cache", "saved-state": "data.step.saved", logs: "data.step.logs",
  preferences: "data.step.preferences", keychain: "data.step.keychain",
  agents: "data.step.agents",
};

type Report = Awaited<ReturnType<DesktopResetBridge["resetReport"]>>;

function FailedItems({ failed }: { failed: { step: string; key: string; agent?: string }[] }) {
  const t = translator();
  return failed.length > 0 && <ul>{failed.map((entry, index) =>
    <li key={index}>{entry.agent ? t("data.agentRemains", { agent: entry.agent }) :
      t("data.stepFailed", { step: t(steps[entry.step] ?? "data.step.other") })}</li>)}</ul>;
}

/** Shown on first-run too: Settings is hidden behind onboarding after the helper relaunches. */
export function ResetReportNotice() {
  const data = desktopResetBridge();
  const t = translator();
  const [report, setReport] = useState<Report>(null);
  const [error, setError] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [wizard, setWizard] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (!data) return;
    const current = () => setWizard(document.querySelector<HTMLDialogElement>("#wizard[open]"));
    current();
    const observer = new MutationObserver(current);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, [data]);
  useEffect(() => {
    let live = true;
    void data?.resetReport().then((value) => { if (live) setReport(value); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [data]);
  if (!data || dismissed || (!report && !error)) return null;
  const notice = <div className="data-reset-result" role={report?.state === "partial" || error ? "alert" : "status"}>
    <Button variant="ghost" size="sm" className="data-reset-dismiss" onClick={() => setDismissed(true)}>{t("data.dismiss")}</Button>
    <p>{error ? t("data.reportFailed") : t(report?.state === "partial" ? "data.partial" : "data.complete")}</p>
    {report && <FailedItems failed={report.failed} />}
    {report?.state === "partial" && <p>{t("data.retryAfterSetup")}</p>}
  </div>;
  return wizard ? createPortal(notice, wizard) : notice;
}

/** Desktop-only destructive action; the browser has no machine-wide deletion capability. */
export function DeleteAllData() {
  const data = desktopResetBridge();
  const t = translator();
  const inCall = useRoomStore((state) => Boolean(state.facts.ws || state.facts.reconnecting));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [report, setReport] = useState<Report>(null);
  const [restarting, setRestarting] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  if (!data) return null;

  async function erase() {
    if (!data || !open || busy || inCall) return;
    setBusy(true); setError(null);
    try {
      const result = await data.deleteAll();
      setRestarting(true);
      setOpen(false);
      if (result.failed.length) setReport({ state: "partial", completed: ["service"], failed: result.failed, agents: result.agents });
    } catch (failure) {
      const key = (failure as { key?: string })?.key;
      if (key === "reset.cancelled") { setOpen(false); return; }
      setError(key === "reset.busy" ? "data.busy" : key === "reset.service-failed" ? "data.serviceFailed" : "data.failed");
    } finally { setBusy(false); }
  }

  return <Group title={t("data.group")}>
    <Row label={t("data.title")} description={t("data.hint")}>
      <Button id="delete-all-sidevoice-data" variant="danger" size="sm" disabled={inCall || busy || restarting}
        onClick={() => { setError(null); setOpen(true); }}>{t("data.action")}</Button>
    </Row>
    {inCall && <p className="data-reset-note" role="status">{t("data.endCall")}</p>}
    {restarting && <p className="data-reset-note" role="status">{t("data.restarting")}</p>}
    {report && <div className="data-reset-note" role={report.state === "partial" ? "alert" : "status"}>
      <p>{t(report.state === "partial" ? "data.partial" : "data.complete")}</p>
      <FailedItems failed={report.failed} />
    </div>}
    {error && !open && <p className="data-reset-note" role="alert">{t(error)}</p>}
    {open && createPortal(<Dialog open size="sm" titleId={titleId} title={t("data.confirmTitle")}
      initialFocus={cancel} onClose={busy ? undefined : () => setOpen(false)}
      footer={<>
        <Button ref={cancel} variant="ghost" tone="neutral" disabled={busy} onClick={() => setOpen(false)}>{t("data.cancel")}</Button>
        <Button variant="danger" loading={busy} disabled={inCall} onClick={() => void erase()}>{t("data.action")}</Button>
      </>}>
      <p>{t("data.confirmWhat")}</p>
      <p className="muted">{t("data.confirmLimits")}</p>
      {error && <p role="alert">{t(error)}</p>}
    </Dialog>, document.body)}
  </Group>;
}
