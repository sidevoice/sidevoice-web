import type { KaraokeRange } from "../../state/room-types";
import { conversationTranslator } from "./conversation-i18n";

/** Where the said part ends, carried to the end of the word it falls in: a word lights whole or not at all. */
export function wordEnd(text: string, at: number) {
  let end = at;
  while (end > 0 && end < text.length && /\S/.test(text[end - 1]) && /\S/.test(text[end])) end += 1;
  return end;
}

/* The part already spoken is coloured; the rest waits. No mark on the current word, and the same two spans
 * whether or not playback is running, so a cue never remounts the text. */
export function KaraokeText({ text, range, playback = "complete" }: { text: string; range?: KaraokeRange | null; playback?: "pending" | "playing" | "complete" }) {
  const t = conversationTranslator();
  // Lit up to the end of the part sounding: between its chunks `from` and `to` meet, at the end of what was heard.
  const valid = !!range && Number.isInteger(range.from) && Number.isInteger(range.to) && range.from >= 0 && range.to >= range.from && range.to > 0 && range.to <= text.length;
  const spoken = valid && range ? wordEnd(text, range.to) : 0;
  const title = valid ? t("karaoke.playing") : undefined;
  return <span className="karaoke-text" data-playback={valid ? "playing" : playback} data-progress={valid ? "true" : undefined} aria-live="off" title={title}><span className="karaoke-played">{text.slice(0, spoken)}</span><span className="karaoke-upcoming">{text.slice(spoken)}</span></span>;
}
