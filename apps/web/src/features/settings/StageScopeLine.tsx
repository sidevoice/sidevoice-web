import { Button } from "../../components/ui/Button";
import { useT } from "../../i18n";
import { useHosts, useHostsController } from "../../state/hosts/hosts-store";
import { stageSource, type Task } from "../../state/hosts/stage-scope";

/** The «Para» line under a stage pane's title (§5.4): which host the choice is for, and whether it is the general
 *  one or this host's own; «Usar la configuración general» whenever the host has its own. With no host, only this
 *  device's models can be chosen, and the line says why. */
export function StageScopeLine({ task }: { task: Task }) {
  const t = useT();
  const hosts = useHostsController();
  const inUse = useHosts((s) => s.inUse);
  const name = useHosts((s) => s.rows.find((r) => r.fp === s.inUse));
  const scope = useHosts((s) => s.scope);
  if (!inUse || !name)
    return (
      <div className="scope-line" data-scope="none">
        <p className="muted">{t("scope.noHost")}</p>
        <Button size="compact" onClick={() => hosts.openSettings("add-host")}>{t("scope.connect")}</Button>
      </div>
    );
  const source = stageSource(scope, inUse, task);
  return (
    <div className="scope-line" data-scope={source}>
      <p>
        <span className="muted">{t("scope.for")} </span><strong>{name.local ? t("host.thisComputer") : name.name}</strong>
        <span className="badge">{t(source === "host" ? "scope.hostOnly" : "scope.general")}</span>
      </p>
      <p className="muted small">{t(source === "host" ? "scope.hostOnly.detail" : "scope.general.detail")}</p>
      {source === "host" && <Button variant="ghost" size="compact" onClick={() => hosts.useGeneral(inUse, task)}>{t("scope.useGeneral")}</Button>}
    </div>
  );
}
