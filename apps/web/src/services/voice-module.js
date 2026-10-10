/* Where the page's voice and its models come from (sidevoice/sidevoice-core#89). Inside the desktop app they are the
 * app's own: the call is `host.voice`, the engine's catalogues and provider keys `host.engine`. On the web the call is
 * `@sidevoice/voice`'s `createVoiceHost` over this page's models (`voice-source.ts`), and the catalogues and keys those
 * of the same `@sidevoice/engine` on this page (`model-catalogs.js`). Either way the page gets the same two
 * interfaces, `VoiceHost` and `ModelCatalogs`, and nothing else of audio or models.
 *
 * Both packages are loaded the first time the page needs either, each in its own chunk, and the page makes one engine. */
import { engineVoiceSource, voiceRefusal } from './voice-source.ts';
import { engineCatalogs, localStorageCredentials } from './model-catalogs.js';

/** The page as the engine's host: what this browser can run models on, and the provider keys `credentials` keeps. */
export async function browserHost(navigator, credentials) {
  const accelerators = ['wasm'];
  if (navigator?.gpu && await navigator.gpu.requestAdapter().catch(() => null)) accelerators.unshift('webgpu');
  return {
    credential: async (provider) => credentials.get(provider),
    capabilities: async () => ({
      os: 'web', arch: 'wasm32', accelerators,
      memoryMb: navigator?.deviceMemory ? Math.round(navigator.deviceMemory * 1024) : undefined,
      cores: navigator?.hardwareConcurrency || undefined,
    }),
  };
}

const loadPackages = () => Promise.all([import('@sidevoice/voice'), import('@sidevoice/engine')]);

/** The packages and this page's one engine, made the first time they are asked for. */
function browserParts(load) {
  return (async () => {
    let voice, engine;
    try {
      [voice, engine] = await load();
      await Promise.all([voice.default(), engine.default()]);
    } catch (cause) {
      throw Object.assign(voiceRefusal('voice-module-unavailable'), { cause });
    }
    const credentials = localStorageCredentials();
    // The engine reads a provider's key where the page keeps it, each time it needs one.
    const webEngine = await engine.WebEngine.create(await browserHost(globalThis.navigator, credentials));
    return { voice, engine: webEngine, credentials };
  })();
}

/**
 * The page's voice and its models' catalogues: the desktop app's when there is one, else this page's own.
 * @param {{host?: any, load?: () => Promise<any[]>}} [options] The desktop app's host, and how the packages load.
 * @returns {{voice: () => Promise<import('@sidevoice/voice').VoiceHost>, catalogs: () => Promise<import('./model-catalogs.js').ModelCatalogs>}}
 */
export function pageVoice({ host: given, load = loadPackages } = {}) {
  let parts = null;
  // The desktop app's host as it is when asked for: it may be installed after this page's script runs.
  const appHost = () => given ?? globalThis.window?.__sidevoiceDesktop?.host;
  const browser = () => (parts ??= browserParts(load).catch((error) => { parts = null; throw error; }));
  return {
    async voice() {
      const host = appHost();
      if (host?.voice) return host.voice;
      const { voice, engine } = await browser();
      return voice.createVoiceHost(engineVoiceSource(engine));
    },
    async catalogs() {
      const host = appHost();
      if (host?.voice) {
        if (typeof host.engine?.catalogs !== 'function') throw voiceRefusal('catalogs-unavailable');
        return host.engine;
      }
      const { engine, credentials } = await browser();
      return engineCatalogs(engine, credentials);
    },
  };
}
