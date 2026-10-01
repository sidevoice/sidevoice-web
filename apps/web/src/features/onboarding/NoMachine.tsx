/* No machine connected (ONBOARDING_AND_HOSTS.md §5.6), in place of the pairing dialog that opened by itself. And the
 * room's banner for a local host that exists but is not running: that is not "no machine", it is its row plus why. */
import { Button } from "../../components/ui/Button";
import { SidevoiceMark } from "../../components/ui/Icons";
import { useT } from "../../i18n";
import { localBanner } from "../../state/hosts/host-list";
import { stepGroups, pathOf } from "../../state/hosts/onboarding";
import { useHosts, useHostsController } from "../../state/hosts/hosts-store";
import { CopyButton, PhraseText } from "../hosts/common";

const NPX = "npx @sidevoice/uplink install";

export function NoMachine() {
  const t = useT();
  const hosts = useHostsController();
  const inApp = useHosts((s) => s.inApp);
  const canHostAgents = useHosts((s) => s.canHostAgents);
  return (
    <section className="no-machine" aria-labelledby="no-machine-title">
      <SidevoiceMark size={40} className="no-machine-mark" />
      <h2 id="no-machine-title">{t("noMachine.title")}</h2>
      <p className="muted">{t("noMachine.text")}</p>
      <div className="no-machine-actions">
        {inApp ? <>
          {canHostAgents && <Button variant="primary" onClick={() => void hosts.choosePath("agents").then(() => hosts.openWizard("W1"))}>{t("hosts.useAgentsHere")}</Button>}
          <Button onClick={async () => { await hosts.choosePath("remote"); hosts.openWizard("W2r"); }}>{t("noMachine.otherMachine")}</Button>
        </> : <>
          <Button variant="primary" onClick={() => hosts.openWizard("W2r")}>{t("noMachine.connect")}</Button>
          <div className="npx-hint">
            <p className="muted">{t("noMachine.notReady")}</p>
            <div className="npx-line"><code>{NPX}</code><CopyButton text={NPX} /></div>
          </div>
        </>}
      </div>
    </section>
  );
}

/** Whether the first-run setup was started and left for later: until it is finished the app is not usable. */
export function useSetupPending(): boolean {
  return useHosts((s) => !!s.onboarding?.deferred_at && !s.onboarding?.completed_at);
}

/** Setup left unfinished (operator, 2026-10-01): the app is not usable until it is done, and there is one way on —
 *  «Continuar la configuración», back at the first step whose outcome is not durable. */
export function SetupPending() {
  const t = useT();
  const hosts = useHostsController();
  const facts = useHosts((s) => s.onboarding);
  const canHostAgents = useHosts((s) => s.canHostAgents);
  const step = hosts.resumeStep();
  const group = stepGroups(pathOf({ onboarding: facts, canHostAgents })).find((g) => g.steps.includes(step));
  return (
    <section className="no-machine" aria-labelledby="setup-pending-title">
      <SidevoiceMark size={40} className="no-machine-mark" />
      <h2 id="setup-pending-title">{t("setup.pending.title")}</h2>
      <p className="muted">{t("setup.pending.text")}</p>
      {group && <p className="muted small">{t("setup.pending.where", { step: t(group.key) })}</p>}
      <div className="no-machine-actions">
        <Button variant="primary" onClick={() => hosts.openWizard()}>{t("noMachine.resume")}</Button>
      </div>
    </section>
  );
}

export function LocalHostBanner() {
  const t = useT();
  const hosts = useHostsController();
  const local = useHosts((s) => s.local);
  const fp = useHosts((s) => s.localPairing?.fp ?? null);
  const inUse = useHosts((s) => s.inUse);
  const wizardOpen = useHosts((s) => s.wizard.open);
  const phrase = localBanner(local);
  // The wizard is already saying what this computer is doing (W2 installs and starts it).
  if (!phrase || !local || wizardOpen || (fp && inUse !== fp)) return null;
  const retry = local.state === "refused" ? "reconnect" : local.state === "stopped-by-person" ? "start" : local.state === "not-installed" ? "serviceInstall" : "restart";
  return (
    <div className="room-banner" role="alert" data-state={local.state}>
      <span>{t("banner.unavailable")} <PhraseText phrase={phrase} /></span>
      <span className="row-actions">
        {local.state !== "incompatible" && local.state !== "starting" && <Button size="compact" variant="primary" onClick={() => void hosts.localCall(retry)}>{t(retry === "reconnect" ? "host.reconnect" : retry === "start" ? "host.start" : retry === "serviceInstall" ? "host.atLogin.enable" : "common.retry")}</Button>}
        <Button size="compact" variant="ghost" onClick={() => fp ? hosts.openSettings("host", fp) : hosts.openSettings("hosts")}>{t("banner.details")}</Button>
      </span>
    </div>
  );
}
