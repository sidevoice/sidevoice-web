import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { ChevronIcon, ConnectorIcon, HarnessIcon, RefreshIcon } from "../../components/ui/Icons";
import { Snippet } from "../../components/ui/Snippet";
import { Tooltip } from "../../components/ui/Tooltip";
import type { AgentManualStep, DetectedAgent, HostAgentsListing, HostAgentsState } from "../../state/room-types";
import { useRoomStore } from "../../state/room-store";
import { actionableAgent } from "../../services/host-agents";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import type { HostMessageKey } from "./messages/en";
import { NewMark } from "../highlights/highlights";
import { InfoTip } from "../../components/ui/InfoTip";
import "./host-agents.css";

function translatedError(t: HostTranslate, key: string, params?: Record<string, string | number>): string {
  const messageKey = `agents.error.${key}` as HostMessageKey;
  const message = t(messageKey, params);
  return message === messageKey ? t("agents.error.unknown") : message;
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
  const words = new Intl.RelativeTimeFormat(document.documentElement.lang || navigator.language, { numeric: "auto" });
  const minutes = Math.round(seconds / 60), hours = Math.round(seconds / 3600), days = Math.round(seconds / 86400);
  return seconds > -45 ? words.format(0, "second") : minutes > -45 ? words.format(minutes, "minute") : hours > -22 ? words.format(hours, "hour") : words.format(days, "day");
}

/** How to add Sidevoice to the agent by hand, or (`removing`) take it out; the list is read again meanwhile, so the row
 *  follows what was done. */
/** What doing it by hand means for an agent as it stands: connecting it, taking Sidevoice out, or replacing another
 *  "sidevoice" entry — the connector's steps for its harness. */
type ManualKind = "connect" | "disconnect" | "replace";
function manualKind(agent: DetectedAgent): ManualKind {
  return agent.registration === "connected" ? "disconnect" : agent.registration === "foreign" ? "replace" : "connect";
}
function manualSteps(agent: DetectedAgent, kind: ManualKind): AgentManualStep[] {
  const steps = agent.manual?.[kind] ?? (kind === "connect" && agent.instructions ? [agent.instructions] : kind === "disconnect" && agent.removal ? [agent.removal] : []);
  return steps.filter((step) => step.command?.trim() || step.snippet?.trim());
}

function Instructions({ agent, fp, id, kind, onClose }: { agent: DetectedAgent; fp: string; id: string; kind: ManualKind; onClose: () => void }) {
  const t = hostTranslator();
  const status = useRoomStore((state) => state.facts.hostAgents[fp]?.status ?? "idle");
  const steps = manualSteps(agent, kind);
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
        {/* The connector's steps, in order, each one to copy. */}
        <ol className="host-agent-steps">{steps.map((step, index) => <li key={index}>
          {step.command?.trim() && <><p className="host-agent-howto-label">{t("agents.manual.command")}</p><Snippet text={step.command} /></>}
          {step.snippet?.trim() && <><p className="host-agent-howto-label">{step.file ? t("agents.manual.file", { file: step.file }) : t("agents.manual.snippet")}</p><Snippet text={step.snippet} /></>}
        </li>)}</ol>
        <p className="muted" role="status">{t(kind === "disconnect" ? "agents.manual.removeWaiting" : kind === "replace" ? "agents.manual.foreignWaiting" : "agents.manual.waiting")}</p>
        <Button variant="ghost" size="sm" onClick={onClose}>{t("agents.close")}</Button>
      </>}
    </div>
  );
}

export function HostAgentRow({ fp, agent }: { fp: string; agent: DetectedAgent }) {
  const t = hostTranslator();
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
  const readOnly = agent.registration === "foreign" || agent.registration === "invalid" || agent.registration === "unknown";
  const isNew = !readOnly && actionableAgent(agent);
  const kind = manualKind(agent);
  const hasManualInstructions = manualSteps(agent, kind).length > 0;
  const panelId = `host-agent-howto-${fp.slice(0, 7)}-${agent.id}`;

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
  const errorText = error ? translatedError(t, error.key, error.params) : null;
  const status: { text: string; tone: "ok" | "error" | "muted" | ""; info?: string } = errorText ? { text: errorText, tone: "error" }
    : busy ? { text: t(`agents.busy.${busy}` as HostMessageKey), tone: "muted" }
    : justConnected && agent.registration === "connected" ? { text: t("agents.justConnected", { agent: agent.label }), tone: "ok" }
    : agent.registration === "connected" ? { text: t("agents.connected"), tone: "" }
    // Short in the row; what it means and what to do, only in its (i).
    : agent.registration === "foreign" ? { text: t("agents.foreign"), tone: "muted", info: t("agents.foreign.info", { agent: agent.label }) }
    : agent.registration === "outdated" ? { text: t("agents.outdated"), tone: "muted", info: t("agents.outdated.info", { agent: agent.label }) }
    : agent.registration === "invalid" ? { text: t("agents.invalid"), tone: "error", info: t("agents.invalid.info", { agent: agent.label, file: agent.instructions?.file ?? "" }) }
    : agent.registration === "unknown" ? { text: t("agents.unknown"), tone: "muted" }
    : { text: t(manualOnly ? "agents.manualOnly" : "agents.notConnected"), tone: "muted" };
  const connected = agent.registration === "connected";
  const outdated = agent.registration === "outdated";
  // The confirm goes: the focus goes back to Disconnect (after Remove, to the row's action as it now stands).
  const action = useRef<HTMLButtonElement>(null);
  const cancelConfirm = () => { setConfirming(false); requestAnimationFrame(() => action.current?.focus()); };
  // The hints say what each button does: Sidevoice doing it, or the person.
  const handHint = t(connected ? "agents.hint.removeByHand" : agent.registration === "foreign" ? "agents.hint.replaceByHand" : "agents.hint.byHand", { agent: agent.label });
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
            <span className={cn("host-agent-status", status.tone === "ok" && "host-agent-ok", status.tone === "error" && "host-agent-error", status.tone === "muted" && "muted")}
              role={errorText ? "alert" : "status"} title={status.text}>{status.text}</span>
            {status.info && <InfoTip label={t("agents.statusInfo", { agent: agent.label })}>{status.info}</InfoTip>}
          </span>
        </span>
        {/* Every action a button on the row, each with a hint: doing it by hand (add, replace, or take Sidevoice out), and
            Connect or Disconnect, which Sidevoice does itself. */}
        <span className="host-agent-actions">
          {hasManualInstructions && <Tooltip content={handHint}>
            <Button variant="ghost" size="sm" disabled={!!busy} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
              {t(agent.registration === "foreign" ? "agents.foreign.manual.toggle" : "agents.manual.toggle")}<ChevronIcon size={14} className={open ? "host-agent-chevron-up" : undefined} />
            </Button>
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
      {confirming && agent.registration === "connected" && !busy && <div className="host-agent-confirm" role="group" aria-label={t("agents.disconnectNamed", { agent: agent.label })}
        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelConfirm(); } }}>
        <p>{t("agents.disconnectConfirm", { agent: agent.label })}</p>
        <span className="host-agent-confirm-actions">
          <Button variant="ghost" tone="neutral" size="sm" autoFocus onClick={cancelConfirm}>{t("hosts.cancel")}</Button>
          <Button variant="danger" size="sm" onClick={() => { cancelConfirm(); run("disconnect"); }}>{t("agents.disconnectYes", { agent: agent.label })}</Button>
        </span>
      </div>}
      {open && agent.registration !== "unknown" &&
        <Instructions agent={agent} fp={fp} id={panelId} kind={kind} onClose={() => setOpen(false)} />}
    </li>
  );
}

/** For an agent the list does not show: one discreet link at its foot, opening how to connect any MCP agent by hand. */
function OtherAgentSection({ custom }: { custom: HostAgentsListing["custom"] }) {
  const t = hostTranslator();
  const [open, setOpen] = useState(false);
  if (!custom) return null;
  return (
    <section className="host-agent-other">
      <button type="button" className="host-agent-other-link" aria-expanded={open} aria-controls="host-agent-other-howto" onClick={() => setOpen((value) => !value)}>
        {t("agents.other.link")}<ChevronIcon size={14} className={open ? "host-agent-chevron-up" : undefined} />
      </button>
      {open && <div className="host-agent-howto" id="host-agent-other-howto">
        <p className="muted">{t("agents.other.detail")}</p>
        {custom.command && <><p className="host-agent-howto-label">{t("agents.other.command")}</p><Snippet text={custom.command} /></>}
        {custom.snippet && <><p className="host-agent-howto-label">{t("agents.other.json")}</p><Snippet text={custom.snippet} /></>}
      </div>}
    </section>
  );
}

function scanError(t: HostTranslate, key: string, params?: Record<string, string | number>) {
  if (key === "no-connector") return t("agents.noConnector");
  if (key === "unreachable" || key === "timeout") return t("agents.unreachable");
  return translatedError(t, key, params);
}

export function HostAgentsPanel({ fp }: { fp: string | null }) {
  const t = hostTranslator();
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
      <div className="host-agents-heading"><h4 id="host-agents-title">{t("agents.heading")}</h4></div>
      <div className="host-agent-problem-quiet">
        <p className="muted">{scanError(t, listing.error?.key ?? "unknown", listing.error?.params)}</p>
        <Button size="sm" variant="secondary" onClick={() => void window.sidevoiceActions?.loadHostAgents?.(fp, { rescan: true })}>{t("agents.refresh")}</Button>
      </div>
    </section>
  );
  if (!value && (listing?.status === "loading" || !listing || listing.status === "idle")) return <p className="muted" role="status">{t("agents.scanning")}</p>;

  const rows = (value?.agents ?? []).filter((agent) => agent.present || agent.registration === "connected");
  const scanning = listing?.status === "loading";
  const failed = listing?.status === "failed";
  return (
    <section className="host-agents" aria-labelledby="host-agents-title">
      {/* The heading, when the list was searched (in words, as time passes), and searching again as an icon. */}
      <div className="host-agents-heading">
        <h4 id="host-agents-title">{t("agents.heading")}</h4>
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
