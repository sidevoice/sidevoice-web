import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { translator } from "../../i18n/translator";

/** Past this many lines a message folds to them, with "See more" (T31; six, then ten, then 25 at the operator's word: See more only when it is really needed, web#520). The one
 *  value: the stylesheet takes it from the message's `--fold-lines`. */
export const FOLD_LINES = 25;

/** What the transcript's text is laid out at: its width, and a count bumped when the face has loaded (a line counted in
 *  the fallback face can come out wrong). A message counts its lines again when either changes. 0 while it has no box. */
export const TextLayoutContext = createContext(0);

/** The lines `node`'s text is laid out on, counted as an inline run: one box per line it spans. It only has to tell `FOLD_LINES`
 *  from one more, so it stops at the line after: a long reply is not walked to its end. */
export function lineCount(node: HTMLElement, stopAfter = FOLD_LINES + 1): number {
  const tops = new Set<number>();
  for (const box of node.getClientRects()) {
    if (box.width > 0 || box.height > 0) tops.add(Math.round(box.top));
    if (tops.size >= stopAfter) break;
  }
  return tops.size;
}

/** A message's words, folded past 25 lines: the 25, then "See more" in the accent, "See less" once open. Its lines are
 *  counted where it is drawn, as it is drawn (inline, so the time can sit on its last line), each time its words or the
 *  transcript's width change; a message that fits never shows the link. Held whole (`whole`) while it is said, so the
 *  words lit as the voice goes never fall behind the fold. */
export function FoldedText({ text, whole = false, children }: { text: string; whole?: boolean; children: ReactNode }) {
  const t = translator();
  const layout = useContext(TextLayoutContext);
  const node = useRef<HTMLSpanElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const element = node.current;
    if (!element || whole || !layout) return;
    const measure = () => {
      // Counted unfolded (inline), then put back as it was, before anything is painted.
      const fold = element.getAttribute("data-fold");
      element.removeAttribute("data-fold");
      const lines = lineCount(element);
      if (fold) element.setAttribute("data-fold", fold);
      setLong(lines > FOLD_LINES);
    };
    measure();
    // The text's size can change with no new text or width (the phone's text scale, up to 2x, is a root custom property): the
    // message's box (its bubble) then changes height, and the lines are counted again. An inline run has no box of its own to watch.
    const box = element.parentElement;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text, whole, layout]);
  const folds = long && !whole;
  return <>
    <span ref={node} className="chat-text" data-fold={folds ? (open ? "open" : "folded") : undefined} style={{ "--fold-lines": FOLD_LINES } as CSSProperties}>{children}</span>
    {folds && <button type="button" className="see-more" aria-expanded={open} onClick={() => setOpen(!open)}>{t(open ? "messages.seeLess" : "messages.seeMore")}</button>}
  </>;
}
