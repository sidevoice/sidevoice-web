import { useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { ChevronIcon, ChevronLeftIcon, ChevronRightIcon, HarnessIcon, MachinesIcon } from "../../components/ui/Icons";
import { Popover } from "../../components/ui/Popover";
import { translator, type Translate } from "../../i18n/translator";
import type { StageConversation } from "./stage-view";
import { VoiceModels, type VoiceModelRow } from "./VoiceModels";

/* What the call runs on, opened from the stage's title (operator, 2026-10-15): the machine, the agent (its harness,
 * model and effort) and the voice's models — each with where it runs, its state, and what can be done when it needs
 * something. The stage itself stays clean: no chips on it; the title wears a dot while a model needs something, and
 * the agent's badge keeps the tile's foot. In a popover under the title (decided 2026-10-16, over a sheet), which on
 * a desktop can pin them along the title instead, to keep them in sight. */

/** A harness by its product name; one not known, as it is reported. */
export function harnessName(id: string | null | undefined) {
  if (!id) return "";
  if (/^claude/.test(id)) return "Claude Code";
  if (/^codex/.test(id)) return "Codex";
  if (/^cursor/.test(id)) return "Cursor";
  return id;
}

/** The three groups: a small heading each, then its lines. */
export function CallDetails({ stage, rows, t }: { stage: StageConversation; rows: VoiceModelRow[]; t: Translate }) {
  const row = stage.row;
  const agent: [string, ReactNode][] = [];
  if (row?.harness) agent.push([t("titleDetail.harness"), <><HarnessIcon harness={row.harness} size={14} />{harnessName(row.harness)}</>]);
  if (row?.model) agent.push([t("titleDetail.model"), row.model]);
  if (row?.effort) agent.push([t("titleDetail.effort"), row.effort]);
  return (
    <div className="call-details">
      {row?.machine && <section className="call-details-group">
        <h3>{t("titleDetail.machine")}</h3>
        <p className="call-details-machine" translate="no"><MachinesIcon size={14} /><span>{row.machine}</span></p>
      </section>}
      {agent.length > 0 && <section className="call-details-group">
        <h3>{t("titleDetail.agent")}</h3>
        <dl className="call-details-agent">{agent.map(([term, value]) => <div key={term}><dt>{term}</dt><dd translate="no">{value}</dd></div>)}</dl>
      </section>}
      <section className="call-details-group">
        <h3>{t("titleDetail.voice")}</h3>
        {rows.length ? <VoiceModels rows={rows} /> : <p className="call-details-none">{t("titleDetail.noVoice")}</p>}
      </section>
    </div>
  );
}

/** Whether the details stay beside the title (operator, 2026-10-16): kept on this device across calls. */
const PINNED_KEY = "sidevoice.callDetailsPinned";
function usePinned(): [boolean, (pinned: boolean) => void] {
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem(PINNED_KEY) === "1"; } catch { return false; } });
  return [pinned, (next) => {
    setPinned(next);
    try { if (next) localStorage.setItem(PINNED_KEY, "1"); else localStorage.removeItem(PINNED_KEY); } catch { /* kept for this page only */ }
  }];
}

/** The details laid along the title, to the right of it, for whoever wants them in sight (operator, 2026-10-16): the
 *  agent (harness · model · effort) and each voice model as a compact chip, its warning dot when it needs something
 *  (the popover has its action), and the way to put them back. The machine is under the name already. */
function PinnedDetails({ stage, rows, onUnpin, t }: { stage: StageConversation; rows: VoiceModelRow[]; onUnpin(): void; t: Translate }) {
  const row = stage.row;
  const agent = [row?.harness ? harnessName(row.harness) : "", row?.model ?? "", row?.effort ?? ""].filter(Boolean).join(" · ");
  return (
    <div className="call-details-pinned" role="group" aria-label={t("titleDetail.open")}>
      {agent && <span className="call-details-chip" title={t("titleDetail.agent")} translate="no">{row?.harness && <HarnessIcon harness={row.harness} size={14} />}<span>{agent}</span></span>}
      {rows.map(({ slot, label, icon }) => (
        <span key={slot.task} className="call-details-chip" data-attention={slot.attention || undefined} title={[label, slot.where, slot.status !== "unknown" ? slot.state : ""].filter(Boolean).join(" · ")}>
          {icon}<span translate="no">{slot.id ?? t("voiceModels.none")}</span>{slot.attention && <i className="stage-attention" aria-hidden="true" />}
        </span>
      ))}
      <Button variant="ghost" tone="neutral" size="icon-sm" className="call-details-unpin" aria-label={t("titleDetail.unpin")} title={t("titleDetail.unpin")} onClick={onUnpin}><ChevronLeftIcon /></Button>
    </div>
  );
}

/** The stage's title: the conversation's name over its machine, as one button that opens the call's details in a
 *  popover under it; a dot after the name while a voice model needs something, said in words to assistive tech. Where
 *  it is above the tile (`pinnable`, a desktop), the popover can pin the details beside the title instead. */
export function StageHeading({ stage, voice, pinnable = false }: { stage: StageConversation; voice: { rows: VoiceModelRow[]; attention: boolean }; pinnable?: boolean }) {
  const t = translator();
  const [open, setOpen] = useState(false);
  const [stored, setPinned] = usePinned();
  const pinned = pinnable && stored;
  const trigger = (
    <button type="button" className="stage-heading" aria-haspopup="dialog">
      <span className="stage-heading-name">
        <span title={stage.title}>{stage.title}</span>
        {voice.attention && <i className="stage-attention" aria-hidden="true" />}
        <ChevronIcon size={14} className="stage-heading-chevron" />
      </span>
      {stage.row?.machine && <span className="stage-machine"><MachinesIcon size={12} /><span>{stage.row.machine}</span></span>}
      <span className="sr-only">{voice.attention ? ` · ${t("voiceModels.attention")}` : ""} · {t("titleDetail.open")}</span>
    </button>
  );
  return <>
    <h2><Popover trigger={trigger} label={t("titleDetail.open")} side="bottom" align="start" className="call-details-popover" open={open} onOpenChange={setOpen}>
      {pinnable && <Button variant="ghost" tone="neutral" size="sm" className="call-details-pin" onClick={() => { setPinned(!pinned); setOpen(false); }}>
        {pinned ? <><ChevronLeftIcon />{t("titleDetail.unpin")}</> : <>{t("titleDetail.pin")}<ChevronRightIcon /></>}
      </Button>}
      <CallDetails stage={stage} rows={voice.rows} t={t} />
    </Popover></h2>
    {pinned && <PinnedDetails stage={stage} rows={voice.rows} onUnpin={() => setPinned(false)} t={t} />}
  </>;
}
