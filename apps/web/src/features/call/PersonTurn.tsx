import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import type { ConversationView } from "../../state/room-types";
import { VoiceWaveform } from "../conversation/VoiceWaveform";
import type { CallTranslate } from "./call-i18n";
import { PAGE_MS, PagedText } from "./PagedText";
import { SENT_LEAVING_MS, useSentTurns, type SentTurn } from "./speech-reading";

/* What a spoken turn sent shows on the stage: three lines at a time (PagedText), each page PAGE_MS, the bubble staying
 * until the last is read (no cap). The transcript has it all. */

/* Speaking again while a turn just sent shows: it lifts away at once from where the new bars come in. Never queued:
 * the bars say at once that they are heard. */

/** One turn sent, on its own clock: shown its time (in "pages", a page's time per page, uncapped), then leaving for
 *  SENT_LEAVING_MS, then done. `cut`: the person spoke again — it leaves at once. */
function SentBubble({ turn, cut, under, onDone }: { turn: SentTurn; cut: boolean; under: boolean; onDone: (key: string) => void }) {
  const [pages, setPages] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const shown = (pages ?? 1) * PAGE_MS;
  useEffect(() => {
    if (leaving || pages == null) return;
    const next = window.setTimeout(() => setLeaving(true), shown);
    return () => window.clearTimeout(next);
  }, [leaving, shown, pages]);
  useEffect(() => { if (cut) setLeaving(true); }, [cut]);
  useEffect(() => {
    if (!leaving) return;
    const next = window.setTimeout(() => onDone(turn.key), SENT_LEAVING_MS);
    return () => window.clearTimeout(next);
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="speech-bubble person-bubble" data-sent="" data-leaving={leaving || undefined} data-under={under || undefined} translate="no">
      <span className="person-said"><PagedText measure={turn.text} onPages={setPages}>{turn.text}</PagedText></span>
    </div>
  );
}

/** The person's turn at the tile's foot: while they speak and while it is transcribed, the voice's bars; once
 *  transcribed, what is sent, for its moment, then it lifts away toward the agent and fades (a plain fade under reduced
 *  motion). */
export function PersonTurn({ conversation, t }: { conversation: ConversationView; t: CallTranslate }) {
  const pending = !!conversation.pendingText || !!conversation.pendingPhase;
  const { turns, done } = useSentTurns(conversation);
  if (!pending && !turns.length) return null;
  return (
    <div className="person-turns">
      {turns.map((turn) => <SentBubble key={turn.key} turn={turn} onDone={done}
        cut={pending} under={pending} />)}
      {pending && (
        <div key="live" className="speech-bubble person-bubble" translate="no">
          <VoiceWaveform phase={conversation.pendingPhase === "transcribing" ? "transcribing" : "listening"} />
          {conversation.pendingCancellable && <Button variant="ghost" tone="neutral" size="sm" className="cancel-input"
            onClick={() => void window.sidevoiceActions?.cancelInput()}>{t("stage.cancelTurn")}</Button>}
        </div>
      )}
    </div>
  );
}
