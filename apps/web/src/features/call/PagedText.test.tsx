import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { KaraokeText } from "../conversation/KaraokeText";
import { PAGE_MS, PagedText } from "./PagedText";

/* What is said on the stage, three lines at a time (PagedText): by time, a page every PAGE_MS, saying how many; with
 * the voice, the page holding the end of what was heard.
 *
 * jsdom lays nothing out, so the layout is modelled here as a browser gives it: a text LINE px a line, CHARS characters
 * a line; the window as tall as three lines (fewer when the text is shorter); and the run moved up by its transform,
 * which a browser's rects include — the run's and the heard part's alike. */
const LINE = 20;
const CHARS = 10;
const TOP = 100;
const linesOf = (text: string) => Math.max(1, Math.ceil(text.length / CHARS));
/** How far up the run is moved, as its style says. */
const shift = (run: Element) => -Number(/translateY\((-?[\d.]+)px\)/.exec((run as HTMLElement).style.transform)?.[1] ?? 0) || 0;
const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON() {} }) as DOMRect;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("paged-text") ? Math.min(3, linesOf(this.textContent!)) * LINE : 0;
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("paged-text-run") ? linesOf(this.textContent!) * LINE : 0;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = this.classList.contains("paged-text-run") ? TOP - shift(this) : TOP;
    return rect(top, top + linesOf(this.textContent!) * LINE);
  });
  // The heard part: a box on each line it spans, from the run's top; empty, one box where it starts.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    const run = this.closest(".paged-text-run")!;
    const top = TOP - shift(run);
    const end = this.textContent!.length;
    const lines = end ? Math.ceil(end / CHARS) : 1;
    return Array.from({ length: lines }, (_, line) => rect(top + line * LINE, top + (line + 1) * LINE)) as unknown as DOMRectList;
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const run = () => document.querySelector<HTMLElement>(".paged-text-run")!;
const windowOf = () => document.querySelector<HTMLElement>(".paged-text")!;
/** Which page of three lines the window shows. */
const page = () => shift(run()) / (3 * LINE);
/** `lines` lines of words, a word a line (the voice lights whole words). */
const text = (lines: number) => "abcdefghi ".repeat(lines);

test("a page is PAGE_MS, three seconds", () => {
  expect(PAGE_MS).toBe(3000);
});

test("by time: three lines at a time, the next three every PAGE_MS, said how many; the last page stays", () => {
  const pages = vi.fn();
  render(<PagedText measure={text(8)} onPages={pages}>{text(8)}</PagedText>);
  expect(pages).toHaveBeenCalledExactlyOnceWith(3);
  expect(page()).toBe(0);
  expect(windowOf()).toHaveAttribute("data-more");
  tick(PAGE_MS - 1);
  expect(page()).toBe(0);
  tick(1);
  expect(run().style.transform).toBe(`translateY(-${3 * LINE}px)`);
  tick(PAGE_MS);
  expect(page()).toBe(2);
  expect(windowOf()).not.toHaveAttribute("data-more");
  // No further page, and no clock left.
  expect(vi.getTimerCount()).toBe(0);
  tick(10 * PAGE_MS);
  expect(page()).toBe(2);
});

test("by time: what fits in three lines is one page, which never turns", () => {
  const pages = vi.fn();
  render(<PagedText measure={text(2)} onPages={pages}>{text(2)}</PagedText>);
  expect(pages).toHaveBeenCalledExactlyOnceWith(1);
  expect(windowOf()).not.toHaveAttribute("data-more");
  expect(vi.getTimerCount()).toBe(0);
});

test("by time: other words start over from their first page, counted again", () => {
  const pages = vi.fn();
  const view = render(<PagedText measure={text(7)} onPages={pages}>{text(7)}</PagedText>);
  tick(PAGE_MS);
  expect(page()).toBe(1);
  view.rerender(<PagedText measure={text(12)} onPages={pages}>{text(12)}</PagedText>);
  expect(pages).toHaveBeenLastCalledWith(4);
  expect(page()).toBe(0);
});

test("a live bubble resize recounts pages without remounting or restarting the current page", () => {
  let notify: () => void = () => {};
  class Observer {
    constructor(callback: () => void) { notify = callback; }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Observer);
  let lines = 7;
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("paged-text") ? 3 * LINE : 0;
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("paged-text-run") ? lines * LINE : 0;
  });
  const pages = vi.fn();
  render(<PagedText measure={text(7)} onPages={pages}>{text(7)}</PagedText>);
  const original = windowOf();
  tick(PAGE_MS);
  expect(page()).toBe(1);
  lines = 10;
  act(() => notify());
  expect(windowOf()).toBe(original);
  expect(page()).toBe(1);
  expect(pages).toHaveBeenCalledExactlyOnceWith(3);
  vi.unstubAllGlobals();
});

test("a live shrink clamps the visible last page without remounting or restarting its clock", () => {
  let notify: () => void = () => {};
  class Observer {
    constructor(callback: () => void) { notify = callback; }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Observer);
  let lines = 9;
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(3 * LINE);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("paged-text-run") ? lines * LINE : 0;
  });
  const pages = vi.fn();
  render(<PagedText measure={text(9)} onPages={pages}>{text(9)}</PagedText>);
  const original = windowOf();
  tick(PAGE_MS);
  tick(PAGE_MS);
  expect(page()).toBe(2);
  lines = 6;
  act(() => notify());
  expect(windowOf()).toBe(original);
  expect(page()).toBe(1);
  expect(run().style.transform).toBe(`translateY(-${3 * LINE}px)`);
  expect(pages).toHaveBeenCalledExactlyOnceWith(3);
  expect(vi.getTimerCount()).toBe(0);
  vi.unstubAllGlobals();
});

/** The agent's words as the stage shows them, `heard` characters of them heard. */
function voiced(words: string, heard: number) {
  return <PagedText measure={words} follow=".karaoke-played">
    <KaraokeText text={words} playback="playing" range={heard > 0 ? { from: 0, to: heard } : null} />
  </PagedText>;
}

test("with the voice: the page holding the end of what was heard, page after page to the last, on no clock", () => {
  const words = text(9);
  const view = render(voiced(words, 0));
  expect(page()).toBe(0);
  expect(windowOf()).toHaveAttribute("data-more");
  expect(vi.getTimerCount()).toBe(0);
  // Its third line: still the first page.
  view.rerender(voiced(words, 3 * CHARS));
  expect(page()).toBe(0);
  // Into its fourth line: the second page.
  view.rerender(voiced(words, 3 * CHARS + 1));
  expect(page()).toBe(1);
  // Time alone turns nothing.
  tick(5 * PAGE_MS);
  expect(page()).toBe(1);
  // Into its seventh line, the third page — and there, the last.
  view.rerender(voiced(words, 6 * CHARS + 1));
  expect(page()).toBe(2);
  expect(windowOf()).not.toHaveAttribute("data-more");
  view.rerender(voiced(words, words.length));
  expect(page()).toBe(2);
});

test("with the voice: a page it jumps to at once, however far; heard again from the start, back to the first", () => {
  const words = text(12);
  const view = render(voiced(words, 0));
  view.rerender(voiced(words, 10 * CHARS));
  expect(page()).toBe(3);
  // Heard again: the words go back to the start, and so does the window.
  view.rerender(voiced(words, 0));
  expect(page()).toBe(0);
  view.rerender(voiced(words, 4 * CHARS));
  expect(page()).toBe(1);
});
