import { useEffect, useRef, type ComponentPropsWithRef, type CSSProperties, type ReactNode } from "react";
import { Pill } from "../../components/ui/Pill";
import { TurnMicIcon } from "../../components/ui/Icons";
import { translator } from "../../i18n/translator";
import { usePrefersReducedMotion, waveColumn } from "./VoiceWaveform";
import "./turn-pill.css";

/* The person's open turn as a pill, one component wherever it shows: under the creature on the stage (PersonTurn), in the
 * transcript (LiveRows) and on the floating card's avatar and pip formats (the stage's pill again). A change here is a change
 * everywhere.
 *
 * Five bars always, in the brand mark's shape at rest (6 : 12 : 21 : 12 : 6 on a 24 grid, SidevoiceMark). While the person speaks they
 * follow the microphone, each bar its own reading, scrolling right to left as the old waveform did; while it is transcribed they blink, a gentle wave across the five (no word: a screen reader is
 * told by the one TurnAnnouncer, and the bars are an image). A device that asks for less motion sees them still, at the shape,
 * dimmer. The bars move only by transform and opacity. */

/** The bars' heights as a share of the tallest: the brand mark's. */
export const TURN_BAR_SHAPE = [6, 12, 21, 12, 6].map((height) => height / 21);
/** How much of its shape a bar keeps where there is no reading to show (before the voice, and through silence): near the mark's. */
const REST = 0.45;
/** The least a bar shows for a reading: the same for every bar, so the pill never collapses and quiet speech is not the mark. */
const READING_FLOOR = 0.15;
/** One column of history per tick, as the waveform it replaced did (~55 ms): the bars scroll with time, newest at the right. */
const TICK_MS = 55;
/** Below this level the microphone hears silence (as VoiceWaveform's). */
const SILENCE = 0.04;

/** The five bars' vertical scales for the readings so far (`columns`, oldest first), as the waveform this pill had before drew them:
 *  each bar is its own reading, the newest at the right, the others the ones before it, so a voice scrolls through the five.
 *  A bar with no reading yet rests at `REST` of its place in the mark's shape; a reading is the bar's height, 0 to 1. */
export function turnBarScales(columns: readonly number[]): number[] {
  const shown = columns.slice(-TURN_BAR_SHAPE.length);
  const first = TURN_BAR_SHAPE.length - shown.length;
  return TURN_BAR_SHAPE.map((shape, bar) => {
    const reading = shown[bar - first];
    // No reading yet (or not a number): the bar rests near its place in the mark's shape. A reading drives its bar from one small
    // floor, the same for all, never from the bar's shape: quiet speech must not draw the mark again.
    if (reading === undefined || !Number.isFinite(reading)) return Math.round(shape * REST * 100) / 100;
    return Math.round(Math.max(READING_FLOOR, Math.min(1, reading)) * 100) / 100;
  });
}

type Phase = "listening" | "transcribing";

/** The five bars. `live`: whether they read the microphone (only while listening, in sight, with motion allowed). */
function TurnBars({ phase, level, live }: { phase: Phase; level?: () => number; live: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  const ownLevel = useRef(level);
  ownLevel.current = level;
  const reduced = usePrefersReducedMotion();
  const t = translator();

  useEffect(() => {
    const node = root.current;
    if (!node || !live || reduced || phase !== "listening") return;
    const bars = [...node.children] as HTMLElement[];
    const columns: number[] = [];
    const drawn: number[] = [];
    let timer = 0;
    const paint = () => turnBarScales(columns).forEach((scale, bar) => {
      if (scale === drawn[bar]) return;
      drawn[bar] = scale;
      bars[bar].style.setProperty("transform", `scaleY(${scale})`);
    });
    const tick = () => {
      timer = 0;
      const own = ownLevel.current ?? window.sidevoiceAudio?.level?.bind(window.sidevoiceAudio);
      const samples = own ? null : window.sidevoiceAudio?.readWaveform() ?? null;
      const read = own ? Math.max(0, Math.min(1, own() || 0)) : samples ? waveColumn(samples) : 0;
      // Silence adds no column: what was said holds its shape through the pauses (as the waveform's did).
      if (read >= SILENCE) { columns.push(read); if (columns.length > TURN_BAR_SHAPE.length) columns.shift(); paint(); }
      timer = window.setTimeout(tick, TICK_MS);
    };
    // Only while it can be seen: a pill mounted out of sight (a hidden tab) reads and schedules nothing (desktop#149).
    let shown = typeof IntersectionObserver === "undefined";
    const start = () => { if (!timer && shown && !document.hidden) tick(); };
    const stop = () => { if (timer) { clearTimeout(timer); timer = 0; } };
    const visibility = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener("visibilitychange", visibility);
    const sight = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      shown = entries[entries.length - 1].isIntersecting;
      if (shown) start(); else stop();
    });
    sight?.observe(node);
    start();
    return () => {
      stop(); sight?.disconnect(); document.removeEventListener("visibilitychange", visibility);
      // What the loop wrote must not outlive it: the blink (CSS) and the still shape start from the mark's own.
      bars.forEach((bar) => bar.style.removeProperty("transform"));
    };
  }, [phase, live, reduced]);

  return (
    <span ref={root} className="turn-bars" data-phase={phase} data-still={reduced || undefined} role="img" aria-label={t(phase === "transcribing" ? "wave.transcribing" : "wave.listening")}>
      {TURN_BAR_SHAPE.map((shape, bar) => <i key={bar} style={{ "--s": shape, "--k": bar } as CSSProperties} />)}
    </span>
  );
}

export type TurnPillProps = Omit<ComponentPropsWithRef<"div">, "children"> & {
  phase: Phase;
  /** A type step (Pill): the stage's, or the transcript's. */
  size?: "inline" | "stage";
  /** The microphone's level now, 0 to 1 (a voice try, say); by default the call's own. */
  level?: () => number;
  /** Unmoving bars (a copy that is only measured). */
  frozen?: boolean;
  /** The × that takes the turn back, if it can be (each place draws its own: one IconButton is a later step). */
  action?: ReactNode;
  /** Things that draw nothing (the stage's announcer). */
  children?: ReactNode;
};

/** The microphone and the five bars while they speak, the five bars alone, blinking, while it is transcribed. */
export function TurnPill({ phase, size, level, frozen = false, action, children, className, ...rest }: TurnPillProps) {
  return (
    <Pill {...rest} size={size} className={className ? `turn-pill ${className}` : "turn-pill"} data-phase={phase} translate="no" action={action}
      lead={<>{phase === "listening" && <TurnMicIcon className="turn-mic" />}<TurnBars phase={phase} level={level} live={!frozen} /></>}>
      {children}
    </Pill>
  );
}
