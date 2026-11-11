import { useContext } from "react";
import { Group, Section } from "../../components/ui/Card";
import { DESKTOP_NIGHTLY_URL } from "../../services/desktop-host";
import { host, type AppBuild } from "../../host";
import { currentDeviceName } from "../../state/device-name";
import type { MachineView } from "../../state/room-types";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { useThisComputerSection } from "../../state/this-computer";
import { AppUpdateSettings } from "../updates/AppUpdateSettings";
import { useOutdatedMachines } from "../updates/useUpdates";
import { translator, type Translate } from "../../i18n/translator";
import { machineName } from "../room/MachineList";
import { LocalMachineRow, RemoteMachineRow } from "./MachineRows";
import { AppRow } from "./service-version";
import "./updates-settings.css";

/* Updates, a Settings section of their own (decided 2026-10-13), holding everything that updates. First the app — its
 * row, with its icon and its version, Automatic or Manual, Check for updates and, while a newer one waits, its one
 * action (AppUpdateSettings: Download, its progress, Restart to update). Then the machines (sidevoice-desktop#67, U3): one
 * row each — this device's and every paired machine's — with its name, its Sidevoice service's version and where that
 * stands (up to date, out of date, newer than the app supports, offline), a chevron to its page, where the card and the
 * notices are; none in this view. This device's service updates itself, in the background, never during a call.
 * In the desktop app always; in a browser or on a phone only while a machine is out of date, with the machines alone. */

/** Whether Settings has Updates: in the desktop app (its build or its updater), or wherever a machine is out of date. */
export function useUpdatesSection() {
  const outdated = useOutdatedMachines().length > 0;
  return host().identity.build !== null || host().updater !== null || outdated;
}

/** A nightly or development app, under its version: what it is, and — a nightly with no updater of its own — that it is
 *  updated by hand, from its page. One with an updater (desktop #56 gives nightlies one, for now) updates as a release. */
export function DesktopBuildNote({ build, updater, t }: { build: AppBuild | null; updater: boolean; t: Translate }) {
  if (build?.channel === "nightly") return <div className="host-status-build">
    {[t("hosts.build.nightly"), build.commit?.slice(0, 7), build.date?.slice(0, 10)].filter(Boolean).join(" · ")}
    {!updater && <>{" — "}<a href={DESKTOP_NIGHTLY_URL} target="_blank" rel="noreferrer">{t("hosts.build.byHand")}<span className="sr-only"> {t("keys.newTab")}</span></a></>}
  </div>;
  return build?.channel === "dev" ? <div className="host-status-build">{t("hosts.build.dev")}</div> : null;
}

/** Updates: the app, then the machines. */
export function UpdatesSettings() {
  const t = translator();
  const store = useContext(RoomStoreContext);
  const build = host().identity.build;
  const updater = host().updater !== null;
  const app = build !== null || updater;
  const own = useThisComputerSection();
  const machines = useRoomStore((state) => state.machines);
  // With its own section this computer is This device, the first row; without one it is listed among the machines.
  const listed = own ? machines.filter((machine) => !machine.local) : machines;
  const open = (machine: MachineView) => store?.patch({ settingsSection: "machines", settingsLevel: "page", machinesView: { machine: machine.id } });
  // The name this device has here, followed as it is set.
  useRoomStore((state) => state.facts.deviceName);
  // A nightly or development app says what it is under its version.
  const noted = build?.channel === "nightly" || build?.channel === "dev";
  return <Section id="updates" title={t("settings.section.updates")} description={t(app ? "settings.updates.description" : "settings.updates.descriptionMachines")}>
    {app && (updater
      // A landing lights the update's own line (its row with its button), never the whole card.
      ? <Group><div className="updates-settings"><AppUpdateSettings />{noted && <DesktopBuildNote build={build} updater={updater} t={t} />}</div></Group>
      : <><AppRow t={t} />{noted && <DesktopBuildNote build={build} updater={updater} t={t} />}</>)}
    {(own || listed.length > 0) && <Group title={t("hosts.title")}>
      {own && <LocalMachineRow name={currentDeviceName()}
        onOpen={() => store?.patch({ settingsSection: "this-computer", settingsLevel: "page" })} />}
      {listed.map((machine) => machine.local
        ? <LocalMachineRow key={machine.id} name={machineName(machine, t)} onOpen={() => open(machine)} />
        : <RemoteMachineRow key={machine.id} machine={machine} name={machineName(machine, t)} onOpen={() => open(machine)} />)}
    </Group>}
  </Section>;
}
