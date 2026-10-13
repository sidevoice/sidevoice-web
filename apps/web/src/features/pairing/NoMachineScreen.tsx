import { useSyncExternalStore } from "react";
import { Button } from "../../components/ui/Button";
import { AddIcon, MachinesIcon } from "../../components/ui/Icons";
import { isVisibleLocalHostInstall, localHostInstallController, type LocalHostInstallController, type LocalHostInstallSource } from "../../services/local-host-install";
import { useRoomStore } from "../../state/room-store";
import { hostTranslator } from "../settings/host-i18n";
import { LocalHostInstallEntry, useLocalInstallOffer } from "./LocalHostInstallEntry";
import "./pairing.css";

/* The first screen without a machine. Where this app can prepare this computer, doing so is the main action and
 * connecting to another machine the second (the operator's call, 2026-10-11); a browser, which cannot, has only the
 * second, and it is the main one there. The preparation's panel follows below once it starts. */
export function NoMachineScreen({
  installController = localHostInstallController,
  source = "no-machine",
}: { installController?: LocalHostInstallController; source?: LocalHostInstallSource } = {}) {
  const t = hostTranslator();
  const ready = useRoomStore((state) => state.facts.machinesReady);
  const machines = useRoomStore((state) => state.machines);
  const install = useSyncExternalStore(installController.subscribe, installController.getSnapshot, installController.getSnapshot);
  const offer = useLocalInstallOffer(installController);
  const localInstallPanel = machines.length > 0 && isVisibleLocalHostInstall(install, source);
  if (!ready || (machines.length > 0 && !localInstallPanel)) return null;
  const noMachines = machines.length === 0;
  const installHere = noMachines && offer.supported;

  return (
    <section className="no-machine-screen" aria-labelledby={noMachines ? "no-machine-title" : "local-install-title"}>
      {noMachines && <>
        <span className="no-machine-icon"><MachinesIcon size={28} /></span>
        <h1 id="no-machine-title">{t("noMachine.title")}</h1>
        <p>{t("noMachine.body")}</p>
      </>}
      <div className="no-machine-actions">
        {installHere && offer.offered && <Button variant="primary" onClick={() => installController.start(source)}>{t("localInstall.cta")}</Button>}
        <Button variant={installHere ? "secondary" : "primary"} onClick={() => window.sidevoiceActions?.openPairing()}><AddIcon />{t("noMachine.connect")}</Button>
      </div>
      {installHere && offer.offered && <p className="no-machine-hint">{t("localInstall.description")}</p>}
      <LocalHostInstallEntry showCta={false} controller={installController} source={source} holdSuccess />
    </section>
  );
}
