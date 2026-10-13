import { useContext } from "react";
import { Group, Section } from "../../components/ui/Card";
import { Snippet } from "../../components/ui/Snippet";
import { useVariant } from "../../lib/variants";
import { DESKTOP_NIGHTLY_URL, desktopBuild, type DesktopBuild } from "../../services/desktop-host";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { AppUpdateSettings } from "../updates/AppUpdateSettings";
import { LocalHostUpdateControl } from "../updates/LocalHostUpdate";
import { useOutdatedMachines } from "../updates/useUpdates";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import { safeLocalHostStatusDetails } from "./local-host-status";
import "./updates-settings.css";

/* Where updates live (VARIANTS `updates-section`): on This device's service card, beside the version (A, as they were
 * built: MachineList's LocalHostStatusPanel); or a Settings section of their own, Updates (B), holding everything that
 * updates — the desktop app (its version, Automatic or Manual, Check, its state and action: AppUpdateSettings, the one
 * component, mounted here instead), Sidevoice on this computer (its version, Update when the app bundles a newer one),
 * each remote machine that is behind (its version, and the command to run there: the room cannot update it yet), and a
 * nightly's or development app's note. In B, This device keeps its version with a link here, and the sidebar's entry
 * opens here. A browser or a phone has the section only while a machine is behind, with only those machines. */

/** Whether updates have a section of their own: VARIANTS `updates-section` B, in the desktop app, or wherever a machine
 *  is behind. */
export function useUpdatesSection() {
  const where = useVariant("updates-section", ["this-device", "section"] as const);
  const outdated = useOutdatedMachines().length > 0;
  return where === "section" && (desktopBuild() !== null || outdated);
}

/** A nightly or development app, under its version: what it is, and how it updates (a nightly by hand, from its page). */
export function DesktopBuildNote({ build, t }: { build: DesktopBuild | null; t: HostTranslate }) {
  if (build?.channel === "nightly") return <div className="host-status-build">
    {[t("hosts.build.nightly"), build.commit?.slice(0, 7), build.date?.slice(0, 10)].filter(Boolean).join(" · ")}{" — "}
    <a href={DESKTOP_NIGHTLY_URL} target="_blank" rel="noreferrer">{t("hosts.build.byHand")}<span className="sr-only"> {t("keys.newTab")}</span></a>
  </div>;
  return build?.channel === "dev" ? <div className="host-status-build">{t("hosts.build.dev")}</div> : null;
}

/** This device's way to its updates where they have a section of their own (B). */
export function SeeUpdates({ t }: { t: HostTranslate }) {
  const store = useContext(RoomStoreContext);
  return <button type="button" className="ui-link see-updates" onClick={() => store?.patch({ settingsSection: "updates", settingsLevel: "page" })}>{t("settings.updates.see")}</button>;
}

/** Updates, as a section (B): the app, this computer's Sidevoice, the machines behind — each a card of its own. */
export function UpdatesSettings() {
  const t = hostTranslator();
  const build = desktopBuild();
  const local = useRoomStore((state) => state.machines.find((machine) => machine.local) ?? null);
  const status = useRoomStore((state) => state.facts.localHostStatus);
  const outdated = useOutdatedMachines();
  const serviceVersion = status ? safeLocalHostStatusDetails(status).product_version : null;
  return <Section id="updates" title={t("settings.section.updates")} description={t(build ? "settings.updates.description" : "settings.updates.descriptionMachines")}>
    {build && <Group title={t("settings.updates.app")}>
      <div className="updates-settings">
        <div className="updates-settings-version">
          {build.version && <span className="host-status-product">{t("hosts.productVersion", { version: build.version })}</span>}
          <DesktopBuildNote build={build} t={t} />
        </div>
        <AppUpdateSettings />
      </div>
    </Group>}
    {build && local && status && <Group title={t("hosts.section.service")}>
      <div className="updates-settings">
        <div className="updates-settings-version">
          {serviceVersion && <span className="host-status-product">{t("hosts.productVersion", { version: serviceVersion })}</span>}
        </div>
        {build.channel === "release" && <LocalHostUpdateControl status={status} />}
      </div>
    </Group>}
    {outdated.length > 0 && <Group title={t("settings.updates.machines")}>
      {outdated.map(({ machine, version, latest, command }) => <div key={machine.id} className="updates-settings updates-machine">
        <div className="updates-settings-version">
          <span className="host-status-product">{machine.host || t("hosts.unnamed")}</span>
          <span className="host-status-build">{version ? t("settings.updates.machineBehind", { version, latest }) : t("updates.available", { version: latest })}</span>
        </div>
        <p className="host-agent-where">{t("settings.updates.runOn", { machine: machine.host || t("hosts.unnamed") })}</p>
        <Snippet text={command} />
      </div>)}
    </Group>}
  </Section>;
}
