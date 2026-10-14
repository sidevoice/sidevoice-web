/* Trying this device's voice settings for real, through the call's own voice (@sidevoice/voice's `VoiceHost`, or the
 * desktop app's): the microphone and the chosen transcriber for words the person says, the chosen speaker for a
 * sentence they hear, the chosen end of turn for the turns they take. No room, no agent, no conversation: a try opens
 * the voice, waits for its result — one, or each turn as it comes until stopped — and stops it, whatever happens. A
 * try is cancellable, bounded in time, and fails by a stable code. */

/** How long a try's phases took, in ms (null where the voice did not say). Transcription: `ready_ms`,
 * `recognition_ms`; voice: `ready_ms`, `first_sound_ms`.
 * @typedef {{ ready_ms: number | null, audio_ms?: number | null, endpoint_silence_ms?: number | null, recognition_ms?: number | null, first_sound_ms?: number | null }} TrialTimings */

/** A transcription try ends the take on a plain short silence: when a turn ends is End of turn's to choose and to try,
 *  not this one's (its Smart model, its patience). The voice's shortest is 2 s of silence (`fast`); 1.5 s, as the
 *  operator asked, waits on the voice taking a silence of its own per call (contract gap). */
const TAKE_ENDS = { end_of_turn: 'silence', patience: 'fast' };
/** A voice try says a sentence and ends no turn, so it asks for no end-of-turn model: the voice loads every model its
 *  settings name, downloading what is not on disk, and with Smart it would fetch Smart's model behind the catalogue the
 *  page shows — End of turn would then offer to download a model already on disk, and this try's ready time would
 *  include that download. End of turn downloads its model, with progress, and tries it itself. */
const SAY_ENDS = { end_of_turn: 'silence' };
/** The longest take, from when the voice listens: past it, still talking, the take ends there and what was said is
 *  transcribed — the voice's mute ends the open turn with what was said (`VoiceHost.mute`). */
export const MAX_TAKE_MS = 10_000;

/** A monotonic clock where there is one (pages, workers), else the wall clock. */
const now = () => globalThis.performance?.now?.() ?? Date.now();

/**
 * The take of a try: requested only when the UI wants it. A take from a retuned listening stretch is discarded;
 * the latest take is handed over after the voice stops.
 * @param {import('@sidevoice/voice').VoiceHost} voice
 * @param {((take: import('@sidevoice/voice').VoiceTake) => void) | undefined} onTake
 * @param {() => boolean} [dropping]
 */
function takeOf(voice, onTake, dropping = () => false) {
  const asked = !!onTake;
  let latest = null;
  const stop = asked ? voice.onTake((take) => { if (!dropping()) latest = take; }) : () => {};
  return {
    listening: () => (asked ? voice.start({ take: true }) : voice.start()),
    hand() { const take = latest; latest = null; if (take) onTake(take); },
    stop,
  };
}

/** A step of the person's turns as a try of the end of turn tells it (`tryEndOfTurn`): `listening` once the voice
 * listens (`again` after other settings restarted it), `restarting` while they do; within a turn, `speaking` and
 * `pause` (the voice no longer hears speech, and the turn has not ended); `ended`, the moment the voice decided the turn
 * ended (its transcription starts); `heard`, its words and how long a silence the voice waited before ending it (its own
 * figure); `not-a-turn`, a turn that ended with no words, or that the voice dropped.
 * @typedef {{step: 'listening', again: boolean} | {step: 'restarting'} | {step: 'speaking'} | {step: 'pause'} | {step: 'ended'}
 *   | {step: 'heard', text: string, endpoint_silence_ms: number | null} | {step: 'not-a-turn'}} TurnStep */

/** A failure of a try itself: `trial-silence` (nothing usable heard in time), `trial-cancelled`, `trial-not-heard`. */
function trialError(code, detail) {
  return Object.assign(new Error(code), { code }, detail ? { detail } : {});
}

/** `promise`, or `signal`'s abort and the time limit first, as a try's own failures. */
function bounded(promise, { signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(trialError('trial-silence')), timeoutMs);
    const abort = () => reject(trialError('trial-cancelled'));
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => { clearTimeout(timer); signal?.removeEventListener('abort', abort); });
  });
}

/**
 * Words the person says, through `settings`: the voice is set to them, listens, and the first turn it finishes with
 * words is the result. A turn with none (a cough, a merge) is not one; an error of the voice ends the try with it.
 * @param {import('@sidevoice/voice').VoiceHost} voice
 * @param {import('@sidevoice/voice').VoiceSettings} settings
 * `onTimings`, once heard: how long the voice took to be ready, and how long transcribing took — not how the take
 * ended (on a short silence, `TAKE_ENDS`), which is End of turn's. As it goes: `onListening` once the voice hears the
 * microphone (its models loaded, the microphone open), and `onLevel`, the microphone's level from 0 to 1 as the voice
 * measures it. The take ends on its silence, at `maxTakeMs`, or when `finish` aborts (Stop): those last two end it with
 * what was said, by muting (unmuted again after); with no turn of the person's open, `finish` is a cancel (nothing to
 * transcribe). A take ended so whose turn comes to no words is `trial-silence` at once: the voice hears no more.
 * `onTranscribing`, each time it changes: whether the take has ended and what was said is being transcribed (Stop, the
 * longest take, or the voice's own end of the turn) — the microphone no longer counts then.
 * `onTake`, once the voice has stopped (heard, failed or cancelled): what the microphone gave it.
 * @param {{signal?: AbortSignal, finish?: AbortSignal, timeoutMs?: number, maxTakeMs?: number, onState?: (state: import('@sidevoice/voice').VoiceCallState) => void, onTimings?: (timings: TrialTimings) => void, onListening?: () => void, onLevel?: (level: number) => void, onTranscribing?: (transcribing: boolean) => void, onTake?: (take: import('@sidevoice/voice').VoiceTake) => void}} [options]
 * @returns {Promise<string>}
 */
export async function tryTranscription(voice, settings, { signal, finish, timeoutMs = 20000, maxTakeMs = MAX_TAKE_MS, onState, onTimings, onListening, onLevel, onTranscribing, onTake } = {}) {
  const stops = [];
  let readyMs = null;
  const recorder = takeOf(voice, onTake);
  // Recognising: a turn has ended and is being transcribed; the longest take no longer cuts it.
  let recognising = false;
  // The person's turn open now (the voice's id for it, or its state speaking): what Stop and the longest take end. A
  // silent microphone is the try's own timeout (`trial-silence`); a turn that came to nothing (a cough) is over.
  let open = null;
  let speaking = false;
  let tooLong = null;
  let muted = false;
  let stopped = null;
  // Told once per change: the take ended (muted by the try) or a turn of it being transcribed.
  let transcribing = false;
  const tell = () => { const now = muted || recognising; if (now !== transcribing) { transcribing = now; onTranscribing?.(now); } };
  // Ends the take with what was said; no turn open, there is nothing to end (Stop is then a cancel).
  const endTake = () => { if (!(open || speaking) || recognising || muted) return false; muted = true; voice.mute(true); tell(); return true; };
  try {
    await voice.setSettings({ ...settings, ...TAKE_ENDS });
    const heard = new Promise((resolve, reject) => {
      stops.push(voice.onTurn((turn) => {
        if (turn.phase === 'started') { open = turn.turn_id ?? true; return; }
        if (turn.turn_id === open || open === true) open = null;
        const text = turn.phase === 'finished' ? String(turn.text ?? '').trim() : '';
        if (!text) {
          // The take was ended and its turn came to nothing: muted, the voice hears no more, so nothing will come.
          if (muted && !(turn.phase === 'cancelled' && turn.merged)) reject(trialError('trial-silence'));
          return;
        }
        // Its own times only: how the take ended is not this try's.
        onTimings?.({ ready_ms: readyMs, recognition_ms: turn.timings?.recognition_ms ?? null });
        resolve(text);
      }));
      stops.push(voice.onError(reject));
    });
    // Its failure before the voice even listens is the start's to report; this one must not go unheard.
    heard.catch(() => {});
    stops.push(voice.onState((state) => {
      recognising = state.recognising > 0;
      if (state.listening !== 'muted') speaking = state.listening === 'speaking';
      tell();
      onState?.(state);
    }));
    if (onLevel) stops.push(voice.onLevel(onLevel));
    const starting = now();
    const listened = recorder.listening().then(() => {
      readyMs = Math.round(now() - starting);
      onListening?.();
      tooLong = setTimeout(endTake, maxTakeMs);
      return heard;
    });
    const asked = new Promise((_, reject) => {
      stopped = () => { if (!endTake()) reject(trialError('trial-cancelled')); };
      if (finish?.aborted) stopped(); else finish?.addEventListener('abort', stopped, { once: true });
    });
    asked.catch(() => {});
    return await bounded(Promise.race([listened, asked]), { signal, timeoutMs: timeoutMs + maxTakeMs });
  } finally {
    clearTimeout(tooLong);
    if (stopped) finish?.removeEventListener('abort', stopped);
    if (muted) voice.mute(false);
    for (const stop of stops) stop();
    await voice.stop().catch(() => {});
    recorder.stop();
    recorder.hand();
  }
}

/**
 * `text` said through `settings`, in `language`: the voice is set to them (its end of turn aside: `SAY_ENDS`) and
 * started, says it, and the try succeeds once it was heard to its end. Cut short or not played, it fails with why (the
 * voice's own code when it failed).
 * @param {import('@sidevoice/voice').VoiceHost} voice
 * @param {import('@sidevoice/voice').VoiceSettings} settings
 * @param {string} text
 * `onTimings`, once heard: how long the voice took to be ready, and from asking it to speak to its first sound.
 * `onProgress`, from that first sound on: where the voice is in `text`, in the voice's own count of its characters —
 * the part sounding now (`sounding`, [from, to)), or `null` between parts — and how much of it was heard. The first
 * sound is `{sounding: null, heard_chars: 0}`.
 * @param {{language?: string | null, signal?: AbortSignal, timeoutMs?: number, onTimings?: (timings: TrialTimings) => void, onProgress?: (progress: {sounding: [number, number] | null, heard_chars: number}) => void}} [options]
 */
export async function tryVoice(voice, settings, text, { language = null, signal, timeoutMs = 60000, onTimings, onProgress } = {}) {
  let saying = null;
  let readyMs = null, firstSoundMs = null;
  try {
    await voice.setSettings({ ...settings, ...SAY_ENDS });
    const starting = now();
    const outcome = await bounded(voice.start().then(() => {
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
    await voice.stop().catch(() => {});
  }
}

/**
 * The end of turn of `settings` as the person tries it: the voice is set to them and listens, and the turns the person
 * takes are told as they go (`onTurnStep`, TurnStep) — only the latest: a turn that starts drops whatever an earlier
 * one tells late. A pause is the voice's state going from speaking back to listening within a turn; the end, its count
 * of turns in transcription rising (or the turn finishing, where that never shows). It listens until `signal` aborts
 * (`trial-cancelled`), `quietMs` pass with no speech (`trial-silence`) or the voice fails (its error); then the voice
 * stops, whatever happens. `onLevel`: the microphone's level from 0 to 1, as the voice measures it. `onTake`, once the
 * voice has stopped: what the microphone gave it since it last started to listen; what it heard before other settings is theirs, and goes with them.
 *
 * `retune` puts other settings in place while it runs: the voice takes a patience or an end of turn only as it starts,
 * so the turn in progress is dropped, the voice stops, takes them, and listens again. Asked again while it does, it
 * goes on with the latest; the same settings change nothing.
 * @param {import('@sidevoice/voice').VoiceHost} voice
 * @param {import('@sidevoice/voice').VoiceSettings} settings
 * @param {{signal?: AbortSignal, quietMs?: number, onLevel?: (level: number) => void, onTurnStep?: (step: TurnStep) => void, onTake?: (take: import('@sidevoice/voice').VoiceTake) => void}} [options]
 * @returns {{done: Promise<void>, retune: (settings: import('@sidevoice/voice').VoiceSettings) => Promise<void>}} `done`
 *   settles once the try is over and the voice stopped, rejecting with why it ended.
 */
export function tryEndOfTurn(voice, settings, { signal, quietMs = 30000, onLevel, onTurnStep, onTake } = {}) {
  const tell = (step) => onTurnStep?.(step);
  // While the voice stops for other settings: the take it hands then is theirs.
  let retuning = false;
  const take = takeOf(voice, onTake, () => retuning);
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
  const told = (step) => { if (turn && turn.step !== step) { turn.step = step; tell({ step }); } };

  const stops = [
    voice.onState((state) => {
      const was = listening, rose = state.recognising > recognising;
      listening = state.listening;
      recognising = state.recognising;
      if (!live) return;
      if (listening === 'speaking') hush();
      else if (was === 'speaking') wait();
      if (!turn || turn.decided) return;
      if (rose) { turn.decided = true; told('ended'); }
      else if (listening === 'speaking') told('speaking');
      else if (was === 'speaking') told('pause');
    }),
    voice.onTurn((event) => {
      if (!live) return;
      if (event.phase === 'started') {
        turn = { id: event.turn_id, decided: false, step: null };
        hush();
        told('speaking');
        return;
      }
      if (event.turn_id !== turn?.id) return;
      turn = null;
      wait();
      const text = event.phase === 'finished' ? String(event.text ?? '').trim() : '';
      if (text) tell({ step: 'heard', text, endpoint_silence_ms: event.timings?.endpoint_silence_ms ?? null });
      // Joined into the next turn, which tells it.
      else if (!(event.phase === 'cancelled' && event.merged)) tell({ step: 'not-a-turn' });
    }),
    voice.onError((error) => end(error)),
    ...(onLevel ? [voice.onLevel(onLevel)] : []),
  ];

  let current = settings;
  /** @type {import('@sidevoice/voice').VoiceSettings | null} */
  let wanted = null;
  /** @type {Promise<void> | null} */
  let opening = null;
  /** The voice started with `current` (stopped first when it ran: `again`), then with what was asked for meanwhile. */
  async function open(again) {
    live = false;
    turn = null;
    hush();
    for (;;) {
      if (again) {
        retuning = true;
        await voice.stop().finally(() => { retuning = false; });
        if (finished) return;
      }
      await voice.setSettings(current);
      if (finished) return;
      await take.listening();
      if (finished) return;
      if (!wanted) break;
      current = wanted;
      wanted = null;
      again = true;
    }
    if (finished) return;
    live = true;
    wait();
    tell({ step: 'listening', again });
  }
  const opened = (again) => (opening = open(again).catch(end).finally(() => { opening = null; }));

  /** @param {import('@sidevoice/voice').VoiceSettings} next */
  function retune(next) {
    if (finished || JSON.stringify(next) === JSON.stringify(wanted ?? current)) return opening ?? Promise.resolve();
    if (opening) { wanted = next; return opening; }
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
      for (const stop of stops) stop();
      // A restart already in flight must settle before the final stop: otherwise it can reopen the microphone
      // after this try has reported cancellation and removed its take listener.
      await opening?.catch(() => {});
      await voice.stop().catch(() => {});
      take.stop();
      take.hand();
    }
  })();
  return { done, retune };
}
