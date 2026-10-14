import { Button } from "../../components/ui/Button";
import { ListenAgainIcon, PendingIcon, ReadIcon, SentIcon, UncertainIcon } from "../../components/ui/Icons";
import type { ChatMessage } from "../../state/room-types";
import { receiptView } from "../../state/room-session-state.js";
import { translator } from "../../i18n/translator";
import { KaraokeText } from "./KaraokeText";
import { uiLocale } from "../../i18n/locale";

/** The delivery mark as a drawing, not a glyph: a text check sat below the time's line and at its own size. The
 *  warning only for a message that failed or is in doubt: a status this version does not know has no mark at all. */
function DeliveryMark({ state }: { state: string }) {
  if (state === "read") return <ReadIcon size={14} />;
  if (state === "delivered" || state === "unconfirmed") return <SentIcon size={14} />;
  if (state === "pending" || state === "sending") return <PendingIcon size={12} />;
  if (state === "uncertain" || state === "not_sent") return <UncertainIcon size={12} />;
  return null;
}

/* No sender's name on a bubble (2026-10-11): the side says who — the agent at the left, the person at the right —
 * and the agent's face sits at the foot of its run. The name stays in what a screen reader is told. */
export function MessageBubble({ message, position }: { message: ChatMessage; position: "only" | "first" | "middle" | "last" }) {
  const t = translator();
  // A delivery status this version does not know (sidevoice-core#112) shows no mark: it has no words to say.
  const delivery = message.role === "user" && message.delivery && receiptView(message.delivery).label ? message.delivery : null;
  const replay = message.replayable && message.role === "assistant" && message.playback !== "playing" && message.playback !== "pending";
  const label = t(message.interrupted ? "messages.interrupted" : "messages.message", { name: message.name, text: message.text });
  return (
    <article className="chat-bubble" data-role={message.role} data-position={position} data-draft={message.draft || undefined}
      data-interrupted={message.interrupted || undefined} aria-label={label}>
      <KaraokeText text={message.text} range={message.karaoke} playback={message.playback} />
      {message.cancellable && <Button variant="ghost" tone="danger" size="sm" className="cancel-input" onClick={() => void window.sidevoiceActions?.cancelInput()}>{t("messages.cancel")}</Button>}
      {(!message.draft || replay || delivery) && <div className="chat-meta">
        {!message.draft && <time dateTime={new Date(message.time).toISOString()} title={new Date(message.time).toLocaleString(uiLocale())}>{new Date(message.time).toLocaleTimeString(uiLocale(), { hour: "2-digit", minute: "2-digit" })}</time>}
        {replay && <Button variant="ghost" tone="neutral" size="icon-sm" className="listen-again" aria-label={t("messages.listenAgain")} title={t("messages.listenAgain")}
          onClick={() => void window.sidevoiceActions?.replayReply(message.segment)}><ListenAgainIcon size={12} /></Button>}
        {delivery && <span className="receipt delivery" data-state={delivery} title={receiptView(delivery).label} aria-label={receiptView(delivery).label}><DeliveryMark state={delivery} /></span>}
      </div>}
      {message.deliveryNote && <span className="chat-audio-note">{message.deliveryNote}</span>}
      {message.audioNote && <span className="chat-audio-note">{message.audioNote}</span>}
    </article>
  );
}
