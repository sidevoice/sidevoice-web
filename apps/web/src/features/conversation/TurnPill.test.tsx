import { readFileSync } from "node:fs";
import path from "node:path";
import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TURN_BAR_SHAPE, TurnPill, turnBarScales } from "./TurnPill";

const stylesheet = () => readFileSync(path.join(import.meta.dirname, "turn-pill.css"), "utf8");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function reducedMotion(matches: boolean) {
  window.matchMedia = ((media: string) => ({ media, matches, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
}

afterEach(() => {
  delete window.sidevoiceAudio;
  reducedMotion(false);
});

const bars = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(".turn-bars > i")];

test("five bars, in the brand mark's shape, whichever the phase", () => {
  expect(TURN_BAR_SHAPE.map((share) => Math.round(share * 21))).toEqual([6, 12, 21, 12, 6]);
  for (const phase of ["listening", "transcribing"] as const) {
    const { container, unmount } = render(<TurnPill phase={phase} frozen />);
    expect(bars(container)).toHaveLength(5);
    expect(bars(container).map((bar) => Number(bar.style.getPropertyValue("--s")))).toEqual(TURN_BAR_SHAPE);
    unmount();
  }
});

test("the microphone shows while they speak and goes while it is transcribed; the bars stay and are an image", () => {
  const { container, rerender } = render(<TurnPill phase="listening" frozen />);
  expect(container.querySelector(".ui-pill-lead > svg.turn-mic")).not.toBeNull();
  expect(screen.getByRole("img", { name: "Listening" })).toBe(container.querySelector(".turn-bars"));
  rerender(<TurnPill phase="transcribing" frozen />);
  expect(container.querySelector("svg")).toBeNull();
  expect(screen.getByRole("img", { name: "Transcribing what you said" })).toBe(container.querySelector(".turn-bars"));
  // No word, no live region of its own: the one announcer is the caller's.
  expect(container).not.toHaveTextContent(/\S/);
  expect(container.querySelector("[role=status]")).toBeNull();
});

test("each bar is its own reading, the newest at the right: the bars are not one shape scaled by one level", () => {
  const rest = TURN_BAR_SHAPE.map((share) => Math.round(share * 0.45 * 100) / 100);
  expect(turnBarScales([])).toEqual(rest);
  // One reading: only the right bar has it; the others rest.
  expect(turnBarScales([0.8])).toEqual([...rest.slice(0, 4), 0.8]);
  // Five readings: each bar its own, in order, whatever the mark's shape.
  expect(turnBarScales([0.9, 0.4, 0.7, 0.5, 0.6])).toEqual([0.9, 0.4, 0.7, 0.5, 0.6]);
  // Scrolling: a new reading enters at the right and the oldest goes.
  expect(turnBarScales([0.9, 0.4, 0.7, 0.5, 0.6, 0.8])).toEqual([0.4, 0.7, 0.5, 0.6, 0.8]);
  // The ratio between two bars changes with the readings (it is not the mark's 12:21 every time).
  const ratio = (columns: number[]) => { const scales = turnBarScales(columns); return scales[1] / scales[2]; };
  expect(new Set([ratio([0.5, 0.5, 0.5, 0.5, 0.5]), ratio([0.4, 0.9, 0.5, 0.5, 0.6]), ratio([0.8, 0.5, 0.9, 0.1, 0.4])]).size).toBe(3);
  // Out-of-range readings are held to 0..1; one that is not a number is silence, never NaN.
  expect(turnBarScales([5, -1, Number.NaN, 0.5, 1])).toEqual([1, rest[1], rest[2], 0.5, 1]);
});

test("while listening the bars follow the level they are given, by transform", async () => {
  // One reading per tick, from a sequence: each lands in the right bar and scrolls left as the next comes.
  const readings = [0.9, 0.5, 0.7, 0.6, 0.8, 0.4];
  let at = 0, level = 0.4;
  const { container } = render(<TurnPill phase="listening" level={() => { level = readings[at] ?? 0; at += 1; return level; }} />);
  await act(() => wait(500));
  const moved = bars(container).map((bar) => bar.style.transform);
  expect(moved).toEqual(["0.5", "0.7", "0.6", "0.8", "0.4"].map((value) => `scaleY(${value})`));
  // Each bar its own reading, not the mark's shape scaled.
  expect(new Set(moved).size).toBe(5);
  // Silence adds no column: the shape holds.
  level = 0;
  await act(() => wait(200));
  expect(bars(container).map((bar) => bar.style.transform)).toEqual(moved);
});

test("while listening with no level given, it reads the call's microphone", async () => {
  const level = vi.fn(() => 0.5);
  window.sidevoiceAudio = { level } as unknown as typeof window.sidevoiceAudio;
  render(<TurnPill phase="listening" />);
  await act(() => wait(120));
  expect(level).toHaveBeenCalled();
});

test("transcribing blinks: nothing reads the microphone, the bars are marked for the blink, and what listening wrote is gone", async () => {
  const level = vi.fn(() => 0.8);
  const { container, rerender } = render(<TurnPill phase="listening" level={level} />);
  await act(() => wait(120));
  expect(bars(container)[2].style.transform).not.toBe("");
  const calls = level.mock.calls.length;
  rerender(<TurnPill phase="transcribing" level={level} />);
  await act(() => wait(150));
  expect(level.mock.calls.length).toBe(calls);
  expect(container.querySelector(".turn-bars")).toHaveAttribute("data-phase", "transcribing");
  // The blink is the stylesheet's (turn-pill.css, @keyframes turn-bar-blink); an inline transform would be under it.
  for (const bar of bars(container)) expect(bar.style.transform).toBe("");
  // Each bar carries its place in the wave.
  expect(bars(container).map((bar) => bar.style.getPropertyValue("--k"))).toEqual(["0", "1", "2", "3", "4"]);
});

test("the blink is declared in the stylesheet: transform and opacity only, never still", async () => {
  const css = stylesheet();
  const blink = css.match(/@keyframes turn-bar-blink\s*{([\s\S]*?)\n}/)?.[1] ?? "";
  const properties = new Set([...blink.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]));
  expect([...properties].sort()).toEqual(["opacity", "transform"]);
  // Down to a third of the height or less, and well dimmer: visible, not the old 1 -> .8.
  expect(blink).toMatch(/scaleY\(calc\(var\(--s\) \* \.3\)\)/);
  expect(blink).toMatch(/opacity: \.4/);
  expect(css).toMatch(/\.turn-bars\[data-phase="transcribing"\] i \{ animation: turn-bar-blink/);
});

test("reduced motion: still bars at the shape, dimmer, and nothing is read", async () => {
  reducedMotion(true);
  const level = vi.fn(() => 0.8);
  const { container } = render(<TurnPill phase="listening" level={level} />);
  await act(() => wait(150));
  expect(level).not.toHaveBeenCalled();
  expect(container.querySelector(".turn-bars")).toHaveAttribute("data-still");
  expect(bars(container).map((bar) => Number(bar.style.getPropertyValue("--s")))).toEqual(TURN_BAR_SHAPE);
  for (const bar of bars(container)) expect(bar.style.transform).toBe("");
  const css = stylesheet();
  expect(css).toMatch(/\.turn-bars\[data-still\] i \{ animation: none; transform: scaleY\(var\(--s\)\); opacity: \.55; \}/);
});

test("the × and the announcer are the caller's, in the pill; a copy that is only measured does not run", async () => {
  const level = vi.fn(() => 0.8);
  const { container } = render(<TurnPill phase="listening" level={level} frozen size="stage" action={<button type="button" className="cancel">x</button>}><span data-turn-announcer /></TurnPill>);
  await act(() => wait(120));
  expect(level).not.toHaveBeenCalled();
  expect(container.querySelector(".ui-pill")).toHaveAttribute("data-size", "stage");
  expect(container.querySelector(".ui-pill")).toHaveAttribute("data-action");
  expect(container.querySelector("button.cancel")).not.toBeNull();
  expect(container.querySelector("[data-turn-announcer]")).not.toBeNull();
});
