import type { ReactElement, ReactNode } from "react";
import { NotEncryptedIcon } from "../../components/ui/Icons";
import { Tooltip } from "../../components/ui/Tooltip";
import { useVariant } from "../../lib/variants";
import { NewAtEnd } from "../highlights/highlights";
import type { HostTranslate } from "./host-i18n";
import type { MachineStatus } from "./machine-status";
import "./machine-state.css";

/* A machine's state where it is listed (Settings' nav, a phone's list), quieter than words: VARIANTS `machine-state` —
 * a small green dot on the machine's icon while it is connected, nothing otherwise (A); the same dot, and the state in
 * a tooltip on hover and on keyboard focus (B); no dot, and a short word under the name only while it is not connected
 * (C). Under all three, what needs the person (Not paired; This device Not working) is always said in words, in its
 * tone: it is an action, not a status. A state still being found (Checking…, Starting…) shows nothing, so an entry does
 * not grow and shrink as Settings opens. The whole state is in each entry's name (machineEntryName) and on the
 * machine's page, in words (MachineState). This device's routine is never worded in the nav — its dot means connected,
 * as any machine's — and VARIANTS `machine-state-this-device` hides even that (only Not working stays). A dot is only
 * ever green and only ever means connected: never the accent (new, selected). */

export type MachineStateStyle = "dot" | "dot-tip" | "word-off";

export function useMachineStateStyle(): MachineStateStyle {
  return useVariant("machine-state", ["dot", "dot-tip", "word-off"] as const);
}

/** Whether This device's entry shows its state at all (VARIANTS `machine-state-this-device`); hidden, it says only what
 *  needs the person. */
export function useThisDeviceState(): "show" | "hide" {
  return useVariant("machine-state-this-device", ["show", "hide"] as const);
}

/** What This device's entry is told of its state: the state, shown; hidden, only what needs the person, else none. */
export function useThisDeviceEntryStatus(status: MachineStatus): MachineStatus | null {
  return useThisDeviceState() === "show" || needsYou(status) ? status : null;
}

/** A state the person has something to do about: said in words wherever the machine is listed. */
const needsYou = (status: MachineStatus) => status.tone === "warning" || status.tone === "danger";
/** This device's own states (where the app reads its service), never worded in the nav but for Not working. */
const SERVICE = new Set(["unprepared", "starting", "failed", "stopped", "running"]);
/** States still being found: nothing shows until they settle. */
const PASSING = new Set(["checking", "starting"]);

/** Whether an entry's icon wears the connected dot. */
function wearsDot(status: MachineStatus | null, style: MachineStateStyle) {
  return !!status && style !== "word-off" && status.tone === "positive";
}

/** Whether an entry says its state in words, on the line under its name. */
function saysWord(status: MachineStatus | null, style: MachineStateStyle) {
  if (!status) return false;
  if (needsYou(status)) return true;
  return style === "word-off" && status.tone !== "positive" && !PASSING.has(status.key) && !SERVICE.has(status.key);
}

/** `status` in words, in its tone: its short form (an entry's second line) or its long one (the machine's page). `live`:
 *  said as it changes. */
export function MachineState({ status, form = "short", live = false }: { status: MachineStatus; form?: "short" | "long"; live?: boolean }) {
  return <span className="machine-state" data-tone={status.tone} data-state={status.key} role={live ? "status" : undefined}>
    {form === "long" ? status.long : status.short}
  </span>;
}

/** An entry's state on the line under its name, where the variant says it in words; else nothing (the line goes). */
export function MachineEntryState({ status }: { status: MachineStatus | null }) {
  const style = useMachineStateStyle();
  return status && saysWord(status, style) ? <MachineState status={status} /> : null;
}

/** A machine's icon with the connected dot on its bottom corner, where the variant has one. */
export function StateOnIcon({ icon, status }: { icon: ReactNode; status: MachineStatus | null }) {
  const style = useMachineStateStyle();
  return <span className="state-on-icon">{icon}
    {wearsDot(status, style) && <span className="state-on-icon-dot" data-state={status!.key} aria-hidden="true" />}
  </span>;
}

/** The word an entry's name says for `status`: This device running is connected, as its dot says; its other routine
 *  states are not said; anything else, its short form. */
function spokenState(status: MachineStatus | null, t: HostTranslate) {
  if (!status) return null;
  if (status.key === "running") return t("hosts.machineState.direct");
  return SERVICE.has(status.key) && !needsYou(status) ? null : status.short;
}

/** An entry's name for a screen reader: its name, its state in words, then not encrypted and new when they hold. */
export function machineEntryName(name: string, status: MachineStatus | null, isNew: boolean | number, t: HostTranslate) {
  const state = spokenState(status, t);
  return (state ? t("hosts.machineEntry", { name, state }) : name) + (status?.insecure ? t("hosts.machineEntry.insecure") : "")
    + (isNew ? t("highlights.navNew") : "");
}

/** An entry's tooltip: its whole name, its state at length, not encrypted. */
export function machineEntryTitle(name: string, status: MachineStatus, t: HostTranslate) {
  return [name, status.long, status.insecure ? t("hosts.notEncrypted") : ""].filter(Boolean).join(" · ");
}

/** A remote machine's entry with its tooltip: the native one (A, C: a mouse's, as `title`), or the app's on hover and on
 *  keyboard focus (B). `children` is the entry, given its native tooltip in `title` when it has one. */
export function MachineEntryTip({ name, status, t, children }: { name: string; status: MachineStatus; t: HostTranslate; children: (title?: string) => ReactElement }) {
  const style = useMachineStateStyle();
  const title = machineEntryTitle(name, status, t);
  return style === "dot-tip" ? <Tooltip content={title}>{children()}</Tooltip> : children(title);
}

/** An entry's words (a machine under Remote machines, This device): its name, cut short when long, the open lock after
 *  it when reached without encryption and "New" at its end (VARIANTS `section-new` A, B); its state on a line of its own
 *  where the variant says it in words, never cut short. */
export function MachineEntryCopy({ name, status, isNew }: { name: string; status: MachineStatus | null; isNew: boolean | number }) {
  return (
    <span className="machine-entry-copy">
      <span className="machine-entry-line">
        <span className="machine-nav-name">{name}</span>
        {status?.insecure && <span className="machine-nav-insecure" aria-hidden="true"><NotEncryptedIcon size={14} /></span>}
        <NewAtEnd isNew={isNew} />
      </span>
      <MachineEntryState status={status} />
    </span>
  );
}
