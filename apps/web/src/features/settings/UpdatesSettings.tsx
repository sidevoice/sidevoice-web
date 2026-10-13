import { Group, Section } from "../../components/ui/Card";
import { useVariant } from "../../lib/variants";
import { DESKTOP_NIGHTLY_URL, desktopBuild, type DesktopBuild } from "../../services/desktop-host";
import { AppUpdateSettings } from "../updates/AppUpdateSettings";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import "./updates-settings.css";

/* Where the desktop app's updates live (VARIANTS `updates-section`): on This device's service card, beside the version
 * (A, as they were built: MachineList's LocalHostStatusPanel); or a Settings section of their own, Updates (B) — the
 * app's version, what kind of build it is, and its updates (AppUpdateSettings, the one component, mounted here instead).
 * In the desktop app only: a browser updates by reloading, and says so where it does (UpdatesEntry). */

/** Whether the desktop app's updates have a section of their own: VARIANTS `updates-section` B, in the desktop app. */
export function useUpdatesSection() {
  const where = useVariant("updates-section", ["this-device", "section"] as const);
  return where === "section" && desktopBuild() !== null;
}

/** A nightly or development app, under its version: what it is, and how it updates (a nightly by hand, from its page). */
export function DesktopBuildNote({ build, t }: { build: DesktopBuild | null; t: HostTranslate }) {
  if (build?.channel === "nightly") return <div className="host-status-build">
    {[t("hosts.build.nightly"), build.commit?.slice(0, 7), build.date?.slice(0, 10)].filter(Boolean).join(" · ")}{" — "}
    <a href={DESKTOP_NIGHTLY_URL} target="_blank" rel="noreferrer">{t("hosts.build.byHand")}<span className="sr-only"> {t("keys.newTab")}</span></a>
  </div>;
  return build?.channel === "dev" ? <div className="host-status-build">{t("hosts.build.dev")}</div> : null;
}

/** Updates, as a section (B): the app's version and its build's note on the card's first line, then its updates. */
export function UpdatesSettings() {
  const t = hostTranslator();
  const build = desktopBuild();
  return <Section id="updates" title={t("settings.section.updates")} description={t("settings.updates.description")}>
    <Group>
      <div className="updates-settings">
        <div className="updates-settings-version">
          <span className="ui-row-label">{t("settings.updates.version")}</span>
          {build?.version && <span className="host-status-product">{t("hosts.productVersion", { version: build.version })}</span>}
          <DesktopBuildNote build={build} t={t} />
        </div>
        <AppUpdateSettings />
      </div>
    </Group>
  </Section>;
}
