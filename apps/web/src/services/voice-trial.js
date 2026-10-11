/* Trying this device's voice settings for real, through the call's own voice (@sidevoice/voice's `VoiceHost`, or the
 * desktop app's): the microphone and the chosen transcriber for words the person says, the chosen speaker for a
 * sentence they hear. No room, no agent, no conversation: a try opens the voice, waits for its one result and stops it,
 * whatever happens. A try is cancellable, bounded in time, and fails by a stable code. */

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
 * @param {{signal?: AbortSignal, timeoutMs?: number, onState?: (state: import('@sidevoice/voice').VoiceCallState) => void}} [options]
 * @returns {Promise<string>}
 */
export async function tryTranscription(voice, settings, { signal, timeoutMs = 20000, onState } = {}) {
  const stops = [];
  try {
    await voice.setSettings(settings);
    const heard = new Promise((resolve, reject) => {
      stops.push(voice.onTurn((turn) => {
        const text = turn.phase === 'finished' ? String(turn.text ?? '').trim() : '';
        if (text) resolve(text);
      }));
      stops.push(voice.onError(reject));
    });
    // Its failure before the voice even listens is the start's to report; this one must not go unheard.
    heard.catch(() => {});
    if (onState) stops.push(voice.onState(onState));
    return await bounded(voice.start().then(() => heard), { signal, timeoutMs });
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
 * @param {{language?: string | null, signal?: AbortSignal, timeoutMs?: number}} [options]
 */
export async function tryVoice(voice, settings, text, { language = null, signal, timeoutMs = 60000 } = {}) {
  let saying = null;
  try {
    await voice.setSettings(settings);
    const outcome = await bounded(voice.start().then(() => {
      saying = voice.say(text, language ? { language } : undefined);
      return saying.outcome;
    }), { signal, timeoutMs });
    if (outcome.status === 'heard') return outcome;
    throw outcome.reason === 'failed' ? trialError(outcome.code || 'trial-not-heard') : trialError('trial-not-heard', outcome.reason);
  } catch (error) {
    saying?.cancel();
    throw error;
  } finally {
    await voice.stop().catch(() => {});
  }
}
