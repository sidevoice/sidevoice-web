import { useRoomStore } from "../../state/room-store";
import type { MachineView } from "../../state/room-types";
import type { ReactNode } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Group, Row } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Snippet } from "../../components/ui/Snippet";
import { host } from "../../host";
import { useVariant } from "../../lib/variants";
import type { Translate } from "../../i18n/translator";
import { safeLocalHostStatusDetails } from "./local-host-status";
import "./service-version.css";

/* MOCKUP (sidevoice-desktop#67, not for merge). The Sidevoice service card, the same one on This device and on a remote
 * machine, with the service's version, its port and where it stands: four ways to place and word them (`serviceRow`: v1 to
 * v4), and, for a remote machine that does not answer, two ways to say so (`remoteOffline`: b1, b2). The app's own version is
 * a row of its own on This device (AppRow), never in the card.
 *
 * Decided: the app pins the service minor; this device's service updates itself to the latest patch of that minor,
 * never during a call; a service newer than the pinned minor is warned about; a remote machine out of date, or newer
 * than the app supports, gets a notice in the permissions notice's style (Alert), with the command that updates it.
 *
 * The fields read here that the real bridge does not report yet — `supported_minor` and `service_update` of the local
 * host's status — are the mock's own (playground preview/mock/bridge.mjs): provisional, not a contract. */

export const SERVICE_ROW = ["v1", "v2", "v3", "v4"] as const;
export const REMOTE_OFFLINE = ["b1", "b2"] as const;
export type ServiceLayout = typeof SERVICE_ROW[number];
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
export interface ServiceInfo { version: string | null; kind: ServiceKind; to?: string | null }

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
  return { version, kind, supported, to: update?.to ?? null };
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
const WORD = {
  current: "settings.updates.upToDate", updating: "service.status.updating", waiting: "service.status.waiting", behind: "service.status.behind", newer: "service.status.newer",
} as const;
const word = (info: ServiceInfo, t: Translate) => info.kind === "unknown" ? "" : t(WORD[info.kind], { to: info.to ?? "" });

/** The notice for a service out of date or newer than the app supports, in the permissions notice's own Alert; where
 *  there is a command that updates it, it comes under. `machine`: a remote machine's name (not this device). */
function ServiceNotice({ info, supported, machine, command, t }: { info: ServiceInfo; supported: string; machine?: string; command?: string; t: Translate }) {
  if ((info.kind !== "behind" && info.kind !== "newer") || !info.version) return null;
  const version = info.version;
  const copy = !machine ? { title: t("service.status.newer"), body: t("service.newerWhy", { version, supported }) }
    : info.kind === "behind" ? { title: t("service.remote.behind.title", { version }), body: t("service.remote.behind.body", { supported, machine }) }
    : { title: t("service.remote.newer.title", { version }), body: t("service.remote.newer.body", { supported, machine }) };
  return <div className="svc-notice">
    <Alert tone="warning" title={copy.title}>{copy.body}</Alert>
    {machine && info.kind === "behind" && command && <Snippet text={command} label={t("settings.updates.copyCommand", { machine })} />}
  </div>;
}

/** A key and its value, as a settings row says them: the key at the left, the value at the right. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="svc-kv"><dt>{label}</dt><dd>{children}</dd></div>;
}

/** The top of the service card, shared by This device's and a remote machine's: its title, and its version, port and where
 *  it stands, placed and worded as the layout says (v1 to v4), with the notice where there is one. `end`: the card's
 *  state at its right (This device's "En marcha", a remote machine's "Sin conexión"). `offline`: a machine that does not
 *  answer, which says that and, in b2, what it was last seen at, and nothing else. */
export function ServiceCardTop({ titleId, focusable = false, layout, info, port, end, machine, command, supported, offline = null, lastSeen = null, t }: {
  titleId: string; focusable?: boolean; layout: ServiceLayout; info: ServiceInfo; port: number | null; end: ReactNode; machine?: string; command?: string; supported: string;
  offline?: "b1" | "b2" | null; lastSeen?: string | null; t: Translate;
}) {
  const shown = !offline && info.kind !== "unknown";
  const status = shown ? word(info, t) : "";
  const listening = !offline && port ? port : null;
  const state = shown ? <span className="svc-word" data-kind={info.kind}>{status}</span> : null;
  return <>
    <div className="host-status-head">
      <span className="svc-title">
        <h4 id={titleId} tabIndex={focusable ? -1 : undefined}>{t("hosts.section.service")}</h4>
        {/* V3: the version as a small tag by the title, and where it stands as another. */}
        {layout === "v3" && shown && <span className="svc-tags"><Badge tag>{"v" + info.version}</Badge><Badge tag tone={TONE[info.kind]} dot>{status}</Badge></span>}
      </span>
      {end}
    </div>
    {/* V1: a quiet line under the title. V3: where it listens, as a quiet line. */}
    {layout === "v1" && shown && <p className="svc-meta"><span className="svc-version">{"v" + info.version}</span> · {state}</p>}
    {layout === "v3" && listening && <p className="svc-meta">{t("service.listens", { port: listening })}</p>}
    {/* V4: three facts side by side, each under its name. */}
    {layout === "v4" && (shown || listening) && <dl className="svc-strip">
      {shown && <div><dt>{t("service.field.version")}</dt><dd>{info.version}</dd></div>}
      {listening && <div><dt>{t("service.field.port")}</dt><dd>{listening}</dd></div>}
      {shown && <div><dt>{t("service.field.status")}</dt><dd>{state}</dd></div>}
    </dl>}
    {offline === "b2" && lastSeen && <p className="svc-meta">{t("service.lastSeen", { version: lastSeen })}</p>}
    {shown && info.kind === "updating" && <ProgressBar value={null} label={status} className="svc-bar" />}
    {/* V1: the port, a row with the card's other settings. V2: the version and the port, rows of their own. */}
    {layout === "v1" && listening && <dl className="svc-kvs"><Fact label={t("service.field.port")}>{listening}</Fact></dl>}
    {layout === "v2" && (shown || listening) && <dl className="svc-kvs">
      {shown && <Fact label={t("service.field.version")}>{info.version}{" · "}{state}</Fact>}
      {listening && <Fact label={t("service.field.port")}>{listening}</Fact>}
    </dl>}
    {shown && <ServiceNotice info={info} supported={supported} machine={machine} command={command} t={t} />}
  </>;
}

/** A remote machine that does not answer: its state at the card's right. */
export function OfflineState({ t }: { t: Translate }) {
  return <span className="host-status-state" role="status"><span className="host-status-dot" aria-hidden="true" />{t("service.offline")}</span>;
}

/** The app's own row, on This device only: its name and its version, in the look of any settings row. */
export function AppRow({ t }: { t: Translate }) {
  const version = host().identity.build?.version;
  if (!version) return null;
  return <Group><Row label={t("settings.updates.one")} description={t("settings.updates.version", { version })} /></Group>;
}
