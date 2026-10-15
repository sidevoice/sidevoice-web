/* Candidate models installed by first-run setup. A catalogue comparison can identify a possible setup download,
 * but cannot prove that all current builds still belong to it or that another tab is not using one. The record is
 * therefore never an authorization to uninstall. */

import { LOCAL_CATALOG } from './model-catalogs.js';

/** @typedef {import('./model-catalogs.js').CatalogView} CatalogView */

export const SETUP_DOWNLOADS_KEY = 'sidevoice.setup-model-downloads';

/** A local model with a trustworthy installed-build listing, or nothing when the catalogue cannot prove it. */
function localModel(catalogs, id) {
  const local = catalogs?.find((catalog) => catalog.id === LOCAL_CATALOG);
  if (!local || local.status?.stale !== false || local.status.reason) return null;
  const model = local.models?.find((entry) => entry.id === id);
  return model && Array.isArray(model.builds) ? model : null;
}

const installed = (model) => model.installed === true || model.builds.some((build) => build.installed === true);

/** Snapshot absence before the engine can mutate catalogue objects during the install. */
export function setupModelAbsent(catalogs, id) {
  const model = localModel(catalogs, id);
  return !!model && !installed(model);
}

/** The set kept on this device; invalid or inaccessible storage authorizes no deletion. */
function read(storage) {
  try {
    const raw = storage?.getItem(SETUP_DOWNLOADS_KEY);
    if (raw == null) return storage ? [] : null;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id.length > 0) ? [...new Set(ids)] : null;
  } catch { return null; }
}

/** A successful setup install with no pre-existing build is the only source of a candidate model ID. */
export function recordSetupInstall(storage, id, absentBeforeInstall, after) {
  const newModel = localModel(after, id);
  if (!absentBeforeInstall || !newModel || !installed(newModel)) return false;
  const ids = read(storage);
  if (!ids) return false;
  try {
    const next = [...new Set([...ids, id])];
    storage.setItem(SETUP_DOWNLOADS_KEY, JSON.stringify(next));
    return JSON.stringify(read(storage)) === JSON.stringify(next);
  } catch { return false; }
}

/** Any ordinary install or explicit removal invalidates a setup candidate, even if the operation later fails. */
export function forgetSetupInstall(storage, id) {
  const ids = read(storage);
  if (!ids?.includes(id)) return;
  try { storage.removeItem(SETUP_DOWNLOADS_KEY); } catch { /* Leaving a candidate cannot authorize deletion. */ }
}

/** Consume the candidate list after setup; a failed clear cannot authorize deletion. */
function take(storage) {
  const ids = read(storage);
  if (!ids?.length) return [];
  try {
    storage.removeItem(SETUP_DOWNLOADS_KEY);
    return storage.getItem(SETUP_DOWNLOADS_KEY) == null ? ids : [];
  } catch { return []; }
}

/**
 * The existing whole-model uninstall has no store-wide ownership receipt or atomic check of selections and use.
 * Finishing setup discards candidates without deleting files until the host can provide that guarantee.
 */
export function discardSetupDownloadCandidates(storage) { take(storage); }
