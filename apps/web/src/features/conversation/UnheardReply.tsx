import { useState } from "react";
import { ChevronIcon, CutIcon, CutMoreIcon, UnplayedIcon } from "../../components/ui/Icons";
import { useVariant } from "../../lib/variants";
import { translator } from "../../i18n/translator";
import { uiLocale } from "../../i18n/locale";
import type { ChatMessage } from "../../state/room-types";
import { wordEnd } from "./KaraokeText";
import { ListenAgain } from "./ListenAgain";

/* How a reply settles once it has played (issue #182): heard whole, cut part-way, or never played. While it plays the
 * bubble is the karaoke's, whole, so nothing here applies until playback is over. Open visual choices, compared on the
 * transcript lab (transcript-lab.html) until one is picked: then its variant goes and the choice is the code. */
export const UNHEARD_MARKS = ["dot", "line", "ghost", "line-subtle", "line-quiet", "line-time", "line-chevron", "line-chevron-time", "line-chevron-inline"] as const;
export const CUT_MARKERS = ["pill", "bar", "rule", "landing", "landing-chevron", "bar-right", "bar-down", "bar-purple", "bar-label"] as const;
export const UNHEARD_MARK_VARIANT = "transcript-unheard-mark";
export const CUT_MARKER_VARIANT = "transcript-cut-marker";

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
    {/* landing: the landing's own pill, pause bars and "Interrupted here"; the rest follows it as the landing's muted text. */}
    {marker.startsWith("landing") && <><CutIcon /><span>{t("messages.cut.here")}</span>{marker === "landing-chevron" && <CutMoreIcon className="cut-chevron" size={10} />}</>}
    {/* bar-*: a bar, an arrow (right, or down for bar-down), and for bar-label a short word. */}
    {marker.startsWith("bar-") && <><span className="cut-bar" aria-hidden="true" />
      {marker === "bar-down" ? <ChevronIcon className="cut-chevron" size={12} /> : <CutMoreIcon className="cut-chevron" size={12} />}
      {marker === "bar-label" && <span className="cut-label">{t("messages.cut.interrupted")}</span>}</>}
  </button>;
  // The rule is a block of its own: a space around it would be a blank line.
  const gap = marker === "rule" ? null : " ";
  return <span className="cut-text" data-variant={marker} data-open={open || undefined}>
    <span className="cut-heard">{heard}</span>{gap}{toggle}{open && <>{gap}<span className="cut-rest">{rest}</span></>}
  </span>;
}

/** The first words of a text, with an ellipsis when there are more. */
const firstWords = (text: string, count: number) => {
  const words = text.trim().split(/\s+/);
  return words.length > count ? `${words.slice(0, count).join(" ")}…` : text.trim();
};

/** A reply that never played: a small mark in the run, in place of its balloon; opening it shows what it said. */
export function UnheardMark({ message }: { message: ChatMessage }) {
  const t = translator();
  const variant = useVariant(UNHEARD_MARK_VARIANT, UNHEARD_MARKS);
  const [open, setOpen] = useState(false);
  const label = t("messages.audio.notPlayed");
  const replay = message.replayable && message.role === "assistant";
  const action = t(open ? "messages.unheard.hide" : "messages.unheard.show");
  const line = variant.startsWith("line");
  const chevron = variant.includes("chevron");
  const when = new Date(message.time).toLocaleTimeString(uiLocale(), { hour: "2-digit", minute: "2-digit" });
  const time = <time className="unheard-time" dateTime={new Date(message.time).toISOString()}>{when}</time>;
  const showsTime = variant.endsWith("time") || variant.endsWith("inline");
  return <div className="unheard" data-variant={variant} data-line={line || undefined} data-roomy={variant.length > 4 && !variant.endsWith("subtle") && !variant.endsWith("quiet") || undefined} data-open={open || undefined} data-segment={message.segment || undefined}>
    <button type="button" className="unheard-mark" aria-expanded={open} title={`${label} · ${action}`} aria-label={`${label} · ${action}`} onClick={() => setOpen(!open)}>
      {chevron ? <CutMoreIcon className="unheard-chevron" size={12} /> : line && <span className="unheard-rule unheard-lead" aria-hidden="true" />}
      <span className="unheard-chip"><UnplayedIcon size={12} />{variant !== "dot" && variant !== "line-quiet" && <span className="unheard-snippet">{variant === "line-subtle" ? firstWords(message.text, 3) : message.text}</span>}</span>
      {variant === "line-chevron-inline" && time}
      {line && <span className="unheard-rule" aria-hidden="true" />}
      {(variant === "line-time" || variant === "line-chevron-time") && time}
    </button>
    {open && <div className="unheard-body">
      <p className="unheard-text">
        {message.text}
        {!showsTime && <time dateTime={new Date(message.time).toISOString()}>{when}</time>}
        {replay && <ListenAgain message={message} />}
      </p>
      {message.deliveryNote && <span className="chat-audio-note">{message.deliveryNote}</span>}
      {message.audioNote && <span className="chat-audio-note">{message.audioNote}</span>}
    </div>}
  </div>;
}
