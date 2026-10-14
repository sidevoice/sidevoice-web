import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createMicLevelChannel } from "../../state/mic-level";
import { Button } from "../../components/ui/Button";
import { Row } from "../../components/ui/Card";
import { ErrorText } from "../../components/ui/ErrorText";
import { VoiceWaveform } from "../conversation/VoiceWaveform";
import { useModelState } from "./ModelSetup";
import { seconds } from "./try-time";
import { TryTake } from "./TryTake";
import { translator, type MessageKey } from "../../i18n/translator";
import { voiceFailure, type ErrorMessage } from "./error-message";
import type { TurnStep } from "../../services/voice-trial.js";
import type { DeviceVoiceSettings as Settings } from "../../services/voice-settings.js";
import type { VoiceTake } from "../../services/voice-take";
import "./model-prepare.css";
import "./turn-try.css";

/* Trying the end of turn as a whole — Smart or Silence, with its patience — where it is chosen, with no screen of its
 * own: the person talks as they would to the agent, and sees, turn by turn, when the agent would have answered. It
 * listens until Stop, 30 s with no speech, or the person leaves (another section, Settings or the setup closed). Only
 * the latest turn shows; a change of the setting while it runs drops it, and the try listens again with the new one.
 *
 * Where it stands is always said in words; the waveform is decoration, hidden from screen readers. A screen reader hears
 * a few whole messages from one polite status region — listening, a turn ended (not its words), a turn that did not
 * count, listening again, the stop — and never speaking or a pause: that would be one message per breath, and its
 * speech, heard by the microphone, would open turns of its own. Try and Stop are one button, so the focus stays.
 *
 * Once it has stopped, its take — what the microphone gave the voice since it last started to listen, with where each
 * turn's speech started, paused and ended — shows under the result, to play (TryTake), where the voice hands one
 * (contract gap #40). It is held here only, in memory, until the next try or until this goes away. */

/** Where the try shows (the preview's VARIANTS `turn-try`): a strip under the end-of-turn choice, with no border of its
 *  own (`strip`), or a card of its own after the end-of-turn choices, as a model's try looks (`card`). */

/** How long a notice stays (a turn that did not count, the new setting listening) before the try says it listens. */
const NOTICE_MS = 2000;

type Phase = "idle" | "starting" | "restarting" | "listening" | "speaking" | "pause" | "ended" | "notice" | "quiet" | "failed" | "done";
const RUNNING: ReadonlySet<Phase> = new Set(["starting", "restarting", "listening", "speaking", "pause", "ended", "notice"]);

/** A message the status region reads out; for a turn that ended, the silence it ended after when the voice said it. */
type Said = { key: MessageKey; ms?: number | null };

export type TurnTrial = {
  phase: Phase;
  /** Which try this is: what an earlier one tells late is not this one's. */
  attempt: number;
  /** The latest turn, once its end was decided: its words and the silence that ended it, each once the voice told it. */
  turn: { text: string; silenceMs: number | null } | null;
  /** What a notice says for its moment: a turn that did not count, or the new setting listening. */
  notice: "not-a-turn" | "changed" | null;
  /** Why it failed, as people read it (error-message.ts). */
  error: ErrorMessage | null;
  /** Once it has stopped: its take, where the voice hands one (gap #40). */
  take: VoiceTake | null;
  /** The last message read out, and how many have been: the same one again is read again. */
  said: Said | null;
  told: number;
};

export const TURN_IDLE: TurnTrial = { phase: "idle", attempt: 0, turn: null, notice: null, error: null, take: null, said: null, told: 0 };

const say = (trial: TurnTrial, said: Said) => ({ said, told: trial.told + 1 });

/** `trial` after a step of the person's turns, as the try tells it (voice-trial.js TurnStep). */
export function turnStepped(trial: TurnTrial, step: TurnStep): TurnTrial {
  switch (step.step) {
    case "listening":
      return step.again ? { ...trial, phase: "notice", notice: "changed", turn: null, ...say(trial, { key: "turnTry.changed" }) }
        : { ...trial, phase: "listening", turn: null, ...say(trial, { key: "turnTry.listening" }) };
    case "restarting":
      return { ...trial, phase: "restarting", turn: null, notice: null };
    case "speaking":
      // A turn starts: the last one's result goes.
      return { ...trial, phase: "speaking", turn: null, notice: null };
    case "pause":
      return { ...trial, phase: "pause" };
    case "ended":
      return { ...trial, phase: "ended", turn: { text: "", silenceMs: null }, ...say(trial, { key: "turnTry.endedNow" }) };
    case "heard": {
      const turn = { text: step.text, silenceMs: step.endpoint_silence_ms };
      // Its end said already: the words and the seconds fill it in, and nothing more is read out.
      if (trial.phase === "ended") return { ...trial, turn };
      return { ...trial, phase: "ended", turn, ...say(trial, { key: turn.silenceMs == null ? "turnTry.endedNow" : "turnTry.ended", ms: turn.silenceMs }) };
    }
    case "not-a-turn":
      return { ...trial, phase: "notice", notice: "not-a-turn", turn: null, ...say(trial, { key: "turnTry.notATurn" }) };
  }
}

/** A try of the end of turn being edited (the controller's `tryTurnSettings`), for one place that shows it: `start`,
 *  `stop`, and where it stands (`trial`). The microphone's level goes to `level`, drawn from there frame by frame, never
 *  through a render. Not `active` (out of sight), unmounted, or its dialog closed (Settings, the setup put off), a try of
 *  its own that runs stops. `smartBlocked`: Smart is chosen without its model ready, and a stop that comes then is said
 *  to be for that. `root` is where it is drawn, for its dialog. */
export function useTurnTry({ active, smartBlocked }: { active: boolean; smartBlocked: boolean }) {
  const [trial, setTrial] = useState<TurnTrial>(TURN_IDLE);
  const attempt = useRef(0);
  const level = useMemo(createMicLevelChannel, []);
  const running = RUNNING.has(trial.phase);
  const runningNow = useRef(running);
  runningNow.current = running;
  const blockedNow = useRef(smartBlocked);
  blockedNow.current = smartBlocked;
  const root = useRef<HTMLDivElement>(null);
  const stop = () => { if (runningNow.current) window.sidevoiceActions?.cancelVoiceTry?.(); };
  async function run() {
    const mine = ++attempt.current;
    const update = (next: (trial: TurnTrial) => TurnTrial) => setTrial((trial) => trial.attempt === mine ? next(trial) : trial);
    level.publish(0);
    runningNow.current = true;
    setTrial((trial) => ({ ...TURN_IDLE, phase: "starting", attempt: mine, told: trial.told }));
    // The test is the end of turn itself: the first turn the voice ends and hears ends the try, with when it decided.
    let decided = false;
    try {
      await window.sidevoiceActions!.tryTurnSettings!({
        onLevel: (value) => level.publish(value * 100),
        onTurnStep: (step) => {
          update((trial) => turnStepped(trial, step));
          if (step.step === "heard" && !decided) { decided = true; window.sidevoiceActions?.cancelVoiceTry?.(); }
        },
        onTake: (take) => update((trial) => ({ ...trial, take })),
      });
    } catch (error) {
      const { code } = error as { code?: string };
      update((trial) => code === "trial-cancelled" && decided && trial.turn
        ? { ...trial, phase: "done", notice: null, ...say(trial, { key: trial.turn.silenceMs == null ? "turnTry.detectedNow" : "turnTry.detected", ms: trial.turn.silenceMs }) }
        : code === "trial-cancelled"
        // Stopped: the last turn stays, once it has its words.
        ? { ...trial, phase: "idle", notice: null, turn: trial.turn?.text ? trial.turn : null, ...say(trial, { key: blockedNow.current ? "turnTry.smartBlocked" : "wizard.trial.cancelled" }) }
        : code === "trial-silence" ? { ...trial, phase: "quiet", notice: null, turn: null, ...say(trial, { key: "turnTry.quiet" }) }
        : { ...trial, phase: "failed", notice: null, turn: null, error: voiceFailure(error, { what: "try" }) });
    } finally {
      level.publish(0);
    }
  }
  useEffect(() => { if (!active) stop(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const dialog = root.current?.closest("dialog");
    dialog?.addEventListener("close", stop);
    return () => { dialog?.removeEventListener("close", stop); stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A notice stays a moment, then the try says it listens — unless something else came meanwhile.
  useEffect(() => {
    if (trial.phase !== "notice") return;
    const told = trial.told;
    const timer = window.setTimeout(() => setTrial((now) => now.phase === "notice" && now.told === told ? { ...now, phase: "listening", notice: null } : now), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [trial.phase, trial.told]);
  return { trial, running, level, root, start: () => void run(), stop };
}
export type TurnTryHandle = ReturnType<typeof useTurnTry>;

/** The try of the end of turn being edited (`draft`), as the `turn-try` variant has it. `smart`: the smart end of turn
 *  is the one chosen, and `smartReady` its model ready; `setup`: the first-run setup's, where nothing says the try uses
 *  what is selected before it is kept, as Settings do; `active`: in sight (Settings' section on show). */
export function TurnTry({ draft, smart, smartReady, setup = false, active = true, handle }: {
  draft: Settings; smart: boolean; smartReady: boolean; setup?: boolean; active?: boolean;
  /** The setup's own try: started from here or from its footer, which is its one Stop. */
  handle?: TurnTryHandle;
}) {
  const t = translator();
  const stt = useModelState("stt", draft);
  const smartBlocked = smart && !smartReady;
  const own = useTurnTry({ active: active && !handle, smartBlocked });
  const { trial, running, level, root, start, stop } = handle ?? own;
  const reasonId = useId();
  // Why it cannot run now: Smart without its model (in the setup, in its footer's words), or no transcription to hear
  // the turn's words.
  const reason = running ? "" : smartBlocked ? t(setup ? "settings.save.waitTurn" : "turnTry.smartBlocked") : !stt.ready ? t("settings.save.waitTranscription") : "";
  // The microphone's level, always drawn: flat while the try does not listen, live while it does.
  const live = useRef(false);
  live.current = running;
  const wave = useMemo(() => () => live.current ? level.current() / 100 : 0, [level]);

  // While it listens, one line whatever the turn is doing; once it decided, one line with when, in the same place.
  const listeningLine = t("turnTry.listeningSimple");
  const detected = trial.turn ? (trial.turn.silenceMs == null ? t("turnTry.detectedNow") : t("turnTry.detected", { s: seconds(trial.turn.silenceMs) })) : "";
  const words: Partial<Record<Phase, string>> = {
    listening: listeningLine, speaking: listeningLine, pause: listeningLine, ended: listeningLine, notice: listeningLine,
    quiet: t("turnTry.quiet"), done: detected,
  };
  const busy = trial.phase === "starting" || trial.phase === "restarting";
  const state = busy ? <p className="model-try-state turn-try-busy"><span className="ui-spinner ui-spinner--inline" aria-hidden />{t("try.starting")}</p>
    : words[trial.phase] ? <p className="turn-try-state">{words[trial.phase]}</p> : null;
  const hint = <div className="turn-try-hint">
    <p className="model-try-hint">{t("turnTry.hint")}</p>
    {!setup && <p className="model-try-hint">{t("turnTry.draft")}</p>}
  </div>;
  const failure = trial.phase === "failed" && trial.error ? <ErrorText className="stage-try-error" role="alert" message={trial.error} /> : null;
  const take = !running && trial.take ? <TryTake key={trial.attempt} take={trial.take} id="turn-try-take" t={t} /> : null;
  // While it runs, the label it was pressed with (a first try is still one).
  const label = t(trial.attempt > (running ? 1 : 0) ? "turnTry.again" : "turnTry.try");
  // In the setup its footer is the one Stop: here a try running is only said (busy).
  const button = running && handle ? <Button size="sm" id="turn-try" className="turn-try-button" loading>{label}</Button>
    : <Button size="sm" id="turn-try" className="turn-try-button" disabled={!!reason} blockedBy={reason ? reasonId : undefined} onClick={running ? stop : start}>
      {running ? t("try.stop") : label}
    </Button>;
  const said = trial.said ? t(trial.said.key, trial.said.ms != null ? { s: seconds(trial.said.ms) } : undefined) : "";
  // Read out as a whole, and again when the same message comes again (its content then differs by a trailing space).
  const status = <p className="sr-only turn-try-said" role="status">{said && said + (trial.told % 2 ? "\u00a0" : "")}</p>;
  const why = reason ? <p className="turn-try-reason" id={reasonId}>{reason}</p> : null;

  // Laid out as the other tries: the button and the microphone's level on one row, always; under it an area of a fixed
  // height — where the turn stands while it listens, then when it decided the turn ended and what was heard, in the
  // same place — and the recorded take under that.
  return <Row label={t("turnTry.title")} block>
    <div ref={root} className="turn-try turn-try-card stt-try" id="turn-try-panel" data-variant="card" data-phase={trial.phase}>
      <div className="stt-try-head">
        {button}
        <span className="model-try-wave" aria-hidden><VoiceWaveform phase="listening" level={wave} /></span>
      </div>
      <div className="stt-try-area">
        {!trial.attempt && !running && hint}
        {state}
        {failure}
      </div>
      {why}
      {take}
      {status}
    </div>
  </Row>;
}
