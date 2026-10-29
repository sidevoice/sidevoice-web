/* The person's voice settings: kept on this device (the room keeps none), handed to the voice as the halves of a call
 * (`VoiceSettings`, @sidevoice/voice `js/voice-host.d.ts`: an input half, an output half, each only where the call
 * uses it), and the choices the settings pane offers from the engine's catalogues (`model-catalogs.js`). A slot names
 * its model by catalogue and id, `{catalog, model}`: the catalogue of models that run on this device (`local`), or a
 * remote provider's. What the pane shows it says by message key, with its params. */

import { LOCAL_CATALOG } from './model-catalogs.js';

/**
 * @typedef {import('@sidevoice/voice').VoiceSettings} VoiceSettings
 * @typedef {import('@sidevoice/voice').VoiceInputSettings} VoiceInputSettings
 * @typedef {import('@sidevoice/voice').VoiceOutputSettings} VoiceOutputSettings
 * @typedef {import('@sidevoice/voice').VoiceEndOfTurnSettings} VoiceEndOfTurnSettings
 * @typedef {import('./model-catalogs.js').CatalogView} CatalogView
 * @typedef {import('./model-catalogs.js').CatalogModel} CatalogModel
 * @typedef {{
 *   stt: {catalog: string, model: string, language: string | null, build?: string},
 *   tts: {catalog: string, model: string, voice: string | null, speed: number, build?: string},
 *   patience: NonNullable<VoiceInputSettings['patience']>,
 *   end_of_turn: 'silence' | 'smart-turn',
 *   idle_unload_minutes: number,
 *   turn: TurnTuning,
 *   turn_model?: string,
 * }} DeviceVoiceSettings The settings this device keeps: every field filled. The voice is given them as the halves of
 *   a call (`voiceHalves`).
 * @typedef {{
 *   listening_bar: {quiet: number, playing: number},
 *   barge_in_min_speech: number,
 *   barge_in_window: number,
 *   vad_confidence: number,
 *   speech_start_ms: number,
 *   pre_roll_ms: number,
 *   audio_grace_ms: number,
 *   fade_ms: number,
 * }} TurnTuning The numbers that decide when a turn starts, when speech cuts a reply and how a reply is cut.
 * @typedef {{key: string, params?: Record<string, string | number>, reasons?: string[], detail?: string}} Note What the pane
 *   says about a choice: a message key and its params, the codes of why a model does not run here, and a provider's own
 *   words.
 */

export const VOICE_SETTINGS_KEY = 'sidevoice.voice-settings';
export const PATIENCE = ['fast', 'normal', 'calm'];
export const END_OF_TURN = ['silence', 'smart-turn'];
/** How long models stay loaded with nothing to do, in minutes, as Settings offers it; the voice's own default is 10. */
export const IDLE_UNLOAD_MINUTES = [5, 10, 30, 60];
/**
 * The numbers of a turn and of cutting a reply, with the bounds the voice accepts: this app owns the values it runs with
 * (the voice's own defaults are only what it does when told nothing), so they are tuned here without a voice release.
 * `listening_bar` is a volume from 0 to 1 (BS.1770 loudness, −110 LUFS to −10 LUFS) while nothing plays and while
 * something does; `barge_in_min_speech` the seconds of speech that cut a reply, counted within `barge_in_window` times as
 * much; `vad_confidence` the detector's confidence from which a window is speech; `speech_start_ms` how long speech goes
 * on before it starts a turn; `pre_roll_ms` the audio kept before it; `audio_grace_ms` how long a reply waits after a
 * turn ends; `fade_ms` the speaker's fade when a reply is cut.
 */
export const TURN_TUNING = {
  listening_bar: { quiet: 0.5, playing: 0.6 },
  barge_in_min_speech: 0.5,
  barge_in_window: 2.5,
  vad_confidence: 0.65,
  speech_start_ms: 150,
  pre_roll_ms: 1000,
  audio_grace_ms: 350,
  fade_ms: 30,
};
/** @type {Record<string, {min: number, max: number, above?: boolean}>} What each number may be; the voice refuses outside. */
export const TURN_BOUNDS = {
  quiet: { min: 0, max: 1 }, playing: { min: 0, max: 1 },
  barge_in_min_speech: { min: 0, max: 60, above: true },
  barge_in_window: { min: 1, max: 10 },
  vad_confidence: { min: 0, max: 1, above: true },
  speech_start_ms: { min: 0, max: 5000 },
  pre_roll_ms: { min: 0, max: 5000 },
  audio_grace_ms: { min: 0, max: 60000 },
  fade_ms: { min: 0, max: 1000 },
};
/** The normal pace, and the step the pane moves a speed by. */
export const SPEED = { normal: 1, step: 0.05 };

/**
 * What a call starts with when the person chose nothing: this device's models, the language heard detected rather than
 * assumed (`null`), the model's own voice at the normal pace.
 * @returns {DeviceVoiceSettings}
 */
export function defaultVoiceSettings() {
  return {
    stt: { catalog: LOCAL_CATALOG, model: 'whisper-base', language: null },
    tts: { catalog: LOCAL_CATALOG, model: 'kokoro-82m-v1.0', voice: null, speed: SPEED.normal },
    patience: 'normal',
    // The model that hears when you have finished, where it runs; silence where it does not (voiceSettingsHere).
    end_of_turn: 'smart-turn',
    idle_unload_minutes: 10,
    turn: { ...TURN_TUNING, listening_bar: { ...TURN_TUNING.listening_bar } },
  };
}

/** `value` as the number `name` may be, or `fallback`. */
function bounded(name, value, fallback) {
  const { min, max, above } = TURN_BOUNDS[name];
  return typeof value === 'number' && Number.isFinite(value) && value <= max && (above ? value > min : value >= min) ? value : fallback;
}

/**
 * `value` as turn numbers, each kept when in bounds and otherwise `defaults`'.
 * @param {any} value
 * @param {TurnTuning} defaults
 * @returns {TurnTuning}
 */
export function normaliseTurnTuning(value, defaults) {
  const bar = value?.listening_bar;
  const number = (name) => bounded(name, value?.[name], defaults[name]);
  return {
    listening_bar: { quiet: bounded('quiet', bar?.quiet, defaults.listening_bar.quiet), playing: bounded('playing', bar?.playing, defaults.listening_bar.playing) },
    barge_in_min_speech: number('barge_in_min_speech'),
    barge_in_window: number('barge_in_window'),
    vad_confidence: number('vad_confidence'),
    speech_start_ms: number('speech_start_ms'),
    pre_roll_ms: number('pre_roll_ms'),
    audio_grace_ms: number('audio_grace_ms'),
    fade_ms: number('fade_ms'),
  };
}

const text = (value) => (typeof value === 'string' && value ? value : null);

/**
 * `value` as settings, field by field: what is missing or malformed takes `defaults`' value. A slot whose catalogue or
 * model is missing takes the default slot whole, so a model is never looked for in another catalogue.
 * @param {any} value
 * @param {DeviceVoiceSettings} defaults
 * @returns {DeviceVoiceSettings}
 */
export function normaliseVoiceSettings(value, defaults) {
  const stt = value?.stt ?? {}, tts = value?.tts ?? {};
  const sttNamed = text(stt.catalog) && text(stt.model), ttsNamed = text(tts.catalog) && text(tts.model);
  const speed = Number(tts.speed);
  return {
    stt: {
      catalog: sttNamed ? stt.catalog : defaults.stt.catalog,
      model: sttNamed ? stt.model : defaults.stt.model,
      language: stt.language === null ? null : text(stt.language) ?? defaults.stt.language,
      ...(sttNamed && text(stt.build) ? { build: stt.build } : {}),
    },
    tts: {
      catalog: ttsNamed ? tts.catalog : defaults.tts.catalog,
      model: ttsNamed ? tts.model : defaults.tts.model,
      voice: ttsNamed ? text(tts.voice) : null,
      speed: Number.isFinite(speed) && speed > 0 ? speed : defaults.tts.speed,
      ...(ttsNamed && text(tts.build) ? { build: tts.build } : {}),
    },
    patience: PATIENCE.includes(value?.patience) ? value.patience : defaults.patience,
    end_of_turn: END_OF_TURN.includes(value?.end_of_turn) ? value.end_of_turn : defaults.end_of_turn,
    idle_unload_minutes: IDLE_UNLOAD_MINUTES.includes(value?.idle_unload_minutes) ? value.idle_unload_minutes : defaults.idle_unload_minutes,
    turn: normaliseTurnTuning(value?.turn, defaults.turn),
    ...(text(value?.turn_model) ? { turn_model: value.turn_model } : {}),
  };
}

/**
 * The settings this device keeps, or the defaults.
 * @param {Storage | null | undefined} storage
 * @returns {DeviceVoiceSettings}
 */
export function readVoiceSettings(storage) {
  const defaults = defaultVoiceSettings();
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

/** The model `id` of catalogue `catalog`, as `catalogs` list it. */
function findModel(catalogs, catalog, id) {
  return catalogs.find((candidate) => candidate.id === catalog)?.models.find((model) => model.id === id) ?? null;
}

/** `speed` within what `model` takes; the normal pace for a model that takes none. */
function speedFor(model, speed) {
  if (!model?.speed) return SPEED.normal;
  return Math.min(model.speed.max, Math.max(model.speed.min, speed));
}

/**
 * `settings` with `patch` applied. Another source takes that source's first model for the slot; another model drops
 * the voice and a language it does not have, and brings the speed within its range.
 * @param {DeviceVoiceSettings} settings
 * @param {{stt?: Partial<DeviceVoiceSettings["stt"]>, tts?: Partial<DeviceVoiceSettings["tts"]>, patience?: DeviceVoiceSettings["patience"], end_of_turn?: DeviceVoiceSettings["end_of_turn"], turn?: Partial<Omit<TurnTuning, "listening_bar">> & {listening_bar?: Partial<TurnTuning["listening_bar"]>}}} patch
 * @param {CatalogView[]} [catalogs]
 * @returns {DeviceVoiceSettings}
 */
export function editVoiceSettings(settings, patch, catalogs = []) {
  const turn = patch.turn ? normaliseTurnTuning({ ...settings.turn, ...patch.turn, listening_bar: { ...settings.turn.listening_bar, ...patch.turn.listening_bar } }, settings.turn) : settings.turn;
  const stt = { ...settings.stt, ...patch.stt }, tts = { ...settings.tts, ...patch.tts };
  for (const [slot, capability, before] of [[stt, 'stt', settings.stt], [tts, 'tts', settings.tts]]) {
    if (slot.catalog !== before.catalog && !(patch[capability]?.model)) {
      const first = offered(catalogs.find((catalog) => catalog.id === slot.catalog), capability).find((model) => runs(model));
      slot.model = first?.id ?? '';
    }
  }
  // A build is one model's: another model, or none asked for, is the engine's own choice again.
  for (const [slot, before, asked] of [[stt, settings.stt, patch.stt], [tts, settings.tts, patch.tts]]) {
    if (slot.catalog !== before.catalog || slot.model !== before.model || (asked && 'build' in asked && !asked.build)) delete slot.build;
  }
  if (stt.catalog !== settings.stt.catalog || stt.model !== settings.stt.model) {
    const languages = findModel(catalogs, stt.catalog, stt.model)?.languages ?? [];
    if (stt.language && languages.length && !languages.some((tag) => sameLanguage(tag, stt.language))) stt.language = null;
  }
  if (tts.catalog !== settings.tts.catalog || tts.model !== settings.tts.model) {
    tts.voice = null;
    tts.speed = speedFor(findModel(catalogs, tts.catalog, tts.model), tts.speed);
  }
  return { ...settings, ...patch, stt, tts, turn };
}

const sameLanguage = (a, b) => a.toLowerCase().split('-')[0] === b.toLowerCase().split('-')[0];

/** A catalogue's models of `capability`. A model whose capabilities are missing, or not a list, offers none
 *  (sidevoice-core#112): it is left out, not the catalogue with it. */
function offered(catalog, capability) {
  return (catalog?.models ?? []).filter((model) => Array.isArray(model?.capabilities) && model.capabilities.includes(capability));
}

/** Whether `model` can be used here: a remote one always (its provider runs it), a local one when a build of it runs. */
export function runs(model) {
  return !model.builds || model.builds.some((build) => build.available);
}

/**
 * Why a local model does not run here, in the kinds the engine's own reason codes name (its first build with reasons,
 * as unfitNote reads them), each once: `accelerator`, `browser` (its engine is not in this web build) or `app` (not in
 * this version of the app), `memory`, `cores`; `none` when it gives no reason. Nothing is said of where else it might
 * run. Null for a model that runs here.
 * @param {CatalogModel} model
 * @param {boolean} inApp Whether this is the desktop app, rather than a browser.
 * @returns {('accelerator' | 'browser' | 'app' | 'memory' | 'cores' | 'none')[] | null}
 */
export function whyNotHere(model, inApp) {
  if (runs(model)) return null;
  const kinds = {
    'no-accelerator': 'accelerator', 'build-accelerator': 'accelerator', memory: 'memory', 'wasm-memory': 'memory', cores: 'cores',
    'backend-not-in-this-build': inApp ? 'app' : 'browser',
  };
  const codes = (model.builds ?? []).find((build) => build.reasons?.length)?.reasons.map((reason) => reason.code) ?? [];
  const found = [...new Set(codes.map((code) => kinds[code]).filter(Boolean))];
  return found.length ? found : ['none'];
}

/** Why a local model does not run here: its first build's reason codes. */
function unfitNote(model) {
  const reasons = (model.builds?.[0]?.reasons ?? []).map((reason) => reason.code);
  return reasons.length ? { key: 'voice.model.unfit', reasons } : { key: 'voice.model.unfitUnknown' };
}

/** Why a catalogue cannot be chosen from, or says its models may be old: its status, as a note. */
function statusNote(catalog) {
  const reason = catalog.status?.reason;
  if (!reason) return null;
  return { key: 'voice.catalog.reason', params: { code: reason.code }, ...(catalog.status.detail ? { detail: catalog.status.detail } : {}) };
}

/**
 * One slot's choices: its sources (`local` first, then each provider's, one of them disabled when it has no model for
 * the slot, with why), and the chosen source's models (a local one grouped by its family, disabled when it does not run
 * here). The chosen model is kept even when its catalogue no longer lists it, and says so.
 * @param {CatalogView[]} catalogs
 * @param {'stt' | 'tts'} capability
 * @param {{catalog: string, model: string}} slot
 */
function slotChoices(catalogs, capability, slot) {
  const sources = catalogs.map((catalog) => {
    const models = offered(catalog, capability);
    const note = statusNote(catalog);
    return {
      id: catalog.id, local: catalog.id === LOCAL_CATALOG, name: catalog.name,
      disabled: !models.length && catalog.id !== slot.catalog,
      note: note ?? (models.length ? null : { key: 'voice.catalog.empty' }),
    };
  });
  if (!sources.some((source) => source.id === slot.catalog)) {
    sources.push({ id: slot.catalog, local: false, name: null, disabled: false, note: { key: 'voice.catalog.missing' } });
  }
  const catalog = catalogs.find((candidate) => candidate.id === slot.catalog);
  const models = offered(catalog, capability);
  const options = models.map((model) => ({
    id: model.id, group: model.family ?? null, disabled: !runs(model) && model.id !== slot.model, runs: runs(model), note: runs(model) ? null : unfitNote(model),
  }));
  const model = models.find((candidate) => candidate.id === slot.model) ?? null;
  if (!model && slot.model) options.unshift({ id: slot.model, group: null, disabled: false, runs: true, note: { key: 'voice.model.missing' } });
  return { sources, options, model };
}

/**
 * This device's end-of-turn model: the one chosen (`id`) when it runs here, else the first of the local catalogue's
 * that does, or none.
 * @param {CatalogView[]} catalogs
 * @param {string} [id]
 */
export function endOfTurnModel(catalogs, id) {
  const models = endOfTurnModels(catalogs);
  return models.find((model) => model.id === id && runs(model)) ?? models.find(runs) ?? null;
}

/**
 * The local catalogue's end-of-turn models, those that run here and those that do not.
 * @param {CatalogView[]} catalogs
 */
export function endOfTurnModels(catalogs) {
  return offered(catalogs.find((catalog) => catalog.id === LOCAL_CATALOG), 'end-of-turn');
}

/**
 * The voice activity detector every call uses on this device (voice-source.ts chooses it the same way): the local
 * catalogue's Silero VAD when it runs here, else another `vad` model that does, or none. Never a person's choice.
 * @param {CatalogView[]} catalogs
 */
export function vadModel(catalogs) {
  const runsHere = offered(catalogs.find((catalog) => catalog.id === LOCAL_CATALOG), 'vad').filter(runs);
  return runsHere.find((model) => model.family === 'silero-vad') ?? runsHere[0] ?? null;
}

/**
 * `settings` as this device can take them: the smart end of turn where no end-of-turn model runs here is silence. With
 * no catalogues read yet, as they are.
 * @param {DeviceVoiceSettings} settings
 * @param {CatalogView[]} catalogs
 * @returns {DeviceVoiceSettings}
 */
export function voiceSettingsHere(settings, catalogs) {
  if (settings.end_of_turn !== 'smart-turn' || !catalogs.some((catalog) => catalog.id === LOCAL_CATALOG) || endOfTurnModel(catalogs, settings.turn_model)) return settings;
  return { ...settings, end_of_turn: 'silence' };
}

/**
 * `settings` as the voice is given them, for a call: as this device can take them (voiceSettingsHere), and the smart end
 * of turn as silence while its model is not on disk. A call loads every model its halves use and downloads what is
 * missing; this one is downloaded only by End of turn's Download (its size, progress and cancel said), and switched to
 * once it is there. With no catalogues read, nothing is known to be on disk.
 * @param {DeviceVoiceSettings} settings
 * @param {CatalogView[]} catalogs
 * @returns {DeviceVoiceSettings}
 */
export function voiceSettingsToLoad(settings, catalogs) {
  const here = voiceSettingsHere(settings, catalogs);
  return modelReady(here, 'end-of-turn', catalogs) ? here : { ...here, end_of_turn: 'silence' };
}

/**
 * What ends a person's turn, as the voice names it: its pause (`ms`, the patience's when absent) or, for Smart, the
 * end-of-turn model the settings chose (the source's own choice when none is).
 * @param {DeviceVoiceSettings} settings
 * @returns {VoiceEndOfTurnSettings}
 */
export function voiceEndOfTurn(settings) {
  return settings.end_of_turn === 'smart-turn'
    ? { kind: 'smart', ...(settings.turn_model ? { model: { catalog: LOCAL_CATALOG, model: settings.turn_model } } : {}) }
    : { kind: 'silence' };
}

/**
 * The input half of a call (the microphone, the detector, the transcriber and, for Smart, its model), for `settings`.
 * `endOfTurn` replaces what ends a turn where a call asks for its own (a try of transcription).
 * @param {DeviceVoiceSettings} settings
 * @param {VoiceEndOfTurnSettings} [endOfTurn]
 * @returns {VoiceInputSettings}
 */
export function voiceInput(settings, endOfTurn = voiceEndOfTurn(settings)) {
  const { listening_bar, barge_in_min_speech, barge_in_window, vad_confidence, speech_start_ms, pre_roll_ms } = settings.turn;
  return {
    stt: { ...settings.stt }, endOfTurn, patience: settings.patience,
    listening_bar: { ...listening_bar }, barge_in_min_speech, barge_in_window, vad_confidence, speech_start_ms, pre_roll_ms,
  };
}

/**
 * The output half of a call (the speaker and its playback), for `settings`. Its language, for what is said when a reply
 * names none, is the one the person hears in: the voice has no transcriber's to take it from in a call that only speaks.
 * @param {DeviceVoiceSettings} settings
 * @returns {VoiceOutputSettings}
 */
export function voiceOutput(settings) {
  const { catalog, model, build, voice, speed } = settings.tts;
  return { tts: { catalog, model, ...(build ? { build } : {}) }, voice, speed, fade_ms: settings.turn.fade_ms, language: settings.stt.language };
}

/**
 * `settings` as the halves of a call: the input where `input` says the call listens, the output where `output` says it
 * speaks, how long a reply waits after a turn ends, and how long its models stay loaded with no call holding them.
 * @param {DeviceVoiceSettings} settings
 * @param {{input?: boolean, output?: boolean}} [halves] Both by default.
 * @returns {VoiceSettings}
 */
export function voiceHalves(settings, { input = true, output = true } = {}) {
  return {
    ...(input ? { input: voiceInput(settings) } : {}),
    ...(output ? { output: voiceOutput(settings) } : {}),
    audio_grace_ms: settings.turn.audio_grace_ms,
    idle_unload_minutes: settings.idle_unload_minutes,
  };
}

/**
 * What the pane offers, for `settings`, from `catalogs` (the engine's). `languages` are the tags offered for a model
 * that lists none (a remote one).
 * @param {CatalogView[]} catalogs
 * @param {DeviceVoiceSettings} settings
 * @param {string[]} [languages]
 */
export function voiceChoices(catalogs, settings, languages = []) {
  const stt = slotChoices(catalogs, 'stt', settings.stt);
  const tts = slotChoices(catalogs, 'tts', settings.tts);
  const local = catalogs.find((catalog) => catalog.id === LOCAL_CATALOG);
  const smartTurn = offered(local, 'end-of-turn').some(runs);
  const voices = tts.model?.voices ?? [];
  return {
    stt: { ...stt, languages: stt.model?.languages?.length ? stt.model.languages : languages },
    tts: {
      ...tts,
      voices: voices.map((voice) => ({ id: voice.id, name: voice.name ?? null, languages: voice.languages ?? [], gender: voice.gender ?? null })),
      // The voice when none is chosen, always the list's first choice: the model's own; for a provider whose voices
      // are the account's own and lists none, the account's first.
      automaticVoice: settings.tts.catalog !== LOCAL_CATALOG && !voices.length ? 'voice.voice.account' : 'voice.voice.first',
      speed: tts.model?.speed ?? null,
    },
    endOfTurn: { smartTurn, note: smartTurn ? null : { key: 'voice.endOfTurn.none' } },
  };
}

/**
 * The remote catalogues, for the keys the person keeps for them: each provider's id and name.
 * @param {CatalogView[]} catalogs
 */
export function remoteProviders(catalogs) {
  return catalogs.filter((catalog) => catalog.id !== LOCAL_CATALOG).map((catalog) => ({ id: catalog.id, name: catalog.name ?? catalog.id }));
}

/**
 * Whether what `settings` chose for `task` can be used now: a provider's model its catalogue lists, or one of this
 * device's that is on disk (the build chosen, else any). The end of turn is ready when it is silence, or its model is.
 * @param {DeviceVoiceSettings} settings
 * @param {'stt' | 'tts' | 'end-of-turn'} task
 * @param {CatalogView[]} catalogs
 */
export function modelReady(settings, task, catalogs) {
  if (task === 'end-of-turn') {
    if (settings.end_of_turn !== 'smart-turn') return true;
    const model = endOfTurnModel(catalogs, settings.turn_model);
    return !!model && (model.installed === true || !!model.builds?.some((build) => build.installed));
  }
  const slot = settings[task];
  const model = catalogs.find((catalog) => catalog.id === slot.catalog)?.models.find((candidate) => candidate.id === slot.model);
  if (!model) return false;
  if (slot.catalog !== LOCAL_CATALOG) return true;
  const chosen = slot.build ? model.builds?.find((build) => build.id === slot.build) : null;
  return chosen ? chosen.installed : model.installed === true || !!model.builds?.some((build) => build.installed);
}

/**
 * The settings in use when `draft` is what was chosen and `saved` what is in use: each choice that is ready now, and
 * for one that is not (a model still to download), what is in use — it switches once it is ready.
 * @param {DeviceVoiceSettings} draft
 * @param {DeviceVoiceSettings} saved
 * @param {CatalogView[]} catalogs
 */
export function readyVoiceSettings(draft, saved, catalogs) {
  // The same model as in use takes its other changes (language, voice, speed) at once, ready or not.
  const same = (task) => draft[task].catalog === saved[task].catalog && draft[task].model === saved[task].model;
  const turnReady = (draft.end_of_turn === saved.end_of_turn && draft.turn_model === saved.turn_model) || modelReady(draft, 'end-of-turn', catalogs);
  return {
    ...draft,
    stt: same('stt') || modelReady(draft, 'stt', catalogs) ? draft.stt : saved.stt,
    tts: same('tts') || modelReady(draft, 'tts', catalogs) ? draft.tts : saved.tts,
    end_of_turn: turnReady ? draft.end_of_turn : saved.end_of_turn,
    ...(turnReady ? {} : { turn_model: saved.turn_model }),
  };
}
