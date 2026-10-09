/* Where the page's voice comes from (sidevoice/sidevoice-core#89). Inside the desktop app it is the app's own build of
 * the module, `host.voice`. On the web it is `@sidevoice/voice` on the page's engine, `@sidevoice/engine`, behind
 * `voice-host.js`. Either way the page gets the same interface and nothing else of audio.
 *
 * The packages are loaded when a call starts, not bundled: until the page's build carries them, a call cannot open
 * its voice and says so (`voice-module-unavailable`). */
import { createVoiceHost, providerKey, voiceFailure } from './voice-host.js';

const VOICE = '@sidevoice/voice', ENGINE = '@sidevoice/engine';

/** The person's choices a call starts with, in `language`. */
export function defaultVoiceSettings(language) {
  return { stt: { model: 'whisper-base', language: language || null }, tts: { model: 'kokoro-82m-v1.0' }, patience: 'normal' };
}

/** The page as the engine's host: what this browser can run models on, and the provider keys this device keeps. */
export async function browserHost(navigator = globalThis.navigator) {
  const accelerators = ['wasm'];
  if (navigator?.gpu && await navigator.gpu.requestAdapter().catch(() => null)) accelerators.unshift('webgpu');
  return {
    credential: async (provider) => providerKey(provider),
    capabilities: async () => ({
      os: 'web', arch: 'wasm32', accelerators,
      memoryMb: navigator?.deviceMemory ? Math.round(navigator.deviceMemory * 1024) : undefined,
      cores: navigator?.hardwareConcurrency || undefined,
    }),
  };
}

/** The page's voice: the desktop app's when there is one, else the module's on this page. */
export async function openVoice({
  host = globalThis.window?.__sidevoiceDesktop?.host,
  load = (specifier) => import(/* @vite-ignore */ specifier),
} = {}) {
  if (host?.voice) return host.voice;
  let voice, engine;
  try {
    [voice, engine] = await Promise.all([load(VOICE), load(ENGINE)]);
  } catch (cause) {
    throw voiceFailure('voice-module-unavailable', cause);
  }
  await engine.default?.();
  await voice.default?.();
  return createVoiceHost(await engine.WebEngine.create(await browserHost()), { VoiceCall: voice.VoiceCall });
}
