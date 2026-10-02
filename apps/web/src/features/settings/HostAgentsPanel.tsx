import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { ChevronIcon, ConnectorIcon, CopyIcon, HarnessIcon } from "../../components/ui/Icons";
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

function timestamp(value: string | number | null | undefined): string {
  if (value == null) return "";
  const date = new Date(typeof value === "number" && value < 1e12 ? value * 1000 : value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium", timeStyle: "short" }).format(date);
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
      <Button size="compact" variant="ghost" aria-label={t("agents.copy")} title={t("agents.copy")} onClick={() => void copy()}>
        <CopyIcon size={15} />{note && <span role="status">{note}</span>}
      </Button>
    </div>
  );
}

function Instructions({ agent, fp, id, onClose }: { agent: DetectedAgent; fp: string; id: string; onClose: () => void }) {
  const t = hostTranslator();
  const status = useRoomStore((state) => state.facts.hostAgents[fp]?.status ?? "idle");
  const how = agent.instructions;
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
        <p className="muted" role="status">{t(agent.registration === "foreign" ? "agents.manual.foreignWaiting" : "agents.manual.waiting")}</p>
        <Button variant="ghost" size="compact" onClick={onClose}>{t("agents.close")}</Button>
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
  const [justConnected, setJustConnected] = useState(false);
  const previous = useRef(agent.registration);
  const manualOnly = agent.connect === "manual";
  const readOnly = agent.registration === "foreign" || agent.registration === "unknown";
  const isNew = !readOnly && actionableAgent(agent);
  const hasManualInstructions = !!(agent.instructions?.command?.trim() || agent.instructions?.snippet?.trim());
  const panelId = `host-agent-howto-${fp.slice(0, 7)}-${agent.id}`;

  useEffect(() => { if (error) setOpen(true); }, [error]);
  useEffect(() => {
    if (previous.current === "not-connected" && agent.registration === "connected") {
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

  const run = (action: "connect" | "disconnect" | "dismiss") =>
    void window.sidevoiceActions?.hostAgentAction?.(fp, agent.id, action);
  const errorText = error ? translatedError(t, error.key, error.params) : null;
  return (
    <li className="host-agent-row" data-registration={agent.registration} data-open={open || undefined}>
      <div className="host-agent-main">
        <span className="host-agent-icon">{agent.id === "other" ? <ConnectorIcon size={16} /> : <HarnessIcon harness={agent.id} size={18} />}</span>
        <span className="host-agent-copy">
          <span className="host-agent-name"><strong>{agent.label}</strong>{agent.version && <span className="muted"> {agent.version}</span>}
            {isNew && <span className="host-agent-badge">{t("agents.new")}</span>}
          </span>
          {justConnected && <span className="host-agent-status host-agent-ok" role="status">{t("agents.justConnected", { agent: agent.label })}</span>}
          {errorText && <span className="host-agent-status host-agent-error" role="alert">{errorText}</span>}
          {!errorText && agent.registration === "connected" && <span className="host-agent-status">{t("agents.connected")}</span>}
          {!errorText && agent.registration === "foreign" && <span className="host-agent-status muted">{t("agents.foreign")}</span>}
          {!errorText && agent.registration === "not-connected" && manualOnly && <span className="host-agent-status muted">{t("agents.manualOnly")}</span>}
          {!errorText && agent.registration === "unknown" && <span className="host-agent-status muted">{t("agents.unknown")}</span>}
        </span>
        <span className="host-agent-actions">
          {busy ? <span className="muted" role="status">{t(`agents.busy.${busy}` as HostMessageKey)}</span>
            : agent.registration === "connected" ? <Button variant="ghost" size="compact" onClick={() => run("disconnect")}>{t("agents.disconnect")}</Button>
              : agent.registration === "foreign" ? hasManualInstructions && <Button variant="ghost" size="compact" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
                {open ? t("agents.close") : t("agents.foreign.manual.toggle")}<ChevronIcon size={14} className={open ? "host-agent-chevron-up" : undefined} />
              </Button>
                : readOnly ? null : <>
                {isNew && <Button variant="ghost" size="compact" onClick={() => run("dismiss")}>{t("agents.notNow")}</Button>}
                <Button variant="ghost" size="compact" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
                  {t("agents.manual.toggle")}<ChevronIcon size={14} className={open ? "host-agent-chevron-up" : undefined} />
                </Button>
                {!manualOnly && <Button variant="primary" size="compact" onClick={() => run("connect")}>{t("agents.connect")}</Button>}
              </>}
        </span>
      </div>
      {open && (agent.registration === "not-connected" || agent.registration === "foreign") &&
        <Instructions agent={agent} fp={fp} id={panelId} onClose={() => setOpen(false)} />}
    </li>
  );
}

function OtherAgentSection({ custom }: { custom: HostAgentsListing["custom"] }) {
  const t = hostTranslator();
  const [open, setOpen] = useState(false);
  if (!custom) return null;
  return (
    <section className="host-agent-other">
      <div className="host-agent-other-head">
        <span className="host-agent-icon"><ConnectorIcon size={16} /></span>
            <span className="host-agent-copy"><strong>{t("agents.other.heading")}</strong>{custom.version && <span className="muted">{custom.version}</span>}<span className="muted">{t("agents.other.sub")}</span></span>
        <Button size="compact" variant="ghost" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? t("agents.close") : t("agents.other.open")}<ChevronIcon size={14} className={open ? "host-agent-chevron-up" : undefined} />
        </Button>
      </div>
      {open && <div className="host-agent-howto">
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
  useEffect(() => {
    if (fp) void window.sidevoiceActions?.loadHostAgents?.(fp, { rescan: true });
  }, [fp]);

  if (!fp) return <div className="host-agent-problem" role="alert"><p>{t("agents.unreachable")}</p></div>;
  if (listing?.status === "failed") return (
    <div className="host-agent-problem" role="alert">
      <p>{scanError(t, listing.error?.key ?? "unknown", listing.error?.params)}</p>
      <Button size="compact" onClick={() => void window.sidevoiceActions?.loadHostAgents?.(fp, { rescan: true })}>{t("agents.refresh")}</Button>
    </div>
  );
  if (!value && (listing?.status === "loading" || !listing || listing.status === "idle")) return <p className="muted" role="status">{t("agents.scanning")}</p>;

  const rows = (value?.agents ?? []).filter((agent) => agent.present || agent.registration === "connected");
  const checkedAt = timestamp(value?.scanned_at);
  return (
    <section className="host-agents" aria-labelledby="host-agents-title">
      <div className="host-agents-heading">
        <h4 id="host-agents-title">{t("agents.heading")}</h4>
        <Button variant="ghost" size="compact" disabled={listing?.status === "loading"}
          onClick={() => void window.sidevoiceActions?.loadHostAgents?.(fp, { rescan: true })}>
          {listing?.status === "loading" ? t("agents.refreshing") : t("agents.refresh")}
        </Button>
      </div>
      <p className="host-agents-scanned muted" role="status">
        {listing?.status === "loading" ? t("agents.refreshing") : checkedAt ? t("agents.scannedAt", { time: checkedAt }) : ""}
      </p>
      {rows.length === 0 ? <p className="muted">{t("agents.none")}</p> : <ul className="host-agent-rows">
        {rows.map((agent) => <HostAgentRow key={agent.id} fp={fp} agent={agent} />)}
      </ul>}
      <OtherAgentSection custom={value?.custom} />
    </section>
  );
}
