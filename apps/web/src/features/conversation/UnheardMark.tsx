import { useState, type ReactNode } from "react";
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
  const icon = <span className="unheard-icon" aria-hidden="true"><UnplayedIcon className="unheard-blocked" size={16} /><CutMoreIcon className="unheard-chevron" size={16} /></span>;
  const toggle = (children: ReactNode, rule: boolean) => <button type="button" className="unheard-mark" aria-expanded={open} aria-label={`${label} · ${action}`} onClick={() => setOpen(!open)}>
    {rule && variant === "line-rule" && <span className="unheard-rule" aria-hidden="true" />}{icon}{children}
  </button>;
  // Opened, the reply is a balloon exactly like the others, with the row's title as its header line.
  if (open) return <div className="unheard" data-variant={variant} data-open data-segment={message.segment || undefined}>
    <MessageBubble message={{ ...message, hearing: "heard" }} position="first" header={<div className="unheard-header">{toggle(<span className="unheard-label" aria-hidden="true">{label}</span>, false)}</div>} />
  </div>;
  return <div className="unheard" data-variant={variant} data-segment={message.segment || undefined}>
    {toggle(<><span className="unheard-snippet">{message.text}</span><span className="unheard-label" aria-hidden="true">{label}</span></>, true)}
  </div>;
}
