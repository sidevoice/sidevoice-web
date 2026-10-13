import { useContext } from "react";
import { Group, Section } from "../../components/ui/Card";
import { Snippet } from "../../components/ui/Snippet";
import { DESKTOP_NIGHTLY_URL, desktopBuild, type DesktopBuild } from "../../services/desktop-host";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { AppUpdateSettings } from "../updates/AppUpdateSettings";
import { LocalHostUpdateControl, useLocalHostUpdate } from "../updates/LocalHostUpdate";
import { appUpdater, UPDATE_PLACE, useOutdatedMachines } from "../updates/useUpdates";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import { safeLocalHostStatusDetails } from "./local-host-status";
import "./updates-settings.css";

/* Updates, a Settings section of their own (decided 2026-10-13), holding everything that updates, each in its row with
 * its action right there once an update is found: the desktop app (its version, a nightly's or development app's note,
 * Automatic or Manual, Check for updates; Download, its progress, Restart to update: AppUpdateSettings), Sidevoice on
 * this computer (its version, Update when the app bundles a newer one: LocalHostUpdateControl), and each remote machine
 * that is behind (its versions, and the command to run there: the room cannot update it yet). In the desktop app
 * always; in a browser or on a phone only while a machine is behind, with only those machines. This device keeps its
 * version with See updates; the sidebar's entry, the rail's rows and a check that finds one land here on the row's
 * action (UPDATE_PLACE, through `settingsFocus`). */

/** Whether Settings has Updates: in the desktop app (its build or its updater), or wherever a machine is behind. */
export function useUpdatesSection() {
  const outdated = useOutdatedMachines().length > 0;
  return desktopBuild() !== null || appUpdater() !== null || outdated;
}

/** A nightly or development app, under its version: what it is, and — a nightly with no updater of its own — that it is
 *  updated by hand, from its page. One with an updater (desktop #56 gives nightlies one, for now) updates as a release. */
export function DesktopBuildNote({ build, updater, t }: { build: DesktopBuild | null; updater: boolean; t: HostTranslate }) {
  if (build?.channel === "nightly") return <div className="host-status-build">
    {[t("hosts.build.nightly"), build.commit?.slice(0, 7), build.date?.slice(0, 10)].filter(Boolean).join(" · ")}
    {!updater && <>{" — "}<a href={DESKTOP_NIGHTLY_URL} target="_blank" rel="noreferrer">{t("hosts.build.byHand")}<span className="sr-only"> {t("keys.newTab")}</span></a></>}
  </div>;
  return build?.channel === "dev" ? <div className="host-status-build">{t("hosts.build.dev")}</div> : null;
}

/** This device's way to Updates, under its version. */
export function SeeUpdates({ t }: { t: HostTranslate }) {
  const store = useContext(RoomStoreContext);
  return <button type="button" className="ui-link see-updates" onClick={() => store?.patch({ settingsSection: "updates", settingsLevel: "page" })}>{t("settings.updates.see")}</button>;
}

/** Updates: the app, this computer's Sidevoice, the machines behind — each a card of its own, never an empty one. */
export function UpdatesSettings() {
  const t = hostTranslator();
  const build = desktopBuild();
  const updater = appUpdater() !== null;
  const app = build !== null || updater;
  const local = useRoomStore((state) => state.machines.find((machine) => machine.local) ?? null);
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const outdated = useOutdatedMachines();
  const service = local && status ? status : null;
  const serviceVersion = service ? safeLocalHostStatusDetails(service).product_version : null;
  // Updating this computer's Sidevoice from here is an app's that updates itself (a release; a nightly with its
  // updater): one updated by hand (a nightly without, a development build) has it updated with it.
  const serviceUpdate = useLocalHostUpdate(service && (!build || build.channel === "release" || updater) ? service : null);
  const description = !app ? "settings.updates.descriptionMachines" : outdated.length ? "settings.updates.descriptionAll" : "settings.updates.description";
  return <Section id="updates" title={t("settings.section.updates")} description={t(description)}>
    {app && <Group title={t("settings.updates.app")}>
      <div className="updates-settings">
        <div className="updates-settings-version">
          {build?.version && <span className="host-status-product">{t("hosts.productVersion", { version: build.version })}</span>}
          <DesktopBuildNote build={build} updater={updater} t={t} />
        </div>
        <AppUpdateSettings />
      </div>
    </Group>}
    {/* No version to say and no update: no card. */}
    {service && (serviceVersion || serviceUpdate.shown) && <Group title={t("hosts.section.service")}>
      <div className="updates-settings" data-settings-row="">
        {serviceVersion && <div className="updates-settings-version">
          <span className="host-status-product">{t("hosts.productVersion", { version: serviceVersion })}</span>
        </div>}
        <LocalHostUpdateControl status={service} update={serviceUpdate} />
      </div>
    </Group>}
    {outdated.length > 0 && <Group title={t("settings.updates.machines")}>
      {outdated.map(({ machine, version, latest, command }) => {
        const name = machine.host || t("hosts.unnamed");
        return <div key={machine.id} id={UPDATE_PLACE.machine(machine.pairingId!)} className="updates-settings updates-machine" data-settings-row="">
          <div className="updates-settings-version">
            <span className="host-status-product">{name}</span>
            <span className="host-status-build">{version ? t("settings.updates.machineBehind", { version, latest }) : t("updates.available", { version: latest })}</span>
          </div>
          <p className="host-agent-where">{t("settings.updates.runOn", { machine: name })}</p>
          <Snippet text={command} label={t("settings.updates.copyCommand", { machine: name })} />
        </div>;
      })}
    </Group>}
  </Section>;
}
