/* Whether this browser lets the page keep anything. The pairings and settings live in localStorage, the outbox in
 * IndexedDB, the engine's models in the origin's private file system (OPFS). A browser set to block site data for the
 * page (or some private windows) refuses every one of them with a SecurityError: nothing pairs across a reload and
 * the voice cannot start. One probe of each, at start, says so once, instead of each failing later on its own. */

import { failureCode } from './failure-code.js';

/** What a probe found: the stores that refused, by name, with the refusal's code. */
/** @typedef {{blocked: boolean, refused: {store: 'localStorage' | 'indexedDB' | 'opfs', code: string}[]}} SiteStorage */

const PROBE_KEY = 'sidevoice.storage-probe';
const PROBE_DB = 'sidevoice-storage-probe';

/** `store` refused when `probe` throws or rejects with a SecurityError; any other failure is not this one's to say. */
async function refusal(store, probe) {
  try {
    await probe();
    return null;
  } catch (error) {
    const code = failureCode(error, '');
    return code === 'SecurityError' ? { store, code } : null;
  }
}

/** Opens (and deletes) a throwaway database: a blocked origin fails the open, or throws at once. */
function openProbeDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROBE_DB);
    // Opened is all the probe asks; closing and deleting it may not be offered, and never decide anything.
    request.onsuccess = () => {
      try { request.result?.close?.(); indexedDB.deleteDatabase?.(PROBE_DB); } catch { /* a probe leaves nothing to fix */ }
      resolve(undefined);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Probes the page's storage once. Each store absent from this browser (no IndexedDB, no OPFS) is skipped.
 * @param {{localStorage?: () => Storage, indexedDB?: IDBFactory | null, storage?: {getDirectory?: () => Promise<unknown>} | null}} [where]
 *   Where each store is reached; the page's own by default. `localStorage` is a getter, since reading the property is
 *   what a blocked origin refuses.
 * @returns {Promise<SiteStorage>}
 */
export async function probeSiteStorage({
  localStorage = () => globalThis.localStorage,
  indexedDB = globalThis.indexedDB ?? null,
  storage = globalThis.navigator?.storage ?? null,
} = {}) {
  const refused = (await Promise.all([
    refusal('localStorage', () => { const store = localStorage(); store.setItem(PROBE_KEY, '1'); store.removeItem(PROBE_KEY); }),
    indexedDB ? refusal('indexedDB', () => openProbeDatabase(indexedDB)) : null,
    storage?.getDirectory ? refusal('opfs', () => storage.getDirectory()) : null,
  ])).filter(Boolean);
  return { blocked: refused.length > 0, refused };
}
