import { useState, useSyncExternalStore } from "react";
import { Button } from "../../components/ui/Button";
import { AddIcon, BackIcon, MachinesIcon } from "../../components/ui/Icons";
import { isVisibleLocalHostInstall, localHostInstallController, type LocalHostInstallController, type LocalHostInstallSource } from "../../services/local-host-install";
import { useRoomStore } from "../../state/room-store";
import { translator } from "../../i18n/translator";
import { LocalHostInstallEntry, useLocalInstallOffer } from "./LocalHostInstallEntry";
import { PrepareThisComputer } from "./PrepareThisComputer";
import { MachineChoices } from "./MachineChoices";
import "./pairing.css";

/* The first screen without a machine. Where this app can prepare this computer, the two ways are the setup's own cards
 * (MachineChoices; operator, 2026-10-16), each acting at once: This computer opens its preparation — the install's
 * panel, Prepare and "I'll do it myself" — with Back to the cards while nothing runs; Another machine opens the pairing.
 * An install already under way (started in the setup) shows its preparation straight away. A browser, which cannot
 * prepare this computer, has only the second, as the main action. */
export function NoMachineScreen({
  installController = localHostInstallController,
  source = "no-machine",
  onContinueSetup,
}: { installController?: LocalHostInstallController; source?: LocalHostInstallSource; onContinueSetup?: () => void } = {}) {
  const t = translator();
  // This computer chosen from the cards; an install that shows its run (started here or in the setup) is chosen already.
  const [here, setHere] = useState(false);
  const ready = useRoomStore((state) => state.facts.machinesReady);
  const machines = useRoomStore((state) => state.machines);
  const localHostAvailable = useRoomStore((state) => state.facts.localHostAvailable);
  const localHostStatus = useRoomStore((state) => state.facts.localHostStatus);
  const install = useSyncExternalStore(installController.subscribe, installController.getSnapshot, installController.getSnapshot);
  const offer = useLocalInstallOffer(installController);
  const projectedLocalOnly = machines.length === 1 && machines[0].local && !machines[0].pairingId;
  const preparingWithoutPairing = projectedLocalOnly && install.phase !== "idle" && install.source === source;
  const localInstallPanel = machines.length > 0 && isVisibleLocalHostInstall(install, source);
  if (!ready || (machines.length > 0 && !localInstallPanel)) return null;
  const noMachines = machines.length === 0 || preparingWithoutPairing;
  const installHere = noMachines && offer.supported;
  const twoWays = noMachines && localHostAvailable &&
    (localHostStatus.state === "absent" || isVisibleLocalHostInstall(install, source));
  const preparing = twoWays && (here || isVisibleLocalHostInstall(install, source));
  const canGoBack = install.phase !== "installing" && install.phase !== "succeeded";

  return (
    <section className="no-machine-screen" aria-labelledby={noMachines ? "no-machine-title" : "local-install-title"}>
      {noMachines && <>
        <span className="no-machine-icon"><MachinesIcon size={28} /></span>
        <h1 id="no-machine-title">{t("noMachine.title")}</h1>
        <p>{t("noMachine.body")}</p>
      </>}
      {twoWays && !preparing && <MachineChoices local label={t("noMachine.title")} t={t}
        onChoose={(choice) => { if (choice === "agents") setHere(true); else window.sidevoiceActions?.openPairing(); }} />}
      {preparing && <>
        <p className="no-machine-hint">{t("localInstall.description")}</p>
        <LocalHostInstallEntry showCta={false} controller={installController} source={source} holdSuccess />
        <PrepareThisComputer id="no-machine-prepare" controller={installController} />
        {canGoBack && <Button variant="ghost" tone="neutral" size="sm" className="no-machine-back"
          onClick={() => { if (install.phase !== "idle") installController.clear(); setHere(false); }}><BackIcon />{t("wizard.back")}</Button>}
      </>}
      {!twoWays && <div className="no-machine-actions">
        {!twoWays && installHere && offer.offered && <Button variant="primary" onClick={() => installController.start(source)}>{t("localInstall.cta")}</Button>}
        <Button variant={installHere ? "secondary" : "primary"} onClick={() => window.sidevoiceActions?.openPairing()}><AddIcon />{t("noMachine.connect")}</Button>
      </div>}
      {!twoWays && installHere && offer.offered && <p className="no-machine-hint">{t("localInstall.description")}</p>}
      {!twoWays && <LocalHostInstallEntry showCta={false} controller={installController} source={source} holdSuccess />}
      {/* Back into the setup where it stands, where the flow offers it: a quiet link, never the main action. */}
      {onContinueSetup && <Button variant="ghost" tone="neutral" size="sm" className="waiting-continue-setup" onClick={onContinueSetup}>{t("noMachine.continue")}</Button>}
    </section>
  );
}
