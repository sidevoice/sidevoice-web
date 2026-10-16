import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { DisclosureButton } from "../../components/ui/DisclosureButton";
import { Group, Row } from "../../components/ui/Card";
import { useRoomStore } from "../../state/room-store";
import { desktopResetBridge, desktopUninstallBridge, type DesktopResetBridge } from "../../services/desktop-host";
import { translator, type MessageKey } from "../../i18n/translator";

const steps: Record<string, MessageKey> = {
  "app-data": "data.step.app", models: "data.step.models", webview: "data.step.webview",
  cache: "data.step.cache", "saved-state": "data.step.saved", logs: "data.step.logs",
  preferences: "data.step.preferences", keychain: "data.step.keychain",
  agents: "data.step.agents", app: "data.step.appBundle",
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

/** What each action says: its row, its button, its confirmation, and what it says once the app is quitting. */
interface ActionCopy { id: string; title: MessageKey; hint: MessageKey; action: MessageKey; confirmTitle: MessageKey; confirmWhat: MessageKey; quitting: MessageKey }
const COPY: Record<"deleteAll" | "uninstall", ActionCopy> = {
  deleteAll: {
    id: "delete-all-sidevoice-data", title: "data.title", hint: "data.hint", action: "data.action",
    confirmTitle: "data.confirmTitle", confirmWhat: "data.confirmWhat", quitting: "data.restarting",
  },
  uninstall: {
    id: "uninstall-sidevoice", title: "data.uninstall.title", hint: "data.uninstall.hint", action: "data.uninstall.action",
    confirmTitle: "data.uninstall.confirmTitle", confirmWhat: "data.uninstall.confirmWhat", quitting: "data.uninstall.quitting",
  },
};

/** One destructive row: its red button opens a short confirmation (what happens in one sentence, what stays behind a
 *  disclosure); the app then asks once more natively and quits to finish. */
type Started = Pick<Awaited<ReturnType<DesktopResetBridge["deleteAll"]>>, "pending" | "failed" | "agents">;

function DangerAction({ action, run, inCall }: { action: keyof typeof COPY; run: () => Promise<Started>; inCall: boolean }) {
  const t = translator();
  const copy = COPY[action];
  const [open, setOpen] = useState(false);
  const [limits, setLimits] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [report, setReport] = useState<Report>(null);
  const [quitting, setQuitting] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const limitsId = useId();

  async function confirm() {
    if (!open || busy || inCall) return;
    setBusy(true); setError(null);
    try {
      const result = await run();
      setQuitting(result.pending.length > 0);
      setOpen(false);
      if (result.failed.length) setReport({ state: "partial", completed: ["service"], failed: result.failed, agents: result.agents });
    } catch (failure) {
      const key = (failure as { key?: string })?.key;
      if (key === "reset.cancelled") { setOpen(false); return; }
      setError(key === "reset.busy" ? "data.busy"
        : key === "reset.service-failed" ? "data.serviceFailed"
        : key === "reset.unsafe" || key === "reset.unavailable" ? "data.unsafeScope"
        : key === "reset.unsupported-connector" ? "data.connectorUpdateRequired"
        : key === "reset.app-unremovable" ? "data.appUnremovable" : "data.failed");
    } finally { setBusy(false); }
  }

  return <>
    <Row label={t(copy.title)} description={t(copy.hint)}>
      <Button id={copy.id} variant="danger" size="sm" disabled={inCall || busy || quitting}
        onClick={() => { setError(null); setLimits(false); setOpen(true); }}>{t(copy.action)}</Button>
    </Row>
    {quitting && <p className="data-reset-note" role="status">{t(copy.quitting)}</p>}
    {report && <div className="data-reset-note" role={report.state === "partial" ? "alert" : "status"}>
      <p>{t(report.state === "partial" ? "data.partial" : "data.complete")}</p>
      <FailedItems failed={report.failed} />
    </div>}
    {error && !open && <p className="data-reset-note" role="alert">{t(error)}</p>}
    {open && createPortal(<Dialog open size="sm" titleId={titleId} title={t(copy.confirmTitle)}
      initialFocus={cancel} onClose={busy ? undefined : () => setOpen(false)}
      footer={<>
        <Button ref={cancel} variant="ghost" tone="neutral" disabled={busy} onClick={() => setOpen(false)}>{t("data.cancel")}</Button>
        <Button variant="danger" loading={busy} disabled={inCall} onClick={() => void confirm()}>{t(copy.action)}</Button>
      </>}>
      <p>{t(copy.confirmWhat)}</p>
      <DisclosureButton open={limits} controls={limitsId} onClick={() => setLimits((shown) => !shown)}>{t("data.limitsToggle")}</DisclosureButton>
      <p id={limitsId} className="muted" hidden={!limits}>{t("data.confirmLimits")}</p>
      {error && <p role="alert">{t(error)}</p>}
    </Dialog>, document.body)}
  </>;
}

/** Whether Settings has a Danger zone: only where one of its actions exists (the desktop app that can reset its
 *  machine). A browser has no machine-wide deletion, so it shows none. */
/** The last group of Settings › Advanced, in red (operator, 2026-10-16: not a section of its own): what deletes
 *  Sidevoice's data, and, where the app can, Sidevoice itself. Only where the app can delete its data (a browser can't). */
export function DangerZone() {
  const data = desktopResetBridge();
  const uninstall = desktopUninstallBridge();
  const t = translator();
  const inCall = useRoomStore((state) => Boolean(state.facts.ws || state.facts.reconnecting));
  if (!data) return null;
  return <div className="danger-zone">
    <Group className="danger-group" title={t("settings.section.danger")}>
      <DangerAction action="deleteAll" run={() => data.deleteAll()} inCall={inCall} />
      {uninstall && <DangerAction action="uninstall" run={() => uninstall.uninstall()} inCall={inCall} />}
    </Group>
    {inCall && <p className="data-reset-note" role="status">{t("data.endCall")}</p>}
  </div>;
}
