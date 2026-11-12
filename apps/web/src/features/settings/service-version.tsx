import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { CloseIcon } from "../../components/ui/Icons";
import { Group } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Snippet } from "../../components/ui/Snippet";
import { host } from "../../host";
import type { Translate } from "../../i18n/translator";
import { listeningPort } from "../../services/device-pairing.js";
import { getReport, refresh, subscribe } from "../../services/local-service";
import { dismissedNotices, dismissNotice, isDismissed, lastSeenVersion, localKind, PINNED_MINOR, remoteKind, subscribeNotices, type ServiceInfo, type ServiceKind } from "../../services/service-version";
import { useRoomStore } from "../../state/room-store";
import type { MachineView } from "../../state/room-types";
import { safeLocalHostStatusDetails, safeProductVersion } from "./local-host-status";
import "./service-version.css";

/* The Sidevoice service card, the same one on This device and on a remote machine: its running state always at the top
 * right; under the title two columns — Version, with a badge that says where it stands, and Port — then, where it is
 * needed, the notice (an Alert) with the command that updates it inside. The app's own version is a row of its own on This
 * device (AppRow), never in the card. A remote machine that does not answer is the same card with what was last known of
 * it and nothing else.
 *
 * The app pins the service minor (services/service-version.ts): this device's service updates itself to the latest patch
 * of that minor, never during a call, and one newer than the pin is warned about and never touched; a remote machine out
 * of date, or newer than the app supports, gets a notice with the command that brings it to the pinned minor. It is not
 * updated from here. */

/** This device's service: its version, where the app says it stands (`version()`: up to date, out of date and updating on
 *  its own, waiting for a call to end, newer than the pinned minor), how far along an update is, whether its core speaks an
 *  API this app cannot use, and the port the service itself listens on (its core's — never the app's proxy's, which is
 *  another each launch). Said by nothing, no badge: a browser, an app with no `version()`. */
export function useLocalService(): ServiceInfo & { progress: number | null; incompatible: boolean; api: number | null; port: number | null } {
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const bridge = host().localHost;
  const report = useSyncExternalStore(subscribe, () => getReport(bridge), () => null);
  // The service changed (restarted, a new core): asked again, not waited for.
  const key = [status.state, status.core?.version, status.core?.api].join("|");
  const was = useRef(key);
  useEffect(() => { if (was.current !== key) { was.current = key; void refresh(); } }, [key]);
  const details = safeLocalHostStatusDetails(status);
  // The version the app reports with the standing it judges (one answer, one moment), else the status's own.
  const version = safeProductVersion(report?.installed?.version) ?? details.product_version ?? null;
  const kind = version ? localKind(report?.update) : "unknown";
  const progress = kind === "updating" && typeof report?.progress === "number" ? Math.max(0, Math.min(1, report.progress)) : null;
  return { version, kind, progress, incompatible: report?.update === "incompatible", api: typeof report?.core_api === "number" ? report.core_api : null,
    port: details.core?.port ?? null };
}

/** A remote machine's service against the pinned minor. `version`: what it says now; `shown`: that, else what it was last
 *  seen running (it may not answer). `offline`: it is not connected, nor being checked. */
export function useRemoteService(machine: MachineView): ServiceInfo & { shown: string | null; port: number | null; command: string; offline: boolean } {
  const info = useRoomStore((state) => machine.pairingId ? state.facts.remoteHostStatus?.[machine.pairingId] : undefined);
  // The newest patch of the pinned minor, where this device's own service knows it.
  const bridge = host().localHost;
  const latest = useSyncExternalStore(subscribe, () => getReport(bridge)?.latest ?? null, () => null);
  const version = info?.version ?? null;
  return {
    version, kind: remoteKind(version, latest), shown: version ?? lastSeenVersion(machine.pairingId), port: listeningPort(machine.urls),
    command: `npx sidevoice@${PINNED_MINOR} install`, offline: machine.state !== "connected" && machine.state !== "checking",
  };
}

const TONE: Record<ServiceKind, BadgeTone> = { current: "positive", updating: "accent", waiting: "neutral", behind: "warning", newer: "warning", unknown: "neutral" };
const BADGE = {
  current: "settings.updates.upToDate", updating: "service.badge.updating", waiting: "service.badge.waiting", behind: "service.badge.behind", newer: "service.badge.newer",
} as const;

/** The words of the notice for a service out of date or newer than the app supports, and the command that updates it where
 *  there is one. `machine`: a remote machine's name; none, this device's. */
function noticeOf(info: ServiceInfo, machine: string | undefined, command: string | undefined, t: Translate) {
  if ((info.kind !== "behind" && info.kind !== "newer") || !info.version) return null;
  const version = info.version, supported = PINNED_MINOR;
  // This device's out of date is updated by itself: no notice. Newer is warned about, as a remote one is.
  if (!machine) return info.kind === "newer" ? { title: t("service.status.newer"), body: t("service.newerWhy", { version, supported }), command: null, machine: "" } : null;
  const copy = info.kind === "behind" ? { title: t("service.remote.behind.title", { version }), body: t("service.remote.behind.body", { supported, machine }) }
    : { title: t("service.remote.newer.title", { version }), body: t("service.remote.newer.body", { supported, machine }) };
  return { ...copy, command: info.kind === "behind" && command ? command : null, machine };
}

/** Whether `who`'s notice for this version is closed: only one that can be (newer than supported) ever is. */
function useDismissal(who: string, info: ServiceInfo) {
  const raw = useSyncExternalStore(subscribeNotices, dismissedNotices, () => "[]");
  const closable = info.kind === "newer";
  return { closable, dismissed: closable && isDismissed(raw, who, info.version), dismiss: () => dismissNotice(who, info.version) };
}

/** The notice, in the permissions notice's own Alert, the command that updates it inside to copy. Out of date cannot be
 *  closed; newer than supported can (×, named for the notice it closes), and stays closed for that version of that machine.
 *  `who`: whose service it is, for that. `onClosed`: told as it is closed, while focus is still on its ×: where focus goes
 *  rather than being lost with it. */
export function ServiceNotice({ who, info, machine, command, onClosed, t }: { who: string; info: ServiceInfo; machine?: string; command?: string; onClosed?: () => void; t: Translate }) {
  const notice = noticeOf(info, machine, command, t);
  const close = useDismissal(who, info);
  if (!notice || close.dismissed) return null;
  const closeNotice = () => { onClosed?.(); close.dismiss(); };
  return <Alert tone="warning" title={notice.title}
    action={close.closable ? <Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("ui.closeNamed", { name: notice.title })} title={t("ui.close")} onClick={closeNotice}><CloseIcon size={14} /></Button> : undefined}
    footer={notice.command ? <Snippet text={notice.command} label={t("settings.updates.copyCommand", { machine: notice.machine })} /> : undefined}>{notice.body}</Alert>;
}

/** Where a service stands, as the badge that follows its version wherever it is said. */
export function ServiceBadge({ kind, t }: { kind: Exclude<ServiceKind, "unknown">; t: Translate }) {
  return <Badge tone={TONE[kind]} dot className="svc-badge">{t(BADGE[kind])}</Badge>;
}

/** The top of the service card, shared by This device's and a remote machine's: its title (focusable: where focus lands when a
 *  card's action or notice goes), with the running state at the right (`end`); under it two columns, the version with its badge and the port; the progress bar while it updates; the
 *  notice where there is one. A version nothing says the standing of (no `version()`) has no badge. `offline`: a machine that
 *  does not answer, which has what was last known — its version without a badge, its port — and nothing else. */
export function ServiceCardTop({ who, titleId, info, progress = null, port, end, machine, command, offline = false, guidance, t }: {
  who: string; titleId: string; info: ServiceInfo; progress?: number | null; port: number | null; end: ReactNode; machine?: string; command?: string;
  offline?: boolean; guidance?: string | null; t: Translate;
}) {
  const kind = !offline && info.kind !== "unknown" ? info.kind : null;
  const version = info.version;
  return <>
    <div className="host-status-head">
      <h4 id={titleId} tabIndex={-1}>{t("hosts.section.service")}</h4>
      {end}
    </div>
    {(version || port) && <dl className="svc-strip">
      {version && <div><dt>{t("service.field.version")}</dt><dd><span className="svc-number">{version}</span>{kind && <ServiceBadge kind={kind} t={t} />}</dd></div>}
      {port && <div data-fact="port"><dt>{t("service.field.port")}</dt><dd><span className="svc-number">{port}</span></dd></div>}
    </dl>}
    {kind === "updating" && <ProgressBar value={progress} label={t(BADGE.updating)} className="svc-bar" />}
    {guidance && <p className="host-update-guidance" role="status">{guidance}</p>}
    {/* Closing a notice leaves focus on the card's title. */}
    {kind && <ServiceNotice who={who} info={info} machine={machine} command={command} onClosed={() => document.getElementById(titleId)?.focus()} t={t} />}
  </>;
}

/** The card's state at its right: a remote machine's service running, with its dot. Not a live region: the page's header
 *  says the machine's state as it changes, once (MachineState). */
export function RunningState({ t }: { t: Translate }) {
  return <span className="host-status-state"><span className="host-status-dot" aria-hidden="true" />{t("hosts.machineState.running")}</span>;
}

/** A remote machine that does not answer: its state at the card's right. */
export function OfflineState({ t }: { t: Translate }) {
  return <span className="host-status-state"><span className="host-status-dot" aria-hidden="true" />{t("hosts.machineState.unreachable")}</span>;
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
