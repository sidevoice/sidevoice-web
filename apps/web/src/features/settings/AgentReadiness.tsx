import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { DisclosureButton } from "../../components/ui/DisclosureButton";
import { translator, uiLanguage } from "../../i18n/translator";
import type { AgentReadinessStatus } from "../../state/room-types";
import { keyFor } from "./error-message";

/** The connector reports codes; the web owns their wording for every agent. */
export function AgentReadiness({ readiness, id }: { readiness: AgentReadinessStatus; id: string }) {
  const [open, setOpen] = useState(false);
  const t = translator();
  const language = uiLanguage();
  const state = readiness.state === "ready" || readiness.state === "unsupported" ? readiness.state : "needs_attention";
  const label = t(state === "ready" ? "agents.readiness.ready"
    : state === "unsupported" ? "agents.readiness.unsupported" : "agents.readiness.needs_attention");
  const chip = <Badge className="host-agent-readiness-state" tone={state === "ready" ? "positive" : state === "needs_attention" ? "warning" : "neutral"}>{label}</Badge>;
  const reasons = Array.isArray(readiness.reasons) && readiness.reasons.length ? readiness.reasons : [{ code: "" }];
  const reasonText = (reason: AgentReadinessStatus["reasons"][number]) => {
    const key = keyFor("agents.readiness.", reason.code, language);
    return key ? t(key) : reason.message?.trim() || t("agents.readiness.unknown_reason");
  };
  return <div className="host-agent-readiness" data-state={state}>
    {state !== "ready" ? <>
      <DisclosureButton className="host-agent-readiness-toggle" open={open} controls={id} onClick={() => setOpen((value) => !value)}>
        {chip}
      </DisclosureButton>
      {open && <div className="host-agent-readiness-body" id={id} role="group" aria-label={label}>
        {reasons.map((reason, index) => <p key={`${reason.code}-${index}`}>{reasonText(reason)}</p>)}
      </div>}
    </> : <span role="status">{chip}</span>}
  </div>;
}
