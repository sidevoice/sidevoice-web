import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { ChatMessage, ConversationView } from "../../state/room-types";
import { VARIANTS_KEY } from "../../lib/variants";
import { translator } from "../../i18n/translator";
import { PersonTurn } from "./PersonTurn";
import { PAGE_MS } from "./PagedText";
import { SENT_LEAVING_MS } from "./speech-reading";

const LONG = "Okay, so here's what I'd like you to do next. First, go through the settings pane and check that every toggle "
  + "still saves when you change it. Then look at the transcript on a phone. And when you're done, push it on a branch.";
const SHORT = "Push it.";

const said = (segment: string, text: string): ChatMessage =>
  ({ id: segment, segment, role: "user", text, name: "You", time: 1 } as unknown as ChatMessage);
const listening = (messages: ChatMessage[] = []): ConversationView =>
  ({ messages, pendingText: "", pendingCancellable: true, pendingPhase: "listening" });
const settled = (messages: ChatMessage[]): ConversationView => ({ messages, pendingText: "", pendingCancellable: false, pendingPhase: "" });

/** The person's turn on the stage, taken from speaking to sent: what PersonTurn shows at each step. */
function turn(text = LONG) {
  const t = translator();
  const view = render(<PersonTurn conversation={listening()} t={t} />);
  const to = (conversation: ConversationView) => view.rerender(<PersonTurn conversation={conversation} t={t} />);
  to(settled([said("u-1", text)]));
  return { to, first: [said("u-1", text)], unmount: view.unmount };
}
const bubbles = () => [...document.querySelectorAll<HTMLElement>(".person-turns > .person-bubble")];
const sentBubble = () => document.querySelector<HTMLElement>(".person-bubble[data-sent]");
const sentBubbles = () => [...document.querySelectorAll<HTMLElement>(".person-bubble[data-sent]")];
/** The sent bubble showing `text`. */
const saying = (text: string) => sentBubbles().find((bubble) => bubble.querySelector(".person-said")!.textContent === text) ?? null;
const words = () => document.querySelector<HTMLElement>(".person-said")!;
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

/** It stays `shown` — not a moment less, not a moment more — then leaves, and is gone SENT_LEAVING_MS later. */
function staysThenGoes(shown: number, bubble: () => HTMLElement | null = sentBubble) {
  tick(shown - 1);
  expect(bubble()).not.toBeNull();
  expect(bubble()).not.toHaveAttribute("data-leaving");
  tick(1);
  expect(bubble()).toHaveAttribute("data-leaving");
  tick(SENT_LEAVING_MS - 1);
  expect(bubble()).not.toBeNull();
  tick(1);
  expect(bubble()).toBeNull();
}

/* What was sent is three lines at a time (PagedText): it reads its window's height (three lines, fewer when the text
 * is shorter) and the run's. jsdom lays nothing out: each text is as many lines tall as `laidOut` says, LINE px a line. */
const LINE = 20;
function laidOut(lines: Record<string, number>) {
  const of = (element: HTMLElement) => lines[element.textContent!] ?? 1;
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("paged-text-run") ? of(this) * LINE : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("paged-text") ? Math.min(3, of(this)) * LINE : 0;
  });
}
const run = (bubble: HTMLElement | null = sentBubble()) => bubble!.querySelector<HTMLElement>(".paged-text-run")!;
/** Which page of three lines its window shows. */
const pageOf = (bubble: HTMLElement | null = sentBubble()) => {
  const shift = /translateY\((-?[\d.]+)px\)/.exec(run(bubble).style.transform);
  return shift ? -Number(shift[1]) / (3 * LINE) || 0 : NaN;
};
const paged = () => words().querySelector<HTMLElement>(".paged-text")!;

/** The window's line height, as call-view.css gives it (PagedText reads it to count lines). */
const lineStyle = document.createElement("style");
lineStyle.textContent = `.paged-text { line-height: ${LINE}px; }`;

beforeEach(() => { localStorage.clear(); document.head.append(lineStyle); vi.useFakeTimers(); });
afterEach(() => { localStorage.clear(); lineStyle.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

test("what was sent shows whole, in its window of three lines, with no check, cut or smaller type", () => {
  laidOut({ [LONG]: 7 });
  turn();
  expect(words()).toHaveTextContent(LONG);
  expect(words().textContent).toBe(LONG);
  expect(paged()).toBeInTheDocument();
  for (const decided of ["data-lines", "data-small", "data-faded"]) expect(words()).not.toHaveAttribute(decided);
  // Its balloon's tail is the only drawing on it.
  expect(sentBubble()!.querySelector(".person-sent-check, svg:not(.balloon-tail)")).toBeNull();
});

test("a choice the preview's panel stored for sent-text or sent-repeat changes nothing", () => {
  for (const stored of [{ "sent-text": "tail" }, { "sent-text": "clamp" }, { "sent-text": "shrink" }, { "sent-text": "line" },
    { "sent-repeat": "replace" }, { "sent-repeat": "stack" }]) {
    localStorage.setItem(VARIANTS_KEY, JSON.stringify(stored));
    laidOut({ [LONG]: 7 });
    const { to, first, unmount } = turn();
    expect(words().textContent).toBe(LONG);
    expect(paged()).toHaveAttribute("data-more");
    expect(words()).not.toHaveAttribute("data-lines");
    // Speaking again, it lifts away at once, under the bars.
    to(listening(first));
    expect(sentBubble()).toHaveAttribute("data-leaving");
    expect(sentBubble()).toHaveAttribute("data-under");
    expect(bubbles()).toHaveLength(2);
    unmount();
    vi.restoreAllMocks();
  }
});

/* How long it stays: a page's time per page, uncapped. */

test("a short sent turn stays a page's time, then lifts away and is gone", () => {
  turn(SHORT);
  staysThenGoes(PAGE_MS);
  expect(document.querySelector(".person-turns")).toBeNull();
});

test("a long one that fits its three lines stays one page's time too: never on its length", () => {
  const text = "go on ".repeat(40).trim();
  laidOut({ [text]: 3 });
  turn(text);
  staysThenGoes(PAGE_MS);
});

/* Its pages. */

test("pages: three lines at a time, the next three scrolling up every PAGE_MS; three pages stay three pages' time", () => {
  laidOut({ [LONG]: 7 });
  turn();
  expect(words()).toHaveTextContent(LONG);
  expect(pageOf()).toBe(0);
  expect(paged()).toHaveAttribute("data-more");
  tick(PAGE_MS - 1);
  expect(pageOf()).toBe(0);
  tick(1);
  expect(run().style.transform).toBe(`translateY(-${3 * LINE}px)`);
  expect(paged()).toHaveAttribute("data-more");
  tick(PAGE_MS);
  expect(pageOf()).toBe(2);
  expect(paged()).not.toHaveAttribute("data-more");
  // The last page is read its own time, without turning further, and then it leaves as usual.
  staysThenGoes(PAGE_MS);
});

test.each([[1, 1], [3, 1], [4, 2], [6, 2], [7, 3], [12, 4]])("pages: %i lines are %i pages, and stay that many pages' time", (lines, pages) => {
  laidOut({ [LONG]: lines });
  turn();
  for (let page = 1; page < pages; page++) {
    tick(PAGE_MS);
    expect(pageOf()).toBe(page);
  }
  staysThenGoes(PAGE_MS);
});

test("pages: no cap — ten pages stay thirty seconds, turning every PAGE_MS", () => {
  laidOut({ [LONG]: 30 });
  turn();
  // Each page sets the next one's clock as it turns: time goes by here a page at a time, as it does on the stage.
  for (let page = 1; page < 10; page++) {
    tick(PAGE_MS - 1);
    expect(pageOf()).toBe(page - 1);
    tick(1);
    expect(pageOf()).toBe(page);
    expect(sentBubble()).not.toHaveAttribute("data-leaving");
  }
  staysThenGoes(PAGE_MS);
  expect(10 * PAGE_MS).toBe(30_000);
});

test("a live recount after the first page keeps the original sent-turn deadline", () => {
  let notify: () => void = () => {};
  class Observer {
    constructor(callback: () => void) { notify = callback; }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Observer);
  let lines = 6;
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("paged-text-run") ? lines * LINE : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("paged-text") ? 3 * LINE : 0;
  });
  turn();
  tick(PAGE_MS + 500);
  expect(pageOf()).toBe(1);
  lines = 9;
  act(() => notify());
  expect(sentBubble()).not.toHaveAttribute("data-leaving");
  tick(PAGE_MS - 501);
  expect(sentBubble()).not.toHaveAttribute("data-leaving");
  tick(1);
  expect(sentBubble()).toHaveAttribute("data-leaving");
  vi.unstubAllGlobals();
});

test("pages: one that fits is a single page, which never turns", () => {
  laidOut({ [SHORT]: 1 });
  turn(SHORT);
  expect(paged()).not.toHaveAttribute("data-more");
  tick(PAGE_MS - 1);
  expect(pageOf()).toBe(0);
  staysThenGoes(1);
});

test("every clock stops with the turn: nothing left running once it is gone, nor once the stage is", () => {
  laidOut({ [LONG]: 7 });
  // The clocks the turn sets (window.setTimeout), neither run nor cleared yet; the renderer's own are not among them.
  const running = new Set<unknown>();
  const set = window.setTimeout, clear = window.clearTimeout;
  vi.spyOn(window, "setTimeout").mockImplementation(((go: () => void, ms?: number) => {
    const id = set(() => { running.delete(id); go(); }, ms);
    running.add(id);
    return id;
  }) as typeof window.setTimeout);
  vi.spyOn(window, "clearTimeout").mockImplementation((id) => { running.delete(id); clear(id); });
  const shown = turn();
  expect(running.size).toBe(2); // its time and its next page
  shown.unmount();
  expect(running.size).toBe(0);
  turn();
  for (let page = 0; page < 3; page++) tick(PAGE_MS);
  tick(SENT_LEAVING_MS);
  expect(sentBubble()).toBeNull();
  expect(running.size).toBe(0);
});

/* Speaking again during its moment: it lifts away at once from where the bars come in. */

test("speaking again, the sent turn lifts away at once from where the bars come in, and is gone when it has", () => {
  const { to, first } = turn();
  tick(300);
  to(listening(first));
  expect(sentBubble()).toHaveAttribute("data-leaving");
  expect(sentBubble()).toHaveAttribute("data-under");
  expect(bubbles()).toHaveLength(2);
  expect(bubbles()[1]).not.toHaveAttribute("data-sent");
  expect(bubbles()[1].querySelector(".voice-wave")).not.toBeNull();
  tick(SENT_LEAVING_MS - 1);
  expect(sentBubble()).not.toBeNull();
  tick(1);
  expect(sentBubble()).toBeNull();
  expect(bubbles()).toHaveLength(1);
  // The new turn cancelled: the one before does not come back.
  to(settled(first));
  expect(document.querySelector(".person-turns")).toBeNull();
  tick(3 * PAGE_MS);
  expect(document.querySelector(".person-turns")).toBeNull();
});

test("cut mid-page, it lifts away at once all the same", () => {
  laidOut({ [LONG]: 7 });
  const { to, first } = turn();
  tick(PAGE_MS + 100);
  expect(pageOf()).toBe(1);
  to(listening(first));
  expect(sentBubble()).toHaveAttribute("data-leaving");
  tick(SENT_LEAVING_MS);
  expect(sentBubble()).toBeNull();
});

test("the next one sent shows alone, from the start of its own moment, on its own clock", () => {
  laidOut({ [LONG]: 7, [SHORT]: 1 });
  const { to, first } = turn();
  tick(PAGE_MS + 200);
  to(listening(first));
  tick(SENT_LEAVING_MS);
  expect(sentBubble()).toBeNull();
  to(settled([...first, said("u-2", SHORT)]));
  expect(sentBubbles()).toHaveLength(1);
  expect(saying(SHORT)).not.toBeNull();
  expect(saying(SHORT)).not.toHaveAttribute("data-leaving");
  staysThenGoes(PAGE_MS, () => saying(SHORT));
  // The first one's pages would have run until now and past: it never comes back.
  tick(3 * PAGE_MS);
  expect(document.querySelector(".person-turns")).toBeNull();
});

test("sent while the one before still leaves: the new one shows at once on its own clock, the other goes on leaving", () => {
  laidOut({ [LONG]: 7, [SHORT]: 1 });
  const { to, first } = turn();
  to(listening(first));
  tick(200);
  to(settled([...first, said("u-2", SHORT)]));
  expect(saying(LONG)).toHaveAttribute("data-leaving");
  expect(saying(SHORT)).not.toHaveAttribute("data-leaving");
  tick(SENT_LEAVING_MS - 200);
  expect(saying(LONG)).toBeNull();
  staysThenGoes(PAGE_MS - (SENT_LEAVING_MS - 200), () => saying(SHORT));
});
