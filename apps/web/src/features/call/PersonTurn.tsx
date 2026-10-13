import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { SentIcon } from "../../components/ui/Icons";
import { useVariant } from "../../lib/variants";
import type { ConversationView } from "../../state/room-types";
import { VoiceWaveform } from "../conversation/VoiceWaveform";
import type { CallTranslate } from "./call-i18n";
import { LIVE_TAIL, latestWords, useSentTurn, type SentOnSpeech } from "./speech-reading";

/** How what a spoken turn sent shows on the stage (VARIANTS `sent-text`): its latest words after a "…" (today); its
 *  first three lines, the last fading into the quieter ink before its "…"; a long one in a smaller type, four lines;
 *  or its first line and the transcript's check. The transcript always has the whole of it. */
export const SENT_TEXT = ["tail", "clamp", "shrink", "line"] as const;
export type SentText = (typeof SENT_TEXT)[number];

/** What a turn just sent does when the person speaks again during its moment (VARIANTS `sent-repeat`): the bars take
 *  its place at once (today); it steps up above them, down to one line, and keeps its time; or it lifts away at once
 *  while the bars come in. Never queued: the bars say at once that they are heard. */
export const SENT_REPEAT = ["replace", "stack", "leave"] as const;
export type SentRepeat = (typeof SENT_REPEAT)[number];
const ON_SPEECH: Record<SentRepeat, SentOnSpeech> = { replace: "drop", stack: "keep", leave: "leave" };

/** What was sent, as `mode` shows it; `stacked`, one line above the next turn's bars. Clamped, its last line fades
 *  only when there is more than it shows. */
function SentWords({ text, mode, stacked }: { text: string; mode: SentText; stacked: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [more, setMore] = useState(false);
  const lines = stacked || mode === "line" ? 1 : mode === "clamp" ? 3 : mode === "shrink" ? 4 : undefined;
  const fades = mode === "clamp" && !stacked;
  useLayoutEffect(() => {
    const node = ref.current;
    setMore(fades && !!node && node.scrollHeight > node.clientHeight + 1);
  }, [text, fades]);
  return (
    <span ref={ref} className="person-said" data-lines={lines} data-small={(mode === "shrink" && !stacked && text.length > LIVE_TAIL) || undefined}
      data-faded={(fades && more) || undefined}>{mode === "tail" ? latestWords(text) : text}</span>
  );
}

/** The person's turn at the tile's foot: while they speak and while it is transcribed, the voice's bars; once
 *  transcribed, what is sent, for a moment, then it lifts away toward the agent and fades (a plain fade under reduced
 *  motion). Only a turn spoken here is shown as sent, never a message typed. */
export function PersonTurn({ conversation, t }: { conversation: ConversationView; t: CallTranslate }) {
  const mode = useVariant("sent-text", SENT_TEXT);
  const repeat = useVariant("sent-repeat", SENT_REPEAT);
  const pending = !!conversation.pendingText || !!conversation.pendingPhase;
  const sent = useSentTurn(conversation, ON_SPEECH[repeat]);
  if (!pending && !sent) return null;
  // Speaking again: in "stack" the sent one stands above the bars; in "leave" it lifts away from where they come in.
  const stacked = pending && repeat === "stack";
  return (
    <div className="person-turns" data-repeat={repeat}>
      {sent && (
        <div key={sent.key} className="speech-bubble person-bubble" data-sent="" data-leaving={sent.leaving || undefined}
          data-stacked={stacked || undefined} data-under={(pending && repeat === "leave") || undefined} translate="no">
          <SentWords text={sent.text} mode={mode} stacked={stacked} />
          {mode === "line" && <span className="person-sent-check"><SentIcon size={14} /><span className="sr-only">{t("stage.sent")}</span></span>}
        </div>
      )}
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
