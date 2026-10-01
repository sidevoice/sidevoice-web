/* One detected agent and how Sidevoice gets connected to it (§4.4), the same row in W3 and in a host's Agentes tab.
 * «Conectar» runs the agent's own registration (`claude mcp add`, `codex mcp add`, Cursor's file); «Hacerlo yo» shows
 * what that is — the command, or the file and what to put in it — for whoever prefers to do it, and opens by itself
 * when the automatic way failed or does not exist. «Comprobar» asks the host to look again. */
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { ChevronIcon, ConnectorIcon, CopyIcon, HarnessIcon, SidevoiceMark } from "../../components/ui/Icons";
import { useT } from "../../i18n";
import type { DetectedAgent } from "../../services/desktop-host";
import { useHosts, useHostsController } from "../../state/hosts/hosts-store";

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

/** The id of the row that stands for any agent the connector has no module for. */
export const OTHER = "other";

function CodeBlock({ code }: { code: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="code-block">
      <pre><code>{code}</code></pre>
      <button type="button" className="code-copy" aria-label={t("common.copy")} title={t("common.copy")}
        onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* the code is selectable */ } }}>
        <CopyIcon size={15} />{copied && <span>{t("common.copied")}</span>}
      </button>
    </div>
  );
}

/** «Otro agente»: any MCP-capable agent, by the host's generic configuration. */
export function otherAgent(custom: { command: string; snippet: string } | null | undefined, label: string): DetectedAgent | null {
  return custom ? { id: OTHER, label, present: true, version: null, registration: "not-connected", connect: "manual", instructions: custom } : null;
}

/** How to connect it by hand, unfolded inside the agent's own card (operator, 2026-10-01: no floating panel): the
 *  command (or the file and its snippet) as code, copied with one click, and «Ya está, comprobar». */
function HowToPanel({ agent, fp, id, onDone }: { agent: DetectedAgent; fp: string; id: string; onDone: () => void }) {
  const t = useT();
  const hosts = useHostsController();
  const how = agent.instructions;
  const other = agent.id === OTHER;
  const hasHow = !!how;
  // Connected by hand: the host re-reads the agent's own configuration every few seconds while this is open, and the
  // row turns «Conectado» by itself. «Otro agente» cannot be read, so there is nothing to wait for there.
  useEffect(() => {
    if (other || !hasHow) return;
    const timer = setInterval(() => void hosts.loadAgents(fp, true, agent.id), 4000);
    return () => clearInterval(timer);
  }, [other, hasHow, hosts, fp, agent.id]);
  return (
    <div className="agent-howto" id={id}>
      {!how ? <p className="muted small">{t("agents.howto.none")}</p> : <>
        {other && <p className="muted small">{t("agents.other.detail")}</p>}
        {how.command && <><p className="howto-label">{other ? t("agents.other.command") : t("agents.howto.command")}</p><CodeBlock code={how.command} /></>}
        {how.snippet && <><p className="howto-label">{how.file ? t("agents.howto.file", { file: how.file }) : t("agents.other.json")}</p><CodeBlock code={how.snippet} /></>}
        {!other && <p className="howto-wait" role="status"><span className="wait-dot" aria-hidden="true" />{t("agents.howto.waiting")}</p>}
        {other && <div className="howto-foot"><Button variant="ghost" size="compact" onClick={onDone}>{t("common.close")}</Button></div>}
      </>}
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
  const [open, setOpen] = useState(false);
  const panelId = "howto-" + fp.slice(0, 6) + "-" + agent.id;
  // A failed automatic connection opens the way to do it by hand.
  useEffect(() => { if (error) setOpen(true); }, [error]);
  const notConnected = agent.registration === "not-connected";
  const isNew = mode === "host" && agent.present && notConnected && !agent.dismissed;
  // Connected some other way (by hand, from the panel): said like a «Conectar» that worked.
  // Just connected (by «Conectar» or by hand): said in the card itself, small and green, for a few seconds.
  const was = useRef(agent.registration);
  const [justConnected, setJustConnected] = useState(false);
  useEffect(() => {
    if (was.current === "not-connected" && agent.registration === "connected") { setOpen(false); setJustConnected(true); onConnected?.(agent.label); }
    was.current = agent.registration;
  }, [agent.registration, agent.label, onConnected]);
  useEffect(() => {
    if (!justConnected) return;
    const timer = setTimeout(() => setJustConnected(false), 5000);
    return () => clearTimeout(timer);
  }, [justConnected]);
  async function connect() { await hosts.agentAction(fp, agent.id, "connect"); }
  return (
    <li className="agent-row" data-registration={agent.registration} data-open={open || undefined}>
      <div className="agent-main">
      <span className="agent-icon">{agent.id === OTHER ? <ConnectorIcon size={16} /> : <HarnessIcon harness={agent.id} size={18} />}</span>
      <span className="agent-copy">
        <span className="agent-name"><strong>{agent.label}</strong>{agent.version && <span className="muted"> {agent.version}</span>}
          {isNew && <span className="badge badge-new">{t("hosts.newAgent")}</span>}</span>
        {justConnected && <span className="agent-status agent-ok" role="status">{t("agents.justConnected")}</span>}
        {error && <span className="agent-status row-error" role="alert">{t("agents.connectFailed", { message: error.message || error.key })}</span>}
        {!error && agent.registration === "foreign" && <span className="agent-status muted">{t("agents.foreign")}</span>}
        {!error && agent.id === OTHER && <span className="agent-status muted">{t("agents.other.sub")}</span>}
        {!error && manualOnly && notConnected && agent.id !== OTHER && <span className="agent-status muted">{t("agents.manualOnly")}</span>}
      </span>
      <span className="agent-end">
        {busy ? <span className="sv-link">{t("agents.busy." + busy)}</span>
          : agent.registration === "connected" ? <>
            <SidevoiceLink registration="connected" />
            {mode === "host" && <Button variant="ghost" size="compact" onClick={() => void hosts.agentAction(fp, agent.id, "disconnect")}>{t("agents.disconnect")}</Button>}
          </> : agent.registration === "foreign" ? <SidevoiceLink registration="foreign" />
          : <>
            {isNew && <Button variant="ghost" size="compact" onClick={() => void hosts.agentAction(fp, agent.id, "dismiss")}>{t("agents.notNow")}</Button>}
            <Button variant="ghost" size="compact" className="howto-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
              {manualOnly ? t("agents.howto.manualToggle") : t("agents.howto.toggle")}<ChevronIcon size={14} className={open ? "chevron-up" : undefined} />
            </Button>
            {!manualOnly && <Button variant="primary" size="compact" onClick={() => void connect()}>{t("agents.connect")}</Button>}
          </>}
      </span>
      </div>
      {open && notConnected && <HowToPanel agent={agent} fp={fp} id={panelId} onDone={() => setOpen(false)} />}
    </li>
  );
}
