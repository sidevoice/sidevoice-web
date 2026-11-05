import { Tooltip } from "../../components/ui/Tooltip";
import { PendingIcon, ReadIcon, ReadTicksIcon, SentIcon, SentTickIcon, TurnCancelIcon, UncertainIcon } from "../../components/ui/Icons";
import type { ChatMessage } from "../../state/room-types";
import { receiptView } from "../../state/room-session-state.js";
import { translator } from "../../i18n/translator";
import { FoldedText } from "./FoldedText";
import { KaraokeText } from "./KaraokeText";
import { ListenAgain } from "./ListenAgain";
import { CutText, hearingOf } from "./UnheardReply";
import { speakerName } from "./group-messages";
import { uiLocale } from "../../i18n/locale";

export type BubblePosition = "only" | "first" | "middle" | "last";

/** The delivery mark as a drawing, not a glyph: a text check sat below the time's line and at its own size. The
 *  warning only for a message that failed or is in doubt: a status this version does not know has no mark at all.
 *  The stage's and the floating card's; the transcript draws its own ticks (TranscriptReceipt). */
export function DeliveryMark({ state }: { state: string }) {
  if (state === "read") return <ReadIcon size={14} />;
  if (state === "delivered" || state === "unconfirmed") return <SentIcon size={14} />;
  if (state === "pending" || state === "sending") return <PendingIcon size={12} />;
  if (state === "uncertain" || state === "not_sent") return <UncertainIcon size={12} />;
  return null;
}

/** The transcript's delivery mark (T42): read, the two ticks in the accent; delivered, one in the time's grey; on its
 *  way, the clock; failed or in doubt, the warning. A status this version does not know (sidevoice-core#112) has none. */
function TranscriptReceipt({ state }: { state: string }) {
  const { label } = receiptView(state);
  const mark = state === "read" ? <ReadTicksIcon /> : state === "delivered" || state === "unconfirmed" ? <SentTickIcon />
    : state === "pending" || state === "sending" ? <PendingIcon size={12} /> : state === "uncertain" || state === "not_sent" ? <UncertainIcon size={12} /> : null;
  if (!mark) return null;
  return <span className="chat-receipt delivery" data-state={state} title={label} aria-label={label}>{mark}</span>;
}

/** A message's time, as the interface's language writes it. */
export function MessageTime({ time }: { time: number }) {
  return <time dateTime={new Date(time).toISOString()} title={new Date(time).toLocaleString(uiLocale())}>{new Date(time).toLocaleTimeString(uiLocale(), { hour: "2-digit", minute: "2-digit" })}</time>;
}

/** The person's round × that takes their turn back, named for assistive tech and in its tooltip (T27). */
export function CancelTurn() {
  const t = translator();
  return <Tooltip action content={t("messages.cancel")}>
    <button type="button" className="turn-cancel" aria-label={t("messages.cancel")} onClick={() => void window.sidevoiceActions?.cancelInput()}><TurnCancelIcon /></button>
  </Tooltip>;
}

/* No sender's name on a bubble (2026-10-11): the side says who — the agent at the left, the person at the right —
 * and the agent's face floats over the foot of its run. The name stays in what a screen reader is told.
 * Its time sits inside it, at its foot right after the words (T42): the agent's with a replay, the person's with the
 * ticks. A reply still being said has none yet: it is lit as it goes, and gets its time once it is over. */
export function MessageBubble({ message, position }: { message: ChatMessage; position: BubblePosition }) {
  const t = translator();
  // A delivery status this version does not know (sidevoice-core#112) shows no mark: it has no words to say.
  const delivery = message.role === "user" && message.delivery && receiptView(message.delivery).label ? message.delivery : null;
  const saying = message.role === "assistant" && (message.playback === "playing" || !!message.karaoke);
  const replay = message.replayable && message.role === "assistant" && message.playback !== "playing" && message.playback !== "pending";
  const hearing = hearingOf(message);
  const label = t(message.interrupted && !message.globally_heard ? "messages.interrupted" : "messages.message", { name: speakerName(message, t), text: message.text });
  return (
    <article className="chat-bubble" data-role={message.role} data-position={position} data-draft={message.draft || undefined}
      data-interrupted={message.interrupted && !message.globally_heard || undefined} data-saying={saying || undefined} aria-label={label}>
      {hearing.kind === "cut" ? <CutText heard={hearing.heard} rest={hearing.rest} />
        : <FoldedText text={message.text} whole={saying}><KaraokeText text={message.text} range={message.karaoke} playback={message.playback} /></FoldedText>}
      {message.cancellable && <CancelTurn />}
      {!message.draft && !saying && <span className="chat-meta">
        <MessageTime time={message.time} />
        {replay && <ListenAgain message={message} />}
        {delivery && <TranscriptReceipt state={delivery} />}
      </span>}
      {message.deliveryNote && <span className="chat-audio-note">{message.deliveryNote}</span>}
      {message.audioNote && <span className="chat-audio-note">{message.audioNote}</span>}
    </article>
  );
}
