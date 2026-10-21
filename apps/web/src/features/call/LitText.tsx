import { useLayoutEffect, useRef } from "react";
import { translator } from "../../i18n/translator";
import { wordEnd } from "../conversation/KaraokeText";
import "./lit-text.css";

/* What is said, lit as the voice says it, without painting any text again (operator, 2026-10-21: the balloon's words lit by
 * rewriting two spans repainted the balloon on the CPU, four times a second, for as long as the agent spoke).
 *
 * The text is drawn twice and never changes: the dim copy in the flow (it gives the box its size), and over it a lit copy
 * (aria-hidden, in the "said" ink). The lit copy is seen through two windows that only move: one over the lines already
 * said (`lit-above`), one over the line being said, up to its last lit word (`lit-line`). A window is a clip box moved by a
 * transform with its text moved back by the opposite one, so the clip's edge travels and the words stay where they are: all
 * of it transform on layers of their own, which the GPU composites without painting. The offsets are whole pixels, so the
 * two layers cancel exactly. A word lights whole (`wordEnd`), as before.
 *
 * `lit-heard` is an empty box at the lit end, one line tall, for PagedText to find the line holding the last word heard. */

/** The lines of the dim copy and where `end` falls: the line holding the last lit character and the right edge of it, in the
 *  box's own pixels (what an ancestor's transform does to the box is divided out), or null when nothing is lit. */
function boundary(base: HTMLElement, end: number): { line: number; x: number; lineHeight: number } | null {
  const node = base.firstChild;
  if (end <= 0 || !node) return null;
  const range = document.createRange();
  range.setStart(node, Math.max(0, end - 1));
  range.setEnd(node, end);
  const rects = range.getClientRects();
  const last = rects[rects.length - 1];
  const box = base.getBoundingClientRect();
  if (!last || !box.width || !base.offsetWidth) return null;
  const scale = box.width / base.offsetWidth;
  const style = getComputedStyle(base);
  const lineHeight = parseFloat(style.lineHeight) || last.height / scale;
  const middle = ((last.top + last.bottom) / 2 - box.top) / scale;
  return { line: Math.max(0, Math.floor(middle / lineHeight)), x: Math.min(base.offsetWidth, Math.max(0, (last.right - box.left) / scale)), lineHeight };
}

export function LitText({ text, spoken }: { text: string; spoken: number }) {
  const base = useRef<HTMLSpanElement>(null);
  const above = useRef<HTMLSpanElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const heard = useRef<HTMLSpanElement>(null);
  const end = spoken > 0 ? wordEnd(text, Math.min(spoken, text.length)) : 0;
  const place = () => {
    const node = base.current, rows = above.current, row = line.current, mark = heard.current;
    if (!node || !rows || !row || !mark || !node.offsetWidth) return;
    const width = node.offsetWidth, height = Math.round(node.offsetHeight);
    const at = boundary(node, end);
    const lineHeight = at?.lineHeight ?? (parseFloat(getComputedStyle(node).lineHeight) || 0);
    const tall = Math.ceil(lineHeight);
    if (row.style.height !== `${tall}px`) { row.style.height = `${tall}px`; mark.style.height = `${tall}px`; }
    // Each window and its text move by opposite whole pixels. Nothing lit: both windows are out of the box.
    const down = at ? Math.round(at.line * lineHeight) : 0;
    const across = at ? Math.round(at.x) : 0;
    rows.style.transform = `translateY(${down - height}px)`;
    (rows.firstElementChild as HTMLElement).style.transform = `translateY(${height - down}px)`;
    row.style.transform = `translate(${across - width}px, ${down}px)`;
    (row.firstElementChild as HTMLElement).style.transform = `translate(${width - across}px, ${-down}px)`;
    mark.hidden = !at;
    mark.style.transform = `translate(${across}px, ${down}px)`;
  };
  // Where the lit end is, whenever it moves or the text is set again (a new window size is the observer's).
  useLayoutEffect(place, [text, end]); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useRef(place);
  latest.current = place;
  useLayoutEffect(() => {
    const node = base.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => latest.current());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <span className="lit-text" data-spoken={end} title={end > 0 ? translator()("karaoke.playing") : undefined}>
      <span ref={base} className="lit-base">{text}</span>
      <span className="lit-copy" aria-hidden="true">
        <span ref={above} className="lit-clip lit-above"><span className="lit-words">{text}</span></span>
        <span ref={line} className="lit-clip lit-line"><span className="lit-words">{text}</span></span>
        <span ref={heard} className="lit-heard" data-mark="" />
      </span>
    </span>
  );
}
