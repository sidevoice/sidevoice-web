import { useEffect, useRef, useState } from "react";
import { translator } from "../../i18n/translator";
import "./transcript.css";

/* The bubble of the turn being recorded is the microphone itself: a row of bars that pulls the meter's analyser once
 * per animation frame and sets their heights. React renders this element once per phase, never per frame, and the
 * runtime keeps owning the audio graph. Where there is no call (a voice try), `level` is where the microphone's level
 * comes from instead, 0 to 1, read the same way each frame.
 *
 * The bars are DOM and move only by transform (transcript.css `.voice-wave-bars`): one slot per column, each a fully
 * rounded bar drawn by three composited parts (two round ends and a middle) whose transforms are all that changes. The
 * canvas this replaced was cleared and redrawn every frame while there was sound, and WebKit rasterises a 2D canvas on the
 * CPU, in its GPU process: about 38 % of a core with the person speaking (desktop#149). */

const COLUMN_MS = 55; // one column of history per ~55 ms, so the scroll follows time and not the frame rate
/** Below this level the microphone hears silence: the waveform waits instead of scrolling it in. */
const SILENCE = 0.04;
const CELL = 5; // column pitch in CSS pixels
const BAR = 3;
const FLOOR = 2; // a silent column is still a line, never a gap

/** The person's balloon on the stage draws long rows of fine bars, as a voice note (2026-10-15); the transcript's open
 *  turn wider, rounder bars on its pill (the soft cards, 2026-10-14); a settings try the fine ones its row is sized for. */
export function waveformBrush(node: HTMLElement): { pitch: number; width: number } {
  if (node.closest(".person-turns")) return { pitch: 6, width: 3 };
  return node.closest(".call-layout") ? { pitch: 8, width: 5 } : { pitch: CELL, width: BAR };
}

/** The three transforms that draw a bar `height` tall and `width` wide, `x` px from the right edge (negative: to its left),
 *  as the canvas drew it: a rounded rectangle whose corners never exceed half its height. Two round ends, of the bar's own
 *  width, and a middle, `middle` px long before it is scaled. Taller than wide, the ends sit apart on the vertical and the
 *  middle scales between them; shorter, the bar is a flat pill: the ends shrink to its height and slide apart sideways, and
 *  the middle (a rectangle of the width that is left) fills the gap. Written as inline transforms, not as custom properties
 *  that CSS works out: resolving those cost WebKit about five times the style time per column (desktop#149). */
export function barTransforms(height: number, width: number, middle: number, x: number): [top: string, bottom: string, middle: string] {
  const lift = Math.max(0, height - width) / 2;
  const slide = Math.max(0, width - height) / 2;
  const end = Math.min(1, height / width);
  const tall = height > width;
  const across = tall ? 1 : (width - height) / width;
  const along = (tall ? height - width : height) / middle;
  const n = (value: number) => Math.round(value * 1000) / 1000;
  return [
    `translate(${n(x - slide)}px,${n(-lift)}px) scale(${n(end)})`,
    `translate(${n(x + slide)}px,${n(lift)}px) scale(${n(end)})`,
    `translate(${n(x)}px,0) scale(${n(across)},${n(along)})`,
  ];
}

export type WaveformPhase = "listening" | "transcribing";

const LABELS = {
  listening: { aria: "wave.listening", title: "wave.listeningTitle" },
  transcribing: { aria: "wave.transcribing", title: "wave.transcribingTitle" },
} as const;

/** The same 60 dB window the call meter uses (`measureMic`), so bubble and meter agree on how loud this is. */
export function waveColumn(samples: Float32Array): number {
  if (!samples.length) return 0;
  let squares = 0;
  for (const sample of samples) squares += sample * sample;
  const rms = Math.sqrt(squares / samples.length);
  const db = 20 * Math.log10(Math.max(rms, 1e-6));
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

function motionQuery(): MediaQueryList | null {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => !!motionQuery()?.matches);
  useEffect(() => {
    const query = motionQuery();
    if (!query?.addEventListener) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function VoiceWaveform({ phase, level }: { phase: WaveformPhase; level?: () => number }) {
  const reduced = usePrefersReducedMotion();
  const bars = useRef<HTMLSpanElement>(null);
  const columns = useRef<number[]>([]);
  // Sets the bars to the columns as they stand: made by the bars' effect, called by the tick.
  const paint = useRef<() => void>(() => {});
  // Read at each frame: a new function on a render changes nothing drawn.
  const ownLevel = useRef(level);
  ownLevel.current = level;

  // One slot per column that fits, the newest at the right. A bar is written only when its height changed: a new column
  // shifts the history by one, which touches the bars whose column differs; between columns only the newest moves.
  useEffect(() => {
    const node = bars.current;
    if (!node) return;
    const brush = waveformBrush(node);
    // A slot's parts: its two ends and its middle.
    const slots: HTMLElement[][] = [];
    const drawn: number[] = [];
    let span = FLOOR;
    let middle = 1;
    node.style.setProperty("--w", String(brush.width));

    const size = () => {
      // Its layout size, not its box on screen: a balloon popping in (scaled) must not make the bars smaller for good.
      const box = node.getBoundingClientRect();
      const width = Math.max(1, Math.round(node.clientWidth || box.width || 0));
      const height = Math.max(1, Math.round(node.clientHeight || box.height || 0));
      const capacity = Math.max(1, Math.floor(width / brush.pitch));
      span = Math.max(FLOOR, height - 2);
      // The middle's own length at its tallest (a bar's span less its two round ends): it scales from there.
      const longest = Math.max(1, span - brush.width);
      if (longest !== middle) { middle = longest; node.style.setProperty("--mid", String(middle)); drawn.fill(NaN); }
      while (slots.length > capacity) { slots.pop()!.forEach((part) => part.remove()); drawn.pop(); }
      while (slots.length < capacity) {
        // The ends are <i>, the middle a <u>: never a <b>, which the card's captions colour (call-card.css .caption-line b).
        const parts = [document.createElement("i"), document.createElement("i"), document.createElement("u")];
        node.append(...parts);
        slots.push(parts);
        drawn.push(NaN);
      }
    };

    paint.current = () => {
      const values = columns.current;
      while (values.length > slots.length) values.shift();
      for (let slot = 0; slot < slots.length; slot += 1) {
        const value = values[values.length - 1 - slot] ?? 0;
        // Hundredths of a pixel, finer than any screen shows, so a column that did not change is not written.
        const bar = Math.round(Math.max(FLOOR, value * span) * 100) / 100;
        if (bar === drawn[slot]) continue;
        drawn[slot] = bar;
        // The slot's place is a fixed distance from the right edge, where the bars are anchored (transcript.css).
        const moves = barTransforms(bar, brush.width, middle, -slot * brush.pitch);
        slots[slot].forEach((part, index) => part.style.setProperty("transform", moves[index]));
      }
    };

    const observer = new ResizeObserver(() => { size(); paint.current(); });
    observer.observe(node);
    size();
    paint.current();
    return () => { observer.disconnect(); paint.current = () => {}; node.replaceChildren(); };
  }, [reduced]);

  useEffect(() => {
    const node = bars.current;
    // Transcribing keeps the last frame: nothing is read, nothing is scheduled, the pulse is CSS.
    if (!node || reduced || phase !== "listening") return;
    let frame = 0;
    let lastColumn = 0;

    const tick = () => {
      // The level now, as the meter measures it (0 to 1): the call's, or the try's own. Only a host without it falls back to
      // the analyser's history, which, averaged, barely moves.
      const own = ownLevel.current ?? window.sidevoiceAudio?.level?.bind(window.sidevoiceAudio);
      const samples = own ? null : window.sidevoiceAudio?.readWaveform() ?? null;
      const value = own ? Math.max(0, Math.min(1, own() || 0)) : samples ? waveColumn(samples) : 0;
      const values = columns.current;
      const now = performance.now();
      // Silence adds no column: what was said holds its shape through the pauses and the wait for the end of turn, so
      // the turn closes on the voice's own shape, frozen there while it is transcribed (operator, 2026-10-15).
      if (value < SILENCE && values.length) { lastColumn = now; frame = requestAnimationFrame(tick); return; }
      if (!values.length || now - lastColumn >= COLUMN_MS) { values.push(value); lastColumn = now; }
      // Between columns the newest one keeps the loudest instant it covers, so a peak is never skipped.
      else values[values.length - 1] = Math.max(values[values.length - 1], value);
      paint.current();
      frame = requestAnimationFrame(tick);
    };
    // Only while it can be seen: a waveform mounted out of sight (a Settings or setup page not shown, a hidden tab) reads
    // and schedules nothing. A loop of frames that never stops keeps the page rendering every frame (desktop#149).
    let shown = typeof IntersectionObserver === "undefined";
    const start = () => { if (!frame && shown && !document.hidden) { lastColumn = performance.now(); frame = requestAnimationFrame(tick); } };
    const stop = () => { if (frame) { cancelAnimationFrame(frame); frame = 0; } };
    const visibility = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener("visibilitychange", visibility);
    const sight = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      shown = entries[entries.length - 1].isIntersecting;
      if (shown) start(); else stop();
    });
    sight?.observe(node);
    start();
    return () => { stop(); sight?.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, [phase, reduced]);

  const t = translator();
  const label = { aria: t(LABELS[phase].aria), title: t(LABELS[phase].title) };
  if (reduced) return <span className="voice-bars" data-phase={phase} role="status" aria-label={label.aria} title={label.title}><i /><i /><i /><i /><i /></span>;
  return <span className="voice-wave" data-phase={phase} role="status" aria-label={label.aria} title={label.title}><span ref={bars} className="voice-wave-bars" aria-hidden="true" /></span>;
}
