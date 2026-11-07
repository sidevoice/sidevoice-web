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
 * Five bars always, in the brand mark's shape (6 : 12 : 21 : 12 : 6 on a 24 grid, SidevoiceMark). While the person speaks they
 * follow the microphone's level; while it is transcribed they blink, a gentle wave across the five (no word: a screen reader is
 * told by the one TurnAnnouncer, and the bars are an image). A device that asks for less motion sees them still, at the shape,
 * dimmer. The bars move only by transform and opacity. */

/** The bars' heights as a share of the tallest: the brand mark's. */
export const TURN_BAR_SHAPE = [6, 12, 21, 12, 6].map((height) => height / 21);
/** How much of its shape a bar keeps in silence; the rest is the level's. */
const REST = 0.45;
const TICK_MS = 50;
/** Below this level the microphone hears silence (as VoiceWaveform's). */
const SILENCE = 0.04;

/** The five bars' vertical scales for the levels read lately (`history[0]` the newest): the middle bar follows the newest
 *  level and the ones either side of it the earlier ones, so a voice ripples out from the middle. At level 0 the bars keep
 *  `REST` of their shape; at level 1 they are the mark's. */
export function turnBarScales(history: readonly number[]): number[] {
  return TURN_BAR_SHAPE.map((shape, bar) => {
    const level = history[Math.min(Math.abs(bar - 2), history.length - 1)] ?? 0;
    const clamped = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    return Math.round(shape * (REST + (1 - REST) * clamped) * 100) / 100;
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
    const history: number[] = [0, 0, 0];
    const drawn: number[] = [];
    let timer = 0;
    const paint = () => turnBarScales(history).forEach((scale, bar) => {
      if (scale === drawn[bar]) return;
      drawn[bar] = scale;
      bars[bar].style.setProperty("transform", `scaleY(${scale})`);
    });
    const tick = () => {
      timer = 0;
      const own = ownLevel.current ?? window.sidevoiceAudio?.level?.bind(window.sidevoiceAudio);
      const samples = own ? null : window.sidevoiceAudio?.readWaveform() ?? null;
      const read = own ? Math.max(0, Math.min(1, own() || 0)) : samples ? waveColumn(samples) : 0;
      history.unshift(read < SILENCE ? 0 : read);
      history.length = 3;
      paint();
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
