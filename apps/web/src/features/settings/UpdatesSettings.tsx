import { useContext, useState, type ReactNode } from "react";
import { Group, Section } from "../../components/ui/Card";
import { Snippet } from "../../components/ui/Snippet";
import { DESKTOP_NIGHTLY_URL, desktopBuild, type DesktopBuild } from "../../services/desktop-host";
import { RoomStoreContext } from "../../state/room-store";
import { AppUpdateSettings } from "../updates/AppUpdateSettings";
import { LocalHostUpdateControl } from "../updates/LocalHostUpdate";
import { useThisComputerUpdate } from "../updates/useThisComputerUpdate";
import { appUpdater, continueAfterRestart, continued, continuing, UPDATE_PLACE, useOutdatedMachines, useUpdatesRows } from "../updates/useUpdates";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import "./updates-settings.css";

/* Updates, a Settings section of their own (decided 2026-10-13), holding everything that updates, each in its row with
 * its action right there once an update is found. This computer (VARIANTS `updates-rows`): two rows (B), each saying
 * what it is — the Sidevoice app, this window (its version, a nightly's or development app's note, Automatic or Manual,
 * Check for updates; Update the app, its progress, Restart to update the app: AppUpdateSettings), and the Sidevoice
 * service, which runs on this computer (its version, Update the service when the app bundles a newer one:
 * LocalHostUpdateControl); or one row (A), Sidevoice, with one version (the app's) and one button, Update Sidevoice,
 * that updates the app and then the service. Then each remote machine that is behind (its versions, and the command to
 * run there: the room cannot update it yet). In the desktop app always; in a browser or on a phone only while a machine
 * is behind, with only those machines. This device says its version and whether it is up to date, the update a link to
 * its row (ThisDeviceVersion); the room's notice and a check that finds one land here on the row's action
 * (UPDATE_PLACE, through `settingsFocus`). */

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


/** This device's Sidevoice in one line on its card: its version — the app's, else its service's — and, where it is
 *  known, Up to date or Update available, the latter a link to its row's button in Updates. */
export function ThisDeviceVersion({ t }: { t: HostTranslate }) {
  const store = useContext(RoomStoreContext);
  const { version, state, place } = useThisComputerUpdate();
  const shown = useUpdatesSection();
  if (!version) return null;
  return <div className="host-status-product this-device-version">
    {t("hosts.productVersion", { version })}
    {state === "current" && <>{" · "}{t("settings.updates.upToDate")}</>}
    {state === "pending" && shown && <>{" · "}<button type="button" className="ui-link see-updates" aria-label={t("settings.updates.updateAvailableLink")}
      onClick={() => store?.patch({ settingsSection: "updates", settingsLevel: "page", settingsFocus: place })}>{t("settings.updates.updateAvailable")}</button></>}
  </div>;
}

/** A part of this computer that updates, at its card's top, under its group's title: what it is, then its version, with
 *  Up to date once its part says so, and a build's note. */
function PartVersion({ hint, version, upToDate, note, t }: { hint: string; version: string | null | undefined; upToDate: boolean; note?: ReactNode; t: HostTranslate }) {
  return <div className="updates-settings-version">
    <span className="updates-part-hint">{hint}</span>
    {version && <span className="host-status-product">{t("settings.updates.version", { version })}
      {upToDate && <span className="updates-up-to-date">{" · "}{t("settings.updates.upToDate")}</span>}</span>}
    {note}
  </div>;
}

/** Updates: this computer — the app and its service, as two rows or one — then the machines behind; never an empty
 *  card. */
export function UpdatesSettings() {
  const t = hostTranslator();
  const rows = useUpdatesRows();
  const build = desktopBuild();
  const updater = appUpdater() !== null;
  const app = build !== null || updater;
  const outdated = useOutdatedMachines();
  const here = useThisComputerUpdate();
  const { shown: service, status: updatable, update: serviceUpdate, version: serviceVersion } = here.service;
  // One row: what the app restarted into, its service is then updated by itself (`continueAfterRestart`).
  const [chain, setChain] = useState(continuing);
  const description = !app ? "settings.updates.descriptionMachines" : outdated.length ? "settings.updates.descriptionAll" : "settings.updates.description";
  const note = <DesktopBuildNote build={build} updater={updater} t={t} />;
  // The service's Update; for one row, Update Sidevoice, its second step.
  const serviceControl = (words: "service" | "all") => updatable && <LocalHostUpdateControl status={updatable} update={serviceUpdate} words={words}
    continuing={words === "all" && chain} onContinued={() => { continued(); setChain(false); }} />;
  return <Section id="updates" title={t("settings.section.updates")} description={t(description)}>
    {rows === "one" ? (app || (service && (serviceVersion || serviceUpdate.shown))) && <Group title={t("settings.updates.one")}>
        <div className="updates-settings" data-settings-row="">
          <PartVersion hint={t(!app ? "settings.updates.serviceHint" : service ? "settings.updates.oneHint" : "settings.updates.appHint")}
            version={here.version} upToDate={here.state === "current"} note={note} t={t} />
          {app ? <AppUpdateSettings words="all" onRestart={continueAfterRestart} idle={serviceControl("all")} /> : serviceControl("all")}
        </div>
      </Group>
      : <>
        {app && <Group title={t("settings.updates.app")}>
          <div className="updates-settings">
            <PartVersion hint={t("settings.updates.appHint")} version={build?.version} upToDate={false} note={note} t={t} />
            <AppUpdateSettings />
          </div>
        </Group>}
        {/* No version to say and no update: no card. */}
        {service && (serviceVersion || serviceUpdate.shown) && <Group title={t("settings.updates.service")}>
          <div className="updates-settings" data-settings-row="">
            <PartVersion hint={t("settings.updates.serviceHint")} version={serviceVersion} upToDate={here.service.state === "current"} t={t} />
            {serviceControl("service")}
          </div>
        </Group>}
      </>}
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
