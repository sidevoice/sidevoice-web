/* One detected agent and how Sidevoice gets connected to it (§4.4), the same row in W3 and in a host's Agentes tab.
 * «Conectar» runs the agent's own registration (`claude mcp add`, `codex mcp add`, Cursor's file); «Hacerlo yo» shows
 * what that is — the command, or the file and what to put in it — for whoever prefers to do it, and opens by itself
 * when the automatic way failed or does not exist. «Comprobar» asks the host to look again. */
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Button } from "../../components/ui/Button";
import { CloseIcon, CopyIcon, HarnessIcon, SidevoiceMark } from "../../components/ui/Icons";
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

/** How to connect it by hand, in a floating panel by its button: the command (or the file and its snippet) as code,
 *  copied with one click, and «Ya está, comprobar» to have the host look again. */
function HowToPopover({ agent, fp, open, onOpenChange, label }: { agent: DetectedAgent; fp: string; open: boolean; onOpenChange: (open: boolean) => void; label: string }) {
  const t = useT();
  const hosts = useHostsController();
  const trigger = useRef<HTMLButtonElement>(null);
  const how = agent.instructions;
  const code = how?.command ?? how?.snippet ?? "";
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <Button ref={trigger} variant="ghost" size="compact">{label}</Button>
      </Popover.Trigger>
      {/* Inside the dialog it opens from, so it is above the dialog and not behind it. */}
      <Popover.Portal container={trigger.current?.closest("dialog") ?? undefined}>
        <Popover.Content className="howto-popover" side="bottom" align="end" sideOffset={8} collisionPadding={16}>
          <div className="howto-head">
            <span className="agent-icon"><HarnessIcon harness={agent.id} size={16} /></span>
            <strong>{t("agents.howto.title", { name: agent.label })}</strong>
            <Popover.Close asChild><Button variant="ghost" size="icon" aria-label={t("common.close")}><CloseIcon size={16} /></Button></Popover.Close>
          </div>
          {!how ? <p className="muted small">{t("agents.howto.none")}</p> : <>
            <p className="muted small">{how.command ? t("agents.howto.command") : t("agents.howto.file", { file: how.file ?? "" })}</p>
            <div className="code-block">
              <pre><code>{code}</code></pre>
              <button type="button" className="code-copy" aria-label={t("common.copy")} title={t("common.copy")}
                onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* the code is selectable */ } }}>
                <CopyIcon size={15} />{copied && <span>{t("common.copied")}</span>}
              </button>
            </div>
            <div className="howto-foot">
              <span className="muted small">{t("agents.howto.after")}</span>
              <Button variant="primary" size="compact" disabled={checking}
                onClick={async () => { setChecking(true); await hosts.loadAgents(fp, true); setChecking(false); onOpenChange(false); }}>
                {checking ? t("agents.howto.checking") : t("agents.howto.check")}
              </Button>
            </div>
          </>}
          <Popover.Arrow className="howto-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
  // A failed automatic connection opens the way to do it by hand.
  useEffect(() => { if (error) setOpen(true); }, [error]);
  const notConnected = agent.registration === "not-connected";
  const isNew = mode === "host" && agent.present && notConnected && !agent.dismissed;
  async function connect() {
    const answer = await hosts.agentAction(fp, agent.id, "connect");
    if (answer?.agent.registration === "connected") onConnected?.(answer.agent.label);
  }
  return (
    <li className="agent-row" data-registration={agent.registration}>
      <span className="agent-icon"><HarnessIcon harness={agent.id} size={18} /></span>
      <span className="agent-copy">
        <span className="agent-name"><strong>{agent.label}</strong>{agent.version && <span className="muted"> {agent.version}</span>}
          {isNew && <span className="badge badge-new">{t("hosts.newAgent")}</span>}</span>
        {error && <span className="agent-status row-error" role="alert">{t("agents.connectFailed", { message: error.message || error.key })}</span>}
        {!error && agent.registration === "foreign" && <span className="agent-status muted">{t("agents.foreign")}</span>}
        {!error && manualOnly && notConnected && <span className="agent-status muted">{t("agents.manualOnly")}</span>}
      </span>
      <span className="agent-end">
        {busy ? <span className="sv-link">{t("agents.busy." + busy)}</span>
          : agent.registration === "connected" ? <>
            <SidevoiceLink registration="connected" />
            {mode === "host" && <Button variant="ghost" size="compact" onClick={() => void hosts.agentAction(fp, agent.id, "disconnect")}>{t("agents.disconnect")}</Button>}
          </> : agent.registration === "foreign" ? <SidevoiceLink registration="foreign" />
          : <>
            {isNew && <Button variant="ghost" size="compact" onClick={() => void hosts.agentAction(fp, agent.id, "dismiss")}>{t("agents.notNow")}</Button>}
            <HowToPopover agent={agent} fp={fp} open={open} onOpenChange={setOpen} label={manualOnly ? t("agents.howto.manualToggle") : t("agents.howto.toggle")} />
            {!manualOnly && <Button variant="primary" size="compact" onClick={() => void connect()}>{t("agents.connect")}</Button>}
          </>}
      </span>
    </li>
  );
}
