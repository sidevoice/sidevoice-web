/* The person's voice settings: kept on this device (the room keeps none), handed to the voice as its `VoiceSettings`
 * (@sidevoice/voice `js/voice-host.d.ts`), and the choices the settings pane offers from the engine's catalogues
 * (`model-catalogs.js`). A slot names its model by catalogue and id, `{catalog, model}`: the catalogue of models that
 * run on this device (`local`), or a remote provider's. What the pane shows it says by message key, with its params. */

import { LOCAL_CATALOG } from './model-catalogs.js';

/**
 * @typedef {import('@sidevoice/voice').VoiceSettings} VoiceSettings
 * @typedef {import('./model-catalogs.js').CatalogView} CatalogView
 * @typedef {import('./model-catalogs.js').CatalogModel} CatalogModel
 * @typedef {{
 *   stt: {catalog: string, model: string, language: string | null, build?: string},
 *   tts: {catalog: string, model: string, voice: string | null, speed: number, build?: string},
 *   patience: NonNullable<VoiceSettings['patience']>,
 *   end_of_turn: NonNullable<VoiceSettings['end_of_turn']>,
 *   idle_unload_minutes: number,
 *   turn_model?: string,
 * }} DeviceVoiceSettings The settings this device keeps: every field filled, so they are the voice's `VoiceSettings` as they are.
 * @typedef {{key: string, params?: Record<string, string | number>, reasons?: string[], detail?: string}} Note What the pane
 *   says about a choice: a message key and its params, the codes of why a model does not run here, and a provider's own
 *   words.
 */

export const VOICE_SETTINGS_KEY = 'sidevoice.voice-settings';
export const PATIENCE = ['fast', 'normal', 'calm'];
export const END_OF_TURN = ['silence', 'smart-turn'];
/** How long models stay loaded with nothing to do, in minutes, as Settings offers it; the voice's own default is 10. */
export const IDLE_UNLOAD_MINUTES = [5, 10, 30, 60];
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
 * @param {{stt?: Partial<DeviceVoiceSettings["stt"]>, tts?: Partial<DeviceVoiceSettings["tts"]>, patience?: DeviceVoiceSettings["patience"], end_of_turn?: DeviceVoiceSettings["end_of_turn"]}} patch
 * @param {CatalogView[]} [catalogs]
 * @returns {DeviceVoiceSettings}
 */
export function editVoiceSettings(settings, patch, catalogs = []) {
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
  return { ...settings, ...patch, stt, tts };
}

const sameLanguage = (a, b) => a.toLowerCase().split('-')[0] === b.toLowerCase().split('-')[0];

/** A catalogue's models of `capability`. */
function offered(catalog, capability) {
  return (catalog?.models ?? []).filter((model) => model.capabilities.includes(capability));
}

/** Whether `model` can be used here: a remote one always (its provider runs it), a local one when a build of it runs. */
function runs(model) {
  return !model.builds || model.builds.some((build) => build.available);
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
    id: model.id, group: model.family ?? null, disabled: !runs(model) && model.id !== slot.model, note: runs(model) ? null : unfitNote(model),
  }));
  const model = models.find((candidate) => candidate.id === slot.model) ?? null;
  if (!model && slot.model) options.unshift({ id: slot.model, group: null, disabled: false, note: { key: 'voice.model.missing' } });
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
      // A provider whose voices are the account's own lists none: the voice is the account's first.
      voiceNote: tts.model && !voices.length ? { key: settings.tts.catalog === LOCAL_CATALOG ? 'voice.voice.model' : 'voice.voice.account' } : null,
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
