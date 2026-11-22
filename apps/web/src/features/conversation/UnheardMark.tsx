import { useState } from "react";
import { NotPlayedIcon, UnfoldIcon } from "../../components/ui/Icons";
import { translator } from "../../i18n/translator";
import type { ChatMessage } from "../../state/room-types";
import { speakerName } from "./group-messages";
import { ListenAgain } from "./ListenAgain";
import { MessageTime, type BubblePosition } from "./MessageBubble";

/** A reply that never played ('bubble-badge', T49–T57). Folded, a grey bubble with the struck circle and its first line,
 *  and nothing else; on hover or focus the circle turns into the arrow (production's morph). A click opens it into a muted
 *  bubble of its own, "Not played" over its words and its time and replay at its foot, and no subtitle under them (why it
 *  did not play is not in the design); the arrow, turned down, folds it again. The whole mark takes the click, as the
 *  reference's does; its toggle is the arrow's button, which says what it does. */
export function UnheardMark({ message, position }: { message: ChatMessage; position: BubblePosition }) {
  const t = translator();
  const [open, setOpen] = useState(false);
  const label = t("messages.audio.notPlayed");
  const action = t(open ? "messages.unheard.hide" : "messages.unheard.show");
  const replay = message.replayable && message.playback !== "playing" && message.playback !== "pending";
  return <article className="chat-bubble unheard" data-role="assistant" data-position={position} data-open={open || undefined} data-segment={message.segment || undefined}
    aria-label={t("messages.message", { name: speakerName(message, t), text: message.text })}>
    <div className="unheard-mark" onClick={() => setOpen(!open)}>
      <button type="button" className="unheard-toggle" aria-expanded={open} aria-label={`${label} · ${action}`}>
        <NotPlayedIcon className="unheard-blocked" /><UnfoldIcon className="unheard-chevron" />
      </button>
      {open && <span className="unheard-badge" aria-hidden="true">{label}</span>}
      <span className="unheard-snippet">{message.text}</span>
    </div>
    {open && <span className="chat-meta"><MessageTime time={message.time} />{replay && <ListenAgain message={message} />}</span>}
    {open && message.deliveryNote && <span className="chat-audio-note">{message.deliveryNote}</span>}
  </article>;
}
