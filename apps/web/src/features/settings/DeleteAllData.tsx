import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Group, Row } from "../../components/ui/Card";
import { useRoomStore } from "../../state/room-store";
import { desktopDataBridge, type DesktopDataBridge } from "../../services/desktop-host";
import { translator, type MessageKey } from "../../i18n/translator";

const steps: Record<string, MessageKey> = {
  "app-data": "data.step.app", models: "data.step.models", webview: "data.step.webview",
  cache: "data.step.cache", "saved-state": "data.step.saved", logs: "data.step.logs",
  preferences: "data.step.preferences", keychain: "data.step.keychain",
};

type Report = Awaited<ReturnType<DesktopDataBridge["resetReport"]>>;

/** Desktop-only destructive action; the browser has no machine-wide deletion capability. */
export function DeleteAllData() {
  const data = desktopDataBridge();
  const t = translator();
  const inCall = useRoomStore((state) => Boolean(state.facts.ws || state.facts.reconnecting));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [report, setReport] = useState<Report>(null);
  const [restarting, setRestarting] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    let live = true;
    void data?.resetReport().then((value) => { if (live) setReport(value); }).catch(() => {
      if (live) setError("data.reportFailed");
    });
    return () => { live = false; };
  }, [data]);
  if (!data) return null;

  async function erase() {
    if (!data || busy || inCall) return;
    setBusy(true); setError(null);
    try {
      const result = await data.deleteAll();
      setRestarting(true);
      setOpen(false);
      if (result.failed.length) setReport({ state: "partial", completed: ["service"], failed: result.failed });
    } catch (failure) {
      const key = (failure as { key?: string })?.key;
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
      {report.failed.length > 0 && <ul>{report.failed.map((entry, index) =>
        <li key={index}>{t("data.stepFailed", { step: t(steps[entry.step] ?? "data.step.other") })}</li>)}</ul>}
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
