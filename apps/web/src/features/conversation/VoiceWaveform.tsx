import { useEffect, useRef, useState } from "react";
import { translator } from "../../i18n/translator";
import "./transcript.css";

/* The bubble of the turn being recorded is the microphone itself: a canvas that pulls the meter's analyser
 * once per animation frame and paints its own pixels. React renders this element once per phase, never per
 * frame, and the runtime keeps owning the audio graph. Where there is no call (a voice try), `level` is where the
 * microphone's level comes from instead, 0 to 1, read the same way each frame. */

const COLUMN_MS = 55; // one column of history per ~55 ms, so the scroll follows time and not the frame rate
const CELL = 5; // column pitch in CSS pixels
const BAR = 3;
const FLOOR = 2; // a silent column is still a line, never a gap

/** Only call bubbles change their brush; settings tries retain the shipped waveform. */
export function waveformBrush(node: HTMLElement): { pitch: number; width: number; shape: "round" | "block" | "segments" } {
  const style = node.closest<HTMLElement>(".call-layout")?.dataset.bubblesStyle;
  if (style === "soft") return { pitch: 8, width: 5, shape: "round" };
  if (style === "illustrated") return { pitch: 9, width: 6, shape: "block" };
  if (style === "panel") return { pitch: 8, width: 2, shape: "segments" };
  return { pitch: CELL, width: BAR, shape: "round" };
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
  const canvas = useRef<HTMLCanvasElement>(null);
  const columns = useRef<number[]>([]);
  // Read at each frame: a new function on a render changes nothing drawn.
  const ownLevel = useRef(level);
  ownLevel.current = level;

  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext?.("2d");
    if (!node || !context) return;
    let frame = 0;
    let lastColumn = 0;
    let width = 1;
    let height = 1;
    let ink = "currentColor";
    let brush = waveformBrush(node);

    const size = () => {
      const ratio = window.devicePixelRatio || 1;
      const box = node.getBoundingClientRect();
      width = Math.max(1, Math.round(box.width || node.clientWidth || 0));
      height = Math.max(1, Math.round(box.height || node.clientHeight || 0));
      node.width = Math.round(width * ratio);
      node.height = Math.round(height * ratio);
      context.setTransform?.(ratio, 0, 0, ratio, 0, 0);
      ink = window.getComputedStyle?.(node).color || ink;
    };

    // Newest column at the right: the turn scrolls away to the left as a recorder does.
    const paint = () => {
      const capacity = Math.max(1, Math.floor(width / brush.pitch));
      const values = columns.current;
      while (values.length > Math.max(1, Math.floor(width / CELL))) values.shift();
      const middle = height / 2;
      const span = Math.max(FLOOR, height - 2);
      context.clearRect(0, 0, width, height);
      context.fillStyle = ink;
      context.beginPath();
      for (let slot = 0; slot < capacity; slot += 1) {
        const value = values[values.length - 1 - slot] ?? 0;
        const bar = Math.max(FLOOR, value * span);
        const x = width - brush.width - slot * brush.pitch;
        const y = middle - bar / 2;
        if (brush.shape === "segments") {
          for (let segment = y; segment < y + bar; segment += 5) context.rect(x, segment, brush.width, Math.min(3, y + bar - segment));
        } else if (context.roundRect) context.roundRect(x, y, brush.width, bar, brush.shape === "block" ? 1.5 : brush.width / 2);
        else context.rect(x, y, brush.width, bar);
      }
      context.fill();
    };

    const observer = new ResizeObserver(() => { size(); paint(); });
    observer.observe(node);
    // A live variant or theme switch repaints the existing samples, even when transcribing is frozen.
    const refresh = () => { brush = waveformBrush(node); ink = window.getComputedStyle?.(node).color || ink; paint(); };
    const mutation = new MutationObserver(refresh);
    const room = node.closest(".call-layout");
    if (room) mutation.observe(room, { attributes: true, attributeFilter: ["data-bubbles-style"] });
    mutation.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    size();
    paint();

    // Transcribing keeps the last frame: nothing is read, nothing is scheduled, the pulse is CSS.
    if (reduced || phase !== "listening") return () => { observer.disconnect(); mutation.disconnect(); };

    const tick = () => {
      const own = ownLevel.current;
      const samples = own ? null : window.sidevoiceAudio?.readWaveform() ?? null;
      const value = own ? Math.max(0, Math.min(1, own() || 0)) : samples ? waveColumn(samples) : 0;
      const values = columns.current;
      const now = performance.now();
      if (!values.length || now - lastColumn >= COLUMN_MS) { values.push(value); lastColumn = now; }
      // Between columns the newest one keeps the loudest instant it covers, so a peak is never skipped.
      else values[values.length - 1] = Math.max(values[values.length - 1], value);
      paint();
      frame = requestAnimationFrame(tick);
    };
    const start = () => { if (!frame && !document.hidden) { lastColumn = performance.now(); frame = requestAnimationFrame(tick); } };
    const stop = () => { if (frame) { cancelAnimationFrame(frame); frame = 0; } };
    const visibility = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener("visibilitychange", visibility);
    start();
    return () => { stop(); observer.disconnect(); mutation.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, [phase, reduced]);

  const t = translator();
  const label = { aria: t(LABELS[phase].aria), title: t(LABELS[phase].title) };
  if (reduced) return <span className="voice-bars" data-phase={phase} role="status" aria-label={label.aria} title={label.title}><i /><i /><i /><i /><i /></span>;
  return <span className="voice-wave" data-phase={phase} role="status" aria-label={label.aria} title={label.title}><canvas ref={canvas} aria-hidden="true" /></span>;
}
