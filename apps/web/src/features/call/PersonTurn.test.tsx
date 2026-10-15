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

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

test("what was sent shows its words in one clamped box: no paging, no check, cut or smaller type", () => {
  turn();
  expect(words().textContent).toBe(LONG);
  expect(sentBubble()!.querySelector(".paged-text, .paged-text-run")).toBeNull();
  for (const decided of ["data-lines", "data-small", "data-faded", "data-more"]) expect(words()).not.toHaveAttribute(decided);
  // Its balloon's tail is the only drawing on it.
  expect(sentBubble()!.querySelector(".person-sent-check, svg:not(.balloon-tail)")).toBeNull();
});

test("a choice the preview's panel stored for sent-text or sent-repeat changes nothing", () => {
  for (const stored of [{ "sent-text": "tail" }, { "sent-text": "clamp" }, { "sent-text": "shrink" }, { "sent-text": "line" },
    { "sent-repeat": "replace" }, { "sent-repeat": "stack" }]) {
    localStorage.setItem(VARIANTS_KEY, JSON.stringify(stored));
    const { to, first, unmount } = turn();
    expect(words().textContent).toBe(LONG);
    expect(words()).not.toHaveAttribute("data-lines");
    // Speaking again, it lifts away at once, under the bars.
    to(listening(first));
    expect(sentBubble()).toHaveAttribute("data-leaving");
    expect(sentBubble()).toHaveAttribute("data-under");
    expect(bubbles()).toHaveLength(2);
    unmount();
  }
});

/* How long it stays: a page's time per page, uncapped. */

test("a short sent turn stays a page's time, then lifts away and is gone", () => {
  turn(SHORT);
  staysThenGoes(PAGE_MS);
  expect(document.querySelector(".person-turns")).toBeNull();
});

/* However long, it stays PAGE_MS: no paging, no length in it. */

test("a long one stays PAGE_MS too, whatever its length, and never turns a page", () => {
  turn();
  tick(PAGE_MS - 1);
  expect(words().textContent).toBe(LONG);
  expect(sentBubble()!.querySelector(".paged-text-run")).toBeNull();
  staysThenGoes(1);
});

test("every clock stops with the turn: nothing left running once it is gone, nor once the stage is", () => {
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
  expect(running.size).toBe(1); // its time
  shown.unmount();
  expect(running.size).toBe(0);
  turn();
  tick(PAGE_MS);
  tick(SENT_LEAVING_MS);
  expect(sentBubble()).toBeNull();
  expect(running.size).toBe(0);
});

/* Its delivery mark: the transcript's, when the message's delivery is known. */

const withDelivery = (delivery?: string): ChatMessage => ({ ...said("u-1", LONG), delivery } as unknown as ChatMessage);
const receipt = () => sentBubble()!.querySelector<HTMLElement>(".person-receipt");
function sentWith(delivery?: string) {
  const t = translator();
  const view = render(<PersonTurn conversation={listening()} t={t} />);
  view.rerender(<PersonTurn conversation={settled([withDelivery(delivery)])} t={t} />);
}

test.each(["delivered", "read", "not_sent"])("a %s message shows its delivery mark, labelled as the transcript's", (state) => {
  sentWith(state);
  expect(receipt()).not.toBeNull();
  expect(receipt()).toHaveAttribute("role", "status");
  expect(receipt()).toHaveAttribute("data-state", state);
  expect(receipt()!.getAttribute("aria-label")).toBeTruthy();
});

test("no known delivery, no mark", () => {
  sentWith(undefined);
  expect(sentBubble()).not.toBeNull();
  expect(receipt()).toBeNull();
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

test("cut late in its time, it lifts away at once all the same", () => {
  const { to, first } = turn();
  tick(PAGE_MS - 100);
  to(listening(first));
  expect(sentBubble()).toHaveAttribute("data-leaving");
  tick(SENT_LEAVING_MS);
  expect(sentBubble()).toBeNull();
});

test("the next one sent shows alone, from the start of its own moment, on its own clock", () => {
  const { to, first } = turn();
  tick(PAGE_MS - 200);
  to(listening(first));
  tick(SENT_LEAVING_MS);
  expect(sentBubble()).toBeNull();
  to(settled([...first, said("u-2", SHORT)]));
  expect(sentBubbles()).toHaveLength(1);
  expect(saying(SHORT)).not.toBeNull();
  expect(saying(SHORT)).not.toHaveAttribute("data-leaving");
  staysThenGoes(PAGE_MS, () => saying(SHORT));
  // The first one's time would have run until now and past: it never comes back.
  tick(3 * PAGE_MS);
  expect(document.querySelector(".person-turns")).toBeNull();
});

test("sent while the one before still leaves: the new one shows at once on its own clock, the other goes on leaving", () => {
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
