import type { ReactNode } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { CheckIcon, RefreshIcon, UpdateIcon, WarningIcon } from "../../components/ui/Icons";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Snippet } from "../../components/ui/Snippet";
import { useVariant } from "../../lib/variants";
import { useRoomStore } from "../../state/room-store";
import type { MachineView } from "../../state/room-types";
import type { Translate } from "../../i18n/translator";
import { safeLocalHostStatusDetails } from "./local-host-status";
import "./service-version.css";

/* MOCKUP (sidevoice-desktop#67, not for merge): the Sidevoice service's version and where it stands, on This device (A)
 * and on a remote machine's page (B), in the alternatives the playground preview's VARIANTS panel picks between
 * (`serviceRow`, `remoteVersion`). Decided: the app pins the service minor; this device's service updates itself to the
 * latest patch of that minor, never during a call; a service newer than the pinned minor is warned about; a remote
 * machine out of date, or newer than the app supports, gets a notice in the permissions notice's style.
 *
 * The fields this reads that the real bridge does not report yet — `supported_minor` and `service_update` of the local
 * host's status — are the mock's own (playground preview/mock/bridge.mjs): provisional, not a contract. */

export const SERVICE_ROW = ["today", "a1", "a2", "a3"] as const;
export const REMOTE_VERSION = ["today", "b1", "b2", "b3"] as const;
export type ServiceRowVariant = typeof SERVICE_ROW[number];
export type RemoteVersionVariant = typeof REMOTE_VERSION[number];

const minorOf = (version: string | null | undefined): [number, number] | null => {
  const match = /^(\d+)\.(\d+)/.exec(version ?? "");
  return match ? [Number(match[1]), Number(match[2])] : null;
};
const compareMinor = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1];

/** The service minor this app pins, where the mock says none (a browser has no local host). */
const PINNED = "0.19";

export type ServiceState = "current" | "updating" | "waiting" | "newer";

/** This device's service: its version, the minor the app supports, and where it stands. */
export function useServiceFacts() {
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const raw = status as unknown as { supported_minor?: string | null; service_update?: { state?: string; to?: string | null } | null };
  const version = safeLocalHostStatusDetails(status).product_version ?? null;
  const supported = raw.supported_minor || PINNED;
  const mine = minorOf(version), pinned = minorOf(supported);
  const newer = !!mine && !!pinned && compareMinor(mine, pinned) > 0;
  const update = raw.service_update;
  const state: ServiceState = newer ? "newer" : update?.state === "updating" ? "updating" : update?.state === "waiting-for-call" ? "waiting" : "current";
  return { version, supported, state, to: update?.to ?? null };
}

/** A remote machine's service against what the app supports: out of date, newer, up to date, or not said. */
export function useRemoteFacts(machine: MachineView) {
  const info = useRoomStore((state) => machine.pairingId ? state.facts.remoteHostStatus?.[machine.pairingId] : undefined);
  const local = useRoomStore((state) => state.facts.localHostStatus) as unknown as { supported_minor?: string | null };
  const supported = local.supported_minor || PINNED;
  const mine = minorOf(info?.version), pinned = minorOf(supported);
  const kind: "behind" | "newer" | "current" | "unknown" = !mine || !pinned ? "unknown"
    : compareMinor(mine, pinned) > 0 ? "newer" : compareMinor(mine, pinned) < 0 || info?.update ? "behind" : "current";
  return { version: info?.version ?? null, supported, kind, command: info?.update?.command?.trim() || `npx sidevoice@${supported} install` };
}

const TONE: Record<ServiceState, BadgeTone> = { current: "positive", updating: "accent", waiting: "neutral", newer: "warning" };
const BADGE = { current: "service.badge.current", updating: "service.badge.updating", waiting: "service.badge.waiting", newer: "service.badge.newer" } as const;
const LINE = { current: "settings.updates.upToDate", updating: "service.line.updating", waiting: "service.line.waiting", newer: "service.line.newer" } as const;

function Glyph({ state }: { state: ServiceState }) {
  const icon = state === "current" ? <CheckIcon size={16} /> : state === "updating" ? <RefreshIcon size={16} /> : state === "waiting" ? <UpdateIcon size={16} /> : <WarningIcon size={16} />;
  return <span className="svc-glyph" data-state={state} aria-hidden="true">{icon}</span>;
}

/** The sentence that says where the service stands (A1's line, A3's state). */
function stateLine(facts: ReturnType<typeof useServiceFacts>, t: Translate) {
  return t(LINE[facts.state], { to: facts.to ?? "" });
}

/** A1: the card keeps its shape; the version line says the state, and what needs more than a word comes under it. */
export function ServiceFactsA1({ t }: { t: Translate }) {
  const facts = useServiceFacts();
  if (!facts.version) return null;
  const word = facts.state === "current" ? t("settings.updates.upToDate") : facts.state === "updating" || facts.state === "waiting" ? stateLine(facts, t) : null;
  return <>
    <div className="host-status-product svc-a1-line" data-state={facts.state}>
      {t("settings.updates.version", { version: facts.version })}
      {word && <span className="svc-a1-word">{" · "}{word}</span>}
    </div>
    {facts.state === "updating" && <div className="svc-extra"><ProgressBar value={null} label={stateLine(facts, t)} className="svc-bar" /></div>}
    {facts.state === "newer" && <div className="svc-extra"><Alert tone="warning" title={t("service.line.newer")}>{t("service.newerWhy", { version: facts.version, supported: facts.supported })}</Alert></div>}
  </>;
}

/** A2: one settings row, in the look of every other row: the name and its version at the left, the state's badge at the
 *  right (the card's other rows follow in the same group). */
export function ServiceRowA2({ t }: { t: Translate }) {
  const facts = useServiceFacts();
  if (!facts.version) return null;
  const description = facts.state === "updating" ? t("service.line.updating", { to: facts.to ?? "" })
    : facts.state === "waiting" ? t("service.line.waiting", { to: facts.to ?? "" })
    : t("settings.updates.version", { version: facts.version });
  return <>
    <div className="ui-row svc-a2-row">
      <div className="ui-row-text">
        <span className="ui-row-label">{t("hosts.section.service")}</span>
        <p className="ui-row-description">{[t("settings.updates.version", { version: facts.version }), facts.state === "current" ? null : description === t("settings.updates.version", { version: facts.version }) ? null : description].filter(Boolean).join(" · ")}</p>
        {facts.state === "updating" && <ProgressBar value={null} label={description} className="svc-bar" />}
      </div>
      <div className="ui-row-control"><Badge tone={TONE[facts.state]} dot>{t(BADGE[facts.state])}</Badge></div>
    </div>
    {facts.state === "newer" && <div className="svc-a2-notice"><Alert tone="warning" title={t("service.line.newer")}>{t("service.newerWhy", { version: facts.version, supported: facts.supported })}</Alert></div>}
  </>;
}

/** A3: the version first and large, then where it stands as a line with its icon, and what the app pins. */
export function ServiceFactsA3({ t }: { t: Translate }) {
  const facts = useServiceFacts();
  if (!facts.version) return null;
  return <div className="svc-a3">
    <div className="svc-a3-version"><span className="svc-a3-number">{facts.version}</span></div>
    <div className="svc-a3-state" data-state={facts.state}><Glyph state={facts.state} /><span>{stateLine(facts, t)}</span></div>
    {facts.state === "updating" && <ProgressBar value={null} label={stateLine(facts, t)} className="svc-bar" />}
    {facts.state === "newer"
      ? <Alert tone="warning" title={t("service.line.newer")}>{t("service.newerWhy", { version: facts.version, supported: facts.supported })}</Alert>
      : <p className="muted svc-a3-policy">{t("service.policy", { supported: facts.supported })}</p>}
  </div>;
}

/** The copy of a remote machine's notice, by what it is. */
function noticeCopy(kind: "behind" | "newer", version: string, supported: string, machine: string, t: Translate) {
  return kind === "behind"
    ? { title: t("service.remote.behind.title", { version }), body: t("service.remote.behind.body", { supported, machine }) }
    : { title: t("service.remote.newer.title", { version }), body: t("service.remote.newer.body", { supported, machine }) };
}

/** The notice in the permissions notice's own component (Alert, warning), the command under it where there is one. */
export function RemoteNotice({ machine, name, t, flat = false }: { machine: MachineView; name: string; t: Translate; flat?: boolean }) {
  const facts = useRemoteFacts(machine);
  if ((facts.kind !== "behind" && facts.kind !== "newer") || !facts.version) return null;
  const copy = noticeCopy(facts.kind, facts.version, facts.supported, name, t);
  return <div className="svc-notice" data-flat={flat || undefined}>
    <Alert tone="warning" title={copy.title}>{copy.body}</Alert>
    {facts.kind === "behind" && <Snippet text={facts.command} label={t("settings.updates.copyCommand", { machine: name })} />}
  </div>;
}

/** B3's quiet form: no box, the same words in the card as a state line with its command. */
export function RemoteLine({ machine, name, t }: { machine: MachineView; name: string; t: Translate }) {
  const facts = useRemoteFacts(machine);
  if ((facts.kind !== "behind" && facts.kind !== "newer") || !facts.version) return null;
  const copy = noticeCopy(facts.kind, facts.version, facts.supported, name, t);
  return <div className="svc-remote-line">
    <p className="svc-remote-line-text"><WarningIcon size={16} className="svc-remote-line-icon" /><span><strong>{copy.title}.</strong> {copy.body}</span></p>
    {facts.kind === "behind" && <Snippet text={facts.command} label={t("settings.updates.copyCommand", { machine: name })} />}
  </div>;
}

/** A remote machine's state badge at its card's head (B3), and under its name in the list: only what is not routine. */
export function RemoteBadge({ machine, t, always = false }: { machine: MachineView; t: Translate; always?: boolean }): ReactNode {
  const facts = useRemoteFacts(machine);
  if (facts.kind === "unknown") return null;
  if (facts.kind === "current") return always ? <Badge tone="positive" dot>{t("settings.updates.upToDate")}</Badge> : null;
  return <Badge tone="warning" dot>{t(facts.kind === "behind" ? "service.remote.badge.behind" : "service.remote.badge.newer")}</Badge>;
}

/** The words for a list entry's second line (B3): the badge's, said as the entry's state is. */
export function RemoteEntryState({ machine, t }: { machine: MachineView; t: Translate }) {
  const variant = useVariant<RemoteVersionVariant>("remoteVersion", REMOTE_VERSION);
  const facts = useRemoteFacts(machine);
  if (variant !== "b3" || (facts.kind !== "behind" && facts.kind !== "newer")) return null;
  return <span className="machine-state svc-entry-state" data-tone="warning">{t(facts.kind === "behind" ? "service.remote.badge.behind" : "service.remote.badge.newer")}</span>;
}
