/* Trying this device's voice settings for real, through the call's own voice (@sidevoice/voice's `VoiceHost`, or the
 * desktop app's): the microphone and the chosen transcriber for words the person says, the chosen speaker for a
 * sentence they hear, the chosen end of turn for the turns they take. No room, no agent, no conversation: a try starts
 * a call of its own, waits for its result — one, or each turn as it comes until stopped — and stops it, whatever
 * happens. A try is cancellable, bounded in time, and fails by a stable code.
 *
 * A try asks the voice for its half alone: transcription and the end of turn only the input (the microphone, the
 * detector, the transcriber, and Smart's model for the end of turn), the voice only the output (the speaker: no
 * microphone is asked for, so a blocked one cannot fail it). A half that is not asked for is not loaded, and a model a
 * call holds is not loaded again: a try after another, or a call after a try, finds what it needs in the voice. */

import { voiceHalves, voiceInput } from './voice-settings.js';

/** How long a try's phases took, in ms (null where the voice did not say). Transcription: `ready_ms`,
 * `recognition_ms`; voice: `ready_ms`, `first_sound_ms`.
 * @typedef {{ ready_ms: number | null, audio_ms?: number | null, endpoint_silence_ms?: number | null, recognition_ms?: number | null, first_sound_ms?: number | null }} TrialTimings */

/** A transcription try records until Stop or its longest take, with no end of turn of its own: when a turn ends is End
 *  of turn's to choose and to try, not this one's (decided 2026-10-15). The voice has no end of turn that never ends one,
 *  so the try asks for silence — the detector alone, no end-of-turn model to load, which would be downloaded behind the
 *  catalogue the page shows — at a pause of 1.5 s: a pause that long ends the turn, and with it the take. Stop does not
 *  wait for it (`VoiceCallHost.endInput`). */
const TAKE_SILENCE = { kind: 'silence', ms: 1500 };
/** The patience it asks with whatever the person's is: it also sets how long a finished turn waits for the next to join
 *  it, which a take that ends at its first turn must not depend on. */
const TAKE_PATIENCE = 'normal';
/** The longest take, from when the voice listens: past it, talking or not, the take ends there and what was said is
 *  transcribed — `VoiceCallHost.endInput` closes the open turn with what was said. */
export const MAX_TAKE_MS = 10_000;

/** A monotonic clock where there is one (pages, workers), else the wall clock. */
const now = () => globalThis.performance?.now?.() ?? Date.now();

/**
 * The take of a try: requested only when the UI wants it (`options`, for the start of each call). A take from a retuned
 * listening stretch is discarded; the latest take is handed over after the voice stops.
 * @param {((take: import('@sidevoice/voice').VoiceTake) => void) | undefined} onTake
 * @param {() => boolean} [dropping]
 */
function takeOf(onTake, dropping = () => false) {
  let latest = null;
  return {
    options: onTake ? { take: true } : undefined,
    /** Listens to `call` for its take; returns how to stop. */
    listen: (call) => (onTake ? call.onTake((take) => { if (!dropping()) latest = take; }) : () => {}),
    hand() { const take = latest; latest = null; if (take) onTake(take); },
  };
}

/** What a try starts calls on: the voice's host, or anything that starts a call as it does.
 * @typedef {{start(settings: import('@sidevoice/voice').VoiceSettings, options?: {take?: boolean}): import('@sidevoice/voice').VoiceCallHost}} TrialHost */

/** A step of the person's turns as a try of the end of turn tells it (`tryEndOfTurn`): `listening` once the voice
 * listens (`again` after other settings restarted it), `restarting` while they do; within a turn, `speaking` and
 * `pause` (the voice no longer hears speech, and the turn has not ended); `ended`, the moment the voice decided the turn
 * ended (its transcription starts); `heard`, its words and how long a silence the voice waited before ending it (its own
 * figure); `not-a-turn`, a turn that ended with no words, or that the voice dropped.
 * @typedef {{step: 'listening', again: boolean} | {step: 'restarting'} | {step: 'speaking'} | {step: 'pause'} | {step: 'ended'}
 *   | {step: 'heard', text: string, endpoint_silence_ms: number | null} | {step: 'not-a-turn'}} TurnStep */

/** How long leaving a try waits for its live take to be closed before the voice is stopped anyway. */
const LEAVE_TAKE_MS = 1000;

/** A failure of a try itself: `trial-silence` (nothing usable heard in time), `trial-cancelled`, `trial-not-heard`. */
function trialError(code, detail) {
  return Object.assign(new Error(code), { code }, detail ? { detail } : {});
}

/** `error` as the try's own failure: its code where it has one, else `transcription-failed`. */
function failureOf(error) {
  const code = /** @type {{code?: unknown} | null | undefined} */ (error)?.code;
  if (typeof code === 'string' && code) return error;
  return trialError('transcription-failed', error instanceof Error ? error.message : undefined);
}

/** `promise`, or `signal`'s abort and the time limit first, as a try's own failures. */
function bounded(promise, { signal, timeoutMs, timeoutCode = 'trial-silence' }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (answer, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      answer(value);
    };
    const timer = setTimeout(() => finish(reject, trialError(typeof timeoutCode === 'function' ? timeoutCode() : timeoutCode)), timeoutMs);
    const abort = () => finish(reject, trialError('trial-cancelled'));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    promise.then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}

/**
 * Words the person says, through `settings`: a call of the input half alone listens (`TAKE_SILENCE`), and the take goes
 * on until Stop (`finish` aborts), `maxTakeMs`, or the voice ending the person's turn on its own (a pause as long as
 * `TAKE_SILENCE`'s), talking or not. Stop and the longest take end the turn open at once with what was said (`endInput`); the result is that
 * turn's words, and a take with none — nothing said, or a turn that
 * came to nothing — is `trial-silence`. Stop before the voice listens is a cancel (nothing recorded yet), as is Stop
 * once the take has ended; an error of the voice ends the try with it. Closing the take is one operation, done once
 * whatever ends the try: further microphone input is fenced off from the voice first (`fence`, awaited: the page
 * routes the microphone away), so speech after the take cannot join its words, then the open turn is closed
 * (`endInput`). A voice without `endInput`, or one that refuses, fails the try (`voice-module-unavailable`, or its own
 * code) instead of reporting silence; leaving a live take that way never keeps the voice from stopping.
 * @param {TrialHost} host
 * @param {import('./voice-settings.js').DeviceVoiceSettings} settings
 * `onTimings`, once heard: how long the voice took to be ready, and how long transcribing took — not how the take
 * ended, which is End of turn's. As it goes: `onListening` once the voice hears the microphone (its models loaded, the
 * microphone open), and `onLevel`, the microphone's level from 0 to 1 as the voice measures it. `onTranscribing`, once,
 * as the take ends and what was said is being transcribed — the microphone no longer counts then.
 * `onTake`, once the voice has stopped (heard, failed or cancelled): what the microphone gave it, where the voice hands
 * one, up to where the take ended — not what the voice went on recording while it transcribed.
 * @param {{signal?: AbortSignal, finish?: AbortSignal, timeoutMs?: number, maxTakeMs?: number, onState?: (state: import('@sidevoice/voice').VoiceCallState) => void, onTimings?: (timings: TrialTimings) => void, onListening?: () => void, onLevel?: (level: number) => void, onTranscribing?: (transcribing: boolean) => void, onTake?: (take: import('@sidevoice/voice').VoiceTake) => void, fence?: () => Promise<void>}} [options]
 * @returns {Promise<string>}
 */
export async function tryTranscription(host, settings, { signal, finish, timeoutMs = 20000, maxTakeMs = MAX_TAKE_MS, onState, onTimings, onListening, onLevel, onTranscribing, onTake, fence } = {}) {
  const deadline = now() + timeoutMs;
  const stops = [];
  let readyMs = null;
  // Where the take ended, in Unix ms: the take handed stops there.
  let endedAt = null;
  const recorder = takeOf(onTake && ((take) => onTake(endedAt == null ? take : takeUpTo(take, endedAt))));
  // The try's call: made once the try begins (a start that throws leaves none).
  let voice = null, stopTake = () => {};
  // Whether the voice listens for the try, and whether the try is over: a start that comes late tells nothing.
  let listening = false, closed = false;
  // Whether the take has ended, and whether a turn of the person's is in it, open or not told yet.
  let ended = false, open = false;
  let tooLong = null;
  let stopped = null;
  // Nothing heard: no turn in the take, or one that came to no words; and the try failed.
  let nothing = () => {};
  let fail = () => {};
  // Fences further microphone input off from this call, once, and closes the open turn, once (the voice does nothing
  // without one). Both are told by the voice or the page as promises, whatever they throw is the try's failure.
  let fencing = null, closing = null;
  const fenceInput = () => (fencing ??= (async () => { await fence?.(); })());
  const closeTake = () => (closing ??= (async () => {
    await fenceInput();
    if (typeof voice.endInput !== 'function') throw trialError('voice-module-unavailable');
    await voice.endInput();
  })().catch((error) => { throw failureOf(error); }));
  // Ends the take where it stands; before the voice listens there is none to end. The voice's own end of the person's
  // turn needs no closing, but what the person says next must not join it.
  const endTake = (byVoice = true) => {
    if (!listening || ended) return false;
    ended = true;
    endedAt = Date.now();
    onTranscribing?.(true);
    if (byVoice) fenceInput().catch((error) => fail(failureOf(error)));
    return true;
  };
  // Stop or the longest take: the take ends and the turn open in it closes now; with no turn in it, nothing was heard
  // once the voice has said so.
  const finishTake = () => {
    if (!endTake(false)) return false;
    closeTake().then(() => { if (!open) nothing(); }, (error) => fail(error));
    return true;
  };
  // The try over with a take live (a turn open, not ended): it closes like any other, whatever the end, and the
  // end's own result is kept.
  const leaveTake = async () => {
    if (!voice || !listening || ended || !open) return;
    ended = true;
    let timer;
    await Promise.race([closeTake().catch(() => {}), new Promise((done) => { timer = setTimeout(done, LEAVE_TAKE_MS); })]);
    clearTimeout(timer);
  };
  try {
    voice = host.start({ input: voiceInput({ ...settings, patience: TAKE_PATIENCE }, TAKE_SILENCE), idle_unload_minutes: settings.idle_unload_minutes }, recorder.options);
    stopTake = recorder.listen(voice);
    const heard = new Promise((resolve, reject) => {
      nothing = () => reject(trialError('trial-silence'));
      fail = reject;
      stops.push(voice.onTurn((turn) => {
        if (turn.phase === 'started') { open = true; return; }
        // Joined into the next turn, which tells its words.
        if (turn.phase === 'cancelled' && turn.merged) return;
        open = false;
        // Told, it ends the take if the voice's own end of it has not yet.
        endTake();
        const text = turn.phase === 'finished' ? String(turn.text ?? '').trim() : '';
        if (!text) return nothing();
        // Its own times only: how the take ended is not this try's.
        onTimings?.({ ready_ms: readyMs, recognition_ms: turn.timings?.recognition_ms ?? null });
        resolve(text);
      }));
      stops.push(voice.onError(reject));
    });
    // Its failure before the voice even listens is the start's to report; this one must not go unheard.
    heard.catch(() => {});
    stops.push(voice.onState((state) => {
      // The voice ended the person's turn on its own (its transcription starts): the take ends there.
      if (state.recognising > 0) endTake();
      onState?.(state);
    }));
    if (onLevel) stops.push(voice.onLevel(onLevel));
    const starting = now();
    const listened = voice.ready.then(() => {
      if (closed) return heard;
      readyMs = Math.round(now() - starting);
      listening = true;
      onListening?.();
      tooLong = setTimeout(finishTake, maxTakeMs);
      return heard;
    });
    const asked = new Promise((_, reject) => {
      stopped = () => { if (!finishTake()) reject(trialError('trial-cancelled')); };
      if (finish?.aborted) stopped(); else finish?.addEventListener('abort', stopped, { once: true });
    });
    asked.catch(() => {});
    return await bounded(Promise.race([listened, asked]), { signal, timeoutMs: Math.max(0, deadline - now()) + maxTakeMs,
      timeoutCode: () => listening ? 'trial-silence' : 'trial-preparation-timeout' });
  } finally {
    closed = true;
    clearTimeout(tooLong);
    if (stopped) finish?.removeEventListener('abort', stopped);
    for (const stop of stops) stop();
    await leaveTake();
    await Promise.race([voice?.stop().catch(() => {}), new Promise((done) => setTimeout(done, LEAVE_TAKE_MS))]);
    // The take is handed by the voice as it stops: its listener goes after.
    stopTake();
    recorder.hand();
  }
}

/** `take` up to Unix ms `at`, where the try ended it: what the voice recorded after it is not the person's. */
function takeUpTo(take, at) {
  const length = Math.max(0, Math.min(take.samples.length, Math.round(((at - take.started_at) * take.sampleRate) / 1000)));
  if (length === take.samples.length) return take;
  return { ...take, samples: take.samples.slice(0, length), ended_at: take.started_at + Math.round((length * 1000) / take.sampleRate) };
}

/**
 * `text` said through `settings`, in `language`: a call of the output half alone — no microphone is asked for, no
 * detector, transcriber or end-of-turn model is loaded — says it, and the try succeeds once it was heard to its end.
 * Cut short or not played, it fails with why (the voice's own code when it failed).
 * @param {TrialHost} host
 * @param {import('./voice-settings.js').DeviceVoiceSettings} settings
 * @param {string} text
 * `onTimings`, once heard: how long the voice took to be ready, and from asking it to speak to its first sound.
 * `onProgress`, from that first sound on: where the voice is in `text`, in the voice's own count of its characters —
 * the part sounding now (`sounding`, [from, to)), or `null` between parts — and how much of it was heard. The first
 * sound is `{sounding: null, heard_chars: 0}`.
 * @param {{language?: string | null, signal?: AbortSignal, timeoutMs?: number, onTimings?: (timings: TrialTimings) => void, onProgress?: (progress: {sounding: [number, number] | null, heard_chars: number}) => void}} [options]
 */
export async function tryVoice(host, settings, text, { language = null, signal, timeoutMs = 60000, onTimings, onProgress } = {}) {
  let voice = null, saying = null;
  let readyMs = null, firstSoundMs = null;
  try {
    const starting = now();
    voice = host.start(voiceHalves(settings, { input: false }));
    const outcome = await bounded(voice.ready.then(() => {
      readyMs = Math.round(now() - starting);
      const asked = now();
      saying = voice.say(text, language ? { language } : undefined);
      saying.onEvent?.((event) => {
        if (event.type === 'playing' && firstSoundMs === null) { firstSoundMs = Math.round(now() - asked); onProgress?.({ sounding: null, heard_chars: 0 }); }
        if (event.type === 'progress') onProgress?.({ sounding: event.sounding, heard_chars: event.heard_chars });
      });
      return saying.outcome;
    }), { signal, timeoutMs });
    if (outcome.status === 'heard') { onTimings?.({ ready_ms: readyMs, first_sound_ms: firstSoundMs }); return outcome; }
    throw outcome.reason === 'failed' ? trialError(outcome.code || 'trial-not-heard') : trialError('trial-not-heard', outcome.reason);
  } catch (error) {
    saying?.cancel();
    throw error;
  } finally {
    await voice?.stop().catch(() => {});
  }
}

/**
 * The end of turn of `settings` as the person tries it: a call of the input half alone — the end of turn and patience of
 * `settings`, Smart's model among them — listens, and the turns the person takes are told as they go (`onTurnStep`, TurnStep) — only the latest: a turn that starts drops whatever an earlier
 * one tells late. A pause is the voice's state going from speaking back to listening within a turn; the end, its count
 * of turns in transcription rising (or the turn finishing, where that never shows). It listens until `signal` aborts
 * (`trial-cancelled`), `quietMs` pass with no speech (`trial-silence`) or the voice fails (its error); then the voice
 * stops, whatever happens. `closeMic` is called when the voice decides a turn ended, so the microphone is closed from
 * then on; `openMic`, when that turn came to no words, so the try goes on listening. `onLevel`: the microphone's level from 0 to 1, as the voice measures it. `onTake`, once the
 * voice has stopped: what the microphone gave it since it last started to listen; what it heard before other settings is theirs, and goes with them.
 *
 * `retune` puts other settings in place while it runs: the turn in progress is dropped, its call stops, and another
 * starts on them and listens again (the models it needs are the voice's already). Asked again while it does, it goes on
 * with the latest; the same input half changes nothing.
 * @param {TrialHost} host
 * @param {import('./voice-settings.js').DeviceVoiceSettings} settings
 * @param {{signal?: AbortSignal, quietMs?: number, closeMic?: () => Promise<void>, openMic?: () => Promise<void>, onLevel?: (level: number) => void, onTurnStep?: (step: TurnStep) => void, onTake?: (take: import('@sidevoice/voice').VoiceTake) => void}} [options]
 * @returns {{done: Promise<void>, retune: (settings: import('./voice-settings.js').DeviceVoiceSettings) => Promise<void>}} `done`
 *   settles once the try is over and the voice stopped, rejecting with why it ended.
 */
export function tryEndOfTurn(host, settings, { signal, quietMs = 30000, closeMic, openMic, onLevel, onTurnStep, onTake } = {}) {
  const tell = (step) => onTurnStep?.(step);
  // While the voice stops for other settings: the take it hands then is theirs.
  let retuning = false;
  // Unix ms when the voice decided the latest turn ended, while nothing has been said since: the take stops there, so
  // what the voice recorded while it transcribed (the turn is over; the microphone is not the person's) is not in it.
  let decidedAt = null;
  const take = takeOf(onTake && ((taken) => onTake(decidedAt == null ? taken : takeUpTo(taken, decidedAt))), () => retuning);
  /** @type {(reason: unknown) => void} */
  let end = () => {};
  const over = new Promise((_, reject) => { end = reject; });
  over.catch(() => {});
  // What the voice last said of itself, and the turn followed (the latest started): whether its end was decided, and
  // the last step told of it.
  let listening = 'idle', recognising = 0;
  /** @type {{id: string, decided: boolean, step: string | null} | null} */
  let turn = null;
  // Whether the voice listens for the try: not while it starts, or starts again; and whether the try is over.
  let live = false, finished = false;
  let quiet = null;
  const hush = () => { clearTimeout(quiet); quiet = null; };
  // The quiet starts over each time speech stops.
  const wait = () => { hush(); quiet = setTimeout(() => end(trialError('trial-silence')), quietMs); };
  // The turn ended: the microphone closes, so nothing after it is recorded. If its words come to nothing, it opens again.
  const shut = () => { Promise.resolve(closeMic?.()).catch((error) => end(error)); };
  const reopen = () => { if (live) Promise.resolve(openMic?.()).catch((error) => end(error)); };
  const told = (step) => { if (turn && turn.step !== step) { turn.step = step; tell({ step }); } };

  // The call now open, and what listens to it (its events, and its take apart: the voice hands the take as it stops).
  let call = null, listeners = [], stopTake = () => {};
  const attach = (opened) => {
    call = opened;
    stopTake = take.listen(opened);
    listeners = [
      opened.onState((state) => {
        const was = listening, rose = state.recognising > recognising;
        listening = state.listening;
        recognising = state.recognising;
        if (!live) return;
        if (listening === 'speaking') hush();
        else if (was === 'speaking') wait();
        if (!turn || turn.decided) return;
        if (rose) { turn.decided = true; decidedAt = Date.now(); told('ended'); shut(); }
        else if (listening === 'speaking') told('speaking');
        else if (was === 'speaking') told('pause');
      }),
      opened.onTurn((event) => {
        if (!live) return;
        if (event.phase === 'started') {
          turn = { id: event.turn_id, decided: false, step: null };
          decidedAt = null;
          hush();
          told('speaking');
          return;
        }
        if (event.turn_id !== turn?.id) return;
        turn = null;
        wait();
        const text = event.phase === 'finished' ? String(event.text ?? '').trim() : '';
        if (!text) { decidedAt = null; reopen(); }
        if (text) tell({ step: 'heard', text, endpoint_silence_ms: event.timings?.endpoint_silence_ms ?? null });
        // Joined into the next turn, which tells it.
        else if (!(event.phase === 'cancelled' && event.merged)) tell({ step: 'not-a-turn' });
      }),
      opened.onError((error) => end(error)),
      ...(onLevel ? [opened.onLevel(onLevel)] : []),
    ];
  };
  /** Stops the call open, if any, and lets go of what listens to it: its events first when `quietly` (the try is
   *  over), after the stop otherwise (a retune). Its take, handed as it stops, is the try's unless it is retuned. */
  async function closeCall(quietly = false) {
    const closing = call, heard = listeners, handedTo = stopTake;
    call = null;
    listeners = [];
    stopTake = () => {};
    if (!closing) return;
    if (quietly) for (const stop of heard) stop();
    await closing.stop().catch(() => {});
    if (!quietly) for (const stop of heard) stop();
    handedTo();
  }

  let current = settings;
  /** @type {import('./voice-settings.js').DeviceVoiceSettings | null} */
  let wanted = null;
  /** @type {Promise<void> | null} */
  let opening = null;
  // Whether a start under way still takes what `retune` asks for: until its loop ends, not until its promise settles.
  let starting = false;
  /** The voice started with `current` (the call before it stopped first: `again`), then with what was asked for meanwhile. */
  async function open(again) {
    live = false;
    turn = null;
    hush();
    starting = true;
    for (;;) {
      if (again) {
        retuning = true;
        await closeCall().finally(() => { retuning = false; });
        if (finished) return;
      }
      attach(host.start({ input: voiceInput(current), idle_unload_minutes: current.idle_unload_minutes }, take.options));
      await call.ready;
      if (finished) return;
      if (!wanted) break;
      current = wanted;
      wanted = null;
      again = true;
    }
    starting = false;
    if (finished) return;
    live = true;
    wait();
    tell({ step: 'listening', again });
  }
  const opened = (again) => {
    const mine = open(again).catch(end).finally(() => { if (opening === mine) opening = null; });
    return (opening = mine);
  };

  /** The input half a call listens with, to tell whether other settings change it. */
  const listeningWith = (settings) => JSON.stringify(voiceInput(settings));
  /** @param {import('./voice-settings.js').DeviceVoiceSettings} next */
  function retune(next) {
    if (finished || listeningWith(next) === listeningWith(wanted ?? current)) return opening ?? Promise.resolve();
    if (starting) { wanted = next; return opening; }
    current = next;
    tell({ step: 'restarting' });
    return opened(true);
  }

  const abort = () => end(trialError('trial-cancelled'));
  const done = (async () => {
    try {
      if (signal?.aborted) throw trialError('trial-cancelled');
      signal?.addEventListener('abort', abort, { once: true });
      opened(false);
      await over;
    } finally {
      finished = true;
      live = false;
      hush();
      signal?.removeEventListener('abort', abort);
      // A restart already in flight must settle before the final stop: otherwise it can reopen the microphone
      // after this try has reported cancellation and removed its take listener.
      await opening?.catch(() => {});
      await closeCall(true);
      take.hand();
    }
  })();
  return { done, retune };
}
