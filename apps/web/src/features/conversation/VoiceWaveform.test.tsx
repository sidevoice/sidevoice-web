import { act, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { barTransforms, VoiceWaveform, waveColumn, waveformBrush } from "./VoiceWaveform";

const frames = (count = 3) => new Promise((resolve) => setTimeout(resolve, 20 * count));

function microphone(amplitude: number) {
  const samples = new Float32Array(256).map((_, index) => amplitude * Math.sin(index / 4));
  const readWaveform = vi.fn(() => samples);
  window.sidevoiceAudio = { readWaveform };
  return readWaveform;
}

function reducedMotion(matches: boolean) {
  window.matchMedia = ((media: string) => ({ media, matches, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
}

afterEach(() => {
  delete window.sidevoiceAudio;
  reducedMotion(false);
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

test("a louder microphone raises the column and silence keeps it at the floor", () => {
  expect(waveColumn(new Float32Array(64))).toBe(0);
  const quiet = waveColumn(new Float32Array(64).fill(0.002));
  const loud = waveColumn(new Float32Array(64).fill(0.4));
  expect(quiet).toBeLessThan(loud);
  expect(loud).toBeLessThanOrEqual(1);
  expect(waveColumn(new Float32Array(64).fill(1))).toBe(1);
});

test("while listening the bubble pulls the meter's analyser every frame", async () => {
  const readWaveform = microphone(0.3);
  const { container } = render(<VoiceWaveform phase="listening" />);
  expect(container.querySelector(".voice-wave")?.getAttribute("data-phase")).toBe("listening");
  expect(container.querySelector(".voice-wave > .voice-wave-bars")).toBeInTheDocument();
  await frames();
  expect(readWaveform.mock.calls.length).toBeGreaterThan(0);
});

test("transcribing freezes the last frame: nothing is read while the turn is being written", async () => {
  const readWaveform = microphone(0.3);
  const { container, rerender } = render(<VoiceWaveform phase="listening" />);
  await frames();
  const reads = readWaveform.mock.calls.length;
  expect(reads).toBeGreaterThan(0);
  rerender(<VoiceWaveform phase="transcribing" />);
  await frames();
  expect(readWaveform.mock.calls.length).toBe(reads);
  expect(container.querySelector(".voice-wave")?.getAttribute("data-phase")).toBe("transcribing");
});

test("a hidden page stops the animation and a visible one resumes it", async () => {
  const readWaveform = microphone(0.3);
  render(<VoiceWaveform phase="listening" />);
  await frames();
  expect(readWaveform.mock.calls.length).toBeGreaterThan(0);
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  document.dispatchEvent(new Event("visibilitychange"));
  await frames();
  const paused = readWaveform.mock.calls.length;
  await frames();
  expect(readWaveform.mock.calls.length).toBe(paused);
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  document.dispatchEvent(new Event("visibilitychange"));
  await frames();
  expect(readWaveform.mock.calls.length).toBeGreaterThan(paused);
});

test("out of sight it reads and schedules nothing; in sight it moves again (desktop#149)", async () => {
  const readWaveform = microphone(0.3);
  let report: (entries: { isIntersecting: boolean }[]) => void = () => {};
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: typeof report) { report = callback; } observe() {} disconnect() {} });
  try {
    render(<VoiceWaveform phase="listening" />);
    // Mounted where nothing shows it (a page of Settings not open): not a frame until it is seen.
    await frames();
    expect(readWaveform).not.toHaveBeenCalled();
    report([{ isIntersecting: true }]);
    await frames();
    const seen = readWaveform.mock.calls.length;
    expect(seen).toBeGreaterThan(0);
    report([{ isIntersecting: false }]);
    await frames();
    const gone = readWaveform.mock.calls.length;
    await frames();
    expect(readWaveform.mock.calls.length).toBe(gone);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("a device that asks for less motion gets the still bars and no moving ones", async () => {
  const readWaveform = microphone(0.3);
  reducedMotion(true);
  const { container } = render(<VoiceWaveform phase="listening" />);
  expect(container.querySelector(".voice-wave-bars")).toBeNull();
  expect(container.querySelector(".voice-bars")?.getAttribute("data-phase")).toBe("listening");
  await frames();
  expect(readWaveform).not.toHaveBeenCalled();
});

test("a level of its own (a voice try, with no call) is read each frame instead of the call's analyser", async () => {
  const readWaveform = microphone(0.3);
  const level = vi.fn(() => 0.6);
  render(<VoiceWaveform phase="listening" level={level} />);
  await frames();
  expect(level.mock.calls.length).toBeGreaterThan(0);
  expect(readWaveform).not.toHaveBeenCalled();
});

test("a call with no microphone captured draws without reading anything", async () => {
  const { container } = render(<VoiceWaveform phase="listening" />);
  await frames();
  expect(container.querySelector(".voice-wave > .voice-wave-bars")).toBeInTheDocument();
});

test("a call bubble draws the soft cards' wider bars; a settings try keeps its fine ones", () => {
  const room = document.createElement("main");
  room.className = "call-layout";
  const wave = document.createElement("span");
  room.append(wave);
  document.body.append(room);
  expect(waveformBrush(wave)).toEqual({ pitch: 8, width: 5 });
  expect(waveformBrush(document.createElement("span"))).toEqual({ pitch: 5, width: 3 });
  // The person's balloon on the stage: long rows of fine bars, as a voice note.
  const turns = document.createElement("div");
  turns.className = "person-turns";
  const own = document.createElement("span");
  turns.append(own);
  room.append(turns);
  expect(waveformBrush(own)).toEqual({ pitch: 6, width: 3 });
  room.remove();
});

test("a bar is a fully rounded rectangle whatever its height: two round ends and a middle, as the canvas drew it", () => {
  // 3 px wide, a middle 17 px long at its tallest. Taller than wide: whole circles apart on the vertical, the middle between them.
  expect(barTransforms(20, 3, 17, 0)).toEqual(["translate(0px,-8.5px) scale(1)", "translate(0px,8.5px) scale(1)", "translate(0px,0) scale(1,1)"]);
  expect(barTransforms(10, 3, 17, -12)).toEqual(["translate(-12px,-3.5px) scale(1)", "translate(-12px,3.5px) scale(1)", "translate(-12px,0) scale(1,0.412)"]);
  // As tall as wide: one circle, nothing in the middle.
  expect(barTransforms(3, 3, 17, 0)).toEqual(["translate(0px,0px) scale(1)", "translate(0px,0px) scale(1)", "translate(0px,0) scale(0,0.176)"]);
  // The floor, flatter than wide: a pill as wide as the bar, its ends as tall as it is, slid apart sideways, the middle in the gap.
  expect(barTransforms(2, 3, 17, 0)).toEqual(["translate(-0.5px,0px) scale(0.667)", "translate(0.5px,0px) scale(0.667)", "translate(0px,0) scale(0.333,0.118)"]);
  // Not wider than it is tall by a hair: the pill, not a circle.
  expect(barTransforms(2.5, 5, 15, -8)[2]).toBe("translate(-8px,0) scale(0.5,0.167)");
});

/* The bars, one frame at a time: a layout of 30 x 22 CSS pixels (six slots of a 5 px pitch, a span of 20 px and a middle of 17),
 * the frames and the clock in the test's hands, and a count of the transforms written. */
function bars(size = { width: 30, height: 22 }) {
  let now = 0;
  let queue: FrameRequestCallback[] = [];
  let resize: () => void = () => {};
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { queue.push(callback); return queue.length; });
  vi.stubGlobal("cancelAnimationFrame", () => { queue = []; });
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
  vi.spyOn(performance, "now").mockImplementation(() => now);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => size.width });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => size.height });
  const writes = { transform: 0 };
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  vi.spyOn(CSSStyleDeclaration.prototype, "setProperty").mockImplementation(function (this: CSSStyleDeclaration, name: string, value: string | null, priority?: string) {
    if (name === "transform") writes.transform += 1;
    return setProperty.call(this, name, value, priority ?? "");
  });
  return {
    size,
    writes,
    /** Advance the clock and run the frame that was waiting. */
    frame: (ms = 16) => act(() => { now += ms; const run = queue; queue = []; run.forEach((callback) => callback(now)); }),
    resize: () => act(() => resize()),
    /** What is drawn, slot by slot, newest first: each slot's three transforms. */
    drawn: (container: HTMLElement) => {
      const parts = [...container.querySelectorAll<HTMLElement>(".voice-wave-bars > *")].map((part) => part.style.transform);
      return Array.from({ length: parts.length / 3 }, (_, slot) => parts.slice(slot * 3, slot * 3 + 3));
    },
  };
}
/** What the slots show when they draw these heights (newest first, 3 px wide, a 5 px pitch, a middle of `middle`). */
const showing = (heights: number[], middle = 17) => heights.map((height, slot) => barTransforms(height, 3, middle, -slot * 5));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
});

test("one slot per column that fits, each of two ends and a middle, drawn at the floor until a voice fills it", () => {
  const view = bars();
  const { container } = render(<VoiceWaveform phase="listening" level={() => 0} />);
  const wave = container.querySelector<HTMLElement>(".voice-wave-bars")!;
  // The brush the layout calls for (a plain page: fine bars, a 5 px pitch) and the middle's length at its tallest: the span (20) less the ends (3).
  expect(wave.style.getPropertyValue("--w")).toBe("3");
  expect(wave.style.getPropertyValue("--mid")).toBe("17");
  expect([...wave.children].map((part) => part.localName).join("")).toBe("iiu".repeat(6));
  expect(view.drawn(container)).toEqual(showing([2, 2, 2, 2, 2, 2]));
});

test("the newest column is the rightmost bar and the history scrolls left, a column per 55 ms", async () => {
  const view = bars();
  let voice = 0.5;
  const { container } = render(<VoiceWaveform phase="listening" level={() => voice} />);
  await view.frame();
  expect(view.drawn(container)).toEqual(showing([10, 2, 2, 2, 2, 2]));
  // Inside the column the newest keeps the loudest instant it covers.
  voice = 0.25;
  await view.frame();
  expect(view.drawn(container)).toEqual(showing([10, 2, 2, 2, 2, 2]));
  voice = 1;
  await view.frame(60);
  expect(view.drawn(container)).toEqual(showing([20, 10, 2, 2, 2, 2]));
  // More columns than slots: the oldest goes.
  for (let column = 0; column < 7; column += 1) await view.frame(60);
  expect(view.drawn(container)).toEqual(showing([20, 20, 20, 20, 20, 20]));
});

test("a bar is written only when its height changed: a new column touches the bars it shifts, between columns only the newest", async () => {
  const view = bars();
  let voice = 1;
  const { container } = render(<VoiceWaveform phase="listening" level={() => voice} />);
  await view.frame();
  view.writes.transform = 0;
  await view.frame(); // same column, same loudest instant
  expect(view.writes.transform).toBe(0);
  voice = 0.5;
  await view.frame(60); // the history shifts: [10, 20, 2, ...]; the third slot was at the floor already, as were the rest
  expect(view.drawn(container)).toEqual(showing([10, 20, 2, 2, 2, 2]));
  expect(view.writes.transform).toBe(2 * 3);
});

test("silence adds no column: what was said holds its shape through the pause", async () => {
  const view = bars();
  let voice = 0.5;
  const { container } = render(<VoiceWaveform phase="listening" level={() => voice} />);
  await view.frame();
  voice = 0.8;
  await view.frame(60);
  const said = view.drawn(container);
  expect(said).toEqual(showing([16, 10, 2, 2, 2, 2]));
  voice = 0;
  view.writes.transform = 0;
  await view.frame(200);
  await view.frame(200);
  expect(view.drawn(container)).toEqual(said);
  expect(view.writes.transform).toBe(0);
});

test("a resize grows or trims the slots and keeps the newest columns", async () => {
  const view = bars();
  const { container } = render(<VoiceWaveform phase="listening" level={() => 1} />);
  await view.frame();
  await view.frame(60);
  expect(view.drawn(container)).toEqual(showing([20, 20, 2, 2, 2, 2]));
  view.size.width = 50;
  view.size.height = 12; // a span of 10, a middle of 7
  await view.resize();
  expect(container.querySelector<HTMLElement>(".voice-wave-bars")!.style.getPropertyValue("--mid")).toBe("7");
  expect(view.drawn(container)).toEqual(showing([10, 10, 2, 2, 2, 2, 2, 2, 2, 2], 7));
  view.size.width = 10;
  await view.resize();
  expect(view.drawn(container)).toEqual(showing([10, 10], 7));
});

test("transcribing keeps the bars as they were, and the phase change does not rebuild them", async () => {
  const view = bars();
  const { container, rerender } = render(<VoiceWaveform phase="listening" level={() => 0.5} />);
  await view.frame();
  const parts = [...container.querySelectorAll(".voice-wave-bars > *")];
  rerender(<VoiceWaveform phase="transcribing" level={() => 1} />);
  expect([...container.querySelectorAll(".voice-wave-bars > *")]).toEqual(parts);
  await view.frame(100);
  expect(view.drawn(container)).toEqual(showing([10, 2, 2, 2, 2, 2]));
});
