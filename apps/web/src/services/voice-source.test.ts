import { expect, test, vi } from "vitest";
import type { Model, WebEngine } from "@sidevoice/engine";
import type { VoiceSettings } from "@sidevoice/voice";
import { engineVoiceSource, settingsRefusal } from "./voice-source";

/* The page's models for its voice, over a fake engine that records what it loaded and answers as told. */

const build = (id: string, extra: Record<string, unknown> = {}) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 1, memoryMb: 1, available: true, reasons: [], installed: true, ...extra });
const model = (id: string, capabilities: Model["capabilities"], builds = [build(id + "/int8")]) =>
  ({ id, family: id, capabilities, parametersM: 1, languages: ["es"], license: "MIT", voices: [], installed: true, builds, recommendedBuild: builds[0]?.id }) as Model;
const catalogue = [
  model("other-vad", ["vad"]),
  model("silero-vad", ["vad"]),
  model("whisper-base", ["stt"], [build("whisper-base/int8"), build("whisper-base/gpu", { available: false })]),
  model("kokoro-82m-v1.0", ["tts"]),
  model("smart-turn-v3", ["end-of-turn"]),
];
const settings = (patch: Partial<VoiceSettings> = {}): VoiceSettings => ({
  stt: { model: "whisper-base", build: null, language: "es" }, tts: { model: "kokoro-82m-v1.0", build: null, voice: null, speed: 1 },
  patience: "normal", end_of_turn: "silence", ...patch,
});

function fakeEngine(models: Model[] = catalogue, { vadRate = 16000 } = {}) {
  const loaded: [string, string | null | undefined][] = [];
  const calls: unknown[][] = [];
  const stream = {
    sampleRate: vadRate, window: 512,
    accept: async (samples: Float32Array) => { calls.push(["accept", samples.length]); return { frames: [{ end: 512, speech: true, probability: 0.9 }], events: [] }; },
    reset: async () => { calls.push(["reset"]); },
  };
  const loadedModel = (id: string) => ({
    id, build: id + "/int8",
    asVad: () => (id === "silero-vad" ? { stream: async (options: object) => { calls.push(["stream", options]); return stream; } } : undefined),
    asStt: () => (id === "whisper-base" ? { transcribe: async (...args: unknown[]) => { calls.push(["transcribe", ...args]); return "hola"; } } : undefined),
    asTts: () => (id === "kokoro-82m-v1.0" ? {
      voices: async () => [{ id: "ef_dora", languages: ["es"] }],
      speak: async (...args: unknown[]) => { calls.push(["speak", ...args]); return { samples: new Float32Array(2), sampleRate: 24000 }; },
    } : undefined),
    asEndOfTurn: () => (id === "smart-turn-v3" ? { seconds: 8, probability: async () => 0.7 } : undefined),
  });
  const engine = {
    models: async () => models,
    load: vi.fn(async (id: string, buildId: string | null | undefined) => { loaded.push([id, buildId]); return loadedModel(id); }),
  };
  return { engine: engine as unknown as WebEngine, loaded, calls };
}

test("silence loads the detector, the transcriber and the speaker the settings chose, and no end-of-turn model", async () => {
  const { engine, loaded, calls } = fakeEngine();
  const models = await engineVoiceSource(engine).models(settings({ stt: { model: "whisper-base", build: "whisper-base/int8", language: "es" } }));
  expect(loaded).toEqual([]);
  const slots = await models.load();
  expect(loaded).toEqual([["silero-vad", null], ["whisper-base", "whisper-base/int8"], ["kokoro-82m-v1.0", null]]);
  expect(slots.endOfTurn).toBeUndefined();
  expect(await slots.vad.accept(new Float32Array(512))).toEqual([{ end: 512, speech: true, probability: 0.9 }]);
  await slots.vad.reset();
  expect(await slots.transcriber.transcribe(new Float32Array(3), 16000, undefined)).toBe("hola");
  await slots.speaker.speak("hola", undefined, "es", 1.1);
  expect(calls).toEqual([["stream", { threshold: 0.6, minSilenceMs: 200, minSpeechMs: 400 }], ["accept", 512], ["reset"], ["transcribe", new Float32Array(3), 16000, null], ["speak", "hola", "ef_dora", "es", 1.1]]);
});

test("smart-turn adds the engine's end-of-turn model", async () => {
  const { engine, loaded } = fakeEngine();
  const slots = await (await engineVoiceSource(engine).models(settings({ end_of_turn: "smart-turn" }))).load();
  expect(loaded.map(([id]) => id)).toContain("smart-turn-v3");
  expect(await slots.endOfTurn!.endOfTurn(new Float32Array(1), 16000)).toBe(0.7);
});

test("what this device cannot run is refused with the seam's code before anything loads", async () => {
  expect(settingsRefusal(catalogue, settings({ stt: { model: "parakeet", build: null, language: null } }))).toBe("model-unknown");
  expect(settingsRefusal(catalogue, settings({ stt: { model: "kokoro-82m-v1.0", build: null, language: null } }))).toBe("model-wrong-task");
  expect(settingsRefusal(catalogue, settings({ stt: { model: "whisper-base", build: "whisper-base/gpu", language: null } }))).toBe("build-unfit");
  // Automatic with no build that runs here is refused too, not left to fail at loading.
  const unfit = [...catalogue, model("whisper-large", ["stt"], [build("whisper-large/gpu", { available: false })])];
  expect(settingsRefusal(unfit, settings({ stt: { model: "whisper-large", build: null, language: null } }))).toBe("model-unfit");
  expect(settingsRefusal(catalogue.filter((m) => m.id !== "smart-turn-v3"), settings({ end_of_turn: "smart-turn" }))).toBe("end-of-turn-unavailable");
  const noVad = catalogue.filter((m) => !m.capabilities.includes("vad"));
  expect(settingsRefusal(noVad, settings())).toBe("vad-unavailable");
  const { engine, loaded } = fakeEngine(noVad);
  await expect(engineVoiceSource(engine).models(settings())).rejects.toMatchObject({ code: "vad-unavailable" });
  expect(loaded).toEqual([]);
});

test("a detector at another rate than the voice feeds is refused, and an engine failure keeps its code", async () => {
  const { engine } = fakeEngine(catalogue, { vadRate: 8000 });
  await expect((await engineVoiceSource(engine).models(settings())).load()).rejects.toMatchObject({ code: "vad-sample-rate" });
  const failing = fakeEngine();
  (failing.engine.load as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(Object.assign(new Error("no key"), { code: "credential-missing", params: {} }));
  await expect((await engineVoiceSource(failing.engine).models(settings())).load()).rejects.toMatchObject({ code: "credential-missing" });
});

test("the catalogue is the engine's, and loading reports progress per model", async () => {
  const { engine } = fakeEngine();
  const seen: string[] = [];
  const source = engineVoiceSource(engine, { onProgress: (id) => seen.push(id) });
  expect(await source.catalogue()).toBe(catalogue);
  (engine.load as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async (id: string, _build: unknown, progress: (p: object) => void) => {
    progress({ files: 1, done: 0, received: 10 });
    return { asVad: () => ({ stream: async () => ({ sampleRate: 16000, accept: async () => ({ frames: [] }), reset: async () => {} }) }), id };
  });
  await (await source.models(settings())).load();
  expect(seen).toEqual(["silero-vad"]);
});
