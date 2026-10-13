import { useContext, useId } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { UpdateIcon } from "../../components/ui/Icons";
import { Popover } from "../../components/ui/Popover";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { updaterFailure } from "../settings/error-message";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import { openSettings } from "../settings/open-settings";
import { machineUpdatePlace, UPDATE_PLACE, useUpdates, type UpdateItem, type UpdaterStatus } from "./useUpdates";
import "./updates.css";

/* The updates waiting, as one quiet row at the conversations' foot, above Settings (UpdateLine): the most pressing
 * one's words — the desktop app's first (automatic: nothing until it is ready to restart into; manual: available, its
 * download's percentage, then ready), then the page's (Reload to update), then a machine's (Updates available). The rail
 * keeps them all behind an icon with their count. Each opens Settings › Updates on its own row, its action (Download,
 * Restart to update, Update, a remote machine's command) in view and focused: that is where it is done. The page's
 * Reload is the exception, acting where it is: Updates does not list the page. A phone has no entry (decided): its page
 * picks up a new version the next time it is opened. Nothing opens by itself, and nothing waits for a call. Never the
 * voice's colour, which is the agents' waiting. */

/** Opens Settings › Updates on an update's place (UPDATE_PLACE): its row's action in view and focused. */
function useLandOn() {
  const store = useContext(RoomStoreContext);
  return (place: string) => openSettings({ section: "updates", focus: place }, store);
}

/** What the app's update says where it waits: ready, Restart to update; downloading, how far; available, its version. */
function appUpdateText(app: UpdaterStatus, t: HostTranslate) {
  const version = app.version ?? "";
  if (app.state === "ready") return version ? t("updates.restartToUpdateVersion", { version }) : t("updates.restartToUpdate");
  if (app.state === "downloading") return t("updates.downloadingPercent", { percent: app.progress == null ? ""
    : new Intl.NumberFormat(document.documentElement.lang || undefined, { style: "percent" }).format(Math.max(0, Math.min(1, app.progress))) });
  return version ? t("updates.available", { version }) : t("updates.availableOne");
}

/** A download or an install that failed, as the app says it; a failed check is Updates' to say. */
const appFailure = (app: UpdaterStatus | null) => app?.error && app.error.code !== "update-check-failed" ? app.error : null;

/** One update in the rail's list: what it is, and Open, which lands on it in Updates (Reload, for the page, reloads). */
function UpdateRow({ title, required, onOpen, reload, error, t }: { title: string; required?: boolean; onOpen: () => void; reload?: boolean; error?: unknown; t: HostTranslate }) {
  const titleId = useId();
  return (
    <li className="update-row">
      <span className="update-row-copy">
        <strong id={titleId}>{title}</strong>{required && <Badge tone="warning">{t("updates.required")}</Badge>}
      </span>
      {!!error && <ErrorText className="update-row-error" message={updaterFailure(error, { t })} />}
      <span className="update-row-actions">
        <Button size="sm" variant="primary" onClick={onOpen} aria-label={reload ? t("updates.reloadNamed") : t("settings.updates.see")} aria-describedby={reload ? undefined : titleId}>
          {reload ? t("updates.reload") : t("updates.open")}
        </Button>
      </span>
    </li>
  );
}

function MachineRow({ item, t }: { item: UpdateItem; t: HostTranslate }) {
  const land = useLandOn();
  const remote = useRoomStore((state) => item.machine ? state.machines.find((machine) => machine.pairingId === item.machine)?.host : null);
  // A remote machine with no name here is an unnamed one, never This computer.
  const title = t("updates.machine", { machine: item.machine ? remote || t("hosts.unnamed") : t("hosts.thisComputer") });
  return <UpdateRow title={title} required={item.required} onOpen={() => land(machineUpdatePlace(item))} t={t} />;
}

function UpdatesList({ items, app, t }: { items: UpdateItem[]; app: UpdaterStatus | null; t: HostTranslate }) {
  const land = useLandOn();
  return items.length || app ? <ul className="updates-list">
    {app && <UpdateRow title={appUpdateText(app, t)} error={appFailure(app)} onOpen={() => land(UPDATE_PLACE.app)} t={t} />}
    {items.map((item) => item.kind === "web"
      ? <UpdateRow key={item.id} title={t("updates.web")} required={item.required} reload onOpen={() => window.sidevoiceActions?.reloadToUpdate?.()} t={t} />
      : <MachineRow key={item.id} item={item} t={t} />)}</ul>
    : <p className="updates-none">{t("updates.none")}</p>;
}

/** The sidebar's foot: one quiet row, the most pressing update's words, landing on it in Updates — the app's first,
 *  then the page's (Reload, in place), then a machine's ("Updates available", on the first one's). One line, cut short,
 *  never wider than the sidebar; a download or an install that failed said under it. */
function UpdateLine({ items, app, t }: { items: UpdateItem[]; app: UpdaterStatus | null; t: HostTranslate }) {
  const land = useLandOn();
  const machine = items.find((item) => item.kind === "machine");
  const shown: [string, () => void] | null = app ? [appUpdateText(app, t), () => land(UPDATE_PLACE.app)]
    : items.some((item) => item.kind === "web") ? [t("updates.reloadToUpdate"), () => window.sidevoiceActions?.reloadToUpdate?.()]
      : machine ? [t("updates.availableAny"), () => land(machineUpdatePlace(machine))] : null;
  if (!shown) return null;
  const [text, open] = shown;
  const error = appFailure(app);
  return <div className="update-foot">
    <Button variant="ghost" tone="neutral" block className="update-line" title={text} onClick={open}>
      <UpdateIcon /><span className="update-line-text">{text}</span></Button>
    {!!error && <ErrorText className="update-line-error" role="alert" message={updaterFailure(error, { t })} />}
  </div>;
}

/** The entry: at the sidebar's foot, the one row; an icon button (the rail) with all of them behind it and their
 *  count. Hidden while nothing waits. */
export function UpdatesEntry({ compact = false }: { compact?: boolean }) {
  const t = hostTranslator();
  const { items, app } = useUpdates();
  if (!compact) return <UpdateLine items={items} app={app} t={t} />;
  const count = items.length + (app ? 1 : 0);
  const label = t("updates.entry", { n: count });
  const trigger = <Button variant="ghost" tone="neutral" size="icon" className="updates-entry updates-entry--icon" aria-label={label} title={label} aria-haspopup="dialog">
      <UpdateIcon size={20} /><span className="updates-count" aria-hidden="true">{count}</span></Button>;
  return <>
    {count > 0 && <Popover trigger={trigger} label={t("updates.title")} side="top" align="start">
      <div className="updates-panel">
        <h3>{t("updates.title")}</h3><UpdatesList items={items} app={app} t={t} />
      </div>
    </Popover>}
  </>;
}
