/* No machine connected (ONBOARDING_AND_HOSTS.md §5.6), in place of the pairing dialog that opened by itself. And the
 * room's banner for a local host that exists but is not running: that is not "no machine", it is its row plus why. */
import { Button } from "../../components/ui/Button";
import { SidevoiceMark } from "../../components/ui/Icons";
import { useT } from "../../i18n";
import { localBanner } from "../../state/hosts/host-list";
import { useHosts, useHostsController } from "../../state/hosts/hosts-store";
import { CopyButton, PhraseText } from "../hosts/common";

const NPX = "npx @sidevoice/uplink install";

export function NoMachine() {
  const t = useT();
  const hosts = useHostsController();
  const inApp = useHosts((s) => s.inApp);
  const canHostAgents = useHosts((s) => s.canHostAgents);
  const deferred = useHosts((s) => !!s.onboarding?.deferred_at && !s.onboarding?.completed_at);
  return (
    <section className="no-machine" aria-labelledby="no-machine-title">
      <SidevoiceMark size={40} className="no-machine-mark" />
      <h2 id="no-machine-title">{t("noMachine.title")}</h2>
      <p className="muted">{t("noMachine.text")}</p>
      <div className="no-machine-actions">
        {deferred && <Button variant="primary" onClick={() => hosts.openWizard()}>{t("noMachine.resume")}</Button>}
        {inApp ? <>
          {canHostAgents && <Button variant={deferred ? "default" : "primary"} onClick={() => void hosts.choosePath("agents").then(() => hosts.openWizard("W1"))}>{t("hosts.useAgentsHere")}</Button>}
          <Button onClick={async () => { await hosts.choosePath("remote"); hosts.openWizard("W2r"); }}>{t("noMachine.otherMachine")}</Button>
        </> : <>
          <Button variant={deferred ? "default" : "primary"} onClick={() => hosts.openWizard("W2r")}>{t("noMachine.connect")}</Button>
          <div className="npx-hint">
            <p className="muted">{t("noMachine.notReady")}</p>
            <div className="npx-line"><code>{NPX}</code><CopyButton text={NPX} /></div>
          </div>
        </>}
      </div>
    </section>
  );
}

/** Onboarding left for later once a host was connected: the no-machine screen is gone, so the room offers it. */
export function SetupBanner() {
  const t = useT();
  const hosts = useHostsController();
  const pending = useHosts((s) => !!s.onboarding?.deferred_at && !s.onboarding?.completed_at && s.rows.length > 0 && !s.wizard.open);
  if (!pending) return null;
  return (
    <div className="room-banner setup-banner" role="status">
      <span>{t("banner.setupPending")}</span>
      <span className="row-actions"><Button size="compact" variant="primary" onClick={() => hosts.openWizard()}>{t("noMachine.resume")}</Button></span>
    </div>
  );
}

export function LocalHostBanner() {
  const t = useT();
  const hosts = useHostsController();
  const local = useHosts((s) => s.local);
  const fp = useHosts((s) => s.localPairing?.fp ?? null);
  const inUse = useHosts((s) => s.inUse);
  const phrase = localBanner(local);
  if (!phrase || !local || (fp && inUse !== fp)) return null;
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
