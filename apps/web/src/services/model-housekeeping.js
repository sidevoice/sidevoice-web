/* What this device's downloaded models are for, and how long one not used is kept. A model is in use when the settings
 * name it (transcription, voice, the end of turn) or every call needs it (the voice activity detector); the others can
 * be deleted, and — when the person asks for it — are, once not used for that long. When a model was last used is the
 * engine's to say (`CatalogModel.lastUsedAt`); one it says nothing about is never deleted on its own. Switching models
 * would otherwise leave the old one (about a gigabyte) for good: the default is a week. */

import { LOCAL_CATALOG } from './model-catalogs.js';
import { endOfTurnModel, vadModel } from './voice-settings.js';

/** @typedef {import('./model-catalogs.js').CatalogView} CatalogView */
/** @typedef {import('./voice-settings.js').DeviceVoiceSettings} DeviceVoiceSettings */
/** @typedef {'transcription' | 'voice' | 'end-of-turn' | 'every-call'} ModelPurpose */

export const DELETE_UNUSED_KEY = 'sidevoice.delete-unused-models';
/** How long a model not used is kept, in days, as Settings offers it; null is forever. */
export const DELETE_UNUSED_DAYS = [7, 30, 90, null];
/** What a device that never chose keeps for. */
export const DEFAULT_DELETE_UNUSED_DAYS = 7;
const NEVER = 'never';
const DAY_MS = 24 * 60 * 60 * 1000;

/** The days chosen on this device, null for never; the default when nothing valid is kept. @param {Storage | null | undefined} storage @returns {number | null} */
export function readDeleteUnused(storage) {
  try {
    const kept = storage?.getItem(DELETE_UNUSED_KEY);
    if (kept === NEVER) return null;
    const days = Number(kept);
    return kept != null && DELETE_UNUSED_DAYS.includes(days) ? days : DEFAULT_DELETE_UNUSED_DAYS;
  } catch { return DEFAULT_DELETE_UNUSED_DAYS; }
}

/** Never is kept as such: an absent value is the default, not never. @param {Storage | null | undefined} storage @param {number | null} days */
export function writeDeleteUnused(storage, days) {
  storage?.setItem(DELETE_UNUSED_KEY, days == null ? NEVER : String(days));
}

/**
 * What each local model is used for, under `settings`: the slots that name it, the end of turn, every call.
 * @param {CatalogView[]} catalogs
 * @param {DeviceVoiceSettings | null | undefined} settings
 * @returns {(model: string) => ModelPurpose[]}
 */
export function modelPurposes(catalogs, settings) {
  const turn = settings?.end_of_turn === 'smart-turn' ? endOfTurnModel(catalogs, settings.turn_model)?.id : null;
  const vad = vadModel(catalogs)?.id;
  return (model) => /** @type {ModelPurpose[]} */ ([
    settings?.stt.catalog === LOCAL_CATALOG && settings.stt.model === model ? 'transcription' : '',
    settings?.tts.catalog === LOCAL_CATALOG && settings.tts.model === model ? 'voice' : '',
    turn === model ? 'end-of-turn' : '',
    vad === model ? 'every-call' : '',
  ].filter(Boolean));
}

/**
 * The downloaded models to delete now: not in use, and last used (as the engine says) more than `days` ago. A model
 * the saved settings or the ones being edited (`editing`) name is in use; with no settings known, none is deleted.
 * @param {CatalogView[]} catalogs
 * @param {DeviceVoiceSettings | null | undefined} settings
 * @param {number | null} days
 * @param {number} now
 * @param {DeviceVoiceSettings | null | undefined} [editing]
 * @returns {string[]}
 */
export function staleModels(catalogs, settings, days, now, editing) {
  if (days == null || !settings) return [];
  const saved = modelPurposes(catalogs, settings), drafted = modelPurposes(catalogs, editing);
  const purposes = (/** @type {string} */ model) => [...saved(model), ...drafted(model)];
  const local = catalogs.find((catalog) => catalog.id === LOCAL_CATALOG);
  return (local?.models ?? []).filter((model) => (model.builds ?? []).some((build) => build.installed)
    && !purposes(model.id).length && typeof model.lastUsedAt === 'number' && now - model.lastUsedAt > days * DAY_MS).map((model) => model.id);
}
