import { useContext, useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { RefreshIcon, UpdateIcon } from "../../components/ui/Icons";
import { Popover } from "../../components/ui/Popover";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { useVariant } from "../../lib/variants";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { updaterFailure } from "../settings/error-message";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import { openSettings } from "../settings/open-settings";
import { useThisComputerSection } from "../../state/this-computer";
import { useUpdates, type UpdateItem, type UpdaterStatus, type useAppUpdate } from "./useUpdates";
import "./updates.css";

/* The updates waiting, as one quiet row at the conversations' foot, above Settings (UpdateLine): the most pressing one,
 * acting where it is. The desktop app's first: automatic, "Restart to update" once it is ready; manual, "Version X
 * available · Download", its download's progress in the same row, then "Restart to update". Then the page's (Reload to
 * update), then this computer's machine's (Updates available, opening where it is updated). The rail keeps them all
 * behind an icon with their count. On a phone they are where the preview's variant puts them (VARIANTS
 * `updates-entry`): that icon in the header before the gear, or the row at the dropped conversations' foot with a dot
 * on the chevron. Nothing opens by itself, and nothing waits for a call: Reload and Restart act when pressed. Never
 * the voice's colour, which is the agents' waiting. */
export const UPDATES_ENTRY = ["header", "panel"] as const;
export function useUpdatesEntry() { return useVariant("updates-entry", UPDATES_ENTRY); }

/** Where a machine's update is acted on: This computer's page, This device or its machine's page under Machines. */
function useOpenMachineUpdate() {
  const machines = useRoomStore((state) => state.machines);
  const store = useContext(RoomStoreContext);
  // This computer in a section of its own (This device): its update is there, not under Remote machines, which leave it out.
  const ownComputer = useThisComputerSection();
  const open = () => {
    const local = machines.find((machine) => machine.local);
    openSettings(ownComputer ? { section: "this-computer" } : { section: "machines", machine: local?.id ?? null }, store);
  };
  return { open, ownComputer };
}

function UpdateRow({ item, t }: { item: UpdateItem; t: HostTranslate }) {
  const { open, ownComputer } = useOpenMachineUpdate();
  const title = item.kind === "web" ? t("updates.web") : t("updates.machine", { machine: t("hosts.thisComputer") });
  const act = () => {
    if (item.kind === "web") window.sidevoiceActions?.reloadToUpdate?.();
    else open();
  };
  return (
    <li className="update-row">
      <span className="update-row-copy">
        <strong>{title}</strong>{item.required && <Badge tone="warning">{t("updates.required")}</Badge>}
      </span>
      <span className="update-row-actions">
        <Button size="sm" variant="primary" onClick={act}
          aria-label={item.kind === "web" ? t("updates.reloadNamed") : ownComputer ? t("updates.openThisDevice") : t("updates.openNamed", { machine: t("hosts.thisComputer") })}>
          {item.kind === "web" ? t("updates.reload") : t("updates.open")}
        </Button>
      </span>
    </li>
  );
}

/** The desktop app's update where it shows (`appUpdateShown`), acting in place: Download fetches it here and its
 *  progress shows here, then Restart to update, which restarts at once, in a call or not. A download or an install
 *  that failed is said under it, with a Retry where one makes sense (a download). */
export function AppUpdateLine({ status, update, t }: { status: UpdaterStatus; update: ReturnType<typeof useAppUpdate>; t: HostTranslate }) {
  const [busy, setBusy] = useState<"download" | "restart" | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  // What the app says next replaces what a call of this page's said.
  useEffect(() => { setFailure(null); }, [status.state]);
  const version = status.version ?? "";
  const error = failure ?? (status.error && status.error.code !== "update-check-failed" ? status.error : null);
  const downloadFailed = (error as { code?: unknown } | null)?.code === "update-download-failed";
  async function run(action: "download" | "restart") {
    if (busy) return;
    setBusy(action); setFailure(null);
    try { await (action === "download" ? update.download() : update.restart()); }
    catch (reason) { setFailure(reason); }
    finally { setBusy(null); }
  }
  const progress = status.progress == null ? null : Math.max(0, Math.min(1, status.progress));
  return (
    <div className="app-update" data-state={status.state}>
      {status.state === "ready" ? update.can.restart && <Button variant="ghost" tone="neutral" block className="app-update-restart" loading={busy === "restart"} onClick={() => void run("restart")}>
          <RefreshIcon size={16} /><span>{t("updates.restartToUpdate")}</span></Button>
        : status.state === "downloading" ? <div className="app-update-progress">
          <span className="app-update-copy">{t("updates.downloading", { version })}
            {progress != null && <span className="app-update-percent">{new Intl.NumberFormat(document.documentElement.lang || undefined, { style: "percent" }).format(progress)}</span>}</span>
          <ProgressBar value={progress} label={t("updates.downloading", { version })} />
        </div>
        : <div className="app-update-row">
          <span className="app-update-copy">{t("updates.available", { version })}</span>
          {update.can.download && <Button size="sm" variant="ghost" loading={busy === "download"} onClick={() => void run("download")}
            aria-label={downloadFailed ? undefined : t("updates.downloadNamed", { version })}>{t(downloadFailed ? "updates.retry" : "updates.download")}</Button>}
        </div>}
      {!!error && <ErrorText className="app-update-error" role="alert" message={updaterFailure(error, { t })} />}
    </div>
  );
}

function UpdatesList({ items, app, update, t }: { items: UpdateItem[]; app: UpdaterStatus | null; update: ReturnType<typeof useAppUpdate>; t: HostTranslate }) {
  return items.length || app ? <ul className="updates-list">
    {app && <li className="update-row update-row--app"><AppUpdateLine status={app} update={update} t={t} /></li>}
    {items.map((item) => <UpdateRow key={item.id} item={item} t={t} />)}</ul>
    : <p className="updates-none">{t("updates.none")}</p>;
}

/** The sidebar's foot (and a phone's panel): one quiet row, its words the most pressing update's, acting where it is.
 *  The app's first (restart once ready; manual: download, then its progress in the row), then the page's (reload), then
 *  a machine's service ("Updates available", opening where it is updated). One line, cut short, never wider than the
 *  sidebar. */
function UpdateLine({ items, app, update, t }: { items: UpdateItem[]; app: UpdaterStatus | null; update: ReturnType<typeof useAppUpdate>; t: HostTranslate }) {
  const [busy, setBusy] = useState<"download" | "restart" | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { open } = useOpenMachineUpdate();
  useEffect(() => { setFailure(null); }, [app?.state]);
  async function run(action: "download" | "restart") {
    if (busy) return;
    setBusy(action); setFailure(null);
    try { await (action === "download" ? update.download() : update.restart()); }
    catch (reason) { setFailure(reason); }
    finally { setBusy(null); }
  }
  const error = app ? failure ?? (app.error && app.error.code !== "update-check-failed" ? app.error : null) : null;
  const row = (text: string, act?: { label?: string; onClick: () => void; loading?: boolean }, extra?: React.ReactNode) => act
    ? <Button variant="ghost" tone="neutral" block className="update-line" title={text} loading={act.loading} onClick={act.onClick}>
        <UpdateIcon /><span className="update-line-text">{text}</span>{act.label && <span className="update-line-act">{act.label}</span>}</Button>
    : <div className="update-line" role="status" title={text}><UpdateIcon /><span className="update-line-text">{text}</span>{extra}</div>;
  let line: React.ReactNode = null;
  if (app) {
    const version = app.version ?? "";
    if (app.state === "ready") line = update.can.restart
      ? row(version ? t("updates.restartToUpdateVersion", { version }) : t("updates.restartToUpdate"), { onClick: () => void run("restart"), loading: busy === "restart" })
      : null;
    else if (app.state === "downloading") {
      const progress = app.progress == null ? null : Math.max(0, Math.min(1, app.progress));
      const percent = progress == null ? "" : new Intl.NumberFormat(document.documentElement.lang || undefined, { style: "percent" }).format(progress);
      line = <div className="update-line update-line--progress" role="status" title={t("updates.downloadingPercent", { percent })}>
        <UpdateIcon /><span className="update-line-text">{t("updates.downloadingPercent", { percent })}</span>
        <ProgressBar className="update-line-bar" value={progress} label={t("updates.downloading", { version })} />
      </div>;
    } else {
      const downloadFailed = (error as { code?: unknown } | null)?.code === "update-download-failed";
      line = update.can.download
        ? row(t("updates.available", { version }), { label: t(downloadFailed ? "updates.retry" : "updates.download"), onClick: () => void run("download"),
            loading: busy === "download" })
        : row(t("updates.available", { version }));
    }
  } else if (items.some((item) => item.kind === "web")) {
    line = row(t("updates.reloadToUpdate"), { onClick: () => window.sidevoiceActions?.reloadToUpdate?.() });
  } else if (items.length) {
    line = row(t("updates.availableAny"), { onClick: open });
  }
  if (!line) return null;
  return <div className="update-foot">
    {line}
    {!!error && <ErrorText className="update-line-error" role="alert" message={updaterFailure(error, { t })} />}
  </div>;
}

/** The entry: at the sidebar's foot (and a phone's panel), the one row; an icon button (the rail, a phone's header)
 *  with all of them behind it and their count. Hidden while nothing waits. */
export function UpdatesEntry({ compact = false, side = "top" }: { compact?: boolean; side?: "top" | "bottom" }) {
  const t = hostTranslator();
  const { items, app, appUpdate } = useUpdates();
  if (!compact) return <UpdateLine items={items} app={app} update={appUpdate} t={t} />;
  const behind = app;
  const count = items.length + (behind ? 1 : 0);
  const label = t("updates.entry", { n: count });
  const trigger = <Button variant="ghost" tone="neutral" size="icon" className="updates-entry updates-entry--icon" aria-label={label} title={label} aria-haspopup="dialog">
      <UpdateIcon size={20} /><span className="updates-count" aria-hidden="true">{count}</span></Button>;
  return <>
    {count > 0 && <Popover trigger={trigger} label={t("updates.title")} side={side} align="start">
      <div className="updates-panel">
        <h3>{t("updates.title")}</h3><UpdatesList items={items} app={behind} update={appUpdate} t={t} />
      </div>
    </Popover>}
  </>;
}

/** Whether something waits: a phone's chevron wears a dot for it where the updates live in its panel. */
export function useUpdatesWaiting() {
  const { items, app } = useUpdates();
  return items.length > 0 || !!app;
}
