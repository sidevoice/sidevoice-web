import { Button } from "../../components/ui/Button";
import { useT } from "../../i18n";
import { useHosts, useHostsController } from "../../state/hosts/hosts-store";
import type { Task } from "../../state/hosts/stage-scope";

/** The «Para» line under a stage pane's title (§5.4): the machine the choice is for — each machine has its own
 *  (operator, 2026-10-02). With no machine, only this device's models can be chosen, and the line says why. */
export function StageScopeLine({ task: _task }: { task: Task }) {
  const t = useT();
  const hosts = useHostsController();
  const inUse = useHosts((s) => s.inUse);
  const name = useHosts((s) => s.rows.find((r) => r.fp === s.inUse));
  if (!inUse || !name)
    return (
      <div className="scope-line" data-scope="none">
        <p className="muted">{t("scope.noHost")}</p>
        <Button size="compact" onClick={() => hosts.openSettings("add-host")}>{t("scope.connect")}</Button>
      </div>
    );
  return (
    <div className="scope-line" data-scope="host">
      <p><span className="muted">{t("scope.for")} </span><strong>{name.local ? t("host.thisComputer") : name.name}</strong></p>
      <p className="muted small">{t("scope.perMachine")}</p>
    </div>
  );
}
