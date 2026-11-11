import { useContext, useEffect, type ReactNode } from "react";
import { Badge } from "../../components/ui/Badge";
import { Group, Section } from "../../components/ui/Card";
import { OpenPageIcon, OtherMachineIcon, ThisComputerIcon } from "../../components/ui/Icons";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { host } from "../../host";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import type { MachineView } from "../../state/room-types";
import { currentDeviceName } from "../../state/device-name";
import { translator, type Translate } from "../../i18n/translator";
import { machineName } from "../room/MachineList";
import { useAppUpdate } from "../updates/useUpdates";
import { AppIcon, ServiceBadge, ServiceNotice, useLocalService, useRemoteService, type ServiceInfo, type ServiceKind } from "./service-version";
import "./service-version.css";

/* MOCKUP (sidevoice-desktop#67, not for merge): Settings › Actualizaciones in two alternatives (the \`updatesView\` variant).
 * The same facts and the same badge as the service cards: the app's version and each machine's service — this device's and
 * every remote's, the up to date one and the one not answering too — with where it stands.
 *   u1  a row each: a Group for this device (the app, its service) and one for the remote machines; the notice (Alert)
 *       below the row that needs it, a remote's command inside it; the "newer" one can be closed.
 *   u3  each machine a link to its page (name, version, badge, chevron), where the card and the notice live.
 * The app's own state here is only up to date or updating: its updater's other steps (Download, Restart) are not drawn. */

export const UPDATES_VIEW = ["u1", "u3"] as const;
export type UpdatesView = typeof UPDATES_VIEW[number];

/** One row: what it is, its version line, its badge at the right; below it, what it needs (an Alert); or, as a link, a
 *  chevron and no more. */
function UpdateRow({ icon, label, description, badge, below, onOpen }: {
  icon?: ReactNode; label: ReactNode; description?: ReactNode; badge: ReactNode; below?: ReactNode; onOpen?: () => void;
}) {
  const content = <>
    {icon}
    <div className="ui-row-text">
      <span className="ui-row-label">{label}</span>
      {description && <p className="ui-row-description">{description}</p>}
    </div>
    <div className="ui-row-control">{badge}{onOpen && <span className="svc-chevron" aria-hidden="true"><OpenPageIcon /></span>}</div>
  </>;
  return <>
    {onOpen ? <button type="button" className="ui-row svc-upd-row svc-link-row" onClick={onOpen}>{content}</button>
      : <div className="ui-row svc-upd-row">{content}</div>}
    {below && <div className="svc-upd-below">{below}</div>}
  </>;
}

/** A remote machine's row: its name and its service, with its version and badge; not answering, "Sin conexión" and what
 *  was last known. */
function RemoteRow({ view, machine, t }: { view: UpdatesView; machine: MachineView; t: Translate }) {
  const store = useContext(RoomStoreContext);
  const service = useRemoteService(machine);
  const name = machineName(machine, t);
  const offline = machine.state !== "connected" && machine.state !== "checking";
  useEffect(() => { if (machine.pairingId && machine.state === "connected") void window.sidevoiceActions?.loadMachineInfo?.(machine.pairingId); }, [machine.pairingId, machine.state]);
  const known = !offline && service.kind !== "unknown" ? service.kind : null;
  const badge = offline ? <Badge tone="neutral" dot className="svc-badge">{t("service.offline")}</Badge> : known ? <ServiceBadge kind={known} t={t} /> : null;
  const version = offline ? service.lastSeen : service.version;
  const line = version ? t("settings.updates.version", { version }) : null;
  const description = view === "u3" ? line : [t("hosts.section.service"), line].filter(Boolean).join(" · ");
  const below = view === "u1" && known ? <ServiceNotice who={machine.pairingId ?? machine.id} info={service} supported={service.supported} machine={name} command={service.command} t={t} /> : null;
  return <UpdateRow icon={view === "u3" ? <span className="svc-machine-icon"><OtherMachineIcon size={20} /></span> : undefined} label={name} description={description}
    badge={badge} below={below}
    onOpen={view === "u3" ? () => store?.patch({ settingsSection: "machines", settingsLevel: "page", machinesView: { machine: machine.id } }) : undefined} />;
}

/** The app's row: its icon, its name, its version and where it stands. */
function AppUpdateRow({ kind, t }: { kind: Exclude<ServiceKind, "unknown">; t: Translate }) {
  const version = host().identity.build?.version ?? null;
  if (!version) return null;
  return <UpdateRow icon={<AppIcon />} label={t("settings.updates.one")} description={t("settings.updates.version", { version })} badge={<ServiceBadge kind={kind} t={t} />} />;
}

export function ServiceUpdates({ view }: { view: UpdatesView }) {
  const t = translator();
  const store = useContext(RoomStoreContext);
  const machines = useRoomStore((state) => state.machines);
  const remotes = machines.filter((machine) => !machine.local);
  const service = useLocalService();
  const app = useAppUpdate();
  const appKind: Exclude<ServiceKind, "unknown"> = !app.status || app.status.state === "idle" ? "current" : "updating";
  const device = currentDeviceName();
  const info: ServiceInfo = service;
  const localBadge = service.kind === "unknown" ? null : <ServiceBadge kind={service.kind} t={t} />;
  const localBelow = <>{service.kind === "updating" && <ProgressBar value={null} label={t("service.badge.updating")} className="svc-bar" />}<ServiceNotice who="local" info={info} supported={service.supported} t={t} /></>;
  const versionLine = service.version ? t("settings.updates.version", { version: service.version }) : null;
  return <Section id="updates" title={t("settings.section.updates")} description={t("settings.updates.description")}>
    <Group title={view === "u3" ? undefined : t("settings.section.thisDevice")}>
      <AppUpdateRow kind={appKind} t={t} />
      {view === "u1" && <UpdateRow label={t("hosts.section.service")} description={versionLine} badge={localBadge} below={localBelow} />}
    </Group>
    {view === "u3" && <Group title={t("hosts.title")}>
      <UpdateRow icon={<span className="svc-machine-icon"><ThisComputerIcon size={20} /></span>} label={device} description={versionLine} badge={localBadge}
        onOpen={() => store?.patch({ settingsSection: "this-computer", settingsLevel: "page" })} />
      {remotes.map((machine) => <RemoteRow key={machine.id} view={view} machine={machine} t={t} />)}
    </Group>}
    {view === "u1" && remotes.length > 0 && <Group title={t("hosts.titleRemote")}>
      {remotes.map((machine) => <RemoteRow key={machine.id} view={view} machine={machine} t={t} />)}
    </Group>}
  </Section>;
}
