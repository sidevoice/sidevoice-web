import { useState } from "react";
import { ChevronIcon, CutIcon, UnplayedIcon } from "../../components/ui/Icons";
import { useVariant } from "../../lib/variants";
import { translator } from "../../i18n/translator";
import { uiLocale } from "../../i18n/locale";
import type { ChatMessage } from "../../state/room-types";
import { wordEnd } from "./KaraokeText";

/* How a reply settles once it has played (issue #182): heard whole, cut part-way, or never played. While it plays the
 * bubble is the karaoke's, whole, so nothing here applies until playback is over. Open visual choices, compared on the
 * transcript lab (transcript-lab.html) until one is picked: then its variant goes and the choice is the code. */
export const UNHEARD_MARKS = ["dot", "line", "ghost"] as const;
export const CUT_MARKERS = ["pill", "bar", "rule"] as const;
export const UNHEARD_MARK_VARIANT = "transcript-unheard-mark";
export const CUT_MARKER_VARIANT = "transcript-cut-marker";

export type Hearing = { kind: "whole" } | { kind: "never" } | { kind: "cut"; heard: string; rest: string };

/** What the person heard of a reply: `heard_chars` counts characters as scalars (a pictogram is one), the cut is carried
 *  to the end of the word it falls in as the karaoke is, and a cut with nothing left unheard is a whole reply. */
export function hearingOf(message: ChatMessage): Hearing {
  if (message.role !== "assistant" || message.draft || message.playback === "playing" || message.playback === "pending" || message.karaoke) return { kind: "whole" };
  if (message.hearing === "not_heard") return { kind: "never" };
  if (message.hearing !== "partial" || !Number.isInteger(message.heard_chars)) return { kind: "whole" };
  const scalars = [...message.text];
  const count = message.heard_chars!;
  if (count <= 0) return { kind: "never" };
  if (count >= scalars.length) return { kind: "whole" };
  const at = wordEnd(message.text, scalars.slice(0, count).join("").length);
  const rest = message.text.slice(at).trimStart();
  return rest ? { kind: "cut", heard: message.text.slice(0, at).trimEnd(), rest } : { kind: "whole" };
}

/** The text of a cut reply: what was heard, the cut marker, and the rest folded until asked for. */
export function CutText({ heard, rest }: { heard: string; rest: string }) {
  const t = translator();
  const marker = useVariant(CUT_MARKER_VARIANT, CUT_MARKERS);
  const [open, setOpen] = useState(false);
  const action = t(open ? "messages.cut.hide" : "messages.cut.show");
  const toggle = <button type="button" className="cut-marker" data-variant={marker} aria-expanded={open} title={action} aria-label={`${t("messages.cut.label")} · ${action}`} onClick={() => setOpen(!open)}>
    {marker === "pill" && <><CutIcon /><span>{t("messages.cut.label")}</span><ChevronIcon className="cut-chevron" size={12} /></>}
    {marker === "bar" && <><span className="cut-bar" aria-hidden="true" /><span className="cut-more" aria-hidden="true">…</span></>}
    {marker === "rule" && <><CutIcon /><span>{action}</span><ChevronIcon className="cut-chevron" size={12} /></>}
  </button>;
  // The rule is a block of its own: a space around it would be a blank line.
  const gap = marker === "rule" ? null : " ";
  return <span className="cut-text" data-variant={marker} data-open={open || undefined}>
    <span className="cut-heard">{heard}</span>{gap}{toggle}{open && <>{gap}<span className="cut-rest">{rest}</span></>}
  </span>;
}

/** A reply that never played: a small mark in the run, in place of its balloon; opening it shows what it said. */
export function UnheardMark({ message }: { message: ChatMessage }) {
  const t = translator();
  const variant = useVariant(UNHEARD_MARK_VARIANT, UNHEARD_MARKS);
  const [open, setOpen] = useState(false);
  const label = t("messages.audio.notPlayed");
  const action = t(open ? "messages.unheard.hide" : "messages.unheard.show");
  return <div className="unheard" data-variant={variant} data-open={open || undefined} data-segment={message.segment || undefined}>
    <button type="button" className="unheard-mark" aria-expanded={open} title={`${label} · ${action}`} aria-label={`${label} · ${action}`} onClick={() => setOpen(!open)}>
      {variant === "line" && <span className="unheard-rule" aria-hidden="true" />}
      <span className="unheard-chip"><UnplayedIcon size={12} />{variant !== "dot" && <span className="unheard-snippet">{message.text}</span>}</span>
      {variant === "line" && <span className="unheard-rule" aria-hidden="true" />}
    </button>
    {open && <p className="unheard-text">
      {message.text}
      <time dateTime={new Date(message.time).toISOString()}>{new Date(message.time).toLocaleTimeString(uiLocale(), { hour: "2-digit", minute: "2-digit" })}</time>
    </p>}
  </div>;
}
