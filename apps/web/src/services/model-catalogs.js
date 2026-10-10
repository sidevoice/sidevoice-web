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
 * @typedef {{
 *   catalogs(): Promise<CatalogView[]>,
 *   setCredential(provider: string, key: string | null): Promise<void>,
 *   hasCredential(provider: string): Promise<boolean>,
 * }} ModelCatalogs
 */

/** The id of the catalogue of models that run on this device. */
export const LOCAL_CATALOG = 'local';

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

/** What a catalogue that failed to answer stands as: its error as the reason it is not current. */
function failed(error) {
  return { stale: false, reason: { code: String(error?.code || 'catalog-failed'), params: error?.params ?? {} }, ...(error?.detail ? { detail: String(error.detail) } : {}) };
}

/**
 * `engine`'s catalogues as `ModelCatalogs`, with the keys in `credentials`. A catalogue that cannot list its models
 * (a provider with no key, say) is listed with none, and its status says why.
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
      const models = await list().catch(() => []);
      return { id: catalog.id, name: catalog.name ?? null, status, models };
    })),
    async setCredential(provider, key) {
      credentials.set(provider, typeof key === 'string' && key.trim() ? key.trim() : null);
    },
    async hasCredential(provider) {
      return credentials.get(provider) != null;
    },
  };
}
