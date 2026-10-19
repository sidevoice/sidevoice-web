import { expect, test, vi } from "vitest";
import type { WebEngine } from "@sidevoice/engine";
import type { VoiceModelChoice } from "@sidevoice/voice";
import { engineVoiceSource } from "./voice-source";

/* The page's models for its voice, slot by slot, over a fake engine of catalogues that records what each loaded and
 * answers as told. */

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
const stt = (patch: VoiceModelChoice = {}): VoiceModelChoice => ({ catalog: "local", model: "whisper-base", ...patch });
const tts = (patch: VoiceModelChoice = {}): VoiceModelChoice => ({ catalog: "local", model: "kokoro-82m-v1.0", ...patch });

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

test("each slot loads on its own: the detector, the transcriber, the speaker, and no end-of-turn model unless asked", async () => {
  const { engine, loaded, calls } = fakeEngine();
  const source = engineVoiceSource(engine);
  expect(loaded).toEqual([]);
  const vad = await source.vad();
  expect(loaded).toEqual([["local", "silero-vad"]]);
  const transcriber = await source.transcriber(stt());
  const speaker = await source.speaker(tts());
  expect(loaded).toEqual([["local", "silero-vad"], ["local", "whisper-base"], ["local", "kokoro-82m-v1.0"]]);
  const stream = await vad.createVad();
  expect(await stream.accept(new Float32Array(512))).toEqual([{ end: 512, speech: true, probability: 0.9 }]);
  await stream.reset();
  expect(await transcriber.transcribe(new Float32Array(3), 16000, undefined)).toBe("hola");
  await speaker.speak("hola", undefined, "es", 1.1);
  expect(calls).toEqual([["stream", { threshold: 0.6, minSilenceMs: 200, minSpeechMs: 400 }], ["accept", 512], ["reset"], ["transcribe", new Float32Array(3), 16000, null], ["speak", "hola", "ef_dora", "es", 1.1]]);
});

test("a remote slot loads from its provider's catalogue; the detector stays this device's", async () => {
  const { engine, loaded } = fakeEngine();
  const source = engineVoiceSource(engine);
  await source.vad();
  await source.transcriber(stt({ catalog: "elevenlabs", model: "scribe_v2" }));
  await source.speaker(tts({ catalog: "elevenlabs", model: "eleven_flash_v2_5" }));
  expect(loaded).toEqual([["local", "silero-vad"], ["elevenlabs", "scribe_v2"], ["elevenlabs", "eleven_flash_v2_5"]]);
});

test("a build the person chose is loaded as such", async () => {
  const { engine, loaded } = fakeEngine();
  const load = vi.fn(async (model: string, build: string) => { loaded.push(["local", `${model} ${build}`]); return { id: model, asStt: () => ({ transcribe: async () => "hola" }) }; });
  (engine as unknown as { load: unknown }).load = load;
  await engineVoiceSource(engine).transcriber(stt({ build: "whisper-base/int8" }));
  expect(load).toHaveBeenCalledWith("whisper-base", "whisper-base/int8", expect.any(Function));
});

test("two calls load shared weights but receive separate detector streams", async () => {
  const { engine, loaded, calls } = fakeEngine();
  const vad = await engineVoiceSource(engine).vad();
  const a = await vad.createVad();
  const b = await vad.createVad();
  expect(a).not.toBe(b);
  expect(calls.filter(([kind]) => kind === "stream")).toHaveLength(2);
  expect(loaded.filter(([, model]) => model === "silero-vad")).toHaveLength(1);
});

test("smart-turn is this device's end-of-turn model: the one chosen when it runs here, else the first that does", async () => {
  const { engine, loaded } = fakeEngine();
  const source = engineVoiceSource(engine);
  const model = await source.endOfTurn!(null);
  expect(loaded).toEqual([["local", "smart-turn-v3"]]);
  expect(await model.endOfTurn(new Float32Array(1), 16000)).toBe(0.7);
  await source.endOfTurn!({ catalog: "local", model: "smart-turn-v3" });
  expect(loaded).toEqual([["local", "smart-turn-v3"], ["local", "smart-turn-v3"]]);
  const unfit = fakeEngine({ catalogs: { local: [...LOCAL.filter((m) => m.id !== "smart-turn-v3"), local("smart-turn-v4", ["end-of-turn"], [build("smart-turn-v4/gpu", { available: false })])] } });
  await expect(engineVoiceSource(unfit.engine).endOfTurn!({ catalog: "local", model: "smart-turn-v4" })).rejects.toMatchObject({ code: "end-of-turn-unavailable" });
});

test("what this device cannot run is refused with a code before anything loads", async () => {
  const refused = async (slot: "transcriber" | "speaker", choice: VoiceModelChoice, catalogs?: Record<string, Listed | Error>) => {
    const { engine, loaded } = fakeEngine(catalogs ? { catalogs } : {});
    const error = await Promise.resolve(engineVoiceSource(engine)[slot](choice)).then(() => null, (failure: unknown) => failure);
    expect(loaded).toEqual([]);
    return error as { code: string; detail?: string } | null;
  };
  expect(await refused("transcriber", stt({ model: "parakeet" }))).toMatchObject({ code: "model-unknown" });
  expect(await refused("transcriber", stt({ model: "kokoro-82m-v1.0" }))).toMatchObject({ code: "model-unknown" });
  expect(await refused("transcriber", { model: "whisper-base" })).toMatchObject({ code: "model-unknown" });
  expect(await refused("transcriber", stt({ catalog: "nowhere" }))).toMatchObject({ code: "catalog-not-found" });
  // A local model with no build that runs here is refused too, not left to fail at loading.
  expect(await refused("transcriber", stt({ model: "whisper-large" }))).toMatchObject({ code: "model-unfit" });
  expect(await refused("speaker", tts({ catalog: "elevenlabs", model: "scribe_v2" }))).toMatchObject({ code: "model-unknown" });
  // A provider that refuses to list is the refusal, with what it said.
  const keyless = Object.assign(new Error("no key"), { code: "credential-missing", params: {}, detail: "invalid_api_key: Invalid API key" });
  expect(await refused("speaker", tts({ catalog: "elevenlabs", model: "eleven_flash_v2_5" }), { local: LOCAL, elevenlabs: keyless }))
    .toMatchObject({ code: "credential-missing", detail: "invalid_api_key: Invalid API key" });
  const noEndOfTurn = fakeEngine({ catalogs: { local: LOCAL.filter((m) => m.id !== "smart-turn-v3") } });
  await expect(engineVoiceSource(noEndOfTurn.engine).endOfTurn!(null)).rejects.toMatchObject({ code: "end-of-turn-unavailable" });
  const noVad = fakeEngine({ catalogs: { local: LOCAL.filter((m) => !(m.capabilities as string[]).includes("vad")) } });
  await expect(engineVoiceSource(noVad.engine).vad()).rejects.toMatchObject({ code: "vad-unavailable" });
  expect(noVad.loaded).toEqual([]);
});

test("the slot a call does not use is never asked: a speaker is not checked while a transcriber loads", async () => {
  // A call of the input half alone (a transcription try) asks for the detector and the transcriber; the speaker named by
  // the settings may be a model that is gone, and nothing about it is read.
  const { engine, loaded } = fakeEngine({ catalogs: { local: LOCAL.filter((m) => m.id !== "kokoro-82m-v1.0") } });
  const source = engineVoiceSource(engine);
  await source.vad();
  await source.transcriber(stt());
  expect(loaded).toEqual([["local", "silero-vad"], ["local", "whisper-base"]]);
  await expect(source.speaker(tts())).rejects.toMatchObject({ code: "model-unknown" });
});

test("a detector at another rate than the voice feeds is refused, and a provider's failure keeps its code and words", async () => {
  const slow = fakeEngine({ vadRate: 8000 });
  await expect((async () => (await engineVoiceSource(slow.engine).vad()).createVad())()).rejects.toMatchObject({ code: "vad-sample-rate" });
  const failing = fakeEngine();
  const source = engineVoiceSource(failing.engine);
  failing.of("elevenlabs").load.mockRejectedValueOnce(Object.assign(new Error("quota"), { code: "provider-refused", params: {}, detail: "quota_exceeded" }));
  await expect(source.speaker(tts({ catalog: "elevenlabs", model: "eleven_flash_v2_5" }))).rejects.toMatchObject({ code: "provider-refused", detail: "quota_exceeded" });
});

test("loading reports progress per model", async () => {
  const { engine } = fakeEngine();
  const seen: string[] = [];
  const source = engineVoiceSource(engine, { onProgress: (id) => seen.push(id) });
  await source.vad();
  await source.transcriber(stt());
  await source.speaker(tts());
  expect(seen).toEqual(["silero-vad", "whisper-base", "kokoro-82m-v1.0"]);
});
