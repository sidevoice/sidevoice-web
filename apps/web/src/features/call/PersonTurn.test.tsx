import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { ChatMessage, ConversationView } from "../../state/room-types";
import { VARIANTS_KEY } from "../../lib/variants";
import { callTranslator } from "./call-i18n";
import { PersonTurn } from "./PersonTurn";
import { PAGE_MS as SENT_PAGE_MS } from "./PagedText";
import { SENT_LEAVING_MS, SENT_SHOWN_MAX_MS, SENT_SHOWN_MS, sentShownMs } from "./speech-reading";

const LONG = "Okay, so here's what I'd like you to do next. First, go through the settings pane and check that every toggle "
  + "still saves when you change it. Then look at the transcript on a phone. And when you're done, push it on a branch.";
const SHORT = "Push it.";

const said = (segment: string, text: string): ChatMessage =>
  ({ id: segment, segment, role: "user", text, name: "You", time: 1 } as unknown as ChatMessage);
const listening = (messages: ChatMessage[] = []): ConversationView =>
  ({ messages, pendingText: "", pendingCancellable: true, pendingPhase: "listening" });
const settled = (messages: ChatMessage[]): ConversationView => ({ messages, pendingText: "", pendingCancellable: false, pendingPhase: "" });

function variants(picked: Record<string, string>) {
  localStorage.setItem(VARIANTS_KEY, JSON.stringify(picked));
}

/** The person's turn on the stage, taken from speaking to sent: what PersonTurn shows at each step. */
function turn(text = LONG) {
  const t = callTranslator();
  const view = render(<PersonTurn conversation={listening()} t={t} />);
  const to = (conversation: ConversationView) => view.rerender(<PersonTurn conversation={conversation} t={t} />);
  to(settled([said("u-1", text)]));
  return { to, first: [said("u-1", text)], unmount: view.unmount };
}
const bubbles = () => [...document.querySelectorAll<HTMLElement>(".person-turns > .person-bubble")];
const sentBubble = () => document.querySelector<HTMLElement>(".person-bubble[data-sent]");
const sentBubbles = () => [...document.querySelectorAll<HTMLElement>(".person-bubble[data-sent]")];
/** The sent bubble showing `text` whole (every mode but "tail" shows it whole). */
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

/* "pages" reads its window's line height and the run's height. jsdom lays nothing out: the stylesheet's line height is
 * given here (not the 24px the code falls back on, so a count that ignored it would show), and each text is as many
 * lines tall as `laidOut` says. */
const LINE = 20;
function laidOut(lines: Record<string, number>) {
  const style = document.createElement("style");
  style.dataset.test = "pages";
  style.textContent = `.person-pages { line-height: ${LINE}px; }`;
  document.head.append(style);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("person-pages-run") ? (lines[this.textContent!] ?? 1) * LINE : 0;
  });
}
const run = (bubble: HTMLElement | null = sentBubble()) => bubble!.querySelector<HTMLElement>(".person-pages-run")!;
/** Which page of three lines its window shows. */
const pageOf = (bubble: HTMLElement | null = sentBubble()) => {
  const shift = /translateY\((-?[\d.]+)px\)/.exec(run(bubble).style.transform);
  return shift ? -Number(shift[1]) / (3 * LINE) || 0 : NaN;
};

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => {
  localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks();
  document.head.querySelectorAll("style[data-test]").forEach((style) => style.remove());
});

test("by default a long sent turn shows its latest words after a “…”, as today", () => {
  turn();
  expect(words()).toHaveTextContent(/^…/);
  expect(words().textContent!.length).toBeLessThan(LONG.length);
  expect(LONG.endsWith(words().textContent!.slice(1))).toBe(true);
  expect(words()).not.toHaveAttribute("data-lines");
});

test("clamp shows it whole from its start, three lines, and fades its last line only when there is more", () => {
  variants({ "sent-text": "clamp" });
  // jsdom lays nothing out: a box holding more than it shows is one whose content is taller than it.
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) { return this.textContent!.length > 40 ? 120 : 24; });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(72);
  turn();
  expect(words()).toHaveTextContent(LONG);
  expect(words()).toHaveAttribute("data-lines", "3");
  expect(words()).toHaveAttribute("data-faded");
});

test("clamp does not fade a turn that fits", () => {
  variants({ "sent-text": "clamp" });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(48);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(48);
  turn(SHORT);
  expect(words()).toHaveAttribute("data-lines", "3");
  expect(words()).not.toHaveAttribute("data-faded");
});

test("shrink sets a long turn smaller in four lines, a short one at its size", () => {
  variants({ "sent-text": "shrink" });
  const long = turn();
  expect(words()).toHaveTextContent(LONG);
  expect(words()).toHaveAttribute("data-lines", "4");
  expect(words()).toHaveAttribute("data-small");
  long.unmount();
  turn(SHORT);
  expect(words()).not.toHaveAttribute("data-small");
});

test("line shows one line and the transcript's check, named for assistive tech", () => {
  variants({ "sent-text": "line" });
  turn();
  expect(words()).toHaveAttribute("data-lines", "1");
  const check = sentBubble()!.querySelector(".person-sent-check")!;
  expect(check.querySelector("svg")).toHaveAttribute("aria-hidden");
  expect(check).toHaveTextContent("Sent");
});

test("the panel's pick is followed live", () => {
  turn();
  expect(words()).not.toHaveAttribute("data-lines");
  act(() => {
    variants({ "sent-text": "line" });
    window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY }));
  });
  expect(words()).toHaveAttribute("data-lines", "1");
});

/* How long it stays. */

test("what was sent stays about three seconds, a little more the longer it is, never past five", () => {
  expect(SENT_SHOWN_MS).toBe(3000);
  expect(SENT_SHOWN_MAX_MS).toBe(5000);
  expect(sentShownMs(SHORT)).toBe(3000);
  expect(sentShownMs("x".repeat(120))).toBe(3000);
  expect(sentShownMs("x".repeat(121))).toBe(3008);
  expect(sentShownMs(LONG)).toBe(3000 + (LONG.length - 120) * 8);
  expect(sentShownMs("x".repeat(369))).toBe(4992);
  expect(sentShownMs("x".repeat(370))).toBe(5000);
  expect(sentShownMs("x".repeat(5000))).toBe(5000);
});

test("a short sent turn stays three seconds, then lifts away and is gone", () => {
  turn(SHORT);
  staysThenGoes(3000);
  expect(document.querySelector(".person-turns")).toBeNull();
});

test("a longer one stays a little longer, on its length", () => {
  const text = "go on ".repeat(40).trim();
  turn(text);
  staysThenGoes(3000 + (text.length - 120) * 8);
});

test("however long, it never stays past five seconds outside pages", () => {
  turn("and then ".repeat(200).trim());
  staysThenGoes(5000);
});

test.each(["tail", "clamp", "shrink", "line"])("%s keeps that same time", (mode) => {
  variants({ "sent-text": mode });
  turn();
  staysThenGoes(sentShownMs(LONG));
});

/* "pages". */

test("pages: three lines at a time, the next three scrolling up every SENT_PAGE_MS; three pages stay three pages' time", () => {
  variants({ "sent-text": "pages" });
  laidOut({ [LONG]: 7 });
  turn();
  expect(words()).toHaveClass("person-pages");
  expect(words()).toHaveTextContent(LONG);
  expect(pageOf()).toBe(0);
  expect(words()).toHaveAttribute("data-more");
  tick(SENT_PAGE_MS - 1);
  expect(pageOf()).toBe(0);
  tick(1);
  expect(run().style.transform).toBe(`translateY(-${3 * LINE}px)`);
  expect(words()).toHaveAttribute("data-more");
  tick(SENT_PAGE_MS);
  expect(pageOf()).toBe(2);
  expect(words()).not.toHaveAttribute("data-more");
  // The last page is read its own time, without turning further, and then it leaves as usual.
  staysThenGoes(SENT_PAGE_MS);
});

test.each([[1, 1], [3, 1], [4, 2], [6, 2], [7, 3], [12, 4]])("pages: %i lines are %i pages, and stay that many pages' time", (lines, pages) => {
  variants({ "sent-text": "pages" });
  laidOut({ [LONG]: lines });
  turn();
  for (let page = 1; page < pages; page++) {
    tick(SENT_PAGE_MS);
    expect(pageOf()).toBe(page);
  }
  staysThenGoes(SENT_PAGE_MS);
});

test("pages: no cap — ten pages stay thirty seconds, turning every SENT_PAGE_MS", () => {
  variants({ "sent-text": "pages" });
  laidOut({ [LONG]: 30 });
  turn();
  // Each page sets the next one's clock as it turns: time goes by here a page at a time, as it does on the stage.
  for (let page = 1; page < 10; page++) {
    tick(SENT_PAGE_MS - 1);
    expect(pageOf()).toBe(page - 1);
    tick(1);
    expect(pageOf()).toBe(page);
    expect(sentBubble()).not.toHaveAttribute("data-leaving");
  }
  staysThenGoes(SENT_PAGE_MS);
  expect(10 * SENT_PAGE_MS).toBeGreaterThan(SENT_SHOWN_MAX_MS);
});

test("pages: one that fits is a single page, which never turns", () => {
  variants({ "sent-text": "pages" });
  laidOut({ [SHORT]: 1 });
  turn(SHORT);
  expect(words()).not.toHaveAttribute("data-more");
  tick(SENT_PAGE_MS - 1);
  expect(pageOf()).toBe(0);
  staysThenGoes(1);
});

test("every clock stops with the turn: nothing left running once it is gone, nor once the stage is", () => {
  variants({ "sent-text": "pages" });
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
  for (let page = 0; page < 3; page++) tick(SENT_PAGE_MS);
  tick(SENT_LEAVING_MS);
  expect(sentBubble()).toBeNull();
  expect(running.size).toBe(0);
});

/* Speaking again during its moment (`sent-repeat`). */

test("speaking again, by default the bars take the sent turn's place at once, and it does not come back", () => {
  const { to, first } = turn();
  to(listening(first));
  expect(bubbles()).toHaveLength(1);
  expect(sentBubble()).toBeNull();
  expect(bubbles()[0].querySelector(".voice-wave")).not.toBeNull();
  // The new turn cancelled: nothing was sent, and the one before is gone, not back for the rest of its moment.
  to(settled(first));
  expect(document.querySelector(".person-turns")).toBeNull();
  tick(sentShownMs(LONG) + SENT_LEAVING_MS);
  expect(document.querySelector(".person-turns")).toBeNull();
});

test("replace, in pages: the one sent is gone at once, the next sent shows alone, on its own clock", () => {
  variants({ "sent-text": "pages" });
  laidOut({ [LONG]: 7, [SHORT]: 1 });
  const { to, first } = turn();
  tick(SENT_PAGE_MS + 200);
  to(listening(first));
  expect(sentBubble()).toBeNull();
  tick(400);
  to(settled([...first, said("u-2", SHORT)]));
  expect(sentBubbles()).toHaveLength(1);
  expect(saying(SHORT)).not.toBeNull();
  staysThenGoes(SENT_PAGE_MS, () => saying(SHORT));
  // The first one's pages would have run until now and past: it never comes back.
  tick(3 * SENT_PAGE_MS);
  expect(document.querySelector(".person-turns")).toBeNull();
});

test("stack: speaking again, the sent turn moves up above the new bubble, whole, and keeps its own time", () => {
  variants({ "sent-repeat": "stack", "sent-text": "clamp" });
  const { to, first } = turn();
  tick(600);
  to(listening(first));
  const [top, bottom] = bubbles();
  expect(top).toHaveAttribute("data-sent");
  expect(top.querySelector(".person-said")).toHaveTextContent(LONG);
  expect(top.querySelector(".person-said")).toHaveAttribute("data-lines", "3");
  expect(bottom).not.toHaveAttribute("data-sent");
  expect(bottom.querySelector(".voice-wave")).not.toBeNull();
  staysThenGoes(sentShownMs(LONG) - 600);
  expect(bubbles()).toHaveLength(1);
});

test("stack, in pages: the first keeps its clock and its pages while a second turn is spoken and sent below it", () => {
  variants({ "sent-repeat": "stack", "sent-text": "pages" });
  laidOut({ [LONG]: 7, [SHORT]: 1 });
  const { to, first } = turn();
  const firstOne = () => saying(LONG);
  tick(1000);
  to(listening(first));
  expect(bubbles()[0]).toBe(firstOne());
  expect(pageOf(firstOne())).toBe(0);
  // Speaking did not restart its page: it turns at three seconds from when it was sent, not from when they spoke.
  tick(SENT_PAGE_MS - 1000 - 1);
  expect(pageOf(firstOne())).toBe(0);
  tick(1);
  expect(pageOf(firstOne())).toBe(1);
  // The second turn sent, at 3.5 s: below the first, which goes on as it was.
  tick(500);
  to(settled([...first, said("u-2", SHORT)]));
  const secondOne = () => saying(SHORT);
  expect(sentBubbles()).toEqual([firstOne(), secondOne()]);
  expect(bubbles()).toHaveLength(2);
  expect(pageOf(firstOne())).toBe(1);
  tick(2500);
  expect(pageOf(firstOne())).toBe(2);
  // The second's own time, from its own moment (3.5 s + one page): it leaves, the first stays.
  staysThenGoes(SENT_PAGE_MS - 2500, secondOne);
  expect(firstOne()).not.toHaveAttribute("data-leaving");
  expect(pageOf(firstOne())).toBe(2);
  // The first leaves at three pages' time from when it was sent, 9 s, as if nothing had happened.
  staysThenGoes(3 * SENT_PAGE_MS - (SENT_PAGE_MS + 500 + SENT_PAGE_MS + SENT_LEAVING_MS), firstOne);
  expect(document.querySelector(".person-turns")).toBeNull();
});

test("stack: speaking a third time, the bars open below both sent ones", () => {
  variants({ "sent-repeat": "stack", "sent-text": "clamp" });
  const { to, first } = turn();
  to(listening(first));
  const both = [...first, said("u-2", SHORT)];
  to(settled(both));
  to(listening(both));
  const [one, two, live] = bubbles();
  expect(one.querySelector(".person-said")).toHaveTextContent(LONG);
  expect(two.querySelector(".person-said")).toHaveTextContent(SHORT);
  expect(live.querySelector(".voice-wave")).not.toBeNull();
});

test("leave: the sent turn lifts away at once from where the bars come in, and is gone when it has", () => {
  variants({ "sent-repeat": "leave" });
  const { to, first } = turn();
  tick(300);
  to(listening(first));
  expect(sentBubble()).toHaveAttribute("data-leaving");
  expect(sentBubble()).toHaveAttribute("data-under");
  expect(bubbles()[1].querySelector(".voice-wave")).not.toBeNull();
  tick(SENT_LEAVING_MS - 1);
  expect(sentBubble()).not.toBeNull();
  tick(1);
  expect(sentBubble()).toBeNull();
  // The new turn cancelled: the one before does not come back.
  to(settled(first));
  expect(document.querySelector(".person-turns")).toBeNull();
  tick(sentShownMs(LONG));
  expect(document.querySelector(".person-turns")).toBeNull();
});

test("leave, in pages: cut mid-page, it lifts away at once all the same", () => {
  variants({ "sent-repeat": "leave", "sent-text": "pages" });
  laidOut({ [LONG]: 7 });
  const { to, first } = turn();
  tick(SENT_PAGE_MS + 100);
  to(listening(first));
  expect(sentBubble()).toHaveAttribute("data-leaving");
  tick(SENT_LEAVING_MS);
  expect(sentBubble()).toBeNull();
});
