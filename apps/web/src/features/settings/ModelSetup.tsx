import { useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { useRoomStore } from "../../state/room-store";
import { createMicLevelChannel } from "../../state/mic-level";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Popover } from "../../components/ui/Popover";
import { useVariant } from "../../lib/variants";
import { endOfTurnModel, type DeviceVoiceSettings as Settings } from "../../services/voice-settings.js";
import type { HostTranslate } from "./host-i18n";
import type { PrepareStatus } from "./ModelPrepare";
import { InfoTip } from "../../components/ui/InfoTip";
import { VoiceWaveform } from "../conversation/VoiceWaveform";
import { wordEnd } from "../conversation/KaraokeText";
import { readingMoves, readingPosition, readOn, type Reading } from "../call/speech-chunks";
import type { KaraokeRange, TrialTimings } from "../../state/room-types";
import type { HostMessageKey } from "./messages/en";

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
    failure,
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

/** How a try shows (the preview's VARIANTS `try-result`): all of it in the model's block (`card`), or in a small dialog
 *  the try opens, the block keeping a line on how the last one went (`dialog`). */
export const TRY_RESULT = ["card", "dialog"] as const;
export const useTryResult = () => useVariant("try-result", TRY_RESULT);

export type TryState = {
  phase: "idle" | "running" | "done" | "failed";
  /** Which try this is: what an earlier one tells late is not this one's. */
  attempt: number;
  /** While it runs: the voice listens (transcription) or sounds (voice); before that its models load. */
  live: boolean;
  /** The voice's: the sentence it says, and the part of it sounding (none before its first sound). */
  said: string;
  range: KaraokeRange | null;
  text: string;
  error: string;
  timings?: TrialTimings | null;
};

const IDLE: TryState = { phase: "idle", attempt: 0, live: false, said: "", range: null, text: "", error: "" };

/** A real try of the settings being edited for `task` (the controller's `tryVoiceSettings`): `keep` makes settings that
 *  work this device's (the setup); `onTried` hears each success. A changed setting clears it; leaving stops it. While
 *  it runs it follows what the try tells (TrialProgress); the microphone's level goes to `level`, drawn from there
 *  frame by frame, never through a render. `open` is the try's dialog (`try-result` `dialog`): a try opens it, and
 *  `close` shuts it, stopping a try that runs. */
export function useVoiceTry(task: Task | null, { keep = true, onTried }: { keep?: boolean; onTried?: (task: Task) => void } = {}) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const [trial, setTrial] = useState<TryState>(IDLE);
  const [open, setOpen] = useState(false);
  const attempt = useRef(0);
  const level = useMemo(createMicLevelChannel, []);
  const slot = JSON.stringify(task && draft ? draft[task] : null);
  useEffect(() => { setTrial({ ...IDLE, attempt: attempt.current }); }, [slot, task]);
  useEffect(() => () => window.sidevoiceActions?.cancelVoiceTry?.(), [task]);
  const cancel = () => window.sidevoiceActions?.cancelVoiceTry?.();
  async function run(options: { text?: string; language?: string | null } = {}) {
    if (!task) return;
    const mine = ++attempt.current;
    const update = (next: (trial: TryState) => TryState) => setTrial((trial) => trial.attempt === mine ? next(trial) : trial);
    level.publish(0);
    setOpen(true);
    setTrial({ ...IDLE, phase: "running", attempt: mine, said: options.text ?? "" });
    try {
      const result = await window.sidevoiceActions!.tryVoiceSettings!(task, { ...options, keep,
        onListening: () => update((trial) => ({ ...trial, live: true })),
        onLevel: (value) => level.publish(value * 100),
        onProgress: (range) => update((trial) => ({ ...trial, live: true, range })) });
      update((trial) => ({ ...trial, phase: "done", live: false, text: result.text ?? "", timings: result.timings ?? null }));
      if (attempt.current === mine) onTried?.(task);
    } catch (error) {
      const cancelled = (error as { code?: string }).code === "trial-cancelled";
      update((trial) => ({ ...trial, phase: cancelled ? "idle" : "failed", live: false, error: (error as Error).message }));
    } finally {
      level.publish(0);
    }
  }
  const close = () => { if (trial.phase === "running") cancel(); setOpen(false); };
  return { trial, run, cancel, level, open, close };
}

/** A try with what it starts with (the sentence, its language), for whatever shows it. */
export type VoiceTry = ReturnType<typeof useVoiceTry> & { start(): void };

/** The first-run setup's try, shown in the slot's block: its first one started from the setup's footer, `tried`
 *  already (then the block offers it again), a line before it (`hint`), and the sentence to hear, to edit (`sample`). */
export type SetupTry = VoiceTry & { tried: boolean; hint?: string; sample?: ReactNode };

/** Past these, a try is slow for this device: transcribing what was said, or the first sound of a sentence. */
const SLOW_MS = { stt: 1500, tts: 1500 } as const;

const seconds = (ms: number) => new Intl.NumberFormat(navigator.language, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(ms / 1000);

/** The time that matters after a try, in words: what was said transcribed, or the voice's first sound. */
const timingMs = (task: Task, timings: TrialTimings) => task === "stt" ? timings.recognition_ms : timings.first_sound_ms;
const timingText = (task: Task, ms: number, t: HostTranslate) => t(task === "stt" ? "try.timing.stt" : "try.timing.tts", { s: seconds(ms) });

/** After a try, one plain line with the time that matters ("Transcribed in 0.4 s", "Starts speaking in 0.3 s"), a
 *  smaller model suggested when that is slow for this device, and every phase in its tooltip. */
export function TryTiming({ task, timings, t }: { task: Task; timings: TrialTimings; t: HostTranslate }) {
  const key = timingMs(task, timings);
  if (key == null) return null;
  const slow = key > SLOW_MS[task];
  const phases: [HostMessageKey, number | null | undefined][] = task === "stt"
    ? [["try.phase.ready", timings.ready_ms], ["try.phase.speech", timings.audio_ms], ["try.phase.pause", timings.endpoint_silence_ms], ["try.phase.recognition", timings.recognition_ms]]
    : [["try.phase.ready", timings.ready_ms], ["try.phase.firstSound", timings.first_sound_ms]];
  return <p className="voice-try-timing" data-slow={slow || undefined} id={task + "-timing"}>
    <span>{timingText(task, key, t)}</span>
    {slow && <span className="voice-try-slow">{t("try.slow")}</span>}
    <InfoTip label={t("try.timing.details")}>
      <span className="voice-try-phases">{phases.filter(([, ms]) => ms != null).map(([label, ms]) => <span key={label}>{t(label, { s: seconds(ms!) })}</span>)}</span>
    </InfoTip>
  </p>;
}

const FIRST = { stt: "voice.try.speak", tts: "voice.try.listen" } as const;
const AGAIN = { stt: "try.speakAgain", tts: "try.listenAgain" } as const;

/** The try's button, beside a ready model's state: try it, Stop while it runs, then again. `offered`: shown while no
 *  try runs (the first-run setup offers the first one in its footer); `again`: tried already, before this visit. */
export function TryButton({ task, handle, id, offered = true, again = false, t }: { task: Task; handle: VoiceTry; id: string; offered?: boolean; again?: boolean; t: HostTranslate }) {
  const running = handle.trial.phase === "running";
  if (!running && !offered) return null;
  return <Button size="sm" id={id} onClick={running ? handle.cancel : handle.start}>
    {running ? t("try.stop") : t(again || handle.trial.phase !== "idle" ? AGAIN[task] : FIRST[task])}
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

/** What was heard, quoted: two lines at most in the block, the rest a "See all" away; in full in the dialog (`roomy`). */
function TryHeard({ text, roomy, t }: { text: string; roomy: boolean; t: HostTranslate }) {
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
    <blockquote ref={quote} id="stt-heard" data-clamped={!roomy || undefined}>{text}</blockquote>
    {cut && <Popover label={t("wizard.transcript")} trigger={<Button variant="ghost" size="sm" className="model-try-all" id="stt-heard-all">{t("try.seeAll")}</Button>}>
      <p className="model-try-full">{text}</p>
    </Popover>}
  </figure>;
}

/** A try as it goes, the same in a model's block and in its dialog: getting ready; then listening, the microphone's
 *  level drawn as it comes, or the sentence lit as it is heard; then what was heard and how quick it was, or why it
 *  failed. `sample`: the sentence to hear, to edit while no try runs (the first-run setup's). */
function TryBody({ task, handle, roomy = false, sample, t }: { task: Task; handle: VoiceTry; roomy?: boolean; sample?: ReactNode; t: HostTranslate }) {
  const { trial } = handle;
  const running = trial.phase === "running";
  const sentence = task === "tts" && !!trial.said && (running || (trial.phase === "done" && !sample));
  return <>
    {task === "tts" && !running && sample}
    {sentence && <TrySentence key={trial.attempt} text={trial.said} range={trial.range} sounding={running && trial.live} done={!running} />}
    <div className="model-try-live" aria-live="polite">
      {running && !trial.live && <p className="model-try-state"><span className="ui-spinner ui-spinner--inline" aria-hidden />{t("try.starting")}</p>}
      {running && trial.live && task === "stt" && <div className="model-try-listening">
        <span className="model-try-wave" aria-hidden><VoiceWaveform phase="listening" level={() => handle.level.current() / 100} /></span>
        <p className="model-try-state">{t("try.listening")}</p>
      </div>}
      {running && trial.live && task === "tts" && <p className="model-try-state">{t("wizard.playing")}</p>}
      {trial.phase === "done" && task === "stt" && <TryHeard text={trial.text} roomy={roomy} t={t} />}
      {trial.phase === "done" && trial.timings && <TryTiming task={task} timings={trial.timings} t={t} />}
      {trial.phase === "failed" && <p className="stage-try-error" role="alert">{trial.error}</p>}
    </div>
  </>;
}

/** The try's own dialog (`try-result` `dialog`): what the block would show, with Stop while it runs, then again or
 *  done. Closed, a running try stops. */
function TryDialog({ task, handle, model, t }: { task: Task; handle: VoiceTry; model: string; t: HostTranslate }) {
  const titleId = useId();
  const running = handle.trial.phase === "running";
  return <Dialog id={task + "-try-dialog"} open={handle.open} size="sm" titleId={titleId} eyebrow={model} closeId={task + "-try-close"}
    title={t(task === "stt" ? "try.dialog.stt" : "try.dialog.tts")} onClose={handle.close}
    footer={running ? <Button id={task + "-try-stop"} onClick={handle.close}>{t("try.stop")}</Button>
      : <><Button id={task + "-try-repeat"} onClick={handle.start}>{t(AGAIN[task])}</Button>
        <Button variant="primary" id={task + "-try-done"} onClick={handle.close}>{t("try.done")}</Button></>}>
    <div className="model-try" data-phase={handle.trial.phase}><TryBody task={task} handle={handle} roomy t={t} /></div>
  </Dialog>;
}

/** What a try shows in a ready model's block, under its state, as the `try-result` variant has it: all of it
 *  (`card`), or a line on how the last one went while its dialog does the rest (`dialog`). `hint`: a line before
 *  any try (the first-run setup's); `sample`: the sentence to hear, edited in the block (`card` only). */
export function TryPanel({ task, handle, model, hint, sample, t }: { task: Task; handle: VoiceTry; model: string; hint?: string; sample?: ReactNode; t: HostTranslate }) {
  const variant = useTryResult();
  const { trial } = handle;
  const idle = trial.phase === "idle";
  if (variant === "card") {
    return <div className="model-try" id={task + "-try-panel"} data-phase={trial.phase} data-empty={(idle && !hint && !sample) || undefined}>
      {idle && hint && <p className="model-try-hint">{hint}</p>}
      <TryBody task={task} handle={handle} sample={sample} t={t} />
    </div>;
  }
  const ms = trial.phase === "done" && trial.timings ? timingMs(task, trial.timings) : null;
  const heard = trial.phase === "done" && task === "stt" ? trial.text : "";
  const summary = !handle.open && (trial.phase === "failed" || heard || ms != null);
  return <>
    {(summary || (idle && hint)) && <div className="model-try" id={task + "-try-panel"} data-phase={trial.phase}>
      {idle && hint && <p className="model-try-hint">{hint}</p>}
      {summary && <p className="model-try-summary" data-failed={trial.phase === "failed" || undefined}>
        {trial.phase === "failed" ? trial.error : <>{heard && <q>{heard}</q>}{heard && ms != null && " · "}{ms != null && timingText(task, ms, t)}</>}
      </p>}
    </div>}
    <TryDialog task={task} handle={handle} model={model} t={t} />
  </>;
}
