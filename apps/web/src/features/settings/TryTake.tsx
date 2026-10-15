import { Fragment, memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "../../components/ui/Button";
import { PauseRecordingIcon, PlayRecordingIcon } from "../../components/ui/Icons";
import { takeMs, type VoiceTake } from "../../services/voice-take";
import { createTakePlayer, takeColumns } from "./take-audio";
import { seconds } from "./try-time";
import type { Translate } from "../../i18n/translator";
import "./try-take.css";

/* A try's take, once the try is over (transcription's in its try block, the end of turn's in its own card): the whole
 * of it as a waveform, from the moment the voice listened to the moment it stopped — the end of turn's with where
 * speech started, the pauses within a turn and where the voice ended it; transcription's with its start and its stop
 * only, as it ends no turn (`turns`, decided 2026-10-15) — Play, and a click, a drag or the arrow keys to move in it. It
 * plays from memory and goes with the try (TryState.take, TurnTrial.take): nothing of it is sent or kept.
 *
 * Its marks are said in words as well (the line under it, which the waveform's slider names as its description), and
 * the slider says where it stands and how long it lasts. React draws the take and its marks; where it stands — the
 * playhead, the part played, the clock and the slider's value — is written here, after each render and, while it plays,
 * frame by frame, never through a render. */

/** The live waveform's pitch (VoiceWaveform): a column every 5 px, a bar 3 px wide, never under 2 px tall. */
const CELL = 5;
const BAR = 3;
const FLOOR = 2;
const HEIGHT = 40;
/** How far an arrow key moves, and Page Up or Down. */
const STEP_MS = 500;
const PAGE_MS = 2000;

/** The bars for `columns`, drawn once per take and width. */
const Bars = memo(function Bars({ columns }: { columns: number[] }) {
  return <svg className="try-take-bars" viewBox={`0 0 ${columns.length * CELL} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden focusable="false">
    {columns.map((value, column) => {
      const height = Math.max(FLOOR, value * (HEIGHT - 2));
      return <rect key={column} x={column * CELL + (CELL - BAR) / 2} y={(HEIGHT - height) / 2} width={BAR} height={height} rx={BAR / 2} />;
    })}
  </svg>;
});

type Mark = { kind: "speech" | "pause" | "end"; text: string };

/** `turns`: whether the voice's turns are marked in it (the end of turn's try); without them, only its ends are. */
export function TryTake({ take, id, turns = true, t }: { take: VoiceTake; id: string; turns?: boolean; t: Translate }) {
  const length = takeMs(take);
  const marked = turns ? take.turns : [];
  const player = useMemo(() => createTakePlayer(take), [take]);
  // Unmounted, or another take: the player stops and lets go of its copy.
  useEffect(() => () => player.release(), [player]);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const wave = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const played = useRef<HTMLSpanElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  /** The tenth of a second the clock and the slider's value say now (-1: to be said). */
  const said = useRef(-1);
  useEffect(() => {
    const follow = () => { setPlaying(player.playing); setAt(player.position()); };
    // Another take starts where its player stands, still at its start, and its clock and length are said anew.
    said.current = -1;
    follow();
    return player.subscribe(follow);
  }, [player]);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = wave.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const count = width ? Math.max(16, Math.floor(width / CELL)) : 64;
  const columns = useMemo(() => takeColumns(take, count), [take, count]);

  const share = (ms: number) => (length > 0 ? Math.max(0, Math.min(1, ms / length)) : 0);
  const percent = (ms: number) => `${share(ms) * 100}%`;
  const clip = (ms: number) => `inset(0 ${100 - share(ms) * 100}% 0 0)`;
  const valueOf = (ms: number) => Math.round(ms / 100) / 10;
  const valueText = (ms: number) => t("take.at", { at: seconds(ms), total: seconds(length) });

  /** Where it stands, written into the page: the playhead and the part played; the clock and the slider's value only
   *  when the tenth of a second they say changes. */
  const show = (ms: number) => {
    head.current?.style.setProperty("left", percent(ms));
    played.current?.style.setProperty("clip-path", clip(ms));
    const tenth = Math.round(ms / 100);
    if (tenth === said.current) return;
    said.current = tenth;
    if (clock.current) clock.current.textContent = seconds(ms);
    wave.current?.setAttribute("aria-valuenow", String(valueOf(ms)));
    wave.current?.setAttribute("aria-valuetext", valueText(ms));
  };
  // Still: where it was left, after each render (a new width, a seek, a pause, the end).
  useLayoutEffect(() => { if (!playing) show(at); });
  // Playing: each frame.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => { show(player.position()); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, player]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => { if (player.playing) player.pause(); else void player.play().catch(() => {}); };
  const seekBy = (ms: number) => player.seek(player.position() + ms);
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, () => void> = {
      ArrowLeft: () => seekBy(-STEP_MS), ArrowDown: () => seekBy(-STEP_MS),
      ArrowRight: () => seekBy(STEP_MS), ArrowUp: () => seekBy(STEP_MS),
      PageDown: () => seekBy(-PAGE_MS), PageUp: () => seekBy(PAGE_MS),
      Home: () => player.seek(0), End: () => player.seek(length),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    move();
  }
  // A press on the waveform moves there, and a drag follows the pointer until it lets go.
  const dragging = useRef(false);
  const seekAt = (x: number) => {
    const box = wave.current?.getBoundingClientRect();
    if (box && box.width > 0) player.seek(((x - box.left) / box.width) * length);
  };
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekAt(event.clientX);
  }
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => { if (dragging.current) seekAt(event.clientX); };
  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  // The marks in words, in the order they came: each turn's speech, its pauses, its end; none but its length where
  // its turns are not marked.
  const marks: Mark[] = marked.flatMap((turn) => [
    { kind: "speech" as const, text: t("take.speech", { s: seconds(turn.speech_ms) }) },
    ...turn.pauses.map((pause) => ({ kind: "pause" as const, text: t("take.pause", { from: seconds(pause.from_ms), to: seconds(pause.to_ms) }) })),
    ...(turn.end_ms != null ? [{ kind: "end" as const, text: t("take.end", { s: seconds(turn.end_ms) }) }] : []),
  ]);
  const described = useId();

  return <figure className="try-take" id={id}>
    <figcaption className="try-take-title">{t("take.title")}</figcaption>
    <div className="try-take-player">
      <Button variant="secondary" size="icon-sm" className="try-take-play" id={id + "-play"} aria-label={t("take.play")} aria-pressed={playing} onClick={toggle}>
        {playing ? <PauseRecordingIcon /> : <PlayRecordingIcon />}
      </Button>
      <div ref={wave} className="try-take-wave" id={id + "-wave"} role="slider" tabIndex={0} aria-label={t("take.position")} aria-describedby={described}
        aria-valuemin={0} aria-valuemax={valueOf(length)}
        onKeyDown={keyDown} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        <Bars columns={columns} />
        <span ref={played} className="try-take-played" aria-hidden><Bars columns={columns} /></span>
        {marked.map((turn) => <Fragment key={turn.turn_id}>
          {turn.pauses.map((pause) => <span key={pause.from_ms} className="try-take-pause" data-kind="pause" aria-hidden
            style={{ left: percent(pause.from_ms), width: `${(share(pause.to_ms) - share(pause.from_ms)) * 100}%` }} />)}
          <span className="try-take-mark" data-kind="speech" aria-hidden style={{ left: percent(turn.speech_ms) }} />
          {turn.end_ms != null && <span className="try-take-mark" data-kind="end" aria-hidden style={{ left: percent(turn.end_ms) }} />}
        </Fragment>)}
        <span ref={head} className="try-take-head" aria-hidden />
      </div>
      <span className="try-take-clock" aria-hidden><span ref={clock} /> / {seconds(length)} s</span>
    </div>
    <p className="try-take-marks" id={described}>
      <span>{t("take.length", { s: seconds(length) })}</span>
      {marks.length ? marks.map((mark, index) => <span key={index} data-kind={mark.kind}><i className="try-take-key" aria-hidden />{mark.text}</span>)
        : turns && <span>{t("take.noSpeech")}</span>}
    </p>
  </figure>;
}
