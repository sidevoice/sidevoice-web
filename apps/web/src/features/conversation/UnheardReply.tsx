import { useState } from "react";
import { CutIcon, CutMoreIcon } from "../../components/ui/Icons";
import { translator } from "../../i18n/translator";
import { uiLocale } from "../../i18n/locale";
import type { ChatMessage } from "../../state/room-types";
import { wordEnd } from "./KaraokeText";

/* How a reply settles once it has played (issue #182): heard whole, cut part-way, or never played. While it plays the
 * bubble is the karaoke's, whole, so nothing here applies until playback is over. A cut reply is drawn here; a reply
 * that never played is UnheardMark's row. */

/** The cut, carried to the end of the word it falls in: the language's own word boundaries where the platform has them
 *  (CJK has no spaces), whitespace otherwise. */
export function cutEnd(text: string, at: number) {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!Segmenter) return wordEnd(text, at);
  for (const part of new Segmenter(uiLocale(), { granularity: "word" }).segment(text)) {
    if (part.index >= at) break;
    const end = part.index + part.segment.length;
    if (end > at) return part.isWordLike ? end : at;
  }
  return at;
}

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
  const at = cutEnd(message.text, scalars.slice(0, count).join("").length);
  const rest = message.text.slice(at).trimStart();
  return rest ? { kind: "cut", heard: message.text.slice(0, at).trimEnd(), rest } : { kind: "whole" };
}

/** The text of a cut reply: what was heard, the landing's marker (the pause bars and an arrow; its word shows on hover or
 *  focus), and the rest folded until asked for. */
export function CutText({ heard, rest }: { heard: string; rest: string }) {
  const t = translator();
  const [open, setOpen] = useState(false);
  const name = t("messages.cut.interrupted");
  const action = t(open ? "messages.cut.hide" : "messages.cut.show");
  return <span className="cut-text" data-open={open || undefined}>
    <span className="cut-heard">{heard}</span>{" "}
    <button type="button" className="cut-marker" aria-expanded={open} aria-label={`${name} · ${action}`} onClick={() => setOpen(!open)}>
      <CutIcon /><span className="cut-label" aria-hidden="true">{name}</span><CutMoreIcon className="cut-chevron" size={10} />
    </button>
    {open && <>{" "}<span className="cut-rest">{rest}</span></>}
  </span>;
}
