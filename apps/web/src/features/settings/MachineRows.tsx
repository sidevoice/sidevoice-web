import { useEffect, type ReactNode } from "react";
import { Badge } from "../../components/ui/Badge";
import { OpenPageIcon, OtherMachineIcon, ThisComputerIcon } from "../../components/ui/Icons";
import { translator } from "../../i18n/translator";
import { NewAtEnd, NewOnIcon } from "../highlights/highlights";
import { useRoomStore } from "../../state/room-store";
import type { MachineView } from "../../state/room-types";
import { machineStatus } from "./machine-status";
import { StateOnIcon } from "./MachineState";
import { ServiceBadge, useLocalService, useRemoteService } from "./service-version";

/* A machine as a row that opens its page — in Settings › Updates and in Remote machines: its icon, its name over its
 * service's version, then, at the right, where that stands (up to date, out of date, newer than the app supports, or that
 * the machine does not answer) and a chevron. The same row in both places; its page has the card and the notices. */

/** The row: `icon`, `name` over `description`, `badge`, a chevron. A button: the whole row opens the page. */
function LinkRow({ icon, name, spoken, description, badge, isNew = 0, onOpen, ...data }: {
  icon: ReactNode; name: string; spoken?: string | null; description: string | null; badge: ReactNode; isNew?: number; onOpen: () => void;
} & Record<`data-${string}`, string | undefined>) {
  return <button type="button" className="ui-row svc-link-row" onClick={onOpen} {...data}>
    <span className="svc-machine-icon" aria-hidden="true"><NewOnIcon icon={icon} isNew={isNew} /></span>
    <span className="ui-row-text">
      <span className="ui-row-label"><span className="svc-link-name">{name}</span>{spoken && <span className="sr-only">{", " + spoken}</span>}</span>
      {description && <>{" "}<span className="ui-row-description">{description}</span></>}
    </span>
    {" "}
    <span className="ui-row-control">{badge}<NewAtEnd isNew={isNew} spoken={translator()("highlights.navNew")} /><span className="svc-chevron" aria-hidden="true"><OpenPageIcon /></span></span>
  </button>;
}

/** This device's row: its name, its service's version and where the app says it stands; the green dot on its icon while its
 *  service runs. Where this computer is listed among the machines (it has no section of its own), it is this row there too. */
export function LocalMachineRow({ machine, name, isNew = 0, onOpen }: { machine: MachineView | null; name: string; isNew?: number; onOpen: () => void }) {
  const t = translator();
  const service = useLocalService();
  const local = useRoomStore((state) => state.facts.localHostStatus);
  return <LinkRow icon={<StateOnIcon icon={<ThisComputerIcon size={20} />} status={machineStatus(machine, local, true, t)} />} name={name} isNew={isNew} onOpen={onOpen} data-machine-row="local" data-machine={machine?.id}
    description={service.version ? t("settings.updates.version", { version: service.version }) : null}
    badge={service.kind === "unknown" ? null : <ServiceBadge kind={service.kind} t={t} />} />;
}

/** A remote machine's row: its name, its service's version and where it stands; not answering, "Offline" in the badge's
 *  place and the version it was last seen running; no longer paired, that. Each machine, once connected, is asked for its
 *  version. */
export function RemoteMachineRow({ machine, name, isNew = 0, onOpen }: { machine: MachineView; name: string; isNew?: number; onOpen: () => void }) {
  const t = translator();
  const service = useRemoteService(machine);
  const local = useRoomStore((state) => state.facts.localHostStatus);
  const state = machineStatus(machine, local, false, t);
  useEffect(() => { if (machine.pairingId && machine.state === "connected") void window.sidevoiceActions?.loadMachineInfo?.(machine.pairingId); }, [machine.pairingId, machine.state]);
  const answering = state.key === "direct" && service.kind !== "unknown";
  const badge = answering ? <ServiceBadge kind={service.kind as Exclude<typeof service.kind, "unknown">} t={t} />
    : state.key === "unpaired" || state.key === "unreachable" ? <Badge tone={state.tone === "warning" ? "warning" : "neutral"} dot className="svc-badge">{state.short}</Badge> : null;
  // Connected is the green dot on its icon, said in words to a screen reader; the rest the badge says.
  return <LinkRow icon={<StateOnIcon icon={<OtherMachineIcon size={20} />} status={state} />} name={name} spoken={state.key === "direct" ? state.short : null}
    isNew={isNew} onOpen={onOpen} data-machine-row={machine.id} data-machine={machine.id} data-name={name} data-state={machine.state}
    description={service.shown ? t("settings.updates.version", { version: service.shown }) : null} badge={badge} />;
}
