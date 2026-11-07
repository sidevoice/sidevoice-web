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

test("the level maps to the five bars: silence keeps part of the shape, full is the mark's, the middle follows the newest level", () => {
  expect(turnBarScales([0, 0, 0])).toEqual(TURN_BAR_SHAPE.map((share) => Math.round(share * 0.45 * 100) / 100));
  expect(turnBarScales([1, 1, 1])).toEqual(TURN_BAR_SHAPE.map((share) => Math.round(share * 100) / 100));
  // A voice that has just come in: the middle bar is up first, the ones either side of it a step behind, the outer ones two.
  const [a, b, middle, d, e] = turnBarScales([1, 0, 0]);
  expect(middle).toBe(1);
  expect(b).toBeCloseTo(TURN_BAR_SHAPE[1] * 0.45, 2);
  expect(d).toBe(b);
  expect(a).toBeCloseTo(TURN_BAR_SHAPE[0] * 0.45, 2);
  expect(e).toBe(a);
  // Out-of-range levels are held to 0..1; a short history reuses its oldest.
  expect(turnBarScales([5])).toEqual(turnBarScales([1]));
  expect(turnBarScales([-1])).toEqual(turnBarScales([0]));
  // A reading that is not a number (an analyser with no samples yet) is silence, never NaN.
  expect(turnBarScales([Number.NaN, Number.NaN, Number.NaN])).toEqual(turnBarScales([0, 0, 0]));
});

test("while listening the bars follow the level they are given, by transform", async () => {
  let level = 0.9;
  const { container } = render(<TurnPill phase="listening" level={() => level} />);
  await act(() => wait(120));
  const loud = bars(container).map((bar) => bar.style.transform);
  expect(loud[2]).toBe(`scaleY(${turnBarScales([0.9])[2]})`);
  level = 0;
  await act(() => wait(260));
  const quiet = bars(container).map((bar) => bar.style.transform);
  expect(quiet[2]).toBe(`scaleY(${turnBarScales([0])[2]})`);
  expect(quiet).not.toEqual(loud);
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
