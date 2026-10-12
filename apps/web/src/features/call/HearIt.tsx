import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Button, type ButtonProps } from "../../components/ui/Button";
import { SpeaksIcon } from "../../components/ui/Icons";
import { useRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { callTranslator } from "./call-i18n";
import { canHear } from "./conversation-state";
import { focusStageHeading } from "./stage-view";
import { hearActionKey } from "./voice-view";

/* "Hear it" (call model B, briefs/CALL-MODEL-B-SPEC.md §2.8 and §2.10): the only way to ask a conversation for what the
 * person missed — a fresh reply, never the old one played. Its name says each step it takes first (turning the voice
 * on, unmuting the agents) and always contains the visible "Hear it". While it asks it is busy, with a spinner; once
 * answered it goes, and focus that was on it goes to the row's own button, or to the stage's heading (§3). */

/** The button itself: taken away while it has focus, focus goes on as `next` says (found while it is still there). */
function HearButton({ threadId, next, ...props }: ButtonProps & { threadId: string; next(element: HTMLElement): () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const element = button.current;
    // Its cleanup runs as it leaves, before the button leaves the page: where focus goes is found while it is still
    // there, and focus moves once it is gone.
    return () => {
      if (!element || document.activeElement !== element) return;
      setTimeout(next(element), 0);
    };
  }, [next]);
  return <Button ref={button} {...props} onClick={() => void window.sidevoiceActions?.hearIt?.(threadId)} />;
}

/** From a row's "Hear it", focus goes to the row's own button; from the stage's, to its heading. */
function rowButton(element: HTMLElement) {
  const target = element.closest(".participant-row")?.querySelector<HTMLElement>(".person");
  return () => target?.focus();
}
const stageHeading = () => focusStageHeading;

/** On a conversation's row, between its unread badge and ⋯: an icon, while the row has a mark it can be asked about. */
export function RowHearIt({ row }: { row: ParticipantView }) {
  const t = callTranslator();
  const action = useRoomStore((state) => t(hearActionKey(state.facts)));
  if ((!row.mark && row.hearing !== "asking") || !canHear(row)) return null;
  const asking = row.hearing === "asking";
  const name = asking ? t("hear.asking", { title: row.title }) : t("hear.row", { action, title: row.title });
  return (
    <HearButton threadId={row.threadId} next={rowButton} variant="ghost" tone="neutral" size="icon-sm"
      className="row-hear" aria-label={name} title={name} loading={asking}>
      <SpeaksIcon size={16} />
    </HearButton>
  );
}

/** The stage's notice (§2.10), under the activity line: an amber hand, what the conversation has, and "Hear it"; asking,
 *  it says so; with no reply in time, that it did not answer by voice. Not a live region: the announcer says what needs
 *  saying (§4). */
export function StageHearIt({ row, hand }: { row: ParticipantView; hand: ReactNode }) {
  const t = callTranslator();
  const action = useRoomStore((state) => t(hearActionKey(state.facts)));
  const asking = row.hearing === "asking";
  if (row.hearing === "no-answer") return <p className="stage-mark" data-state="no-answer">{hand}<span>{t("hear.noAnswer", { title: row.title })}</span></p>;
  if (!row.mark && !asking) return null;
  return (
    <p className="stage-mark" data-state={asking ? "asking" : "mark"}>
      {hand}
      <span>{asking ? t("hear.asking", { title: row.title }) : t("stage.hasSomething", { title: row.title })}</span>
      {canHear(row) && <HearButton threadId={row.threadId} next={stageHeading} variant="secondary" size="sm" className="stage-hear"
        aria-label={asking ? t("hear.asking", { title: row.title }) : action} loading={asking}>{t("hear.it")}</HearButton>}
    </p>
  );
}
