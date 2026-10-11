/* The models this page's voice can be given, and the keys of remote providers: the engine's, wherever it runs. In the
 * desktop app it is the app's engine, `host.engine` (sidevoice-desktop's `docs/BRIDGE.md`); on the web it is
 * @sidevoice/engine's `WebEngine` on this page, with the keys in this browser's storage. Both answer the same three
 * calls, `ModelCatalogs`, and the settings pane asks nothing else. */

/**
 * @typedef {{reason?: {code: string, params?: Record<string, number>}, stale: boolean, detail?: string}} CatalogStatus
 *   How a catalogue stands, as the engine says: why it is not current (absent when it is), whether its models are the
 *   last kept, and what a provider said when it last refused.
 * @typedef {import('@sidevoice/engine').ModelInfo & Partial<import('@sidevoice/engine').LocalModelInfo>} CatalogModel
 *   A model as its catalogue lists it; a local one also has its family and builds.
 * @typedef {{id: string, name: string | null, status: CatalogStatus, models: CatalogModel[]}} CatalogView
 *   One catalogue: `local` first, then each remote provider's, its id the provider's.
 * @typedef {{fraction: number | null, done: number | null, total: number | null}} InstallProgress How far an install has
 *   got: the share of it done (null while unknown), and its bytes when the engine counts them.
 * @typedef {{build?: string | null, engine?: string | null, onProgress?: (progress: InstallProgress) => void, signal?: AbortSignal}} InstallOptions
 *   Which build (its id, and its engine for a native engine), where progress goes, and the signal that cancels it.
 * @typedef {{
 *   catalogs(): Promise<CatalogView[]>,
 *   install(model: string, options?: InstallOptions): Promise<void>,
 *   setCredential(provider: string, key: string | null): Promise<void>,
 *   hasCredential(provider: string): Promise<boolean>,
 * }} ModelCatalogs
 */

/** The id of the catalogue of models that run on this device. */
export const LOCAL_CATALOG = 'local';

import { engineFailureCode } from './failure-code.js';

const KEY_PREFIX = 'sidevoice.provider-key.';

/**
 * Provider keys in this browser's `localStorage`: where the page's engine host reads them (`credential`) and the
 * settings pane writes them. Any script of the page can read them; the pane says so.
 * @param {Storage | undefined} [storage]
 */
export function localStorageCredentials(storage = globalThis.localStorage) {
  return {
    /** @param {string} provider */
    get: (provider) => storage?.getItem(KEY_PREFIX + provider) ?? null,
    /** @param {string} provider @param {string | null} key */
    set: (provider, key) => (key == null ? storage?.removeItem(KEY_PREFIX + provider) : storage?.setItem(KEY_PREFIX + provider, key)),
  };
}

/** A cancelled install, whoever ran it, by one code. */
const cancelled = () => Object.assign(new Error('install-cancelled'), { code: 'install-cancelled' });

/** The web engine's progress (files done of all, and the bytes of the one downloading) as a share of the install. */
export function webInstallProgress(progress) {
  const files = progress?.files || 0;
  if (!files) return { fraction: null, done: null, total: null };
  const current = progress.size ? Math.min(1, (progress.received || 0) / progress.size) : 0;
  return { fraction: Math.min(1, ((progress.done || 0) + current) / files), done: null, total: null };
}

/** The desktop app's native engine install (`host.nativeEngine`, sidevoice-desktop's BRIDGE.md) as `install`: its
 *  bytes as the share done, and the signal as its `cancel(job)`.
 * @param {{install(model: string, engine: string | null, onProgress: (report: {done: number, total: number}) => void): Promise<void> & {job: string}, cancel(job: string): unknown}} nativeEngine
 * @returns {ModelCatalogs['install']}
 */
export function nativeInstall(nativeEngine) {
  return (model, { engine = null, onProgress, signal } = {}) => {
    if (signal?.aborted) return Promise.reject(cancelled());
    const running = nativeEngine.install(model, engine, (report) => onProgress?.({
      fraction: report?.total ? Math.min(1, report.done / report.total) : null, done: report?.done ?? null, total: report?.total ?? null,
    }));
    signal?.addEventListener('abort', () => { void nativeEngine.cancel(running.job); }, { once: true });
    return running.then(() => undefined, (error) => { throw error?.key === 'install_cancelled' ? cancelled() : error; });
  };
}

/** What a catalogue that failed to answer stands as: its error as the reason it is not current. */
function failed(error) {
  return { stale: false, reason: { code: engineFailureCode(error, 'catalog-failed'), params: error?.params ?? {} }, ...(error?.detail ? { detail: String(error.detail) } : {}) };
}

/**
 * `engine`'s catalogues as `ModelCatalogs`, with the keys in `credentials`. A catalogue that cannot list its models
 * (a provider with no key, say) is listed with none, and its status says why: when the catalogue itself gave no
 * reason, the failure of its listing is the reason.
 * @param {import('@sidevoice/engine').WebEngine} engine
 * @param {{get(provider: string): string | null, set(provider: string, key: string | null): void}} credentials
 * @returns {ModelCatalogs}
 */
export function engineCatalogs(engine, credentials) {
  return {
    catalogs: () => Promise.all(engine.catalogs().map(async (catalog) => {
      const status = await catalog.status().catch(failed);
      // Every capability at once: the engine lists all of a catalogue's models when it is given none.
      const list = /** @type {() => Promise<CatalogModel[]>} */ (/** @type {unknown} */ (catalog.models.bind(catalog)));
      let failure = null;
      const models = await list().catch((error) => { failure = error; return []; });
      return { id: catalog.id, name: catalog.name ?? null, status: failure && !status.reason ? failed(failure) : status, models };
    })),
    // On this device, in its private storage: the build named, or the one the engine recommends.
    install: (model, { build = null, onProgress, signal } = {}) =>
      engine.install(model, build ?? undefined, (progress) => onProgress?.(webInstallProgress(progress)), signal)
        .catch((error) => { throw signal?.aborted || error?.code === 'cancelled' ? cancelled() : error; }),
    async setCredential(provider, key) {
      credentials.set(provider, typeof key === 'string' && key.trim() ? key.trim() : null);
    },
    async hasCredential(provider) {
      return credentials.get(provider) != null;
    },
  };
}
