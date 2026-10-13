import { useContext, useState, type ReactNode } from "react";
import { Group, Section } from "../../components/ui/Card";
import { Snippet } from "../../components/ui/Snippet";
import { DESKTOP_NIGHTLY_URL, desktopBuild, type DesktopBuild } from "../../services/desktop-host";
import { RoomStoreContext } from "../../state/room-store";
import { AppUpdateSettings } from "../updates/AppUpdateSettings";
import { LocalHostUpdateControl } from "../updates/LocalHostUpdate";
import { useThisComputerUpdate } from "../updates/useThisComputerUpdate";
import { appUpdater, continueAfterRestart, continued, continuing, UPDATE_PLACE, useOutdatedMachines } from "../updates/useUpdates";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import "./updates-settings.css";

/* Updates, a Settings section of their own (decided 2026-10-13), holding everything that updates, each in its row with
 * its action right there once an update is found. This computer as one row, Sidevoice (decided), in one state: one
 * version each (a nightly's or development app's note above): Automatic or Manual; Sidevoice 0.3.0 · Up to date · Check
 * for updates; then, only while a newer one waits, its line with its one action — Sidevoice 0.4.0 available · Download,
 * its progress, Restart to update (AppUpdateSettings). The app updated, then its service, folded into the same state
 * (LocalHostUpdateControl: Update Sidevoice where only the service is behind the one the app bundles; never beside Up
 * to date). Then each remote machine that is behind (its versions, and the command to
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
function PartVersion({ hint, version, upToDate, note, t }: { hint?: string; version: string | null | undefined; upToDate: boolean; note?: ReactNode; t: HostTranslate }) {
  return <div className="updates-settings-version">
    {hint && <span className="updates-part-hint">{hint}</span>}
    {version && <span className="host-status-product">{t("settings.updates.version", { version })}
      {upToDate && <span className="updates-up-to-date">{" · "}{t("settings.updates.upToDate")}</span>}</span>}
    {note}
  </div>;
}

/** Updates: this computer as one row, Sidevoice (its service updated with the app), then the machines behind; never
 *  an empty card. */
export function UpdatesSettings() {
  const t = hostTranslator();
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
  // Update Sidevoice, the row's second step: this computer's service, where the app's update did not bring it along.
  const serviceControl = updatable && <LocalHostUpdateControl status={updatable} update={serviceUpdate}
    continuing={chain} onContinued={() => { continued(); setChain(false); }} />;
  // With the app's updater, its row says Sidevoice's version and where it stands: above it, only a build's note.
  const noted = build?.channel === "nightly" || build?.channel === "dev";
  return <Section id="updates" title={t("settings.section.updates")} description={t(description)}>
    {(app || (service && (serviceVersion || serviceUpdate.shown))) && <Group title={t("settings.updates.one")}>
      {/* A landing lights the update's own line (its row with its button), never the whole card. */}
      <div className="updates-settings">
        {(!updater || noted) && <PartVersion hint={app ? undefined : t("settings.updates.serviceHint")}
          version={updater ? null : here.version} upToDate={here.state === "current" && !here.app.can.check} note={note} t={t} />}
        {/* One row, one state, for the app and its service together: the service behind is Sidevoice's update. */}
        {app ? <AppUpdateSettings onRestart={continueAfterRestart} service={serviceControl} current={here.state === "current"} /> : serviceControl}
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
