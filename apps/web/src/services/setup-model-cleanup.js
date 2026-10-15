/* Models installed by this device's first-run setup alone. An install earns provenance only after a fresh catalogue
 * said no build was present before it and another fresh catalogue confirms success. The small device-local record
 * survives a setup reload; it is cleared before cleanup so a failed deletion is never retried on the next launch. */

import { LOCAL_CATALOG } from './model-catalogs.js';
import { modelPurposes } from './model-housekeeping.js';

/** @typedef {import('./model-catalogs.js').CatalogView} CatalogView */
/** @typedef {import('./model-catalogs.js').ModelCatalogs} ModelCatalogs */
/** @typedef {import('./voice-settings.js').DeviceVoiceSettings} DeviceVoiceSettings */

export const SETUP_DOWNLOADS_KEY = 'sidevoice.setup-model-downloads';

/** A local model with a trustworthy installed-build listing, or nothing when the catalogue cannot prove it. */
function localModel(catalogs, id) {
  const local = catalogs?.find((catalog) => catalog.id === LOCAL_CATALOG);
  if (!local || local.status?.stale !== false || local.status.reason) return null;
  const model = local.models?.find((entry) => entry.id === id);
  return model && Array.isArray(model.builds) ? model : null;
}

const installed = (model) => model.installed === true || model.builds.some((build) => build.installed === true);

/** The set kept on this device; invalid or inaccessible storage authorizes no deletion. */
function read(storage) {
  try {
    const raw = storage?.getItem(SETUP_DOWNLOADS_KEY);
    if (raw == null) return storage ? [] : null;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id.length > 0) ? [...new Set(ids)] : null;
  } catch { return null; }
}

/** A successful setup install with no pre-existing build is the only source of an owned model ID. */
export function recordSetupInstall(storage, id, before, after) {
  const oldModel = localModel(before, id), newModel = localModel(after, id);
  if (!oldModel || !newModel || installed(oldModel) || !installed(newModel)) return false;
  const ids = read(storage);
  if (!ids) return false;
  try {
    const next = [...new Set([...ids, id])];
    storage.setItem(SETUP_DOWNLOADS_KEY, JSON.stringify(next));
    return JSON.stringify(read(storage)) === JSON.stringify(next);
  } catch { return false; }
}

/** Read and clear before any asynchronous catalogue read or uninstall. A failed clear authorizes nothing. */
function take(storage) {
  const ids = read(storage);
  if (!ids?.length) return [];
  try {
    storage.removeItem(SETUP_DOWNLOADS_KEY);
    return storage.getItem(SETUP_DOWNLOADS_KEY) == null ? ids : [];
  } catch { return []; }
}

/**
 * Quietly remove only confirmed setup downloads that are neither selected nor in use at the moment of deletion.
 * @param {{storage: Storage | null, models: ModelCatalogs | null, selected: () => (DeviceVoiceSettings | null | undefined)[],
 *   busy: () => boolean, changed?: () => Promise<unknown>, log?: (error: unknown) => void}} options
 */
export async function cleanSetupDownloads({ storage, models, selected, busy, changed, log = console.warn }) {
  const ids = take(storage);
  if (!ids.length || !models?.uninstall || busy()) return;
  let removed = false;
  for (const id of ids) {
    if (busy()) break;
    try {
      const catalogs = await models.catalogs();
      const model = localModel(catalogs, id);
      if (!model || !installed(model)) continue;
      const settings = selected();
      if (!settings.length || !settings[0] || settings.some((value) => value && modelPurposes(catalogs, value)(id).length)) continue;
      if (busy()) break;
      await models.uninstall(id);
      removed = true;
    } catch (error) { log(error); }
  }
  if (removed) try { await changed?.(); } catch (error) { log(error); }
}
