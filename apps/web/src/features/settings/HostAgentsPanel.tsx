import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { ChevronIcon, ConnectorIcon, CopyIcon, HarnessIcon, RefreshIcon } from "../../components/ui/Icons";
import { Tooltip } from "../../components/ui/Tooltip";
import type { DetectedAgent, HostAgentsListing, HostAgentsState } from "../../state/room-types";
import { useRoomStore } from "../../state/room-store";
import { actionableAgent } from "../../services/host-agents";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import type { HostMessageKey } from "./messages/en";
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
  const words = new Intl.RelativeTimeFormat(navigator.language, { numeric: "auto" });
  const minutes = Math.round(seconds / 60), hours = Math.round(seconds / 3600), days = Math.round(seconds / 86400);
  return seconds > -45 ? words.format(0, "second") : minutes > -45 ? words.format(minutes, "minute") : hours > -22 ? words.format(hours, "hour") : words.format(days, "day");
}

function CodeBlock({ code }: { code: string }) {
  const t = hostTranslator();
  const [note, setNote] = useState("");
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(code);
      setNote(t("agents.copied"));
    } catch {
      setNote(t("agents.copyFailed"));
    }
  }
  return (
    <div className="host-agent-code">
      <pre><code>{code}</code></pre>
      <Button size="sm" variant="ghost" aria-label={t("agents.copy")} title={t("agents.copy")} onClick={() => void copy()}>
        <CopyIcon size={15} />{note && <span role="status">{note}</span>}
      </Button>
    </div>
  );
}

/** How to add Sidevoice to the agent by hand, or (`removing`) take it out; the list is read again meanwhile, so the row
 *  follows what was done. */
function Instructions({ agent, fp, id, removing = false, onClose }: { agent: DetectedAgent; fp: string; id: string; removing?: boolean; onClose: () => void }) {
  const t = hostTranslator();
  const status = useRoomStore((state) => state.facts.hostAgents[fp]?.status ?? "idle");
  const how = removing ? agent.removal : agent.instructions;
  const command = how?.command?.trim() ? how.command : undefined;
  const snippet = how?.snippet?.trim() ? how.snippet : undefined;
  useEffect(() => {
    if ((!command && !snippet) || status === "loading") return;
    const timer = window.setInterval(() => {
      void window.sidevoiceActions?.loadHostAgents?.(fp, { rescan: true, watch: agent.id });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [fp, agent.id, command, snippet, status]);
  return (
    <div className="host-agent-howto" id={id}>
      {!command && !snippet ? <p className="muted">{t("agents.manual.none")}</p> : <>
        {command && <><p className="host-agent-howto-label">{t("agents.manual.command")}</p><CodeBlock code={command} /></>}
        {snippet && <><p className="host-agent-howto-label">{how?.file ? t("agents.manual.file", { file: how.file }) : t("agents.manual.snippet")}</p><CodeBlock code={snippet} /></>}
        <p className="muted" role="status">{t(removing ? "agents.manual.removeWaiting" : agent.registration === "foreign" ? "agents.manual.foreignWaiting" : "agents.manual.waiting")}</p>
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
  const manualOnly = agent.connect === "manual";
  const readOnly = agent.registration === "foreign" || agent.registration === "unknown";
  const isNew = !readOnly && actionableAgent(agent);
  const hasManualInstructions = !!(agent.instructions?.command?.trim() || agent.instructions?.snippet?.trim());
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
  const status: { text: string; tone: "ok" | "error" | "muted" | "" } = errorText ? { text: errorText, tone: "error" }
    : busy ? { text: t(`agents.busy.${busy}` as HostMessageKey), tone: "muted" }
    : justConnected && agent.registration === "connected" ? { text: t("agents.justConnected", { agent: agent.label }), tone: "ok" }
    : agent.registration === "connected" ? { text: t("agents.connected"), tone: "" }
    : agent.registration === "foreign" ? { text: t("agents.foreign"), tone: "muted" }
    : agent.registration === "unknown" ? { text: t("agents.unknown"), tone: "muted" }
    : { text: t(manualOnly ? "agents.manualOnly" : "agents.notConnected"), tone: "muted" };
  const connected = agent.registration === "connected";
  // The hints say what each button does: Sidevoice doing it, or the person.
  const handHint = t(connected ? "agents.hint.removeByHand" : agent.registration === "foreign" ? "agents.hint.replaceByHand" : "agents.hint.byHand", { agent: agent.label });
  return (
    <li className="host-agent-row" data-registration={agent.registration} data-open={open || undefined}>
      <div className="host-agent-main">
        <span className="host-agent-icon">{agent.id === "other" ? <ConnectorIcon size={16} /> : <HarnessIcon harness={agent.id} size={18} />}</span>
        <span className="host-agent-copy">
          <span className="host-agent-name"><strong>{agent.label}</strong>{agent.version && <span className="muted"> {agent.version}</span>}
            {isNew && <span className="host-agent-badge">{t("agents.new")}</span>}
          </span>
          {/* Always one status line under the name, so a row never changes height: what went wrong, else a moment of
              "ready" once connected, else where it stands. */}
          <span className={cn("host-agent-status", status.tone === "ok" && "host-agent-ok", status.tone === "error" && "host-agent-error", status.tone === "muted" && "muted")}
            role={status.tone === "error" ? "alert" : "status"} title={status.text}>{status.text}</span>
        </span>
        {/* Every action a button on the row, each with a hint: doing it by hand (add, replace, or take Sidevoice out), and
            Connect or Disconnect, which Sidevoice does itself. */}
        <span className="host-agent-actions">
          {(connected || hasManualInstructions) && <Tooltip content={handHint}>
            <Button variant="ghost" size="sm" disabled={!!busy} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
              {t(agent.registration === "foreign" ? "agents.foreign.manual.toggle" : "agents.manual.toggle")}<ChevronIcon size={14} className={open ? "host-agent-chevron-up" : undefined} />
            </Button>
          </Tooltip>}
          {connected ? <Tooltip content={t("agents.hint.disconnect", { agent: agent.label })}>
              <Button variant="ghost" size="sm" loading={busy === "disconnect"} disabled={!!busy || confirming} aria-label={t("agents.disconnectNamed", { agent: agent.label })}
                onClick={() => setConfirming(true)}>{t("agents.disconnect")}</Button>
            </Tooltip>
            : !readOnly && !manualOnly && <Tooltip content={t("agents.hint.connect", { agent: agent.label })}>
              <Button variant="primary" size="sm" loading={busy === "connect"} disabled={!!busy} aria-label={t("agents.connectNamed", { agent: agent.label })}
                onClick={() => run("connect")}>{t("agents.connect")}</Button>
            </Tooltip>}
        </span>
      </div>
      {confirming && agent.registration === "connected" && !busy && <div className="host-agent-confirm" role="group" aria-label={t("agents.disconnectNamed", { agent: agent.label })}>
        <p>{t("agents.disconnectConfirm", { agent: agent.label })}</p>
        <span className="host-agent-confirm-actions">
          <Button variant="ghost" tone="neutral" size="sm" autoFocus onClick={() => setConfirming(false)}>{t("hosts.cancel")}</Button>
          <Button variant="danger" size="sm" onClick={() => { setConfirming(false); run("disconnect"); }}>{t("agents.disconnectYes", { agent: agent.label })}</Button>
        </span>
      </div>}
      {open && agent.registration !== "unknown" &&
        <Instructions agent={agent} fp={fp} id={panelId} removing={connected} onClose={() => setOpen(false)} />}
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
        {custom.command && <><p className="host-agent-howto-label">{t("agents.other.command")}</p><CodeBlock code={custom.command} /></>}
        {custom.snippet && <><p className="host-agent-howto-label">{t("agents.other.json")}</p><CodeBlock code={custom.snippet} /></>}
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
  if (listing?.status === "failed") return (
    <div className="host-agent-problem" role="alert">
      <p>{scanError(t, listing.error?.key ?? "unknown", listing.error?.params)}</p>
      <Button size="sm" onClick={() => void window.sidevoiceActions?.loadHostAgents?.(fp, { rescan: true })}>{t("agents.refresh")}</Button>
    </div>
  );
  if (!value && (listing?.status === "loading" || !listing || listing.status === "idle")) return <p className="muted" role="status">{t("agents.scanning")}</p>;

  const rows = (value?.agents ?? []).filter((agent) => agent.present || agent.registration === "connected");
  const scanning = listing?.status === "loading";
  return (
    <section className="host-agents" aria-labelledby="host-agents-title">
      {/* The heading, when the list was searched (in words, as time passes), and searching again as an icon. */}
      <div className="host-agents-heading">
        <h4 id="host-agents-title">{t("agents.heading")}</h4>
        <span className="host-agents-scanned" role="status">{scanning ? t("agents.searching") : searchedAgo ? t("agents.searchedAgo", { time: searchedAgo }) : ""}</span>
        <Tooltip content={t("agents.searchAgain")}>
          <Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("agents.searchAgain")} disabled={scanning}
            onClick={() => void window.sidevoiceActions?.loadHostAgents?.(fp, { rescan: true })}>
            {scanning ? <span className="ui-spinner ui-spinner--inline" aria-hidden /> : <RefreshIcon size={16} />}
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
