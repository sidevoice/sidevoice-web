/* The person's voice settings: kept on this device (the room keeps none), handed to the voice as its `VoiceSettings`
 * (@sidevoice/voice `js/voice-host.d.ts`), and the choices the settings pane offers from the voice's catalogue
 * (`models()`, the engine's models with their builds ranked for this device). */

/**
 * @typedef {{model: string, build: string | null, language: string | null}} SttSettings
 * @typedef {{model: string, build: string | null, voice: string | null, speed: number}} TtsSettings
 * @typedef {{stt: SttSettings, tts: TtsSettings, patience: string, end_of_turn: string}} VoiceSettings
 * @typedef {{code: string, params?: Record<string, number>}} BuildReason
 * @typedef {{id: string, backend: string, accelerator?: string, precision: string, downloadBytes: number, memoryMb: number,
 *   available: boolean, reasons: BuildReason[], installed: boolean}} VoiceBuild
 * @typedef {{id: string, family?: string, capabilities: string[], languages: string[],
 *   voices: {id: string, languages?: string[], gender?: string}[], installed: boolean, builds: VoiceBuild[],
 *   recommendedBuild?: string}} VoiceModel
 */

export const VOICE_SETTINGS_KEY = 'sidevoice.voice-settings';
export const PATIENCE = ['fast', 'normal', 'calm'];
export const END_OF_TURN = ['silence', 'smart-turn'];
/** The remote providers whose keys this device keeps: a remote build's `backend`. */
export const PROVIDERS = ['openai', 'elevenlabs'];
export const SPEED = { min: 0.5, max: 2, step: 0.05 };

/** What a call starts with when the person chose nothing, in `language`. */
export function defaultVoiceSettings(language) {
  return {
    stt: { model: 'whisper-base', build: null, language: language || null },
    tts: { model: 'kokoro-82m-v1.0', build: null, voice: null, speed: 1 },
    patience: 'normal',
    end_of_turn: 'silence',
  };
}

const text = (value) => (typeof value === 'string' && value ? value : null);

/** `value` as settings, field by field: what is missing or malformed takes `defaults`' value. */
export function normaliseVoiceSettings(value, defaults) {
  const stt = value?.stt ?? {}, tts = value?.tts ?? {};
  const speed = Number(tts.speed);
  return {
    stt: {
      model: text(stt.model) ?? defaults.stt.model,
      build: text(stt.build),
      language: stt.language === null ? null : text(stt.language) ?? defaults.stt.language,
    },
    tts: {
      model: text(tts.model) ?? defaults.tts.model,
      build: text(tts.build),
      voice: text(tts.voice),
      speed: Number.isFinite(speed) ? Math.min(SPEED.max, Math.max(SPEED.min, speed)) : defaults.tts.speed,
    },
    patience: PATIENCE.includes(value?.patience) ? value.patience : defaults.patience,
    end_of_turn: END_OF_TURN.includes(value?.end_of_turn) ? value.end_of_turn : defaults.end_of_turn,
  };
}

/** The settings this device keeps, or the defaults for `language`. */
export function readVoiceSettings(storage, language) {
  const defaults = defaultVoiceSettings(language);
  try {
    const stored = JSON.parse(storage?.getItem(VOICE_SETTINGS_KEY) || 'null');
    return stored && typeof stored === 'object' ? normaliseVoiceSettings(stored, defaults) : defaults;
  } catch {
    return defaults;
  }
}

export function writeVoiceSettings(storage, settings) {
  try { storage?.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* a full or blocked storage keeps nothing */ }
}

/** `settings` with `patch` applied: a new model drops the build, and the voice or a language it does not have. */
export function editVoiceSettings(settings, patch, models = []) {
  const stt = { ...settings.stt, ...patch.stt }, tts = { ...settings.tts, ...patch.tts };
  if (patch.stt?.model && patch.stt.model !== settings.stt.model) {
    stt.build = null;
    const languages = models.find((model) => model.id === stt.model)?.languages ?? [];
    if (stt.language && languages.length && !languages.some((tag) => sameLanguage(tag, stt.language))) stt.language = null;
  }
  if (patch.tts?.model && patch.tts.model !== settings.tts.model) { tts.build = null; tts.voice = null; }
  return { ...settings, ...patch, stt, tts };
}

/** The provider a model is called at, for a remote one: its remote build's backend. */
export function providerOf(model) {
  return model?.builds?.find((build) => build.accelerator === 'remote')?.backend ?? null;
}

const sameLanguage = (a, b) => a.toLowerCase().split('-')[0] === b.toLowerCase().split('-')[0];
const megabytes = (bytes) => (bytes >= 1e9 ? (bytes / 1e9).toFixed(1) + ' GB' : Math.max(1, Math.round(bytes / 1e6)) + ' MB');

/** Why a build does not run here, in words: one sentence per reason code, the code itself when it is a new one. */
export const BUILD_REASONS = {
  memory: 'no cabe en la memoria de este dispositivo',
  cores: 'necesita más núcleos de los que tiene este dispositivo',
  'wasm-memory': 'necesita más memoria de la que una página puede usar',
  'no-accelerator': 'su motor no tiene aquí ningún acelerador',
  'build-accelerator': 'necesita un acelerador que este dispositivo no tiene',
  'backend-not-in-this-build': 'su motor no está en esta versión',
};
function buildNote(build) {
  return (build.reasons ?? []).map((reason) => BUILD_REASONS[reason.code] ?? reason.code).join('; ');
}
function buildLabel(build) {
  return [build.backend, build.precision, build.accelerator, build.downloadBytes ? megabytes(build.downloadBytes) : null]
    .filter(Boolean).join(' · ') + (build.installed ? ' · descargado' : '');
}

/**
 * A model as an option of the pane: usable or not here, and why.
 * @param {VoiceModel} model
 * @param {Record<string, boolean | null>} keys
 * @returns {{id: string, provider: string | null, disabled: boolean, note: string}}
 */
function modelOption(model, keys) {
  const provider = providerOf(model);
  if (provider) {
    const keyed = keys[provider] === true;
    return { id: model.id, provider, disabled: !keyed, note: keyed ? '' : 'Falta la clave de ' + PROVIDER_NAMES[provider] };
  }
  const runs = model.builds.some((build) => build.available);
  return { id: model.id, provider: null, disabled: !runs, note: runs ? '' : buildNote(model.builds[0] ?? {}) || 'no se puede ejecutar aquí' };
}

export const PROVIDER_NAMES = { openai: 'OpenAI', elevenlabs: 'ElevenLabs' };

/**
 * One stage's choices: its models (the chosen one kept even when the catalogue lacks it), and the chosen model's builds.
 * @param {VoiceModel[]} models
 * @param {string} capability
 * @param {{model: string}} stage
 * @param {Record<string, boolean | null>} keys
 */
function stageChoices(models, capability, stage, keys) {
  const offered = models.filter((model) => model.capabilities.includes(capability));
  const options = offered.map((model) => modelOption(model, keys));
  const model = offered.find((candidate) => candidate.id === stage.model) ?? null;
  if (!model) options.unshift({ id: stage.model, provider: null, disabled: false, note: 'no está en el catálogo de esta voz' });
  const builds = model && !providerOf(model)
    ? model.builds.map((build) => ({ id: build.id, label: buildLabel(build), disabled: !build.available, note: buildNote(build) }))
    : [];
  return { model, options, builds, recommendedBuild: model?.recommendedBuild ?? null };
}

/**
 * What the pane offers, for `settings`, from `models` (the voice's catalogue) and `keys` (`{provider: boolean}`, whether
 * this device keeps a key for it). `languages` are the tags offered for a model that lists none (a remote one).
 * @param {VoiceModel[]} models
 * @param {VoiceSettings} settings
 * @param {Record<string, boolean | null>} [keys]
 * @param {string[]} [languages]
 */
export function voiceChoices(models, settings, keys = {}, languages = []) {
  const stt = stageChoices(models, 'stt', settings.stt, keys);
  const tts = stageChoices(models, 'tts', settings.tts, keys);
  const smartTurn = models.some((model) => model.capabilities.includes('end-of-turn'));
  const voices = tts.model?.voices ?? [];
  return {
    stt: { ...stt, languages: stt.model?.languages?.length ? stt.model.languages : languages },
    tts: {
      ...tts,
      voices: voices.map((voice) => ({ id: voice.id, languages: voice.languages ?? [], gender: voice.gender ?? null })),
      // A provider whose voices are the account's own lists none: the voice is the account's first.
      voiceNote: tts.model && !voices.length ? (providerOf(tts.model) ? 'La primera voz de tu cuenta.' : 'La voz del modelo.') : '',
    },
    endOfTurn: {
      smartTurn,
      note: smartTurn ? '' : 'Aún no hay un modelo de fin de turno en el motor de voz: el turno termina con el silencio.',
    },
  };
}
