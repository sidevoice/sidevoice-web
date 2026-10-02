import { Button } from "../../components/ui/Button";
import { useRoomStore } from "../../state/room-store";
import { hostTranslator } from "../settings/host-i18n";

export function NoMachineScreen() {
  const t = hostTranslator();
  const ready = useRoomStore((state) => state.facts.machinesReady);
  const machines = useRoomStore((state) => state.machines);
  if (!ready || machines.length > 0) return null;

  return (
    <section className="no-machine-screen" aria-labelledby="no-machine-title">
      <div className="no-machine-copy">
        <h1 id="no-machine-title">{t("noMachine.title")}</h1>
        <p>{t("noMachine.body")}</p>
      </div>
      <div className="no-machine-actions">
        <Button variant="primary" onClick={() => window.sidevoiceActions?.openPairing()}>{t("noMachine.connect")}</Button>
      </div>
    </section>
  );
}
