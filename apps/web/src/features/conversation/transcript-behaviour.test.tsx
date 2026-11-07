import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ChatMessage, ConversationView } from "../../state/room-types";
import { translator } from "../../i18n/translator";
import { FOLD_LINES } from "./FoldedText";
import { JUMP_SETTLE_MS, MessageList, PIN_MS } from "./MessageList";
import { transcriptBlocks } from "./transcript-blocks";

/* The transcript's behaviour (the creature redesign's T31, T38, T40): following the newest only at the foot, the way
 * back and its dot, the jump pinned to the foot, a long message folded at 25 lines, and only what changed drawn again. */

const base = new Date(2026, 10, 4, 10, 38).getTime();
const message = (overrides: Partial<ChatMessage>): ChatMessage => ({ segment: crypto.randomUUID(), thread: "fp|one", session: "call", role: "assistant", text: "Hola", name: "Agente", time: base, ...overrides });
const view = (messages: ChatMessage[], extra: Partial<ConversationView> = {}): ConversationView => ({ messages, pendingText: "", pendingCancellable: false, ...extra });
/** The same conversation as the room hands it over again: every row a new object, as conversationView makes them. */
const again = (messages: ChatMessage[]) => messages.map((row) => ({ ...row }));

/** The list's box, as a browser would lay it out: `height` of content in a 300px window; scrollTo moves it at once. */
function scroller(container: HTMLElement) {
  const list = container.querySelector<HTMLElement>("#messages")!;
  const box = { height: 900 };
  Object.defineProperties(list, {
    scrollHeight: { configurable: true, get: () => box.height },
    clientHeight: { configurable: true, value: 300 },
  });
  const scrollTo = vi.fn((options: ScrollToOptions) => { list.scrollTop = options.top ?? list.scrollTop; });
  Object.defineProperty(list, "scrollTo", { configurable: true, value: scrollTo });
  const scrollAt = (top: number) => { list.scrollTop = top; fireEvent.scroll(list); };
  return { list, box, scrollTo, scrollAt };
}
const jump = () => document.querySelector<HTMLButtonElement>(".latest-jump")!;

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test("at its foot the list follows the newest; scrolled up it keeps its place and the way back shows, with a dot once something new came", () => {
  const rows = [message({ segment: "a" })];
  const { container, rerender } = render(<MessageList conversation={view(rows)} />);
  const { box, scrollTo, scrollAt, list } = scroller(container);
  scrollAt(600);
  expect(jump()).not.toHaveAttribute("data-show");
  // At the foot: what comes is followed, before it is painted.
  box.height = 1000;
  rerender(<MessageList conversation={view(again([...rows, message({ segment: "b", text: "Sigo", time: base + 1_000 })]))} />);
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: "instant" });
  // Scrolled up past the foot's 24px: the place is kept, the way back shows, without a dot yet.
  scrollAt(1000 - 300 - 24);
  expect(jump()).toHaveAttribute("data-show");
  expect(jump()).not.toHaveAttribute("data-new");
  scrollTo.mockClear();
  box.height = 1100;
  rerender(<MessageList conversation={view(again([...rows, message({ segment: "b", text: "Sigo", time: base + 1_000 }), message({ segment: "c", text: "Y más", time: base + 2_000 })]))} />);
  expect(scrollTo).not.toHaveBeenCalled();
  expect(list.scrollTop).toBe(676);
  expect(jump()).toHaveAttribute("data-new");
  // Back at the foot by hand: the way back goes, and its dot with it.
  scrollAt(1100 - 300 - 23);
  expect(jump()).not.toHaveAttribute("data-show");
  expect(jump()).not.toHaveAttribute("data-new");
  expect(jump()).toHaveAttribute("aria-hidden", "true");
});

test("the way back reaches the very foot and stays pinned there while the live turn grows, then lets go", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let now = 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const rows = [message({ segment: "a" })];
  const { container, rerender } = render(<MessageList conversation={view(rows)} />);
  const { box, scrollTo, scrollAt } = scroller(container);
  scrollAt(100);
  fireEvent.click(screen.getByRole("button", { name: "Go to the end of the conversation" }));
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: "smooth" });
  // Mid-way down (the smooth scroll under way, away from the foot), the live turn grows: pinned, it is followed.
  scrollAt(400);
  now += PIN_MS - 100;
  box.height = 960;
  rerender(<MessageList conversation={view(again(rows), { pendingPhase: "listening", pendingCancellable: true })} />);
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 960, behavior: "instant" });
  // Where the smooth scroll is taken to have arrived, it is set exactly at the foot.
  scrollTo.mockClear();
  act(() => { vi.advanceTimersByTime(JUMP_SETTLE_MS); });
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 960, behavior: "instant" });
  // Pinned no longer: scrolled away again, what comes is not followed.
  now += 200;
  scrollAt(100);
  scrollTo.mockClear();
  box.height = 1020;
  rerender(<MessageList conversation={view(again(rows), { pendingPhase: "transcribing", pendingCancellable: true })} />);
  expect(scrollTo).not.toHaveBeenCalled();
});

test("a jump still under way is let go of when the transcript closes: reopened and scrolled up, nothing takes the reader back to the foot", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let now = 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const rows = [message({ segment: "a" })];
  const { container, rerender, unmount } = render(<MessageList conversation={view(rows)} />);
  const { box, scrollTo, scrollAt } = scroller(container);
  scrollAt(100);
  fireEvent.click(screen.getByRole("button", { name: "Go to the end of the conversation" }));
  // Closed within the jump's settling time, then opened again: it lands at the foot, as an opening does.
  now += 200;
  rerender(<MessageList conversation={view(again(rows))} visible={false} />);
  rerender(<MessageList conversation={view(again(rows))} visible />);
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: "instant" });
  // The reader scrolls up; the old jump's settling time passes, and what comes is not followed either (not pinned).
  scrollAt(100);
  scrollTo.mockClear();
  act(() => { vi.advanceTimersByTime(JUMP_SETTLE_MS); });
  expect(scrollTo).not.toHaveBeenCalled();
  box.height = 960;
  rerender(<MessageList conversation={view(again(rows), { pendingPhase: "listening" })} />);
  expect(scrollTo).not.toHaveBeenCalled();
  expect(jump()).toHaveAttribute("data-new");
  // Unmounted mid-jump, its settling does nothing.
  fireEvent.click(screen.getByRole("button", { name: "Go to the end of the conversation" }));
  unmount();
  scrollTo.mockClear();
  act(() => { vi.advanceTimersByTime(JUMP_SETTLE_MS); });
  expect(scrollTo).not.toHaveBeenCalled();
});

/** Lays the transcript out: 300px wide, and each message's text on one line per 40 characters. */
/** Characters per line of the laid-out text; a test lowers it to stand for a larger text scale. */
let perLine = 40;
function layOut() {
  perLine = 40;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(300);
  const own = HTMLElement.prototype.getClientRects;
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    if (!this.classList.contains("chat-text")) return own.call(this);
    // Counted unfolded: the fold is lifted while it counts.
    expect(this.hasAttribute("data-fold")).toBe(false);
    const lines = Math.ceil((this.textContent ?? "").length / perLine);
    return Array.from({ length: lines }, (_, i) => ({ top: i * 22, width: 200, height: 22 })) as unknown as DOMRectList;
  });
}

test("a message past 25 lines folds to 25 with See more, and See less once open; one of 25 lines is whole", () => {
  layOut();
  const ten = "x".repeat(1000), eleven = "y".repeat(1001);
  render(<MessageList conversation={view([message({ segment: "ten", text: ten }), message({ segment: "eleven", text: eleven, time: base + 1_000 })])} />);
  const [first, second] = document.querySelectorAll<HTMLElement>(".chat-text");
  expect(first).not.toHaveAttribute("data-fold");
  expect(second).toHaveAttribute("data-fold", "folded");
  expect(screen.getAllByRole("button", { name: /See (more|less)/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "See more" }));
  expect(second).toHaveAttribute("data-fold", "open");
  expect(screen.getByRole("button", { name: "See less" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "See less" }));
  expect(second).toHaveAttribute("data-fold", "folded");
  // The time sits after the link, at the message's foot.
  expect(second.parentElement!.querySelector(".see-more + .chat-meta")).not.toBeNull();
});

test("a 24-line message shows no See more, a 30-line one does, folded to the one value", () => {
  layOut();
  render(<MessageList conversation={view([message({ segment: "nine", text: "a".repeat(960) }), message({ segment: "thirty", text: "b".repeat(1200), time: base + 1_000 })])} />);
  const [nine, thirty] = document.querySelectorAll<HTMLElement>(".chat-text");
  expect(nine).not.toHaveAttribute("data-fold");
  expect(thirty).toHaveAttribute("data-fold", "folded");
  expect(thirty.style.getPropertyValue("--fold-lines")).toBe(String(FOLD_LINES));
  expect(screen.getAllByRole("button", { name: "See more" })).toHaveLength(1);
});

test("a text scale change (no new text, no new width) counts the lines again: a 24-line message folds at 2x and unfolds when scaled back", () => {
  layOut();
  const observers: Array<() => void> = [];
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { observers.push(callback); } observe() {} disconnect() {} unobserve() {} });
  render(<MessageList conversation={view([message({ segment: "scaled", text: "s".repeat(960) })])} />);
  const text = () => document.querySelector<HTMLElement>(".chat-text")!;
  expect(text()).not.toHaveAttribute("data-fold");
  expect(screen.queryByRole("button", { name: "See more" })).toBeNull();
  // Text twice the size: half the characters to a line, 48 lines. Only the box resized.
  perLine = 20;
  act(() => observers.forEach((callback) => callback()));
  expect(text()).toHaveAttribute("data-fold", "folded");
  expect(screen.getByRole("button", { name: "See more" })).toBeInTheDocument();
  // Scaled back down: 24 lines again, no fold.
  perLine = 40;
  act(() => observers.forEach((callback) => callback()));
  expect(text()).not.toHaveAttribute("data-fold");
  expect(screen.queryByRole("button", { name: "See more" })).toBeNull();
  vi.unstubAllGlobals();
});

test("a long reply is whole while it is said, its words lit as it goes, and folds once it is over", () => {
  layOut();
  const long = "z".repeat(1200);
  const { rerender } = render(<MessageList conversation={view([message({ segment: "now", text: long, playback: "playing", karaoke: { from: 0, to: 120 } })])} />);
  expect(document.querySelector(".chat-text")).not.toHaveAttribute("data-fold");
  expect(screen.queryByRole("button", { name: "See more" })).toBeNull();
  // Said, it has no time yet; over, it has its time and folds.
  expect(document.querySelector(".chat-meta")).toBeNull();
  rerender(<MessageList conversation={view([message({ segment: "now", text: long, playback: "complete", hearing: "heard", heard_chars: 1200 })])} />);
  expect(document.querySelector(".chat-text")).toHaveAttribute("data-fold", "folded");
  expect(document.querySelector(".chat-meta time")).not.toBeNull();
});

test("the live turn moving on redraws only its own run: the runs above keep their nodes, and a face stays put as its run grows", () => {
  const rows = [
    message({ segment: "a", role: "user", name: "", text: "¿Y ahora?" }),
    message({ segment: "b", text: "Ya está.", time: base + 1_000 }),
    message({ segment: "c", role: "user", name: "", text: "¿Y luego?", time: base + 2_000 }),
    message({ segment: "d", text: "Luego, las pruebas de la noche.", time: base + 3_000, playback: "playing", karaoke: { from: 0, to: 5 } }),
  ];
  const { container, rerender } = render(<MessageList conversation={view(rows)} />);
  const runs = () => [...container.querySelectorAll<HTMLElement>(".message-group")];
  const [, earlier, , live] = runs();
  const earlierBubble = earlier.querySelector(".chat-bubble"), liveFace = live.querySelector(".chat-face");
  const changed: MutationRecord[] = [];
  const watch = new MutationObserver((records) => changed.push(...records));
  watch.observe(earlier, { subtree: true, childList: true, attributes: true, characterData: true });
  // The voice moves on: every row a new object, only the said reply's words lit further.
  rerender(<MessageList conversation={view(again(rows).map((row) => row.segment === "d" ? { ...row, karaoke: { from: 0, to: 16 } } : row))} />);
  expect(runs()[1]).toBe(earlier);
  expect(earlier.querySelector(".chat-bubble")).toBe(earlierBubble);
  expect(live.querySelector(".karaoke-played")?.textContent).toBe("Luego, las pruebas");
  // The agent says more in the same run: the run and its face are the same nodes, the face now over the new foot.
  rerender(<MessageList conversation={view([...again(rows).map((row) => row.segment === "d" ? { ...row, karaoke: null, playback: "complete" as const } : row),
    message({ segment: "e", text: "Y la migración.", time: base + 4_000 })])} />);
  expect(runs()[3]).toBe(live);
  expect(live.querySelector(".chat-face")).toBe(liveFace);
  expect(live.querySelectorAll(".chat-message-row")).toHaveLength(2);
  expect(live.querySelector(".chat-message-row:last-of-type .chat-bubble")).toHaveAttribute("data-position", "last");
  watch.disconnect();
  expect(changed).toHaveLength(0);
});

beforeEach(() => { vi.restoreAllMocks(); });

test("what is happening now joins its side's last run when a message said now would, else starts its own", () => {
  const t = translator("en");
  const said = [message({ segment: "u", role: "user", name: "", text: "Perfect.", time: base })];
  const runOf = (blocks: ReturnType<typeof transcriptBlocks>) => blocks.filter((block) => block.kind === "run");
  // A minute later: the open turn is the foot of the person's run.
  const joined = runOf(transcriptBlocks(view(said, { pendingPhase: "listening", pendingCancellable: true }), said, t, "en", base + 60_000));
  expect(joined).toHaveLength(1);
  expect(joined[0].kind === "run" && joined[0].run.live).toEqual([{ kind: "turn", phase: "listening", cancellable: true }]);
  // An hour later: a run of its own.
  expect(runOf(transcriptBlocks(view(said, { pendingPhase: "listening" }), said, t, "en", base + 3_600_000))).toHaveLength(2);
  // Working starts the agent's run after the person's, wearing the face of the agent who last spoke.
  const talk = [message({ segment: "a", text: "Hi", time: base - 1_000 }), ...said];
  const working = runOf(transcriptBlocks(view(talk, { working: true }), talk, t, "en", base + 60_000));
  expect(working.at(-1)?.kind === "run" && working.at(-1)).toMatchObject({ key: "live-assistant", run: { role: "assistant", thread: "fp|one", live: [{ kind: "working" }] } });
  // On a new day, what happens now is headed by it.
  const days = transcriptBlocks(view(said, { pendingPhase: "listening" }), said, t, "en", base + 86_400_000).filter((block) => block.kind === "day");
  expect(days.map((day) => day.kind === "day" && day.label)).toEqual(["Yesterday", "Today"]);
});
