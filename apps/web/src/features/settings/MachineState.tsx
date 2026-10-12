import { Badge } from "../../components/ui/Badge";
import { NotEncryptedIcon } from "../../components/ui/Icons";
import { useVariant } from "../../lib/variants";
import { NewAtEnd } from "../highlights/highlights";
import type { HostTranslate } from "./host-i18n";
import type { MachineStatus } from "./machine-status";
import "./machine-state.css";

/* A machine's state as it shows, always in words (machine-status.ts words it), never a dot, never the accent: a word
 * in its tone under the machine's name (VARIANTS `machine-state` A, as the conversations and the agents list read), or
 * a pill in its tone (B, as the Providers' Connected). Its line is always there, so a change of state never moves the
 * entry. */

export function useMachineStateStyle() {
  return useVariant("machine-state", ["word", "pill"] as const);
}

/** `status` in its short form (lists, entries) or its long one (the machine's page). `live`: said as it changes. */
export function MachineState({ status, form = "short", live = false }: { status: MachineStatus; form?: "short" | "long"; live?: boolean }) {
  const style = useMachineStateStyle();
  const words = form === "long" ? status.long : status.short;
  const role = live ? "status" : undefined;
  return style === "pill"
    ? <Badge tone={status.tone} className="machine-state-pill" data-state={status.key} role={role}>{words}</Badge>
    : <span className="machine-state" data-tone={status.tone} data-state={status.key} role={role}>{words}</span>;
}

/** An entry's name for a screen reader: its name, its state in the words it shows, then not encrypted and new when
 *  they hold — the visible words inside it. */
export function machineEntryName(name: string, status: MachineStatus, isNew: boolean, t: HostTranslate) {
  return t("hosts.machineEntry", { name, state: status.short }) + (status.insecure ? t("hosts.machineEntry.insecure") : "")
    + (isNew ? t("highlights.navNew") : "");
}

/** An entry's tooltip (a mouse's; the page says it all): its whole name, its state at length, not encrypted. */
export function machineEntryTitle(name: string, status: MachineStatus, t: HostTranslate) {
  return [name, status.long, status.insecure ? t("hosts.notEncrypted") : ""].filter(Boolean).join(" · ");
}

/** An entry's words (a machine under Remote machines, This device): its name, cut short when long, the open lock after
 *  it when reached without encryption and "New" at its end (VARIANTS `new-mark` B); its state on a line of its own,
 *  never cut short. A phone's list puts them on one line. */
export function MachineEntryCopy({ name, status, isNew }: { name: string; status: MachineStatus; isNew: boolean }) {
  return (
    <span className="machine-entry-copy">
      <span className="machine-entry-line">
        <span className="machine-nav-name">{name}</span>
        {status.insecure && <span className="machine-nav-insecure" aria-hidden="true"><NotEncryptedIcon size={14} /></span>}
        <NewAtEnd isNew={isNew} />
      </span>
      <MachineState status={status} />
    </span>
  );
}
