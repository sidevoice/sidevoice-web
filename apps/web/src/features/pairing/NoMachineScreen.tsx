import { useSyncExternalStore } from "react";
import { Button } from "../../components/ui/Button";
import { isVisibleLocalHostInstall, localHostInstallController, type LocalHostInstallController, type LocalHostInstallSource } from "../../services/local-host-install";
import { useRoomStore } from "../../state/room-store";
import { hostTranslator } from "../settings/host-i18n";
import { LocalHostInstallEntry } from "./LocalHostInstallEntry";

export function NoMachineScreen({
  installController = localHostInstallController,
  source = "no-machine",
}: { installController?: LocalHostInstallController; source?: LocalHostInstallSource } = {}) {
  const t = hostTranslator();
  const ready = useRoomStore((state) => state.facts.machinesReady);
  const machines = useRoomStore((state) => state.machines);
  const install = useSyncExternalStore(installController.subscribe, installController.getSnapshot, installController.getSnapshot);
  const localInstallPanel = machines.length > 0 && isVisibleLocalHostInstall(install, source);
  if (!ready || (machines.length > 0 && !localInstallPanel)) return null;
  const noMachines = machines.length === 0;

  return (
    <section className="no-machine-screen" aria-labelledby={noMachines ? "no-machine-title" : "local-install-title"}>
      {noMachines && <div className="no-machine-copy">
        <h1 id="no-machine-title">{t("noMachine.title")}</h1>
        <p>{t("noMachine.body")}</p>
      </div>}
      <div className="no-machine-actions">
        <Button variant="primary" onClick={() => window.sidevoiceActions?.openPairing()}>{t("noMachine.connect")}</Button>
        <LocalHostInstallEntry showCta={noMachines} controller={installController} source={source} holdSuccess />
      </div>
    </section>
  );
}
