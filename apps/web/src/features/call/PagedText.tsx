import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** How long each page stays where the pages turn by time (the person's sent turn); the agent's turn with its voice. */
export const PAGE_MS = 3000;

/* What is said on the stage, three lines at a time: a window three lines tall, and when there is more, the next three
 * scroll up in its place like a page turned (no scroll under reduced motion: call-view.css). The person's sent turn
 * turns a page every PAGE_MS (`onPages` says how many, for how long it stays); the agent's follows its voice: the page
 * holding the last word heard (`follow`, the element whose end marks it). */
export function PagedText({ children, measure, onPages, follow }: { children: ReactNode; measure: unknown; onPages?: (pages: number) => void;
  follow?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const run = useRef<HTMLSpanElement>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(0);
  const [step, setStep] = useState(0);
  // How many pages, once laid out: the window is three lines tall, so its height is a page.
  useLayoutEffect(() => {
    const node = box.current, inner = run.current;
    if (!node || !inner) return;
    const height = node.clientHeight || 1;
    const count = Math.max(1, Math.ceil((inner.scrollHeight - 1) / height));
    setStep(height); setPages(count);
    if (!follow) { setPage(0); onPages?.(count); }
  }, [measure]); // eslint-disable-line react-hooks/exhaustive-deps
  // By time: a page every PAGE_MS.
  useEffect(() => {
    if (follow || page >= pages - 1) return;
    const next = window.setTimeout(() => setPage((now) => now + 1), PAGE_MS);
    return () => window.clearTimeout(next);
  }, [follow, page, pages]);
  // With the voice: the page where the last word heard ends.
  useLayoutEffect(() => {
    if (!follow || !run.current || !step) return;
    const mark = run.current.querySelector(follow);
    const rects = mark?.getClientRects();
    const last = rects && rects.length ? rects[rects.length - 1] : null;
    if (!last) return;
    const top = run.current.getBoundingClientRect().top + page * step;
    const at = Math.max(0, Math.min(pages - 1, Math.floor((last.bottom - top - 1) / step)));
    if (at > page) setPage(at);
  });
  return <span ref={box} className="paged-text" data-more={page < pages - 1 || undefined}>
    <span ref={run} className="paged-text-run" style={{ transform: `translateY(${-page * step}px)` }}>{children}</span>
  </span>;
}
