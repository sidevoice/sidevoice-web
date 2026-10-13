import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { ChatMessage, ConversationView } from "../../state/room-types";
import { VARIANTS_KEY } from "../../lib/variants";
import { callTranslator } from "./call-i18n";
import { PersonTurn } from "./PersonTurn";
import { SENT_LEAVING_MS, SENT_SHOWN_MS } from "./speech-reading";

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
const words = () => document.querySelector<HTMLElement>(".person-said")!;
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

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

test("speaking again, by default the bars take the sent turn's place at once, and it does not come back", () => {
  const { to, first } = turn();
  to(listening(first));
  expect(bubbles()).toHaveLength(1);
  expect(sentBubble()).toBeNull();
  expect(bubbles()[0].querySelector(".voice-wave")).not.toBeNull();
  // The new turn cancelled: nothing was sent, and the one before is gone, not back for the rest of its moment.
  to(settled(first));
  expect(document.querySelector(".person-turns")).toBeNull();
  tick(SENT_SHOWN_MS + SENT_LEAVING_MS);
  expect(document.querySelector(".person-turns")).toBeNull();
});

test("stack: the sent turn stands above the bars, one line, and keeps its own time", () => {
  variants({ "sent-repeat": "stack", "sent-text": "clamp" });
  const { to, first } = turn();
  tick(600);
  to(listening(first));
  const [top, bottom] = bubbles();
  expect(top).toHaveAttribute("data-sent");
  expect(top).toHaveAttribute("data-stacked");
  expect(top.querySelector(".person-said")).toHaveAttribute("data-lines", "1");
  expect(bottom.querySelector(".voice-wave")).not.toBeNull();
  tick(SENT_SHOWN_MS - 600 - 1);
  expect(sentBubble()).not.toHaveAttribute("data-leaving");
  tick(1);
  expect(sentBubble()).toHaveAttribute("data-leaving");
  tick(SENT_LEAVING_MS);
  expect(sentBubble()).toBeNull();
  expect(bubbles()).toHaveLength(1);
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
});
