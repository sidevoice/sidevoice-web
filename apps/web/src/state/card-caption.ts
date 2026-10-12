/* The floating call card's caption (briefs/FLOATING-CARD-SPEC.md §4, FC8): the words being said, as the room reads them,
 * on a channel of their own — they change with every word while a reply plays, which the snapshot the tray diffs must
 * not. The room publishes it (features/call/CardCaptionFeed.tsx); the desktop app's bridge, or the preview's card host,
 * hands it to the card, which only draws it: the card never gets the transcript, and never runs the karaoke itself. */

/** What the caption shows. `who`: the agent's reply, or the person's own turn. `previous`: the chunk before, as its
 *  last words ('' at a reply's start). `current`: the chunk being said (the agent's), the words just sent (the person's,
 *  '' while their turn is still open: the card shows their bars then). `spoken`: how many characters of `current` have
 *  been said, or null when nothing of it sounds now — a reply that just ended, one that came in writing, the person's.
 *  `source`: said by the voice, or come in writing (call model B, the agents muted). */
export interface CardCaption {
  who: "agent" | "you";
  previous: string;
  current: string;
  spoken: number | null;
  source: "voice" | "written";
}

export interface CaptionChannel {
  publish(caption: CardCaption | null): void;
  /** Called with every caption published that differs from the last; returns the function that stops it. */
  subscribe(listener: (caption: CardCaption | null) => void): () => void;
  current(): CardCaption | null;
}

const same = (a: CardCaption | null, b: CardCaption | null) => a === b || (!!a && !!b && a.who === b.who && a.previous === b.previous
  && a.current === b.current && a.spoken === b.spoken && a.source === b.source);

export function createCaptionChannel(): CaptionChannel {
  const listeners = new Set<(caption: CardCaption | null) => void>();
  let last: CardCaption | null = null;
  return {
    publish(caption) {
      if (same(caption, last)) return;
      last = caption;
      for (const listener of listeners) listener(last);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    current: () => last,
  };
}
