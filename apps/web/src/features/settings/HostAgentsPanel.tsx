import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { DisclosureButton } from "../../components/ui/DisclosureButton";
import { cn } from "../../lib/cn";
import { ChevronIcon, ConnectorIcon, HarnessIcon, RefreshIcon } from "../../components/ui/Icons";
import { Snippet } from "../../components/ui/Snippet";
import { ErrorDetails } from "../../components/ui/ErrorText";
import { Tooltip } from "../../components/ui/Tooltip";
import type { AgentManualStep, DetectedAgent, HostAgentsListing, HostAgentsState } from "../../state/room-types";
import { useRoomStore } from "../../state/room-store";
import { actionableAgent } from "../../services/host-agents";
import { translator, type Translate, type MessageKey } from "../../i18n/translator";
import { errorMessage, keyFor, type ErrorMessage } from "./error-message";
import { NewMark } from "../highlights/highlights";
import { InfoTip } from "../../components/ui/InfoTip";
import "./host-agents.css";
import { uiLocale } from "../../i18n/locale";
import { AgentReadiness, AgentReadinessDetails } from "./AgentReadiness";

/** A machine's failure with its agents, in words (error-message.ts): its key's sentence, else this panel's own generic
 *  line, the key behind Details. */
function translatedError(t: Translate, key: string, params?: Record<string, string | number>): ErrorMessage {
  return errorMessage({ key }, { t, generic: t("agents.error.unknown"), known: (code) => {
    const known = keyFor("agents.error.", code);
    return known ? t(known, params) : null;
  } });
}

/** How long ago `value` was, in words ("2 minutes ago"), kept current as time passes. */
function useRelativeTime(value: string | number | null | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (value == null) return "";
  const at = new Date(typeof value === "number" && value < 1e12 ? value * 1000 : value).valueOf();
  if (Number.isNaN(at)) return "";
  const seconds = Math.round((at - Math.max(now, at)) / 1000);
  const words = new Intl.RelativeTimeFormat(uiLocale(), { numeric: "auto" });
  const minutes = Math.round(seconds / 60), hours = Math.round(seconds / 3600), days = Math.round(seconds / 86400);
  return seconds > -45 ? words.format(0, "second") : minutes > -45 ? words.format(minutes, "minute") : hours > -22 ? words.format(hours, "hour") : words.format(days, "day");
}

/** How to add Sidevoice to the agent by hand, or (`removing`) take it out; the list is read again meanwhile, so the row
 *  follows what was done. */
/** What doing it by hand means for an agent as it stands: connecting it, taking Sidevoice out, or replacing another
 *  "sidevoice" entry — the connector's steps for its harness. */
type ManualKind = "connect" | "update" | "disconnect" | "replace";
const REGISTRATIONS = new Set<string>(["connected", "not-connected", "foreign", "outdated", "invalid", "unknown"]);
function manualKind(agent: DetectedAgent): ManualKind {
  return agent.registration === "connected" ? "disconnect" : agent.registration === "foreign" ? "replace"
    : agent.registration === "outdated" ? "update" : "connect";
}
function manualSteps(agent: DetectedAgent, kind: ManualKind): AgentManualStep[] {
  // An update's steps where the connector gives them; else a replacement's (remove, then add), else adding.
  const steps = agent.manual?.[kind] ?? (kind === "update" ? agent.manual?.replace ?? agent.manual?.connect : undefined)
    ?? ((kind === "connect" || kind === "update") && agent.instructions ? [agent.instructions] : kind === "disconnect" && agent.removal ? [agent.removal] : []);
  return steps.filter((step) => step.command?.trim() || step.snippet?.trim());
}

/** `steps` with commands that follow one another (and nothing else in them) joined into one, a line each. */
function groupedSteps(steps: AgentManualStep[]): AgentManualStep[] {
  const grouped: AgentManualStep[] = [];
  for (const step of steps) {
    const onlyCommand = !!step.command?.trim() && !step.snippet?.trim();
    const last = grouped[grouped.length - 1];
    if (onlyCommand && last && last.command?.trim() && !last.snippet?.trim()) last.command = last.command.trimEnd() + "\n" + step.command!.trim();
    else grouped.push(onlyCommand ? { command: step.command!.trim() } : step);
  }
  return grouped;
}

function Instructions({ agent, fp, id, kind, onClose }: { agent: DetectedAgent; fp: string; id: string; kind: ManualKind; onClose: () => void }) {
  const t = translator();
  const status = useRoomStore((state) => state.facts.hostAgents[fp]?.status ?? "idle");
  const steps = manualSteps(agent, kind);
  // On another machine the steps are run there, and said so; on this device, nothing to say.
  const machine = useRoomStore((state) => state.machines.find((entry) => entry.pairingId === fp) ?? null);
  const remoteName = machine && !machine.local ? machine.host || t("hosts.unnamed") : null;
  useEffect(() => {
    if (!steps.length || status === "loading") return;
    const timer = window.setInterval(() => {
      void window.sidevoiceActions?.loadHostAgents?.(fp, { rescan: true, watch: agent.id });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [fp, agent.id, steps.length, status]);
  return (
    <div className="host-agent-howto" id={id}>
      {!steps.length ? <p className="muted">{t("agents.manual.none")}</p> : <>
        {/* The connector's steps, in order, each one to copy: commands one after another are one step, one per line,
            copied at once; anything else (a file to edit, a snippet to paste) is a step of its own. */}
        {remoteName && <p className="host-agent-where">{t("agents.manual.runOn", { machine: remoteName })}</p>}
        <ol className="host-agent-steps">{groupedSteps(steps).map((step, index) => <li key={index}>
          {step.command?.trim() && <><p className="host-agent-howto-label">{t(step.command.includes("\n") ? "agents.manual.commands" : "agents.manual.command")}</p><Snippet text={step.command} /></>}
          {step.snippet?.trim() && <><p className="host-agent-howto-label">{step.file ? t("agents.manual.file", { file: step.file }) : t("agents.manual.snippet")}</p><Snippet text={step.snippet} /></>}
        </li>)}</ol>
        <p className="muted" role="status">{t(kind === "disconnect" ? "agents.manual.removeWaiting" : kind === "replace" || kind === "update" ? "agents.manual.foreignWaiting" : "agents.manual.waiting")}</p>
        <Button variant="ghost" size="sm" onClick={onClose}>{t("agents.close")}</Button>
      </>}
    </div>
  );
}

export function HostAgentRow({ fp, agent }: { fp: string; agent: DetectedAgent }) {
  const t = translator();
  const rowState = useRoomStore((state) => state.facts.hostAgents[fp]);
  const busy = rowState?.busy[agent.id];
  const error = rowState?.actionErrors[agent.id];
  const [open, setOpen] = useState(false);
  // Disconnecting asks first, saying what it does: Sidevoice taken out of the agent's MCP servers (the connector runs
  // `claude mcp remove`, `codex mcp remove`, or edits Cursor's mcp.json); its new sessions then have no voice tools.
  const [confirming, setConfirming] = useState(false);
  const [justConnected, setJustConnected] = useState(false);
  const previous = useRef(agent.registration);
  // What the connector can do itself; an older one says only connect "auto" | "manual".
  const can = agent.can ?? { connect: agent.connect === "auto", update: agent.connect === "auto", disconnect: true };
  const manualOnly = !can.connect;
  // A registration this app does not know (sidevoice-core#112) reads as unknown, never as Not connected: nothing to do
  // by hand, and Connect only where the connector itself says it can.
  const recognized = REGISTRATIONS.has(agent.registration);
  const readOnly = agent.registration === "foreign" || agent.registration === "invalid" || agent.registration === "unknown"
    || (!recognized && agent.can?.connect !== true);
  const isNew = !readOnly && actionableAgent(agent);
  const kind = manualKind(agent);
  const hasManualInstructions = recognized && manualSteps(agent, kind).length > 0;
  const panelId = `host-agent-howto-${fp.slice(0, 7)}-${agent.id}`;
  const readinessId = `host-agent-readiness-${fp.slice(0, 7)}-${agent.id}`;
  const [readinessOpen, setReadinessOpen] = useState(false);

  useEffect(() => { if (error) setOpen(true); }, [error]);
  useEffect(() => {
    if ((previous.current === "not-connected" || previous.current === "foreign") && agent.registration === "connected") {
      setOpen(false);
      setJustConnected(true);
    }
    previous.current = agent.registration;
  }, [agent.registration]);
  useEffect(() => {
    if (!justConnected) return;
    const timer = window.setTimeout(() => setJustConnected(false), 5000);
    return () => window.clearTimeout(timer);
  }, [justConnected]);

  const run = (action: "connect" | "disconnect") =>
    void window.sidevoiceActions?.hostAgentAction?.(fp, agent.id, action);
  const failure = error ? translatedError(t, error.key, error.params) : null;
  const errorText = failure?.text ?? null;
  // Three states to read at a glance — Connected, Not connected, Needs attention (an entry an older Sidevoice made,
  // another 'sidevoice' entry, settings that can't be read) — the last with its reason after it, the row's action beside.
  const status: { text: string; tone: "ok" | "error" | "muted" | "attention" | ""; info?: string; reason?: string } = errorText ? { text: errorText, tone: "error" }
    : busy ? { text: t(`agents.busy.${busy}` as MessageKey), tone: "muted" }
    : justConnected && agent.registration === "connected" ? { text: t("agents.justConnected", { agent: agent.label }), tone: "ok" }
    : agent.registration === "connected" ? { text: t("agents.state.connected"), tone: "ok" }
    // Short in the row; what it means and what to do, only in its (i).
    : agent.registration === "foreign" ? { text: t("agents.state.attention"), reason: t("agents.foreign"), tone: "attention", info: t("agents.foreign.info", { agent: agent.label }) }
    : agent.registration === "outdated" ? { text: t("agents.state.attention"), reason: t("agents.outdated"), tone: "attention", info: t("agents.outdated.info", { agent: agent.label }) }
    : agent.registration === "invalid" ? { text: t("agents.state.attention"), reason: t("agents.invalid"), tone: "attention", info: t("agents.invalid.info", { agent: agent.label, file: agent.instructions?.file ?? "" }) }
    : agent.registration === "unknown" || !recognized ? { text: t("agents.unknown"), tone: "muted" }
    : { text: t("agents.state.notConnected"), tone: "muted", ...(manualOnly ? { reason: t("agents.manualOnly") } : {}) };
  const connected = agent.registration === "connected";
  const outdated = agent.registration === "outdated";
  // The confirm goes: the focus goes back to Disconnect (after Remove, to the row's action as it now stands).
  const action = useRef<HTMLButtonElement>(null);
  const cancelConfirm = () => { setConfirming(false); requestAnimationFrame(() => action.current?.focus()); };
  // The hints say what each button does: Sidevoice doing it, or the person.
  const handHint = t(connected ? "agents.hint.removeByHand" : agent.registration === "foreign" ? "agents.hint.replaceByHand" : agent.registration === "outdated" ? "agents.hint.updateByHand" : "agents.hint.byHand", { agent: agent.label });
  return (
    <li className="host-agent-row" data-registration={agent.registration} data-open={open || undefined}>
      <div className="host-agent-main">
        <span className="host-agent-icon">{agent.id === "other" ? <ConnectorIcon size={16} /> : <HarnessIcon harness={agent.id} size={18} />}</span>
        <span className="host-agent-copy">
          <span className="host-agent-name"><strong>{agent.label}</strong>{agent.version && <span className="muted"> {agent.version}</span>}
            <NewMark id={`agent:${fp}:${agent.id}`} />
          </span>
          {/* Always one status line under the name, so a row never changes height: what went wrong, else a moment of
              "ready" once connected, else where it stands. */}
          <span className="host-agent-status-line">
            <span className={cn("host-agent-status", status.tone === "ok" && "host-agent-ok", status.tone === "error" && "host-agent-error", status.tone === "muted" && "muted", status.tone === "attention" && "host-agent-attention")}
              role={errorText ? "alert" : "status"} title={status.reason ? status.text + " · " + status.reason : status.text}>{status.text}{status.reason && <span className="host-agent-reason"> · {status.reason}</span>}</span>
            {failure && <ErrorDetails details={failure.details} />}
            {status.info && <InfoTip label={t("agents.statusInfo", { agent: agent.label })}>{status.info}</InfoTip>}
            {agent.readiness && <AgentReadiness readiness={agent.readiness} id={readinessId} open={readinessOpen} onToggle={() => setReadinessOpen((value) => !value)} />}
          </span>
        </span>
        {/* Every action a button on the row, each with a hint: doing it by hand (add, replace, or take Sidevoice out), and
            Connect or Disconnect, which Sidevoice does itself. */}
        <span className="host-agent-actions">
          {hasManualInstructions && <Tooltip content={handHint}>
            <DisclosureButton disabled={!!busy} open={open} controls={panelId} onClick={() => setOpen((value) => !value)}>
              {t(agent.registration === "foreign" ? "agents.foreign.manual.toggle" : "agents.manual.toggle")}
            </DisclosureButton>
          </Tooltip>}
          {connected ? can.disconnect !== false && <Tooltip content={t("agents.hint.disconnect", { agent: agent.label })}>
              <Button ref={action} variant="ghost" size="sm" loading={busy === "disconnect"} disabled={busy === "connect" || confirming} aria-label={t("agents.disconnectNamed", { agent: agent.label })}
                onClick={() => setConfirming(true)}>{t("agents.disconnect")}</Button>
            </Tooltip>
            // An entry an older Sidevoice made reads Update, as its (i) says; the connector's connect rewrites it.
            : !readOnly && (outdated ? can.update ?? can.connect : can.connect) && <Tooltip content={t(outdated ? "agents.hint.update" : "agents.hint.connect", { agent: agent.label })}>
              <Button ref={action} variant="primary" size="sm" loading={busy === "connect"} disabled={busy === "disconnect"} aria-label={t(outdated ? "agents.updateNamed" : "agents.connectNamed", { agent: agent.label })}
                onClick={() => run("connect")}>{t(outdated ? "agents.update" : "agents.connect")}</Button>
            </Tooltip>}
        </span>
      </div>
      {agent.readiness && readinessOpen && <AgentReadinessDetails readiness={agent.readiness} id={readinessId} />}
      {confirming && agent.registration === "connected" && !busy && <div className="host-agent-confirm" role="group" aria-label={t("agents.disconnectNamed", { agent: agent.label })}
        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelConfirm(); } }}>
        <p>{t("agents.disconnectConfirm", { agent: agent.label })}</p>
        <span className="host-agent-confirm-actions">
          <Button variant="ghost" tone="neutral" size="sm" autoFocus onClick={cancelConfirm}>{t("hosts.cancel")}</Button>
          <Button variant="danger" size="sm" onClick={() => { cancelConfirm(); run("disconnect"); }}>{t("agents.disconnectYes", { agent: agent.label })}</Button>
        </span>
      </div>}
      {open && recognized && agent.registration !== "unknown" &&
        <Instructions agent={agent} fp={fp} id={panelId} kind={kind} onClose={() => setOpen(false)} />}
    </li>
  );
}

/** Sidevoice's own entry in the connector's `mcpServers` configuration, as it goes into an agent's list of MCP servers:
 *  `"sidevoice": { "command", "args", "env" }` — the same command, arguments and environment the connector registers
 *  with Claude Code, Codex and Cursor. Else (a configuration of another shape) the configuration as it came. */
export function sidevoiceEntry(snippet: string): string {
  try {
    const entry = (JSON.parse(snippet) as { mcpServers?: { sidevoice?: unknown } }).mcpServers?.sidevoice;
    if (entry && typeof entry === "object") return `"sidevoice": ${JSON.stringify(entry, null, 2)}`;
  } catch { /* not JSON: shown as it came */ }
  return snippet;
}

/** For an agent the list does not show: one discreet link at its foot, opening how to connect any MCP agent by hand —
 *  add Sidevoice to the agent's list of MCP servers, with its entry to paste there. The command alone is not offered:
 *  the entry holds it with its arguments and the environment it needs, which the command line leaves out. */
function OtherAgentSection({ custom }: { custom: HostAgentsListing["custom"] }) {
  const t = translator();
  const [open, setOpen] = useState(false);
  if (!custom?.snippet) return null;
  return (
    <section className="host-agent-other">
      <button type="button" className="host-agent-other-link" aria-expanded={open} aria-controls="host-agent-other-howto" onClick={() => setOpen((value) => !value)}>
        {t("agents.other.link")}<ChevronIcon size={14} className={open ? "host-agent-chevron-up" : undefined} />
      </button>
      {open && <div className="host-agent-howto" id="host-agent-other-howto">
        <p className="muted">{t("agents.other.detail")}</p>
        <Snippet text={sidevoiceEntry(custom.snippet)} label={t("agents.other.copy")} />
      </div>}
    </section>
  );
}

function scanError(t: Translate, key: string, params?: Record<string, string | number>): ErrorMessage {
  if (key === "no-connector") return { text: t("agents.noConnector") };
  if (key === "unreachable" || key === "timeout") return { text: t("agents.unreachable") };
  return translatedError(t, key, params);
}

/** Why a search failed, quietly, with its Details. */
function ScanError({ why }: { why: ErrorMessage }) {
  return <div><p className="muted">{why.text}</p><ErrorDetails details={why.details} /></div>;
}

export function HostAgentsPanel({ fp }: { fp: string | null }) {
  const t = translator();
  const listing = useRoomStore((state) => fp ? state.facts.hostAgents[fp] : undefined) as HostAgentsState | undefined;
  const value = listing?.value;
  const searchedAgo = useRelativeTime(value?.scanned_at);
  useEffect(() => {
    if (fp) void window.sidevoiceActions?.loadHostAgents?.(fp, { rescan: true });
  }, [fp]);

  if (!fp) return <div className="host-agent-problem" role="alert"><p>{t("agents.unreachable")}</p></div>;
  // A search that failed with nothing found before: the heading stays, and why, quietly, with searching again. With a
  // list already shown (a rescan while connecting by hand blipped), the list stays and the header says it.
  if (listing?.status === "failed" && !value) return (
    <section className="host-agents" aria-labelledby="host-agents-title">
      <div className="host-agents-heading"><h4 id="host-agents-title" tabIndex={-1}>{t("agents.heading")}</h4></div>
      <div className="host-agent-problem-quiet">
        <ScanError why={scanError(t, listing.error?.key ?? "unknown", listing.error?.params)} />
        <Button size="sm" variant="secondary" onClick={() => void window.sidevoiceActions?.loadHostAgents?.(fp, { rescan: true })}>{t("agents.refresh")}</Button>
      </div>
    </section>
  );
  if (!value && (listing?.status === "loading" || !listing || listing.status === "idle")) return <p className="muted" role="status">{t("agents.scanning")}</p>;

  // Only the agents installed on the machine; any other is connected by hand (OtherAgentSection, always below).
  const rows = (value?.agents ?? []).filter((agent) => agent.present);
  const scanning = listing?.status === "loading";
  const failed = listing?.status === "failed";
  return (
    <section className="host-agents" aria-labelledby="host-agents-title">
      {/* The heading, when the list was searched (in words, as time passes), and searching again as an icon. */}
      <div className="host-agents-heading">
        <h4 id="host-agents-title" tabIndex={-1}>{t("agents.heading")}</h4>
        {/* Not a live region: it changes every minute, and with each rescan while connecting by hand. */}
        <span className="host-agents-scanned" data-failed={failed || undefined}>{scanning ? t("agents.searching") : failed ? t("agents.searchFailed") : searchedAgo ? t("agents.searchedAgo", { time: searchedAgo }) : ""}</span>
        <Tooltip content={t("agents.searchAgain")}>
          <Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("agents.searchAgain")} loading={scanning}
            onClick={() => void window.sidevoiceActions?.loadHostAgents?.(fp, { rescan: true })}>
            <RefreshIcon size={16} />
          </Button>
        </Tooltip>
      </div>
      {rows.length === 0 ? <p className="muted">{t("agents.none")}</p> : <ul className="host-agent-rows">
        {rows.map((agent) => <HostAgentRow key={agent.id} fp={fp} agent={agent} />)}
      </ul>}
      <OtherAgentSection custom={value?.custom} />
    </section>
  );
}
