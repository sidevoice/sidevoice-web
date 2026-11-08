import { Badge } from "../../components/ui/Badge";
import { DisclosureButton } from "../../components/ui/DisclosureButton";
import { translator, uiLanguage } from "../../i18n/translator";
import type { AgentReadinessStatus } from "../../state/room-types";
import { keyFor } from "./error-message";

type State = "ready" | "needs_attention" | "unsupported";
const stateOf = (readiness: AgentReadinessStatus): State =>
  readiness.state === "ready" || readiness.state === "unsupported" ? readiness.state : "needs_attention";
const labelKey = (state: State) => state === "unsupported" ? "agents.readiness.unsupported" : "agents.readiness.needs_attention";

/** Readiness only speaks when something needs doing: a small chip in the card's status line, so the card keeps its
 *  height, opening its reasons below (AgentReadinessDetails). Ready says nothing, as every other agent's card. */
export function AgentReadiness({ readiness, id, open, onToggle }: { readiness: AgentReadinessStatus; id: string; open: boolean; onToggle: () => void }) {
  const t = translator();
  const state = stateOf(readiness);
  if (state === "ready") return null;
  return <DisclosureButton className="host-agent-readiness-toggle" open={open} controls={id} onClick={onToggle}>
    <Badge className="host-agent-readiness-state" tone={state === "needs_attention" ? "warning" : "neutral"}>{t(labelKey(state))}</Badge>
  </DisclosureButton>;
}

/** The connector reports codes; the web owns their wording for every agent. */
export function AgentReadinessDetails({ readiness, id }: { readiness: AgentReadinessStatus; id: string }) {
  const t = translator();
  const language = uiLanguage();
  const state = stateOf(readiness);
  if (state === "ready") return null;
  const reasons = Array.isArray(readiness.reasons) && readiness.reasons.length ? readiness.reasons : [{ code: "" }];
  const reasonText = (reason: AgentReadinessStatus["reasons"][number]) => {
    const key = keyFor("agents.readiness.", reason.code, language);
    return key ? t(key) : reason.message?.trim() || t("agents.readiness.unknown_reason");
  };
  return <div className="host-agent-readiness" data-state={state} id={id} role="group" aria-label={t(labelKey(state))}>
    {reasons.map((reason, index) => <p key={`${reason.code}-${index}`}>{reasonText(reason)}</p>)}
  </div>;
}
