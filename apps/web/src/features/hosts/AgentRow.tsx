/* One detected agent and how Sidevoice gets connected to it (§4.4), the same row in W3 and in a host's Agentes tab.
 * «Conectar» runs the agent's own registration (`claude mcp add`, `codex mcp add`, Cursor's file); «Hacerlo yo» shows
 * what that is — the command, or the file and what to put in it — for whoever prefers to do it, and opens by itself
 * when the automatic way failed or does not exist. «Comprobar» asks the host to look again. */
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { HarnessIcon, SidevoiceMark } from "../../components/ui/Icons";
import { useT } from "../../i18n";
import type { DetectedAgent } from "../../services/desktop-host";
import { useHosts, useHostsController } from "../../state/hosts/hosts-store";
import { CopyButton } from "./common";

/** Whether Sidevoice is connected to an agent: the mark lit (lila and mustard) or off (one ink, the fourth bar at
 *  45 %, as the brand's one-ink rule draws it), always with its words — the mark alone does not say it. */
export function SidevoiceLink({ registration }: { registration: DetectedAgent["registration"] }) {
  const t = useT();
  const on = registration === "connected";
  return (
    <span className="sv-link" data-on={on || undefined} data-registration={registration}>
      <SidevoiceMark size={14} className="sv-link-mark" />
      <span>{t("wizard.w1.registration." + registration)}</span>
    </span>
  );
}

function HowTo({ agent, fp, onChecked }: { agent: DetectedAgent; fp: string; onChecked?: () => void }) {
  const t = useT();
  const hosts = useHostsController();
  const how = agent.instructions;
  const [checking, setChecking] = useState(false);
  if (!how) return <p className="muted small">{t("agents.howto.none")}</p>;
  return (
    <div className="howto">
      {how.command && <>
        <p className="muted small">{t("agents.howto.command")}</p>
        <pre><code>{how.command}</code></pre>
        <CopyButton text={how.command} label={t("agents.howto.copyCommand")} />
      </>}
      {how.file && how.snippet && <>
        <p className="muted small">{t("agents.howto.file", { file: how.file })}</p>
        <pre><code>{how.snippet}</code></pre>
        <CopyButton text={how.snippet} label={t("agents.copyConfig")} />
      </>}
      <Button variant="ghost" size="compact" disabled={checking} onClick={async () => { setChecking(true); await hosts.loadAgents(fp, true); setChecking(false); onChecked?.(); }}>
        {checking ? t("agents.howto.checking") : t("agents.howto.check")}
      </Button>
    </div>
  );
}

export function AgentRow({ fp, agent, mode, onConnected }: { fp: string; agent: DetectedAgent; mode: "wizard" | "host"; onConnected?: (label: string) => void }) {
  const t = useT();
  const hosts = useHostsController();
  const key = fp + ":" + agent.id;
  const busy = useHosts((s) => s.agentBusy[key]);
  const error = useHosts((s) => s.agentErrors[key]);
  const manualOnly = agent.connect === "manual";
  const [open, setOpen] = useState(manualOnly);
  // A failed automatic connection shows how to do it by hand, with what went wrong above it.
  useEffect(() => { if (error) setOpen(true); }, [error]);
  const notConnected = agent.registration === "not-connected";
  const isNew = mode === "host" && agent.present && notConnected && !agent.dismissed;
  async function connect() {
    const answer = await hosts.agentAction(fp, agent.id, "connect");
    if (answer?.agent.registration === "connected") { setOpen(false); onConnected?.(answer.agent.label); }
  }
  return (
    <li className="agent-row" data-registration={agent.registration}>
      <div className="agent-line">
        <span className="agent-icon"><HarnessIcon harness={agent.id} size={18} /></span>
        <span className="agent-copy">
          <strong>{agent.label}</strong>{agent.version && <span className="muted"> · {agent.version}</span>}
          {isNew && <span className="badge badge-new">{t("hosts.newAgent")}</span>}
          {agent.registration === "foreign" && <span className="muted agent-status">{t("agents.foreign")}</span>}
        </span>
        {busy ? <span className="sv-link">{t("agents.busy." + busy)}</span> : <SidevoiceLink registration={agent.registration} />}
      </div>
      {(notConnected || (mode === "host" && agent.registration === "connected")) && (
        <div className="row-actions agent-actions">
          {notConnected && !manualOnly && <Button variant="primary" size="compact" disabled={!!busy} onClick={() => void connect()}>{t("agents.connect")}</Button>}
          {notConnected && (
            <Button variant="ghost" size="compact" aria-expanded={open} onClick={() => setOpen(!open)}>
              {manualOnly ? t("agents.howto.manualToggle") : t("agents.howto.toggle")}
            </Button>
          )}
          {mode === "host" && agent.registration === "connected" &&
            <Button variant="ghost" size="compact" disabled={!!busy} onClick={() => void hosts.agentAction(fp, agent.id, "disconnect")}>{t("agents.disconnect")}</Button>}
          {isNew && <Button variant="ghost" size="compact" disabled={!!busy} onClick={() => void hosts.agentAction(fp, agent.id, "dismiss")}>{t("agents.notNow")}</Button>}
        </div>
      )}
      {error && <p className="row-error" role="alert">{t("agents.connectFailed", { message: error.message || error.key })}</p>}
      {notConnected && open && <HowTo agent={agent} fp={fp} />}
    </li>
  );
}
