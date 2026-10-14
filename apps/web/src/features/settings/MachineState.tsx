import type { ReactNode } from "react";
import { Badge } from "../../components/ui/Badge";
import { NewAtEnd } from "../highlights/highlights";
import type { Translate } from "../../i18n/translator";
import type { MachineStatus } from "./machine-status";
import "./machine-state.css";

/* A machine's state where it is listed (Settings' nav, a phone's list), quieter than words: a small green dot on the
 * machine's icon while it is connected, nothing otherwise — This device's too. What needs the person (Not paired; This
 * device Not working) is always said in words, in its tone: it is an action, not a status. The whole state is in each
 * entry's name (machineEntryName), its native tooltip, and on the machine's page, in words (MachineState). This
 * device's routine is never worded in the nav: its dot means connected, as any machine's. A dot is only ever green and
 * only ever means connected: never the accent (new, selected). A machine paired without encryption reads as any other:
 * nothing on a machine says how it was paired (the plain-http consent is asked once, when pairing). */

/** A state the person has something to do about: said in words wherever the machine is listed. */
const needsYou = (status: MachineStatus) => status.tone === "warning" || status.tone === "danger";
/** This device's own states (where the app reads its service), never worded in the nav but for Not working. */
const SERVICE = new Set(["unprepared", "starting", "failed", "stopped", "running"]);

/** `status` in words, in its tone: its short form (an entry's second line) or its long one (the machine's page). `live`:
 *  said as it changes. */
export function MachineState({ status, form = "short", live = false }: { status: MachineStatus; form?: "short" | "long"; live?: boolean }) {
  const words = form === "long" ? status.long : status.short;
  // Connected wears the models' "Ready" badge (green, with its dot); the rest are words in their tone, not connected muted.
  if (status.tone === "positive") return <Badge tone="positive" dot className="machine-state machine-state-badge" data-tone={status.tone} data-state={status.key}
    role={live ? "status" : undefined}>{words}</Badge>;
  return <span className="machine-state" data-tone={status.tone} data-state={status.key} role={live ? "status" : undefined}>{words}</span>;
}

/** An entry's state on the line under its name, only when it needs the person; else nothing (the line goes). */
export function MachineEntryState({ status }: { status: MachineStatus | null }) {
  return status && needsYou(status) ? <MachineState status={status} /> : null;
}

/** A machine's icon with the connected dot on its bottom corner while it is connected. */
export function StateOnIcon({ icon, status }: { icon: ReactNode; status: MachineStatus | null }) {
  return <span className="state-on-icon">{icon}
    {status?.tone === "positive" && <span className="state-on-icon-dot" data-state={status!.key} aria-hidden="true" />}
  </span>;
}

/** The word an entry's name says for `status`: This device running is connected, as its dot says; its other routine
 *  states are not said; anything else, its short form. */
function spokenState(status: MachineStatus | null, t: Translate) {
  if (!status) return null;
  if (status.key === "running") return t("hosts.machineState.direct");
  return SERVICE.has(status.key) && !needsYou(status) ? null : status.short;
}

/** An entry's name for a screen reader: its name, its state in words, then new when it holds. */
export function machineEntryName(name: string, status: MachineStatus | null, isNew: boolean | number, t: Translate) {
  const state = spokenState(status, t);
  return (state ? t("hosts.machineEntry", { name, state }) : name) + (isNew ? t("highlights.navNew") : "");
}

/** An entry's tooltip: its whole name and its state at length. */
export function machineEntryTitle(name: string, status: MachineStatus) {
  return [name, status.long].filter(Boolean).join(" · ");
}

/** An entry's words (a machine under Remote machines, This device): its name, cut short when long, and "New" at its end
 *  (VARIANTS `section-new` A, B); its state on a line of its own when it needs the person, never cut short. */
export function MachineEntryCopy({ name, status, isNew }: { name: string; status: MachineStatus | null; isNew: boolean | number }) {
  return (
    <span className="machine-entry-copy">
      <span className="machine-entry-line">
        <span className="machine-nav-name">{name}</span>
        <NewAtEnd isNew={isNew} />
      </span>
      <MachineEntryState status={status} />
    </span>
  );
}
