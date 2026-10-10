import { expect, test, vi } from "vitest";
import type { WebEngine } from "@sidevoice/engine";
import type { VoiceSettings } from "@sidevoice/voice";
import { engineVoiceSource } from "./voice-source";

/* The page's models for its voice, over a fake engine of catalogues that records what each loaded and answers as
 * told. */

type Capability = "stt" | "tts" | "vad" | "end-of-turn";
const build = (id: string, extra: Record<string, unknown> = {}) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 1, memoryMb: 1, available: true, reasons: [], installed: true, ...extra });
const local = (id: string, capabilities: Capability[], builds = [build(id + "/int8")]) =>
  ({ id, family: id, capabilities, parametersM: 1, languages: ["es"], license: "MIT", voices: [], installed: true, builds });
const remote = (id: string, capabilities: Capability[]) => ({ id, capabilities, languages: [], voices: [] });
const LOCAL = [
  local("other-vad", ["vad"]),
  local("silero-vad", ["vad"]),
  local("whisper-base", ["stt"]),
  local("whisper-large", ["stt"], [build("whisper-large/gpu", { available: false })]),
  local("kokoro-82m-v1.0", ["tts"]),
  local("smart-turn-v3", ["end-of-turn"]),
];
const ELEVENLABS = [remote("scribe_v2", ["stt"]), remote("eleven_flash_v2_5", ["tts"])];
const settings = (patch: Partial<VoiceSettings> = {}): VoiceSettings => ({
  stt: { catalog: "local", model: "whisper-base", language: "es" }, tts: { catalog: "local", model: "kokoro-82m-v1.0", voice: null, speed: 1 },
  patience: "normal", end_of_turn: "silence", ...patch,
});

type Listed = Record<string, unknown>[];
function fakeEngine({ catalogs = { local: LOCAL, elevenlabs: ELEVENLABS } as Record<string, Listed | Error>, vadRate = 16000 } = {}) {
  const loaded: [string, string][] = [];
  const calls: unknown[][] = [];
  const stream = {
    sampleRate: vadRate, window: 512,
    accept: async (samples: Float32Array) => { calls.push(["accept", samples.length]); return { frames: [{ end: 512, speech: true, probability: 0.9 }], events: [] }; },
    reset: async () => { calls.push(["reset"]); },
  };
  const loadedModel = (id: string) => ({
    id,
    asVad: () => (id === "silero-vad" ? { stream: async (options: object) => { calls.push(["stream", options]); return stream; } } : undefined),
    asStt: () => (["whisper-base", "scribe_v2"].includes(id) ? { transcribe: async (...args: unknown[]) => { calls.push(["transcribe", ...args]); return "hola"; } } : undefined),
    asTts: () => (["kokoro-82m-v1.0", "eleven_flash_v2_5"].includes(id) ? {
      voices: async () => [{ id: "ef_dora", languages: ["es"] }],
      speak: async (...args: unknown[]) => { calls.push(["speak", ...args]); return { samples: new Float32Array(2), sampleRate: 24000 }; },
    } : undefined),
    asEndOfTurn: () => (id === "smart-turn-v3" ? { seconds: 8, probability: async () => 0.7 } : undefined),
  });
  const catalog = (id: string) => {
    const listing = catalogs[id];
    if (listing === undefined) throw Object.assign(new Error("no such catalogue"), { code: "catalog-not-found", params: {} });
    return {
      id,
      models: async (capability: Capability) => {
        if (listing instanceof Error) throw listing;
        return listing.filter((model) => (model.capabilities as Capability[]).includes(capability));
      },
      load: vi.fn(async (model: string, progress: (value: object) => void) => { loaded.push([id, model]); progress({ files: 1, done: 0, received: 1 }); return loadedModel(model); }),
    };
  };
  const made = new Map<string, ReturnType<typeof catalog>>();
  const of = (id: string) => { if (!made.has(id)) made.set(id, catalog(id)); return made.get(id)!; };
  const engine = { catalog: of, localCatalog: () => of("local") };
  return { engine: engine as unknown as WebEngine, loaded, calls, of };
}

test("silence loads the detector, then each slot from the catalogue it names, and no end-of-turn model", async () => {
  const { engine, loaded, calls } = fakeEngine();
  const models = await engineVoiceSource(engine).models(settings());
  expect(loaded).toEqual([]);
  const slots = await models.load();
  expect(loaded).toEqual([["local", "silero-vad"], ["local", "whisper-base"], ["local", "kokoro-82m-v1.0"]]);
  expect(slots.endOfTurn).toBeUndefined();
  expect(await slots.vad.accept(new Float32Array(512))).toEqual([{ end: 512, speech: true, probability: 0.9 }]);
  await slots.vad.reset();
  expect(await slots.transcriber.transcribe(new Float32Array(3), 16000, undefined)).toBe("hola");
  await slots.speaker.speak("hola", undefined, "es", 1.1);
  expect(calls).toEqual([["stream", { threshold: 0.6, minSilenceMs: 200, minSpeechMs: 400 }], ["accept", 512], ["reset"], ["transcribe", new Float32Array(3), 16000, null], ["speak", "hola", "ef_dora", "es", 1.1]]);
});

test("a remote slot loads from its provider's catalogue; the detector stays this device's", async () => {
  const { engine, loaded } = fakeEngine();
  await (await engineVoiceSource(engine).models(settings({
    stt: { catalog: "elevenlabs", model: "scribe_v2", language: "es" }, tts: { catalog: "elevenlabs", model: "eleven_flash_v2_5", voice: "v1" },
  }))).load();
  expect(loaded).toEqual([["local", "silero-vad"], ["elevenlabs", "scribe_v2"], ["elevenlabs", "eleven_flash_v2_5"]]);
});

test("smart-turn adds this device's end-of-turn model", async () => {
  const { engine, loaded } = fakeEngine();
  const slots = await (await engineVoiceSource(engine).models(settings({ end_of_turn: "smart-turn" }))).load();
  expect(loaded).toContainEqual(["local", "smart-turn-v3"]);
  expect(await slots.endOfTurn!.endOfTurn(new Float32Array(1), 16000)).toBe(0.7);
});

test("what this device cannot run is refused with a code before anything loads", async () => {
  const refused = async (patch: Partial<VoiceSettings>, catalogs?: Record<string, Listed | Error>) => {
    const { engine, loaded } = fakeEngine(catalogs ? { catalogs } : {});
    const error = await Promise.resolve(engineVoiceSource(engine).models(settings(patch))).then(() => null, (failure: unknown) => failure);
    expect(loaded).toEqual([]);
    return error as { code: string; detail?: string } | null;
  };
  expect(await refused({ stt: { catalog: "local", model: "parakeet" } })).toMatchObject({ code: "model-unknown" });
  expect(await refused({ stt: { catalog: "local", model: "kokoro-82m-v1.0" } })).toMatchObject({ code: "model-unknown" });
  expect(await refused({ stt: { model: "whisper-base" } })).toMatchObject({ code: "model-unknown" });
  expect(await refused({ stt: { catalog: "nowhere", model: "whisper-base" } })).toMatchObject({ code: "catalog-not-found" });
  // A local model with no build that runs here is refused too, not left to fail at loading.
  expect(await refused({ stt: { catalog: "local", model: "whisper-large" } })).toMatchObject({ code: "model-unfit" });
  expect(await refused({ end_of_turn: "smart-turn" }, { local: LOCAL.filter((m) => m.id !== "smart-turn-v3") })).toMatchObject({ code: "end-of-turn-unavailable" });
  expect(await refused({}, { local: LOCAL.filter((m) => !(m.capabilities as string[]).includes("vad")) })).toMatchObject({ code: "vad-unavailable" });
  // A provider that refuses to list is the refusal, with what it said.
  const keyless = Object.assign(new Error("no key"), { code: "credential-missing", params: {}, detail: "invalid_api_key: Invalid API key" });
  expect(await refused({ tts: { catalog: "elevenlabs", model: "eleven_flash_v2_5" } }, { local: LOCAL, elevenlabs: keyless }))
    .toMatchObject({ code: "credential-missing", detail: "invalid_api_key: Invalid API key" });
});

test("a detector at another rate than the voice feeds is refused, and a provider's failure keeps its code and words", async () => {
  const slow = fakeEngine({ vadRate: 8000 });
  await expect((await engineVoiceSource(slow.engine).models(settings())).load()).rejects.toMatchObject({ code: "vad-sample-rate" });
  const failing = fakeEngine();
  const tts = { catalog: "elevenlabs", model: "eleven_flash_v2_5" };
  const models = await engineVoiceSource(failing.engine).models(settings({ tts }));
  failing.of("elevenlabs").load.mockRejectedValueOnce(Object.assign(new Error("quota"), { code: "provider-refused", params: {}, detail: "quota_exceeded" }));
  await expect(models.load()).rejects.toMatchObject({ code: "provider-refused", detail: "quota_exceeded" });
});

test("loading reports progress per model", async () => {
  const { engine } = fakeEngine();
  const seen: string[] = [];
  await (await engineVoiceSource(engine, { onProgress: (id) => seen.push(id) }).models(settings())).load();
  expect(seen).toEqual(["silero-vad", "whisper-base", "kokoro-82m-v1.0"]);
});
