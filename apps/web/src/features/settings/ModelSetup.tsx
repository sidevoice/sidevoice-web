import { useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { useRoomStore } from "../../state/room-store";
import { createMicLevelChannel } from "../../state/mic-level";
import { Button } from "../../components/ui/Button";
import { Popover } from "../../components/ui/Popover";
import { endOfTurnModel, type DeviceVoiceSettings as Settings } from "../../services/voice-settings.js";
import type { Translate, MessageKey } from "../../i18n/translator";
import type { PrepareStatus } from "./ModelPrepare";
import { MAX_TAKE_MS } from "../../services/voice-trial.js";
import { Textarea } from "../../components/ui/Input";
import { EditIcon } from "../../components/ui/Icons";
import { VoiceWaveform } from "../conversation/VoiceWaveform";
import { wordEnd } from "../conversation/KaraokeText";
import { readingMoves, readingPosition, readOn, type Reading } from "../call/speech-chunks";
import type { KaraokeRange, TrialTimings } from "../../state/room-types";
import type { VoiceTake } from "../../services/voice-take";
import { seconds } from "./try-time";
import { TryTake } from "./TryTake";
import { ErrorText } from "../../components/ui/ErrorText";
import { voiceFailure, type ErrorMessage } from "./error-message";

/* A voice slot's chosen model made ready, the same in Settings and in the first-run setup: one of this device's
 * catalogue is downloaded first when it is not on disk (its size said, with progress and cancel), then checked; a
 * provider's needs no download, only its key. ModelPrepare draws where it stands; this says where that is. */

export type Task = "stt" | "tts";

/** Where the slot's model stands: not on this device yet (with its download size), being installed, failed, ready. */
export function useModelState(task: Task | "end-of-turn", draft: Settings | null) {
  const catalogs = useRoomStore((state) => state.facts.voiceCatalogue.catalogs);
  const catalogueState = useRoomStore((state) => state.facts.voiceCatalogue.state);
  const install = useRoomStore((state) => state.facts.voiceInstall);
  // The end of turn has no slot of its own: its model is this device's end-of-turn model, when it is the smart one.
  const turnModel = task === "end-of-turn" && draft?.end_of_turn === "smart-turn" ? endOfTurnModel(catalogs, draft?.turn_model) : null;
  const slot = task === "end-of-turn" ? (turnModel ? { catalog: "local", model: turnModel.id, build: undefined as string | undefined } : undefined) : draft?.[task];
  const model = slot ? catalogs.find((catalog) => catalog.id === slot.catalog)?.models.find((candidate) => candidate.id === slot.model) ?? null : null;
  const local = slot?.catalog === "local";
  // The build it runs as: the one chosen (Settings, "How it runs"), else the engine's recommended one.
  const chosen = slot?.build ? model?.builds?.find((candidate) => candidate.id === slot.build) : undefined;
  const build = chosen ?? model?.builds?.find((candidate) => candidate.id === model.recommendedBuild) ?? model?.builds?.find((candidate) => candidate.available);
  const installed = !!model && (!local || (chosen ? chosen.installed : model.installed === true || !!model.builds?.some((candidate) => candidate.installed)));
  const mine = install && install.task === task && install.model === slot?.model ? install : null;
  const installing = mine?.state === "running";
  const failure = mine?.state === "failed" ? mine.error : "";
  const failureDetails = mine?.state === "failed" ? mine.details ?? "" : "";
  const ready = !!model && installed;
  // Downloaded in full, it is checked before the install ends; then the catalogues are read again to see it there.
  const status: PrepareStatus | null = !model ? null
    : installing ? ((mine?.fraction ?? 0) >= 1 ? "verifying" : "downloading")
    : failure ? "failed"
    : ready ? "ready"
    : local && catalogueState === "loading" ? "loading"
    : "absent";
  return {
    status,
    model,
    local,
    /** Ready to use: a provider's listed model, or one of this device's that is on disk. */
    ready,
    size: build?.downloadBytes ?? null,
    /** The build it runs as, and whether it was chosen rather than the engine's. */
    build: build ?? null,
    buildChosen: !!chosen,
    installing,
    fraction: installing ? mine!.fraction : null,
    /** Why its download failed, in words, and what was raw about it (for its Details). */
    failure,
    failureDetails,
  };
}

export type ModelState = ReturnType<typeof useModelState>;

/** Whether the catalogues can be shown: read, or being read again with the last ones still there — a download that
 *  ends reads them again, and the page must not empty and redraw itself under the person meanwhile. */
export function catalogueShown(catalogue: { state: string; catalogs: unknown[] }) {
  return catalogue.state === "ready" || (catalogue.state === "loading" && catalogue.catalogs.length > 0);
}

/** Bytes as people read them: MB below a gigabyte, else GB. */
export function sizeText(bytes: number | null, language = document.documentElement.lang || "en") {
  if (!bytes) return "";
  const format = (value: number, unit: string) => value.toLocaleString(language, { maximumFractionDigits: value < 10 ? 1 : 0 }) + " " + unit;
  return bytes >= 1e9 ? format(bytes / 1e9, "GB") : format(Math.max(1, bytes / 1e6), "MB");
}

/** The download of the slot's model: started, cancelled. */
export const downloadModel = (task: Task | "end-of-turn") => void window.sidevoiceActions?.installVoiceModel?.(task);
export const cancelDownload = () => window.sidevoiceActions?.cancelVoiceInstall?.();

export type TryState = {
  phase: "idle" | "running" | "done" | "failed";
  /** Which try this is: what an earlier one tells late is not this one's. */
  attempt: number;
  /** While it runs: the voice listens (transcription) or sounds (voice); before that its models load. */
  live: boolean;
  /** Transcription's, while it runs: the take has ended (Stop, its longest, or a silence) and is being transcribed. */
  transcribing: boolean;
  /** The voice's: the sentence it says, and the part of it sounding (none before its first sound). */
  said: string;
  range: KaraokeRange | null;
  text: string;
  /** Why it failed, as people read it (error-message.ts). */
  error: ErrorMessage | null;
  timings?: TrialTimings | null;
  /** Transcription's, once it has stopped: what the microphone gave the voice, where the voice hands it (gap #40). */
  take?: VoiceTake | null;
};

const IDLE: TryState = { phase: "idle", attempt: 0, live: false, transcribing: false, said: "", range: null, text: "", error: null, take: null };

/** A real try of the settings being edited for `task` (the controller's `tryVoiceSettings`): `keep` makes settings that
 *  work this device's (the setup); `onTried` hears each success. A changed setting clears it; leaving stops it. While
 *  it runs it follows what the try tells (TrialProgress); the microphone's level goes to `level`, drawn from there
 *  frame by frame, never through a render. A try shows all of itself in the model's block (decided 2026-10-12). Its
 *  take, when the voice hands one, is held here only, in memory: a new try, a changed setting, a stop, or this going
 *  away lets it go. */
export function useVoiceTry(task: Task | null, { keep = true, onTried }: { keep?: boolean; onTried?: (task: Task) => void } = {}) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const [trial, setTrial] = useState<TryState>(IDLE);
  const trialRef = useRef(trial);
  trialRef.current = trial;
  const attempt = useRef(0);
  const level = useMemo(createMicLevelChannel, []);
  const slot = JSON.stringify(task && draft ? draft[task] : null);
  // A setting of the model under try changed: the try running stops (what it would say describes the old one), and
  // what the last one said goes.
  const tried = useRef(slot);
  useEffect(() => {
    if (tried.current !== slot && trialRef.current.phase === "running") window.sidevoiceActions?.cancelVoiceTry?.();
    tried.current = slot;
    setTrial({ ...IDLE, attempt: attempt.current });
  }, [slot, task]);
  useEffect(() => () => window.sidevoiceActions?.cancelVoiceTry?.(), [task]);
  const cancel = () => window.sidevoiceActions?.cancelVoiceTry?.();
  // Stop: a transcription try's take ends with what was said, and is transcribed; a voice try is cancelled.
  const finish = () => task === "stt" && window.sidevoiceActions?.finishVoiceTry ? window.sidevoiceActions.finishVoiceTry() : cancel();
  async function run(options: { text?: string; language?: string | null } = {}) {
    if (!task) return;
    const mine = ++attempt.current;
    const update = (next: (trial: TryState) => TryState) => setTrial((trial) => trial.attempt === mine ? next(trial) : trial);
    level.publish(0);
    setTrial({ ...IDLE, phase: "running", attempt: mine, said: options.text ?? "" });
    try {
      const result = await window.sidevoiceActions!.tryVoiceSettings!(task, { ...options, keep,
        onListening: () => update((trial) => ({ ...trial, live: true })),
        onLevel: (value) => level.publish(value * 100),
        onProgress: (range) => update((trial) => ({ ...trial, live: true, range })),
        // The take ended: the microphone's level no longer counts, and the try says it transcribes.
        onTranscribing: (transcribing) => { if (transcribing && attempt.current === mine) level.publish(0); update((trial) => ({ ...trial, transcribing })); },
        onTake: (take) => update((trial) => ({ ...trial, take })) });
      update((trial) => ({ ...trial, phase: "done", live: false, transcribing: false, text: result.text ?? "", timings: result.timings ?? null }));
      if (attempt.current === mine) onTried?.(task);
    } catch (error) {
      const cancelled = (error as { code?: string }).code === "trial-cancelled";
      // Stopped, the try is put away, its take with it; failed, what the microphone gave shows why.
      update((trial) => ({ ...trial, phase: cancelled ? "idle" : "failed", live: false, transcribing: false, error: voiceFailure(error, { what: "try" }), ...(cancelled ? { take: null } : {}) }));
    } finally {
      level.publish(0);
    }
  }
  return { trial, run, cancel, finish, level };
}

/** A try with what it starts with (the sentence, its language), for whatever shows it. */
/** A try as it is offered: `start` runs it; for the voice, `sentence` is what it says, edited in the try itself. */
export type VoiceTry = ReturnType<typeof useVoiceTry> & { start(): void; sentence?: string; setSentence?(sentence: string): void };

/** The first-run setup's try, shown in the slot's block: started from the block's button or the setup's footer, which
 *  stops it (the one Stop); `tried` already (then the block's button says again), a line before it (`hint`), and the
 *  sentence to hear, to edit (`sample`). */
export type SetupTry = VoiceTry & { tried: boolean; hint?: string; sample?: ReactNode };

/** Past these, a try is slow for this device: transcribing what was said, or the first sound of a sentence. */
const SLOW_MS = { stt: 1500, tts: 1500 } as const;

/** The time that matters after a try, in words: what was said transcribed, or the voice's first sound. */
const timingMs = (task: Task, timings: TrialTimings) => task === "stt" ? timings.recognition_ms : timings.first_sound_ms;
const timingText = (task: Task, ms: number, t: Translate) => t(task === "stt" ? "try.timing.stt" : "try.timing.tts", { s: seconds(ms) });

/** From this long, getting ready was loading the model (a cold start), worth saying apart; below it, it was there. */
const COLD_LOAD_MS = 1000;

/** After a try, one plain line with the time that matters ("Transcribed in 0.4 s", "First sound in 0.3 s"), the model's
 *  load after it only when it had to load, and a smaller model suggested when that is slow for this device. */
export function TryTiming({ task, timings, t }: { task: Task; timings: TrialTimings; t: Translate }) {
  const key = timingMs(task, timings);
  if (key == null) return null;
  const slow = key > SLOW_MS[task];
  // What this try's step chooses, and nothing else: transcribing (Transcription), the first sound (Voice); the model's
  // load only when it was loaded for this try (a cold start), not a few ms of a model already there.
  const cold = timings.ready_ms != null && timings.ready_ms >= COLD_LOAD_MS ? timings.ready_ms : null;
  return <p className="voice-try-timing" data-slow={slow || undefined} id={task + "-timing"}>
    <span>{timingText(task, key, t)}{cold != null && " " + t("try.loadedIn", { s: seconds(cold) })}</span>
    {slow && <span className="voice-try-slow">{t("try.slow")}</span>}
  </p>;
}

const FIRST = { stt: "voice.try.speak", tts: "voice.try.listen" } as const;
const AGAIN = { stt: "try.speakAgain", tts: "try.listenAgain" } as const;

/** The try's button, first in its block whether or not the try can run: try it, Stop while it runs, then again.
 *  `reason`: why it cannot run now (its model not ready), said by the text `reasonId` names — the button stays reachable
 *  and reads it. `stopsElsewhere`: the first-run setup's, whose footer is the one Stop; here a try running is only
 *  said (busy). `again`: tried already, before this visit. */
export function TryButton({ task, handle, id, again = false, reason = "", reasonId, stopsElsewhere = false, t }: {
  task: Task; handle: VoiceTry; id: string; again?: boolean; reason?: string; reasonId?: string; stopsElsewhere?: boolean; t: Translate;
}) {
  const running = handle.trial.phase === "running";
  // While it runs, the label it was pressed with (a first try is still one).
  const label = t(again || (!running && handle.trial.phase !== "idle") ? AGAIN[task] : FIRST[task]);
  if (running && stopsElsewhere) return <Button size="sm" id={id} loading>{label}</Button>;
  const blocked = !running && !!reason;
  return <Button size="sm" id={id} disabled={blocked} blockedBy={blocked ? reasonId : undefined} onClick={running ? handle.finish : handle.start}>
    {running ? t("try.stop") : label}
  </Button>;
}

/** How far into a sentence the voice is, in characters (speech-chunks.ts `readOn`, as a reply on the stage): the part
 *  sounding, its words moving on at a speaking pace within it. Only this ticks while it moves, nothing around it. */
function useHeardTo(range: KaraokeRange | null, sounding: boolean) {
  const reading = useRef<Reading | null>(null);
  reading.current = readOn(reading.current, "try", sounding, range, Date.now());
  const moving = readingMoves(reading.current!);
  const [, tick] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    if (!moving) return;
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [moving]);
  return readingPosition(reading.current!);
}

/** The voice's sentence, its words lit as they are heard; all of it once it was. */
function TrySentence({ text, range, sounding, done }: { text: string; range: KaraokeRange | null; sounding: boolean; done: boolean }) {
  const heard = useHeardTo(range, sounding);
  const end = done ? text.length : wordEnd(text, Math.min(text.length, heard));
  return <p className="model-try-sentence" data-done={done || undefined} translate="no">
    <span className="model-try-said">{text.slice(0, end)}</span><span className="model-try-unsaid">{text.slice(end)}</span>
  </p>;
}

/** What was heard, quoted: two lines at most in the block, the rest a "See all" away; in full in the dialog (`roomy`).
 *  `id` is the quote's, and `<id>-all` its See all. */
export function TryHeard({ text, roomy, t, id = "stt-heard" }: { text: string; roomy: boolean; t: Translate; id?: string }) {
  const quote = useRef<HTMLQuoteElement>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const node = quote.current;
    if (!node || roomy) return;
    // Cut short where it is drawn: measured, and again when the block's width changes.
    const measure = () => setCut(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text, roomy]);
  return <figure className="model-try-heard">
    <figcaption>{t("wizard.transcript")}</figcaption>
    <blockquote ref={quote} id={id} data-clamped={!roomy || undefined}>{text}</blockquote>
    {cut && <Popover label={t("wizard.transcript")} trigger={<Button variant="ghost" size="sm" className="model-try-all" id={id + "-all"}>{t("try.seeAll")}</Button>}>
      <p className="model-try-full">{text}</p>
    </Popover>}
  </figure>;
}

/** A try as it goes, the same in a model's block and in its dialog: getting ready; then listening, the microphone's
 *  level drawn as it comes, or the sentence lit as it is heard; then what was heard and how quick it was, or why it
 *  failed — and, for transcription, the take to listen to when the voice handed one (outside the live region: it is
 *  read when reached, not when it appears). `sample`: the sentence to hear, to edit while no try runs (the first-run
 *  setup's). */
function TryBody({ task, handle, roomy = false, sample, quote = true, t }: { task: Task; handle: VoiceTry; roomy?: boolean; sample?: ReactNode; quote?: boolean; t: Translate }) {
  const { trial } = handle;
  const running = trial.phase === "running";
  const sentence = quote && task === "tts" && !!trial.said && (running || (trial.phase === "done" && !sample));
  return <>
    {task === "tts" && !running && sample}
    {sentence && <TrySentence key={trial.attempt} text={trial.said} range={trial.range} sounding={running && trial.live} done={!running} />}
    <div className="model-try-live" aria-live="polite">
      {running && !trial.live && <p className="model-try-state"><span className="ui-spinner ui-spinner--inline" aria-hidden />{t("try.starting")}</p>}
      {running && trial.live && task === "stt" && <div className="model-try-listening">
        <span className="model-try-wave" aria-hidden><VoiceWaveform phase="listening" level={() => handle.level.current() / 100} /></span>
        <p className="model-try-state">{t("try.listening")}</p>
        {/* The take's length, filling to its longest (MAX_TAKE_MS), from when it listens. */}
        <span className="model-try-take" key={trial.attempt} style={{ animationDuration: MAX_TAKE_MS + "ms" }} role="img" aria-label={t("try.takeMax", { s: MAX_TAKE_MS / 1000 })} />
      </div>}
      {running && trial.live && task === "tts" && <p className="model-try-state">{t("wizard.playing")}</p>}
      {trial.phase === "done" && task === "stt" && <TryHeard text={trial.text} roomy={roomy} t={t} />}
      {trial.phase === "done" && trial.timings && <TryTiming task={task} timings={trial.timings} t={t} />}
      {trial.phase === "failed" && trial.error && <ErrorText className="stage-try-error" role="alert" message={trial.error} />}
    </div>
  </>;
}

/** The transcription try, one layout that never jumps. Its first row: the try's button and, beside it, the microphone's
 *  level, always there — flat until it listens, moving while it does. Its second, of a fixed height: while it listens,
 *  what to do and the take's length filling to its longest; once the take has ended (Stop, its longest, a silence),
 *  "Transcribing…", the level flat and the take's length stopped where it ended; once done, in its place, what was
 *  heard and how quick; or why it failed. */
function SttTry({ handle, hint, button, t }: { handle: VoiceTry; hint?: string; button?: ReactNode; t: Translate }) {
  const { trial } = handle;
  const running = trial.phase === "running";
  const taking = running && trial.live;
  const listening = taking && !trial.transcribing;
  return <div className="model-try stt-try" id="stt-try-panel" data-phase={trial.phase}>
    <div className="stt-try-head">
      {button}
      <span className="model-try-wave" aria-hidden><VoiceWaveform phase="listening" level={() => listening ? handle.level.current() / 100 : 0} /></span>
    </div>
    <div className="stt-try-area" aria-live="polite">
      {trial.phase === "idle" && hint && <p className="model-try-hint">{hint}</p>}
      {running && !trial.live && <p className="model-try-state"><span className="ui-spinner ui-spinner--inline" aria-hidden />{t("try.starting")}</p>}
      {taking && <>
        {trial.transcribing
          ? <p className="model-try-state"><span className="ui-spinner ui-spinner--inline" aria-hidden />{t("try.transcribing")}</p>
          : <p className="model-try-state">{t("try.listening")}</p>}
        {/* The take's length, filling to its longest (MAX_TAKE_MS), from when it listens; stopped once it has ended. */}
        <span className="model-try-take" key={trial.attempt} data-ended={trial.transcribing || undefined} style={{ animationDuration: MAX_TAKE_MS + "ms" }} role="img" aria-label={t("try.takeMax", { s: MAX_TAKE_MS / 1000 })} />
      </>}
      {trial.phase === "done" && <>
        <TryHeard text={trial.text} roomy={false} t={t} />
        {trial.timings && <TryTiming task="stt" timings={trial.timings} t={t} />}
      </>}
      {trial.phase === "failed" && trial.error && <ErrorText className="stage-try-error" role="alert" message={trial.error} />}
    </div>
    {/* The take to listen to, when the voice handed one: outside the live area, read when reached. */}
    {!running && trial.take && <TryTake key={trial.attempt} take={trial.take} id="stt-take" turns={false} t={t} />}
  </div>;
}

/** The voice's try, laid out as the transcription's. Its first row: the try's button and, beside it, the voice's level —
 *  always there, flat while silent, moving while it speaks (the voice gives no output level: it follows the playing,
 *  not a measure of it). Its second, of a fixed height: the sentence it says, editable (its pencil, or a click on it)
 *  while it does not speak, lit as it is heard; under it, getting ready, then how quick its first sound was, or why it
 *  failed. Play says what is there. */
function TtsTry({ handle, hint, button, t }: { handle: VoiceTry; hint?: string; button?: ReactNode; t: Translate }) {
  const [editing, setEditing] = useState(false);
  const { trial } = handle;
  const running = trial.phase === "running";
  const sounding = running && trial.live;
  const text = handle.sentence ?? "";
  const started = useRef(0);
  if (sounding && !started.current) started.current = performance.now();
  if (!sounding) started.current = 0;
  const moving = () => sounding ? 0.35 + 0.3 * Math.abs(Math.sin((performance.now() - started.current) / 140)) : 0;
  const lit = running || (trial.phase === "done" && trial.said === text.trim());
  return <div className="model-try tts-try" id="tts-try-panel" data-phase={trial.phase}>
    <div className="stt-try-head">
      {button}
      <span className="model-try-wave" aria-hidden><VoiceWaveform phase="listening" level={moving} /></span>
    </div>
    <div className="stt-try-area tts-try-area">
      <div className="tts-try-sentence">
        {editing && !running
          ? <Textarea id="tts-sentence" className="voice-try-text" minRows={1} maxRows={3} maxLength={200} value={text} autoFocus
              aria-label={t("voiceTry.sentence")} onChange={(event) => handle.setSentence?.(event.target.value)} onBlur={() => setEditing(false)} />
          : lit ? <TrySentence key={trial.attempt} text={trial.said || text} range={trial.range} sounding={sounding} done={!running} />
          : <button type="button" className="tts-try-said" aria-label={t("voiceTry.edit")} onClick={() => setEditing(true)}>{text}</button>}
        {!running && !editing && <Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("voiceTry.edit")} title={t("voiceTry.edit")}
          onClick={() => setEditing(true)}><EditIcon /></Button>}
      </div>
      <div className="model-try-live" aria-live="polite">
        {trial.phase === "idle" && hint && <p className="model-try-hint">{hint}</p>}
        {running && !trial.live && <p className="model-try-state"><span className="ui-spinner ui-spinner--inline" aria-hidden />{t("try.starting")}</p>}
        {trial.phase === "done" && trial.timings && <TryTiming task="tts" timings={trial.timings} t={t} />}
        {trial.phase === "failed" && trial.error && <ErrorText className="stage-try-error" role="alert" message={trial.error} />}
      </div>
    </div>
  </div>;
}

/** What a try shows in its block, after the slot's settings: all of it, the same whether or not the model is ready. `hint`: a line before any try (the first-run
 *  setup's); `sample`: the sentence to hear, edited in the block. */
export function TryPanel({ task, handle, model, hint, sample, button, t }: { task: Task; handle: VoiceTry; model: string; hint?: string; sample?: ReactNode; button?: ReactNode; t: Translate }) {
  const { trial } = handle;
  const idle = trial.phase === "idle";
  if (task === "stt") return <SttTry handle={handle} hint={hint} button={button} t={t} />;
  if (handle.setSentence) return <TtsTry handle={handle} hint={hint} button={button} t={t} />;
  return <div className="model-try" id={task + "-try-panel"} data-phase={trial.phase} data-empty={(idle && !hint && !sample) || undefined}>
    {idle && hint && <p className="model-try-hint">{hint}</p>}
    <TryBody task={task} handle={handle} sample={sample} t={t} />
  </div>;
}
