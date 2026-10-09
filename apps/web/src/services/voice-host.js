/* The page's voice on the web: the `VoiceHost` interface over `@sidevoice/voice`'s `VoiceCall` on a `WebEngine`.
 * The interface is @sidevoice/voice's (`js/voice-host.d.ts`, sidevoice/sidevoice-voice#6), and the desktop app's
 * `host.voice` is the same one; the module's own `createVoiceHost(engine)` replaces this file once it is released,
 * and until then this behaves as it:
 *
 * - the call exists from the first `setSettings`, and emits nothing before `start()`;
 * - `start()` resolves on the first `state` whose `listening` is not `"idle"` and rejects `{code, message?}`; a
 *   second `start()` settles with the pending one, and one while listening resolves at once;
 * - `stop()` is safe at any time: a pending `start()` rejects `{code: "stopped"}`;
 * - listeners get what is emitted after they subscribe, in the order the call emitted it. */

/** The module's configuration (`VoiceConfig`) for the person's `settings`: the stages they chose, and the rest. */
export function voiceConfig(settings = {}) {
  const language = settings.stt?.language;
  return {
    vad: { model: 'silero-vad' },
    stt: { model: settings.stt?.model ?? 'whisper-base', ...(language ? { language } : {}) },
    tts: {
      model: settings.tts?.model ?? 'kokoro-82m-v1.0',
      ...(settings.tts?.voice ? { voice: settings.tts.voice } : {}),
      ...(settings.tts?.speed ? { speed: settings.tts.speed } : {}),
    },
    patience: settings.patience ?? 'normal',
  };
}

const KEY_PREFIX = 'sidevoice.provider-key.';

/** The key this device keeps for `provider`, where the interface stores it: what the engine's backends ask for. */
export function providerKey(provider, storage = globalThis.localStorage) {
  return storage?.getItem(KEY_PREFIX + provider) ?? null;
}

/** A failure with a stable code, as the interface rejects with. */
export function voiceFailure(code, cause) {
  return Object.assign(new Error(cause?.message || code), { code, cause });
}

/**
 * The interface over `VoiceCall` (the module's class) on `engine` (a `WebEngine`).
 * @param {any} engine
 * @param {{VoiceCall: any, storage?: Storage | null}} options
 */
export function createVoiceHost(engine, { VoiceCall, storage = globalThis.localStorage }) {
  const listeners = { 'user-turn': new Set(), playback: new Set(), state: new Set(), level: new Set(), karaoke: new Set(), error: new Set() };
  const emit = (kind, data) => { for (const listener of [...listeners[kind]]) listener(data); };
  const listen = (kind) => (listener) => { listeners[kind].add(listener); return () => listeners[kind].delete(listener); };
  let call = null, muted = false, listening = false, pending = null;
  const settle = (outcome) => { const waiting = pending; pending = null; waiting?.[outcome.error ? 'reject' : 'resolve'](outcome.error); };
  function create(config) {
    call = VoiceCall.create(engine, config);
    call.onEvent(({ type, data }) => {
      if (type === 'state') {
        listening = !!data?.listening && data.listening !== 'idle';
        if (listening) settle({});
      }
      if (type === 'error' && pending) settle({ error: voiceFailure(data?.code || 'voice-failed', data) });
      if (type === 'room-message') {
        if (data?.type === 'voice-user-turn') emit('user-turn', data.data);
        else if (data?.type === 'voice-playback') emit('playback', data.data);
      } else if (Object.hasOwn(listeners, type)) emit(type, data);
    });
    if (muted) call.mute(true);
  }
  return {
    async setSettings(next) {
      let config;
      try { config = voiceConfig(next ?? {}); if (call) call.setConfig(config); else create(config); }
      catch (cause) { throw voiceFailure(cause?.code || 'voice-settings-invalid', cause); }
    },
    start() {
      if (!call) return Promise.reject(voiceFailure('settings-missing'));
      if (listening) return Promise.resolve();
      if (pending) return pending.promise;
      let resolve, reject;
      const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
      pending = { promise, resolve, reject };
      try { call.start(); } catch (cause) { settle({ error: voiceFailure(cause?.code || 'voice-failed', cause) }); }
      return promise;
    },
    async stop() {
      if (pending) settle({ error: voiceFailure('stopped') });
      call?.stop();
    },
    speak(reply) { call?.roomEvent({ type: 'voice-reply', data: reply }); },
    setOnline(online) { call?.setOnline(!!online); },
    mute(value) { muted = !!value; call?.mute(muted); },
    cancelInput() { call?.cancelInput(); },
    onUserTurn: listen('user-turn'),
    onPlayback: listen('playback'),
    onState: listen('state'),
    onLevel: listen('level'),
    onKaraoke: listen('karaoke'),
    onError: listen('error'),
    models: () => engine.models(),
    async setProviderKey(provider, key) {
      if (key) storage?.setItem(KEY_PREFIX + provider, key);
      else storage?.removeItem(KEY_PREFIX + provider);
    },
    async hasProviderKey(provider) { return !!storage?.getItem(KEY_PREFIX + provider); },
  };
}
