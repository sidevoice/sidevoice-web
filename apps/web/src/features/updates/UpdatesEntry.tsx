import { useContext, useId } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DownloadsIcon } from "../../components/ui/Icons";
import { Popover } from "../../components/ui/Popover";
import { useVariant } from "../../lib/variants";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import { appUpdater, updateLater, useUpdates, type UpdateItem } from "./useUpdates";
import "./updates.css";

/* The updates waiting, behind one quiet entry with their count: on a desktop at the conversations' foot, above
 * Settings, opening upward; on a phone where the preview's variant puts it (VARIANTS `updates-entry`): a button in the
 * header before the gear, or a row at the dropped conversations' foot with a dot on the chevron. Nothing opens by
 * itself and nothing moves during a call: Reload and Restart wait for it to end, saying so. Never the voice's colour,
 * which is the agents' waiting. */
export const UPDATES_ENTRY = ["header", "panel"] as const;
export function useUpdatesEntry() { return useVariant("updates-entry", UPDATES_ENTRY); }

function UpdateRow({ item, inCall, t }: { item: UpdateItem; inCall: boolean; t: HostTranslate }) {
  const why = useId();
  const machines = useRoomStore((state) => state.machines);
  const store = useContext(RoomStoreContext);
  const waits = inCall && item.kind !== "machine";
  const title = item.kind === "web" ? t("updates.web") : item.kind === "app" ? t("updates.app", { version: item.version }) : t("updates.machine", { machine: t("hosts.thisComputer") });
  const act = () => {
    if (item.kind === "web") window.sidevoiceActions?.reloadToUpdate?.();
    else if (item.kind === "app") void appUpdater()?.restart();
    else {
      // This computer's machine page, at its update.
      const local = machines.find((machine) => machine.local);
      window.sidevoiceActions?.showSettingsSection?.("machines");
      if (local) store?.patch({ machinesView: { machine: local.id } });
      document.getElementById("settings-open")?.click();
    }
  };
  return (
    <li className="update-row">
      <span className="update-row-copy">
        <strong>{title}</strong>{item.required && <Badge tone="warning">{t("updates.required")}</Badge>}
        {waits && <span className="update-row-note" id={why}>{t("updates.afterCall")}</span>}
      </span>
      <span className="update-row-actions">
        {!item.required && <Button variant="ghost" tone="neutral" size="sm" onClick={() => updateLater(item)}>{t("updates.later")}</Button>}
        <Button size="sm" variant="primary" disabled={waits} aria-describedby={waits ? why : undefined} onClick={act}
          aria-label={item.kind === "web" ? t("updates.reloadNamed") : item.kind === "app" ? t("updates.restartNamed") : t("updates.openNamed", { machine: t("hosts.thisComputer") })}>
          {item.kind === "web" ? t("updates.reload") : item.kind === "app" ? t("updates.restart") : t("updates.open")}
        </Button>
      </span>
    </li>
  );
}

function UpdatesList({ items, inCall, t }: { items: UpdateItem[]; inCall: boolean; t: HostTranslate }) {
  return items.length ? <ul className="updates-list">{items.map((item) => <UpdateRow key={item.id} item={item} inCall={inCall} t={t} />)}</ul>
    : <p className="updates-none">{t("updates.none")}</p>;
}

/** The entry: a row with its count (the sidebar's foot, a phone's panel), or an icon button (the rail, a phone's
 *  header). Hidden while nothing waits. */
export function UpdatesEntry({ compact = false, side = "top" }: { compact?: boolean; side?: "top" | "bottom" }) {
  const t = hostTranslator();
  const { items, inCall } = useUpdates();
  if (!items.length) return null;
  const label = t("updates.entry", { n: items.length });
  const trigger = compact
    ? <Button variant="ghost" tone="neutral" size="icon" className="updates-entry updates-entry--icon" aria-label={label} title={label} aria-haspopup="dialog">
      <DownloadsIcon size={20} /><span className="updates-count" aria-hidden="true">{items.length}</span></Button>
    : <Button variant="ghost" tone="neutral" block className="updates-entry" aria-label={label} aria-haspopup="dialog">
      <DownloadsIcon size={18} /><span>{t("updates.title")}</span><Badge tone="accent" className="updates-badge">{items.length}</Badge></Button>;
  return <Popover trigger={trigger} label={t("updates.title")} side={side} align="start">
    <div className="updates-panel"><h3>{t("updates.title")}</h3><UpdatesList items={items} inCall={inCall} t={t} /></div>
  </Popover>;
}

/** Whether something waits: a phone's chevron wears a dot for it where the updates live in its panel. */
export function useUpdatesWaiting() { return useUpdates().items.length > 0; }
