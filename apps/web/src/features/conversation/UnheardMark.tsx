import { useState } from "react";
import { CutMoreIcon, UnplayedIcon } from "../../components/ui/Icons";
import { useVariant } from "../../lib/variants";
import { translator } from "../../i18n/translator";
import type { ChatMessage } from "../../state/room-types";
import { MessageBubble } from "./MessageBubble";

/** The never-played mark, compared as two variants: with a short rule at its left, or without. */
export const UNHEARD_MARKS = ["line-rule", "line-plain"] as const;
export const UNHEARD_MARK_VARIANT = "transcript-unheard-mark";

/** A reply that never played: one quiet row in the run in place of its balloon. At rest the blocked-speaker icon and the
 *  first words; on hover or focus the icon becomes an arrow and the row says what it is. Opened, the reply is a balloon
 *  like any other under the row, and the arrow points down. */
export function UnheardMark({ message }: { message: ChatMessage }) {
  const t = translator();
  const variant = useVariant(UNHEARD_MARK_VARIANT, UNHEARD_MARKS);
  const [open, setOpen] = useState(false);
  const label = t("messages.audio.notPlayed");
  const action = t(open ? "messages.unheard.hide" : "messages.unheard.show");
  return <div className="unheard" data-variant={variant} data-open={open || undefined} data-segment={message.segment || undefined}>
    <button type="button" className="unheard-mark" aria-expanded={open} aria-label={`${label} · ${action}`} onClick={() => setOpen(!open)}>
      {variant === "line-rule" && <span className="unheard-rule" aria-hidden="true" />}
      <span className="unheard-icon" aria-hidden="true"><UnplayedIcon className="unheard-blocked" size={16} /><CutMoreIcon className="unheard-chevron" size={16} /></span>
      <span className="unheard-snippet">{message.text}</span>
      <span className="unheard-label" aria-hidden="true">{label}</span>
    </button>
    {open && <MessageBubble message={{ ...message, hearing: "heard" }} position="only" />}
  </div>;
}
