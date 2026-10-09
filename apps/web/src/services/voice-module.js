/* Where the page's voice comes from (sidevoice/sidevoice-core#89). Inside the desktop app it is the app's own build of
 * the module, `host.voice`. On the web it is `@sidevoice/voice`'s `createVoiceHost` over this page's models
 * (`voice-source.ts`, on `@sidevoice/engine`). Either way the page gets the same interface and nothing else of audio.
 *
 * Both packages are loaded the first time the page needs its voice, each in its own chunk. */
import { engineVoiceSource, voiceRefusal } from './voice-source.ts';

/** The page as the engine's host: what this browser can run models on, and the provider keys `keys` keeps. */
export async function browserHost(navigator, keys) {
  const accelerators = ['wasm'];
  if (navigator?.gpu && await navigator.gpu.requestAdapter().catch(() => null)) accelerators.unshift('webgpu');
  return {
    credential: async (provider) => keys.get(provider),
    capabilities: async () => ({
      os: 'web', arch: 'wasm32', accelerators,
      memoryMb: navigator?.deviceMemory ? Math.round(navigator.deviceMemory * 1024) : undefined,
      cores: navigator?.hardwareConcurrency || undefined,
    }),
  };
}

const loadPackages = () => Promise.all([import('@sidevoice/voice'), import('@sidevoice/engine')]);

/** The page's voice: the desktop app's when there is one, else the module's on this page. */
export async function openVoice({ host = globalThis.window?.__sidevoiceDesktop?.host, load = loadPackages } = {}) {
  if (host?.voice) return host.voice;
  let voice, engine;
  try {
    [voice, engine] = await load();
    await Promise.all([voice.default(), engine.default()]);
  } catch (cause) {
    throw Object.assign(voiceRefusal('voice-module-unavailable'), { cause });
  }
  // The engine reads a provider's key where the voice keeps it, each time it needs one.
  const keys = voice.localStorageProviderKeys();
  const source = engineVoiceSource(await engine.WebEngine.create(await browserHost(globalThis.navigator, keys)));
  return voice.createVoiceHost(source, { keys });
}
