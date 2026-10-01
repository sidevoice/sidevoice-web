import { Button } from "../../components/ui/Button";
import { ChevronIcon, MachinesIcon } from "../../components/ui/Icons";
import { useT } from "../../i18n";
import { useHosts, useHostsController } from "../../state/hosts/hosts-store";
import { HostDot, PhraseText } from "./common";

/** Configuración › Máquinas (§5.2): the local host first, then the remote ones. A row says its state, its name, how
 *  it is reached, a new agent if there is one, and «Usar» / «En uso»; the chevron opens its page. */
export function HostList() {
  const t = useT();
  const hosts = useHostsController();
  const rows = useHosts((s) => s.rows);
  const inApp = useHosts((s) => s.inApp);
  const canHostAgents = useHosts((s) => s.canHostAgents);
  const hasLocal = useHosts((s) => !!s.localPairing || (s.local !== null && s.local.state !== "absent"));
  return (
    <section className="host-list" aria-labelledby="hosts-title">
      <h3 id="hosts-title"><MachinesIcon /> {t("hosts.title")}</h3>
      {rows.length === 0 && <p className="muted">{t("hosts.empty")}</p>}
      <ul className="host-rows">
        {rows.map((row) => (
          <li key={row.fp} className="host-row" data-dot={row.dot} data-in-use={row.inUse || undefined}>
            <button type="button" className="host-row-main" onClick={() => hosts.openSettings("host", row.fp)} aria-label={t("hosts.open", { name: row.name })}>
              <HostDot dot={row.dot} />
              <span className="host-row-copy">
                <span className="host-row-name">{row.name || t("hosts.unnamed")}{row.newAgent && <span className="badge badge-new">{t("hosts.newAgent")}</span>}</span>
                <span className="host-row-sub muted"><PhraseText phrase={row.subtitle} />{row.cause && <> · <PhraseText phrase={row.cause} /></>}</span>
              </span>
            </button>
            {row.inUse ? <span className="badge badge-in-use">{t("hosts.inUse")}</span>
              : <Button variant="ghost" size="compact" disabled={!row.usable} onClick={() => hosts.use(row.fp)} aria-label={t("hosts.useNamed", { name: row.name })}>{t("hosts.use")}</Button>}
            <button type="button" className="host-row-chevron" aria-hidden="true" tabIndex={-1} onClick={() => hosts.openSettings("host", row.fp)}><ChevronIcon className="chevron-right" /></button>
          </li>
        ))}
        {inApp && canHostAgents && !hasLocal && (
          <li className="host-row host-row-offer">
            <button type="button" className="host-row-main" onClick={() => { hosts.closeSettings(); void hosts.choosePath("agents").then(() => hosts.openWizard("W1")); }}>
              <span className="host-dot" data-dot="off" aria-hidden="true" />
              <span className="host-row-copy"><span className="host-row-name">{t("hosts.useAgentsHere")}</span><span className="host-row-sub muted">{t("hosts.useAgentsHereDetail")}</span></span>
            </button>
          </li>
        )}
      </ul>
      {rows.length > 1 && <p className="muted small">{t("hosts.switchNote")}</p>}
      <div className="host-list-foot"><Button variant="ghost" onClick={() => hosts.openSettings("add-host")}>+ {t("hosts.add")}</Button></div>
    </section>
  );
}
