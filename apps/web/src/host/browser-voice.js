/* Where the page's voice and its models come from (sidevoice/sidevoice-core#89). Inside the desktop app they are the
 * app's own: the call is `host.voice`, the engine's catalogues and provider keys `host.engine`. On the web the call is
 * `@sidevoice/voice`'s `createVoiceHost` over this page's models (`voice-source.ts`), and the catalogues and keys those
 * of the same `@sidevoice/engine` on this page (`model-catalogs.js`). Either way the page gets the same two
 * interfaces, `VoiceHost` and `ModelCatalogs`, and nothing else of audio or models.
 *
 * Both packages are loaded the first time the page needs either, each in its own chunk, and the page makes one engine. */
import { engineVoiceSource, voiceRefusal } from '../services/voice-source.ts';
import { engineCatalogs, localStorageCredentials } from '../services/model-catalogs.js';
import { engineFailureCode } from '../services/failure-code.js';
import { audioDiagnostics } from '../services/audio-diagnostics.ts';

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

/** Begin microphone permission and Web Audio in the button's user gesture, before models or chunks are awaited.
 * @param {string | null} [input] The microphone chosen, by its device id; the system's default when none.
 * @returns {{context: AudioContext, resumed: Promise<void>, stream: Promise<MediaStream>, release(): void} | null} */
export function beginBrowserAudioActivation(input = null) {
  if (!globalThis.navigator?.mediaDevices?.getUserMedia || !globalThis.AudioContext) return null;
  const context = new AudioContext();
  const resumed = context.resume();
  const stream = navigator.mediaDevices.getUserMedia({ audio: {
    echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1,
    ...(input ? { deviceId: { exact: input } } : {}),
  } }).catch((error) => { throw Object.assign(new Error(error?.message || "getUserMedia"), {
    code: error?.name === "NotAllowedError" || error?.name === "SecurityError" ? "microphone-denied" : "microphone-unavailable",
  }); });
  // A model may load for a while before these promises are observed.
  void resumed.catch(() => {});
  void stream.catch(() => {});
  // The page's own stream and context are watched, not changed (sidevoice-web#341).
  const unwatch = [];
  let released = false;
  try {
    const diagnostics = audioDiagnostics();
    const stopContext = diagnostics.watchContext(context);
    void stream.then((opened) => { if (!released) unwatch.push(diagnostics.watchStream(opened, context)); }, () => {});
    unwatch.push(stopContext);
  } catch { /* never in the way of the call */ }
  return { context, resumed, stream, release() {
    released = true;
    try { unwatch.forEach((stop) => stop()); } catch { /* nothing to undo */ }
    void stream.then((opened) => opened.getTracks().forEach((track) => track.stop()), () => {});
    void context.close().catch(() => {});
  } };
}

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
    // The engine reads a provider's key where the page keeps it, each time it needs one. Its failure to start is the
    // voice's, by a code the page can say (`engineFailureCode`).
    try {
      const webEngine = await engine.WebEngine.create(await browserHost(globalThis.navigator, credentials));
      return { voice, engine: webEngine, credentials };
    } catch (cause) {
      const code = engineFailureCode(cause);
      throw Object.assign(voiceRefusal(code, String(cause?.message || code), cause?.detail), { cause });
    }
  })();
}

/**
 * The page's voice and its models' catalogues: the desktop app's when there is one, else this page's own.
 * @param {{host?: any, load?: () => Promise<any[]>, app?: () => any}} [options] The app's host given outright (a test), how the packages
 *   load, and where the app's voice is found when it is asked for.
 * @returns {{voice: () => Promise<import('@sidevoice/voice').VoiceHost>, catalogs: () => Promise<import('../services/model-catalogs.js').ModelCatalogs>}}
 */
export function pageVoice({ host: given, load = loadPackages, app = () => null } = {}) {
  let parts = null;
  // The desktop app's host as it is when asked for: it may be installed after this page's script runs.
  const appHost = () => given ?? app();
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
        // Its models install through the app's engine, which takes the web's own options (sidevoice-desktop#51).
        return host.engine;
      }
      const { engine, credentials } = await browser();
      return engineCatalogs(engine, credentials);
    },
  };
}
