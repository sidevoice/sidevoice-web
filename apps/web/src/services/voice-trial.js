/* Trying this device's voice settings for real, through the call's own voice (@sidevoice/voice's `VoiceHost`, or the
 * desktop app's): the microphone and the chosen transcriber for words the person says, the chosen speaker for a
 * sentence they hear. No room, no agent, no conversation: a try opens the voice, waits for its one result and stops it,
 * whatever happens. A try is cancellable, bounded in time, and fails by a stable code. */

/** How long a try's phases took, in ms (null where the voice did not say). Transcription: `ready_ms`, `audio_ms`,
 * `endpoint_silence_ms`, `recognition_ms`; voice: `ready_ms`, `first_sound_ms`.
 * @typedef {{ ready_ms: number | null, audio_ms?: number | null, endpoint_silence_ms?: number | null, recognition_ms?: number | null, first_sound_ms?: number | null }} TrialTimings */

/** A monotonic clock where there is one (pages, workers), else the wall clock. */
const now = () => globalThis.performance?.now?.() ?? Date.now();

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
 * `onTimings`, once heard: how long the voice took to be ready, and the turn's own (the speech, the pause waited for,
 * the recognition).
 * @param {{signal?: AbortSignal, timeoutMs?: number, onState?: (state: import('@sidevoice/voice').VoiceCallState) => void, onTimings?: (timings: TrialTimings) => void}} [options]
 * @returns {Promise<string>}
 */
export async function tryTranscription(voice, settings, { signal, timeoutMs = 20000, onState, onTimings } = {}) {
  const stops = [];
  let readyMs = null;
  try {
    await voice.setSettings(settings);
    const heard = new Promise((resolve, reject) => {
      stops.push(voice.onTurn((turn) => {
        const text = turn.phase === 'finished' ? String(turn.text ?? '').trim() : '';
        if (!text) return;
        onTimings?.({ ready_ms: readyMs, audio_ms: turn.timings?.audio_ms ?? null, endpoint_silence_ms: turn.timings?.endpoint_silence_ms ?? null, recognition_ms: turn.timings?.recognition_ms ?? null });
        resolve(text);
      }));
      stops.push(voice.onError(reject));
    });
    // Its failure before the voice even listens is the start's to report; this one must not go unheard.
    heard.catch(() => {});
    if (onState) stops.push(voice.onState(onState));
    const starting = now();
    return await bounded(voice.start().then(() => { readyMs = Math.round(now() - starting); return heard; }), { signal, timeoutMs });
  } finally {
    for (const stop of stops) stop();
    await voice.stop().catch(() => {});
  }
}

/**
 * `text` said through `settings`, in `language`: the voice is set to them and started, says it, and the try succeeds
 * once it was heard to its end. Cut short or not played, it fails with why (the voice's own code when it failed).
 * @param {import('@sidevoice/voice').VoiceHost} voice
 * @param {import('@sidevoice/voice').VoiceSettings} settings
 * @param {string} text
 * `onTimings`, once heard: how long the voice took to be ready, and from asking it to speak to its first sound.
 * @param {{language?: string | null, signal?: AbortSignal, timeoutMs?: number, onTimings?: (timings: TrialTimings) => void}} [options]
 */
export async function tryVoice(voice, settings, text, { language = null, signal, timeoutMs = 60000, onTimings } = {}) {
  let saying = null;
  let readyMs = null, firstSoundMs = null;
  try {
    await voice.setSettings(settings);
    const starting = now();
    const outcome = await bounded(voice.start().then(() => {
      readyMs = Math.round(now() - starting);
      const asked = now();
      saying = voice.say(text, language ? { language } : undefined);
      saying.onEvent?.((event) => { if (event.type === 'playing' && firstSoundMs === null) firstSoundMs = Math.round(now() - asked); });
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
