/* What this device's downloaded models are for, and how long one not used is kept. A model is in use when the settings
 * name it (transcription, voice, the end of turn) or every call needs it (the voice activity detector); the others can
 * be deleted, and — when the person asks for it — are, once not used for that long. When a model was last used is the
 * engine's to say (`CatalogModel.lastUsedAt`); one it says nothing about is never deleted on its own. Downloads are
 * costly: the default is never. */

import { LOCAL_CATALOG } from './model-catalogs.js';
import { endOfTurnModel, vadModel } from './voice-settings.js';

/** @typedef {import('./model-catalogs.js').CatalogView} CatalogView */
/** @typedef {import('./voice-settings.js').DeviceVoiceSettings} DeviceVoiceSettings */
/** @typedef {'transcription' | 'voice' | 'end-of-turn' | 'every-call'} ModelPurpose */

export const DELETE_UNUSED_KEY = 'sidevoice.delete-unused-models';
/** How long a model not used is kept, in days, as Settings offers it; null is forever (the default). */
export const DELETE_UNUSED_DAYS = [null, 30, 90];
const DAY_MS = 24 * 60 * 60 * 1000;

/** @param {Storage | null | undefined} storage @returns {number | null} */
export function readDeleteUnused(storage) {
  try {
    const days = Number(storage?.getItem(DELETE_UNUSED_KEY));
    return DELETE_UNUSED_DAYS.includes(days) ? days : null;
  } catch { return null; }
}

/** @param {Storage | null | undefined} storage @param {number | null} days */
export function writeDeleteUnused(storage, days) {
  if (days == null) storage?.removeItem(DELETE_UNUSED_KEY);
  else storage?.setItem(DELETE_UNUSED_KEY, String(days));
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
 * The downloaded models to delete now: not in use, and last used (as the engine says) more than `days` ago.
 * @param {CatalogView[]} catalogs
 * @param {DeviceVoiceSettings | null | undefined} settings
 * @param {number | null} days
 * @param {number} now
 * @returns {string[]}
 */
export function staleModels(catalogs, settings, days, now) {
  if (days == null) return [];
  const purposes = modelPurposes(catalogs, settings);
  const local = catalogs.find((catalog) => catalog.id === LOCAL_CATALOG);
  return (local?.models ?? []).filter((model) => (model.builds ?? []).some((build) => build.installed)
    && !purposes(model.id).length && typeof model.lastUsedAt === 'number' && now - model.lastUsedAt > days * DAY_MS).map((model) => model.id);
}
