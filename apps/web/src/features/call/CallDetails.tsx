import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronIcon, HarnessIcon, MachinesIcon } from "../../components/ui/Icons";
import { Popover } from "../../components/ui/Popover";
import { Dialog } from "../../components/ui/Dialog";
import { translator, type Translate } from "../../i18n/translator";
import { ConversationAvatar } from "./ConversationAvatar";
import type { StageConversation } from "./stage-view";
import { VoiceModels, type VoiceModelRow } from "./VoiceModels";

/* What the call runs on, opened from the stage's title (operator, 2026-10-15): the machine, the agent (its harness,
 * model and effort) and the voice's models — each with where it runs, its state, and what can be done when it needs
 * something. The stage itself stays clean: no chips on it; the title wears a dot while a model needs something, and
 * the agent's badge keeps the tile's foot. Two forms are compared on the live page (variant `titleDetail`,
 * lib/variants.ts): a popover under the title, or a sheet — from the window's right edge, from its foot on a phone —
 * with the agent's avatar at its head. */

/** A harness by its product name; one not known, as it is reported. */
export function harnessName(id: string | null | undefined) {
  if (!id) return "";
  if (/^claude/.test(id)) return "Claude Code";
  if (/^codex/.test(id)) return "Codex";
  if (/^cursor/.test(id)) return "Cursor";
  return id;
}

export const TITLE_DETAILS = ["popover", "sheet"] as const;
export type TitleDetail = (typeof TITLE_DETAILS)[number];

/** The three groups, the same in either form: a small heading each, then its lines. */
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

/** The stage's title: the conversation's name over its machine, as one button that opens the call's details in the
 *  form `detail` says; a dot after the name while a voice model needs something, said in words to assistive tech. */
export function StageHeading({ stage, detail, voice }: { stage: StageConversation; detail: TitleDetail; voice: { rows: VoiceModelRow[]; attention: boolean } }) {
  const t = translator();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const sheet = detail === "sheet";
  const trigger = (
    <button type="button" className="stage-heading" aria-haspopup="dialog" aria-expanded={sheet ? open : undefined} onClick={sheet ? () => setOpen(true) : undefined}>
      <span className="stage-heading-name">
        <span title={stage.title}>{stage.title}</span>
        {voice.attention && <i className="stage-attention" aria-hidden="true" />}
        <ChevronIcon size={14} className="stage-heading-chevron" />
      </span>
      {stage.row?.machine && <span className="stage-machine"><MachinesIcon size={12} /><span>{stage.row.machine}</span></span>}
      <span className="sr-only">{voice.attention ? ` · ${t("voiceModels.attention")}` : ""} · {t("titleDetail.open")}</span>
    </button>
  );
  const details = <CallDetails stage={stage} rows={voice.rows} t={t} />;
  if (!sheet) {
    return <h2><Popover trigger={trigger} label={t("titleDetail.open")} side="bottom" align="start" className="call-details-popover">{details}</Popover></h2>;
  }
  return (
    <h2>
      {trigger}
      {open && createPortal(
        <Dialog open size="sm" className="call-details-sheet" titleId={titleId} eyebrow={t("titleDetail.open")} title={stage.title}
          leading={stage.row ? <ConversationAvatar row={stage.row} /> : undefined} closeLabel={t("ui.close")} onClose={() => setOpen(false)}>
          {details}
        </Dialog>, document.body)}
    </h2>
  );
}
