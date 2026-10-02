import { useSyncExternalStore } from "react";
import { Button } from "../../components/ui/Button";
import { localHostInstallController, type LocalHostInstallController } from "../../services/local-host-install";
import { useRoomStore } from "../../state/room-store";
import { hostTranslator } from "../settings/host-i18n";
import { LocalHostInstallEntry } from "./LocalHostInstallEntry";

export function NoMachineScreen({ installController = localHostInstallController }: { installController?: LocalHostInstallController } = {}) {
  const t = hostTranslator();
  const ready = useRoomStore((state) => state.facts.machinesReady);
  const machines = useRoomStore((state) => state.machines);
  const install = useSyncExternalStore(installController.subscribe, installController.getSnapshot, installController.getSnapshot);
  const nativeInstallInProgress = install.phase === "installing" && machines.some((machine) => machine.local && machine.localStatus === "installing");
  if (!ready || (machines.length > 0 && !nativeInstallInProgress)) return null;
  const noMachines = machines.length === 0;

  return (
    <section className="no-machine-screen" aria-labelledby={noMachines ? "no-machine-title" : "local-install-title"}>
      {noMachines && <div className="no-machine-copy">
        <h1 id="no-machine-title">{t("noMachine.title")}</h1>
        <p>{t("noMachine.body")}</p>
      </div>}
      <div className="no-machine-actions">
        <Button variant="primary" onClick={() => window.sidevoiceActions?.openPairing()}>{t("noMachine.connect")}</Button>
        <LocalHostInstallEntry showCta={noMachines} controller={installController} />
      </div>
    </section>
  );
}
