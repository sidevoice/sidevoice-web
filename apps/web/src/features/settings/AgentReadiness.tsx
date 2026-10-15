import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { DisclosureButton } from "../../components/ui/DisclosureButton";
import { translator, type MessageKey } from "../../i18n/translator";
import type { AgentReadinessStatus } from "../../state/room-types";

const reasonKeys: Record<string, MessageKey> = {
  "cursor.bridge_not_running": "agents.readiness.cursor.bridge_not_running",
};

/** The connector reports codes; the web owns their wording for every agent. */
export function AgentReadiness({ readiness, id }: { readiness: AgentReadinessStatus; id: string }) {
  const [open, setOpen] = useState(false);
  const t = translator();
  const state = readiness.state === "ready" || readiness.state === "unsupported" ? readiness.state : "needs_attention";
  const label = t(state === "ready" ? "agents.readiness.ready"
    : state === "unsupported" ? "agents.readiness.unsupported" : "agents.readiness.needs_attention");
  const chip = <Badge className="host-agent-readiness-state" tone={state === "ready" ? "positive" : state === "needs_attention" ? "warning" : "neutral"}>{label}</Badge>;
  const reasons = Array.isArray(readiness.reasons) && readiness.reasons.length ? readiness.reasons : [""];
  return <div className="host-agent-readiness" data-state={state}>
    {state === "needs_attention" ? <>
      <DisclosureButton className="host-agent-readiness-toggle" open={open} controls={id} onClick={() => setOpen((value) => !value)}>
        {chip}
      </DisclosureButton>
      {open && <div className="host-agent-readiness-body" id={id} role="group" aria-label={label}>
        {reasons.map((reason, index) => <p key={`${reason}-${index}`}>{t(reasonKeys[reason] ?? "agents.readiness.unknown_reason")}</p>)}
      </div>}
    </> : <span role="status">{chip}</span>}
  </div>;
}
