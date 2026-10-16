import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** How long each page stays where the pages turn by time (the person's sent turn); the agent's turn with its voice. */
export const PAGE_MS = 3000;

/** How the window moves on: a page of its lines at a time, the last page only as tall as the lines it has; or a line at
 *  a time, the line heard kept with the next one under it, never a line left empty. */
export type PagedTurn = "page" | "scroll";

/* What is said on the stage, a few lines at a time (`lines`, three by default): a window that many lines tall, and when
 * there is more, it moves on as `turn` says — the next page scrolling up in its place like a page turned, or one line
 * (no scroll under reduced motion: call-view.css). A page never shows an empty line: the last one, shorter, takes only
 * its own lines' height. The person's sent turn moves on by time (a page every PAGE_MS; `onPages` says how many, for
 * how long it stays); the agent's follows its voice: the line holding the last word heard (`follow`, the element whose
 * end marks it). Above the window, a strip of the bubble's own padding shows the line before, fading out (call-view.css
 * --paged-peek): there is more above, and the transcript has it. The whole text stays in the page for assistive tech. */

interface Layout { line: number; total: number }

/** The window's line height and how many lines the run takes; a line height it cannot read (none laid out, or
 *  "normal") is one page, the window as CSS caps it. */
function layoutOf(node: HTMLElement, run: HTMLElement): Layout {
  const line = parseFloat(getComputedStyle(node).lineHeight);
  return line > 0 ? { line, total: Math.max(1, Math.round(run.scrollHeight / line)) } : { line: 0, total: 1 };
}

/** The furthest first line the window can show. */
/** A fixed window's last page ends on the last line, full (operator, 2026-10-15): it turns only as far as that, never
 *  leaving it a line or two in a window three tall. */
function lastTop(total: number, lines: number, turn: PagedTurn, fixed = false) {
  return turn === "page" && !fixed ? Math.floor((total - 1) / lines) * lines : Math.max(0, total - lines);
}

/** The first line shown while line `current` is heard: its page's first, or the line that keeps the next one in view. */
function topFor(current: number, total: number, lines: number, turn: PagedTurn, fixed = false) {
  const top = turn === "page" ? Math.floor(current / lines) * lines : current - lines + 2;
  return Math.max(0, Math.min(top, lastTop(total, lines, turn, fixed)));
}

export function PagedText({ children, measure, onPages, follow, lines = 3, turn = "page", fixed }: { children: ReactNode; measure: unknown;
  onPages?: (pages: number) => void; follow?: string; lines?: number; turn?: PagedTurn;
  /** Always `lines` tall, whatever is shown: a box that never grows or shrinks as its words move on (the stage's balloon). */
  fixed?: boolean }) {
  const box = useRef<HTMLSpanElement>(null);
  const run = useRef<HTMLSpanElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [top, setTop] = useState(0);
  // Once laid out: how many lines, and so how many pages.
  useLayoutEffect(() => {
    const node = box.current, inner = run.current;
    const next = node && inner && layoutOf(node, inner);
    if (!next) return;
    setLayout(next);
    if (!follow) { setTop(0); onPages?.(Math.ceil(next.total / lines)); }
  }, [measure, lines, turn]); // eslint-disable-line react-hooks/exhaustive-deps
  // A reflow while the turn stays mounted (the face arriving after a fallback, a resize, a turned phone) can change the
  // lines: follow it, keeping the window where it was inside the new run. The sent turn's original page count owns its
  // display lifetime.
  useLayoutEffect(() => {
    const node = box.current, inner = run.current;
    if (!node || !inner) return;
    const observer = new ResizeObserver(() => {
      const next = layoutOf(node, inner);
      if (!next) return;
      setLayout((before) => before && before.line === next.line && before.total === next.total ? before : next);
      setTop((before) => Math.min(turn === "page" ? Math.floor(before / lines) * lines : before, lastTop(next.total, lines, turn, fixed)));
    });
    observer.observe(node);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [measure, follow, lines, turn]);
  // By time: a page every PAGE_MS, or a line every PAGE_MS / lines (the same pace).
  useEffect(() => {
    if (follow || !layout || top >= lastTop(layout.total, lines, turn, fixed)) return;
    const next = window.setTimeout(() => setTop((now) => now + (turn === "page" ? lines : 1)), turn === "page" ? PAGE_MS : PAGE_MS / lines);
    return () => window.clearTimeout(next);
  }, [follow, top, layout, lines, turn]);
  // With the voice: where the last word heard ends — back to the start when it is heard again from the start.
  useLayoutEffect(() => {
    if (!follow || !run.current || !layout?.line) return;
    const mark = run.current.querySelector(follow);
    if (!mark) return;
    const rects = mark.getClientRects();
    const last = mark.textContent && rects.length ? rects[rects.length - 1] : null;
    // Measured from the run's own top: the transform moves the run and the words in it alike, mid-turn too.
    const current = !last ? 0 : Math.floor((last.bottom - run.current.getBoundingClientRect().top - 1) / layout.line);
    const at = topFor(Math.max(0, Math.min(layout.total - 1, current)), layout.total, lines, turn, fixed);
    if (at !== top) setTop(at);
  });
  const shown = layout && !fixed ? Math.min(lines, turn === "page" ? layout.total - top : layout.total) : lines;
  // The window as tall as the lines it shows (the strip above it, --peek, besides); until laid out, call-view.css caps it.
  const style = { "--paged-lines": lines, height: layout?.line ? `calc(${shown * layout.line}px + var(--peek))` : undefined } as CSSProperties;
  return <span ref={box} className="paged-text" data-turn={turn} data-more={(layout && top + shown < layout.total) || undefined} style={style}>
    <span ref={run} className="paged-text-run" style={{ transform: `translateY(${-top * (layout?.line ?? 0)}px)` }}>{children}</span>
  </span>;
}
