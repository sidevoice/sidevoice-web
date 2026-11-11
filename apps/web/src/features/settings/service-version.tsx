import { useRoomStore } from "../../state/room-store";
import type { MachineView } from "../../state/room-types";
import type { ReactNode } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { WarningIcon } from "../../components/ui/Icons";
import { Group } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Snippet } from "../../components/ui/Snippet";
import { host } from "../../host";
import { useVariant } from "../../lib/variants";
import type { Translate } from "../../i18n/translator";
import { safeLocalHostStatusDetails } from "./local-host-status";
import "./service-version.css";

/* MOCKUP (sidevoice-desktop#67, not for merge). The Sidevoice service card, the same one on This device and on a remote
 * machine: its running state always at the top right, under the title two columns — Version, with a badge that says
 * where it stands, and Port — then, where it is needed, the notice (Alert) with the command that updates it inside. The
 * app's own version is a row of its own on This device (AppRow), never in the card. For a remote machine that does not
 * answer, two ways to say so (\`remoteOffline\`: b1, b2).
 *
 * Decided: the app pins the service minor; this device's service updates itself to the latest patch of that minor,
 * never during a call; a service newer than the pinned minor is warned about; a remote machine out of date, or newer
 * than the app supports, gets a notice in the permissions notice's style (Alert), with the command that updates it.
 *
 * The fields read here that the real bridge does not report yet — \`supported_minor\` and \`service_update\` of the local
 * host's status — are the mock's own (playground preview/mock/bridge.mjs): provisional, not a contract. */

export const REMOTE_OFFLINE = ["b1", "b2"] as const;
/** MOCK: where the port sits in the card's two columns: a, in the second column; b, at the card's far right edge. */
export const PORT_ALIGN = ["a", "b"] as const;
export type RemoteOffline = typeof REMOTE_OFFLINE[number];

const minorOf = (version: string | null | undefined): [number, number] | null => {
  const match = /^(\d+)\.(\d+)/.exec(version ?? "");
  return match ? [Number(match[1]), Number(match[2])] : null;
};
const compareMinor = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1];

/** The service minor this app pins, where the mock says none (a browser has no local host). */
const PINNED = "0.19";
/** MOCK: what a machine was last seen running, for a machine that is not answering (the app would keep it per pairing). */
const LAST_SEEN: Record<string, string> = { daimon: "0.16.0", "NUC del salón": "0.20.0", "Mac mini": "0.19.2", "Portátil viejo": "0.19.1" };

export type ServiceKind = "current" | "updating" | "waiting" | "behind" | "newer" | "unknown";
export interface ServiceInfo { version: string | null; kind: ServiceKind }

/** This device's service: its version, and whether it is up to date, updating, waiting for a call to end, or newer than
 *  the minor the app supports. */
export function useLocalService(): ServiceInfo & { supported: string } {
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const raw = status as unknown as { supported_minor?: string | null; service_update?: { state?: string; to?: string | null } | null };
  const version = safeLocalHostStatusDetails(status).product_version ?? null;
  const supported = raw.supported_minor || PINNED;
  const mine = minorOf(version), pinned = minorOf(supported);
  const newer = !!mine && !!pinned && compareMinor(mine, pinned) > 0;
  const update = raw.service_update;
  const kind: ServiceKind = !version ? "unknown" : newer ? "newer" : update?.state === "updating" ? "updating" : update?.state === "waiting-for-call" ? "waiting" : "current";
  return { version, kind, supported };
}

/** A remote machine's service against what the app supports: out of date, newer, up to date, or not said; and what it
 *  was last seen at when it does not answer. */
export function useRemoteService(machine: MachineView): ServiceInfo & { supported: string; command: string; lastSeen: string | null } {
  const info = useRoomStore((state) => machine.pairingId ? state.facts.remoteHostStatus?.[machine.pairingId] : undefined);
  const local = useRoomStore((state) => state.facts.localHostStatus) as unknown as { supported_minor?: string | null };
  const supported = local.supported_minor || PINNED;
  const mine = minorOf(info?.version), pinned = minorOf(supported);
  const kind: ServiceKind = !mine || !pinned ? "unknown" : compareMinor(mine, pinned) > 0 ? "newer" : compareMinor(mine, pinned) < 0 || info?.update ? "behind" : "current";
  return { version: info?.version ?? null, kind, supported, command: info?.update?.command?.trim() || `npx sidevoice@${supported} install`,
    lastSeen: info?.version ?? LAST_SEEN[machine.host] ?? null };
}

/** MOCK: how a remote machine that does not answer says so (b1, or b2 with what it was last seen at). */
export function useMockOffline(): RemoteOffline { return useVariant<RemoteOffline>("remoteOffline", REMOTE_OFFLINE); }

const TONE: Record<ServiceKind, BadgeTone> = { current: "positive", updating: "accent", waiting: "neutral", behind: "warning", newer: "warning", unknown: "neutral" };
const BADGE = {
  current: "settings.updates.upToDate", updating: "service.badge.updating", waiting: "service.badge.waiting", behind: "service.badge.behind", newer: "service.badge.newer",
} as const;

/** The words of the notice for a service out of date or newer than the app supports, and the command that updates it where
 *  there is one. `machine`: a remote machine's name (not this device). */
export function noticeOf(info: ServiceInfo, supported: string, machine: string | undefined, command: string | undefined, t: Translate) {
  if ((info.kind !== "behind" && info.kind !== "newer") || !info.version) return null;
  const version = info.version;
  const copy = !machine ? { title: t("service.status.newer"), body: t("service.newerWhy", { version, supported }) }
    : info.kind === "behind" ? { title: t("service.remote.behind.title", { version }), body: t("service.remote.behind.body", { supported, machine }) }
    : { title: t("service.remote.newer.title", { version }), body: t("service.remote.newer.body", { supported, machine }) };
  return { ...copy, command: machine && info.kind === "behind" && command ? command : null, machine: machine ?? "" };
}

/** The notice, in the permissions notice's own Alert; the command that updates it, inside the Alert, to copy. */
export function ServiceNotice({ info, supported, machine, command, t }: { info: ServiceInfo; supported: string; machine?: string; command?: string; t: Translate }) {
  const notice = noticeOf(info, supported, machine, command, t);
  if (!notice) return null;
  return <Alert tone="warning" title={notice.title}
    footer={notice.command ? <Snippet text={notice.command} label={t("settings.updates.copyCommand", { machine: notice.machine })} /> : undefined}>{notice.body}</Alert>;
}

/** The same words, quiet: a line with its icon, the command under it (the compact updates list). */
export function ServiceHint({ info, supported, machine, command, t }: { info: ServiceInfo; supported: string; machine?: string; command?: string; t: Translate }) {
  const notice = noticeOf(info, supported, machine, command, t);
  if (!notice) return null;
  return <div className="svc-hint">
    <p><WarningIcon size={16} className="svc-hint-icon" /><span><strong>{notice.title}.</strong> {notice.body}</span></p>
    {notice.command && <Snippet text={notice.command} label={t("settings.updates.copyCommand", { machine: notice.machine })} />}
  </div>;
}

/** Where a service stands, as the badge that follows its version wherever it is said. */
export function ServiceBadge({ kind, t }: { kind: Exclude<ServiceKind, "unknown">; t: Translate }) {
  return <Badge tone={TONE[kind]} dot className="svc-badge">{t(BADGE[kind])}</Badge>;
}

/** The top of the service card, shared by This device's and a remote machine's: its title, with the running state at the
 *  right (\`end\`: This device's or a remote machine's "En marcha", a machine's "Sin conexión"); under it two columns, the
 *  version with its badge and the port; the progress bar while it updates; the notice where there is one. \`offline\`: a
 *  machine that does not answer, which says that and, in b2, what it was last seen at, and nothing else. */
export function ServiceCardTop({ titleId, focusable = false, info, port, end, machine, command, supported, offline = null, lastSeen = null, t }: {
  titleId: string; focusable?: boolean; info: ServiceInfo; port: number | null; end: ReactNode; machine?: string; command?: string; supported: string;
  offline?: "b1" | "b2" | null; lastSeen?: string | null; t: Translate;
}) {
  const kind = !offline && info.kind !== "unknown" ? info.kind : null;
  const shown = kind !== null;
  const align = useVariant<typeof PORT_ALIGN[number]>("portAlign", PORT_ALIGN);
  const listening = !offline && port ? port : null;
  return <>
    <div className="host-status-head">
      <h4 id={titleId} tabIndex={focusable ? -1 : undefined}>{t("hosts.section.service")}</h4>
      {end}
    </div>
    {(shown || listening) && <dl className="svc-strip" data-port={align}>
      {kind && <div><dt>{t("service.field.version")}</dt><dd><span className="svc-number">{info.version}</span><ServiceBadge kind={kind} t={t} /></dd></div>}
      {listening && <div data-fact="port"><dt>{t("service.field.port")}</dt><dd><span className="svc-number">{listening}</span></dd></div>}
    </dl>}
    {offline === "b2" && lastSeen && <p className="svc-meta">{t("service.lastSeen", { version: lastSeen })}</p>}
    {shown && info.kind === "updating" && <ProgressBar value={null} label={t(BADGE.updating)} className="svc-bar" />}
    {shown && <ServiceNotice info={info} supported={supported} machine={machine} command={command} t={t} />}
  </>;
}

/** The card's state at its right: a machine's service running (This device's has its own words), with its dot. */
export function RunningState({ t }: { t: Translate }) {
  return <span className="host-status-state" role="status"><span className="host-status-dot" aria-hidden="true" />{t("hosts.machineState.running")}</span>;
}

/** A remote machine that does not answer: its state at the card's right. */
export function OfflineState({ t }: { t: Translate }) {
  return <span className="host-status-state" role="status"><span className="host-status-dot" aria-hidden="true" />{t("service.offline")}</span>;
}

/** The app's icon, the one the app has. */
export function AppIcon({ size = 40 }: { size?: number }) {
  return <img className="svc-app-icon" src={`${import.meta.env.BASE_URL}apple-touch-icon.png`} alt="" width={size} height={size} style={{ width: size, height: size }} />;
}

/** The app's own row, on This device only: its icon, its name and its version, in the look of any settings row. */
export function AppRow({ t }: { t: Translate }) {
  const version = host().identity.build?.version;
  if (!version) return null;
  return <Group>
    <div className="ui-row svc-app-row">
      <AppIcon />
      <div className="ui-row-text">
        <span className="ui-row-label">{t("settings.updates.one")}</span>
        <p className="ui-row-description">{t("settings.updates.version", { version })}</p>
      </div>
    </div>
  </Group>;
}
