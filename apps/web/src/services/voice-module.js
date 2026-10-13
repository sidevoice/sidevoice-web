/* Where the page's voice and its models come from (sidevoice/sidevoice-core#89). Inside the desktop app they are the
 * app's own: the call is `host.voice`, the engine's catalogues and provider keys `host.engine`. On the web the call is
 * `@sidevoice/voice`'s `createVoiceHost` over this page's models (`voice-source.ts`), and the catalogues and keys those
 * of the same `@sidevoice/engine` on this page (`model-catalogs.js`). Either way the page gets the same two
 * interfaces, `VoiceHost` and `ModelCatalogs`, and nothing else of audio or models.
 *
 * Both packages are loaded the first time the page needs either, each in its own chunk, and the page makes one engine. */
import { engineVoiceSource, voiceRefusal } from './voice-source.ts';
import { engineCatalogs, localStorageCredentials } from './model-catalogs.js';
import { engineFailureCode } from './failure-code.js';

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

/** A slot's model as the voice tells one from another: the settings' slot without what applies without reloading it
 *  (the language; the voice and the speed). */
const modelOf = ({ language: _language, ...stt }) => stt;
const speakerOf = ({ voice: _voice, speed: _speed, ...tts }) => tts;
const modelsKey = (settings) => JSON.stringify([modelOf(settings.stt), speakerOf(settings.tts), settings.turn_model ?? null]);

/**
 * The voice over `source`, a model changed without a cut (contract gap #31). The voice is given one stable model per
 * slot — transcriber, speaker, end-of-turn classifier — each calling whichever model is chosen now; a change of model
 * or source loads the new one and, once it is ready, moves the slot onto it. What was under way finishes on the model
 * it began with (it holds that one), and the call goes on: the voice is told the settings with the slots it was made
 * with, so it only takes what applies without reloading (language, voice, speed, patience). A change between Smart and
 * Silence is the voice's own to make (a stage of its turn logic): that one it still applies by restarting.
 * @param {(source: import('@sidevoice/voice').VoiceModelSource) => import('@sidevoice/voice').VoiceHost} createVoiceHost
 * @param {import('@sidevoice/voice').VoiceModelSource} source
 * @returns {import('@sidevoice/voice').VoiceHost}
 */
export function swappingVoiceHost(createVoiceHost, source) {
  /** The settings being applied: whatever loads, loads these. */
  let latest = null;
  /** The settings the voice was made with, or last restarted on: their slots are the ones it is always told. */
  let held = null;
  /** The settings whose models the slots call (or will, once loaded). */
  let applied = null;
  /** The models the slots call now; null until the voice first loads them. */
  let current = null;
  let changes = 0;
  const slots = {
    transcriber: { transcribe: (...args) => current.transcriber.transcribe(...args) },
    speaker: { speak: (...args) => current.speaker.speak(...args) },
    endOfTurn: { endOfTurn: (...args) => current.endOfTurn.endOfTurn(...args) },
  };
  // The voice asks for its models on its first settings and on a change of its own stages; it loads them as it starts
  // (and again after unloading them while idle): the settings chosen by then. What it gets is the slots, never the
  // models themselves.
  const voice = createVoiceHost({
    async models(settings) {
      const chosen = await source.models(settings);
      return {
        async load() {
          current = await (latest && latest !== settings ? await source.models(latest) : chosen).load();
          return { vad: current.vad, transcriber: slots.transcriber, speaker: slots.speaker, ...(current.endOfTurn ? { endOfTurn: slots.endOfTurn } : {}) };
        },
      };
    },
  });
  const turnOf = (settings) => settings.end_of_turn ?? 'silence';
  return Object.freeze({
    ...voice,
    async setSettings(settings) {
      const change = ++changes;
      latest = settings;
      // The first settings, or Smart and Silence swapped: the voice's to apply, loading the models chosen now.
      if (!held || turnOf(held) !== turnOf(settings)) {
        held = applied = settings;
        return voice.setSettings(settings);
      }
      const asHeld = { ...settings, stt: { ...settings.stt, ...modelOf(held.stt) }, tts: { ...settings.tts, ...speakerOf(held.tts) } };
      if (modelsKey(applied) !== modelsKey(settings)) {
        // Another model: refused before anything changes when this device can't run it; loaded, then the slots move
        // to it — unless a later change came meanwhile, which applies instead.
        const chosen = await source.models(settings);
        if (current) {
          const next = await chosen.load();
          if (change !== changes) return;
          current = next;
        }
        applied = settings;
      }
      await voice.setSettings(asHeld);
    },
  });
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
      return swappingVoiceHost(voice.createVoiceHost, engineVoiceSource(engine));
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
