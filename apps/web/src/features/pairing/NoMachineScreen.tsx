import { useSyncExternalStore } from "react";
import { Button } from "../../components/ui/Button";
import { AddIcon, MachinesIcon } from "../../components/ui/Icons";
import { isVisibleLocalHostInstall, localHostInstallController, type LocalHostInstallController, type LocalHostInstallSource } from "../../services/local-host-install";
import { useRoomStore } from "../../state/room-store";
import { translator } from "../../i18n/translator";
import { LocalHostInstallEntry, useLocalInstallOffer } from "./LocalHostInstallEntry";
import { PrepareThisComputer } from "./PrepareThisComputer";
import "./pairing.css";

/* The first screen without a machine. Where this app can prepare this computer, doing so is the main action and
 * connecting to another machine the second (the operator's call, 2026-10-11); a browser, which cannot, has only the
 * second, and it is the main one there. The preparation's panel follows below once it starts. */
export function NoMachineScreen({
  installController = localHostInstallController,
  source = "no-machine",
  onContinueSetup,
}: { installController?: LocalHostInstallController; source?: LocalHostInstallSource; onContinueSetup?: () => void } = {}) {
  const t = translator();
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

  return (
    <section className="no-machine-screen" aria-labelledby={noMachines ? "no-machine-title" : "local-install-title"}>
      {noMachines && <>
        <span className="no-machine-icon"><MachinesIcon size={28} /></span>
        <h1 id="no-machine-title">{t("noMachine.title")}</h1>
        <p>{t("noMachine.body")}</p>
      </>}
      {twoWays && <>
        {localHostStatus.state === "absent" && install.phase === "idle" && <p className="no-machine-absent">{t("hosts.status.absent")}</p>}
        <p className="no-machine-hint">{t("localInstall.description")}</p>
        <LocalHostInstallEntry showCta={false} controller={installController} source={source} holdSuccess anotherMachine={false} />
        <PrepareThisComputer id="no-machine-prepare" controller={installController} />
      </>}
      <div className="no-machine-actions">
        {!twoWays && installHere && offer.offered && <Button variant="primary" onClick={() => installController.start(source)}>{t("localInstall.cta")}</Button>}
        <Button variant={installHere ? "secondary" : "primary"} onClick={() => window.sidevoiceActions?.openPairing()}><AddIcon />{t("noMachine.connect")}</Button>
      </div>
      {!twoWays && installHere && offer.offered && <p className="no-machine-hint">{t("localInstall.description")}</p>}
      {!twoWays && <LocalHostInstallEntry showCta={false} controller={installController} source={source} holdSuccess />}
      {/* Back into the setup where it stands, where the flow offers it: a quiet link, never the main action. */}
      {onContinueSetup && <Button variant="ghost" tone="neutral" size="sm" className="waiting-continue-setup" onClick={onContinueSetup}>{t("noMachine.continue")}</Button>}
    </section>
  );
}
