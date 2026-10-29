import type { CatalogView } from "../services/model-catalogs.js";

/* The model picker lab's mocked machines. Each builds the local catalogue the engine would give there: every model with
 * its builds, whether each runs and, when not, the engine's reason codes (voice.unfit.* in the catalogues). */

export const ENVIRONMENTS = [
  { id: "desktop-gpu", label: "Desktop with GPU", inApp: true },
  { id: "desktop-cpu", label: "Desktop, CPU only", inApp: true },
  { id: "browser-webgpu", label: "Browser with WebGPU", inApp: false },
  { id: "browser-wasm", label: "Browser, WASM only", inApp: false },
  { id: "iphone", label: "iPhone Safari", inApp: false },
] as const;
export type EnvironmentId = (typeof ENVIRONMENTS)[number]["id"];

/** What a model asks of the machine: anywhere, a lot of memory, an engine only the desktop app has, or that engine plus
 *  a graphics card. */
type Need = "any" | "heavy" | "native" | "native-gpu";

const MODELS: { id: string; family: string; capabilities: ("stt" | "tts")[]; need: Need; mb: number }[] = [
  { id: "whisper-tiny", family: "whisper", capabilities: ["stt"], need: "any", mb: 75 },
  { id: "whisper-base", family: "whisper", capabilities: ["stt"], need: "any", mb: 145 },
  { id: "whisper-large-v3", family: "whisper", capabilities: ["stt"], need: "heavy", mb: 1550 },
  { id: "moonshine-tiny", family: "moonshine", capabilities: ["stt"], need: "any", mb: 190 },
  { id: "parakeet-ctc-0.6b", family: "parakeet", capabilities: ["stt"], need: "native", mb: 640 },
  { id: "parakeet-ctc-1.1b", family: "parakeet", capabilities: ["stt"], need: "native", mb: 1100 },
  { id: "parakeet-tdt-0.6b-v2", family: "parakeet", capabilities: ["stt"], need: "native-gpu", mb: 640 },
  { id: "parakeet-tdt-0.6b-v3", family: "parakeet", capabilities: ["stt"], need: "native-gpu", mb: 640 },
  { id: "kokoro-82m-v1.0", family: "kokoro", capabilities: ["tts"], need: "any", mb: 92 },
  { id: "piper-es", family: "piper", capabilities: ["tts"], need: "any", mb: 63 },
  { id: "qwen3-tts-0.6b", family: "qwen3-tts", capabilities: ["tts"], need: "native-gpu", mb: 1200 },
  { id: "qwen3-tts-1.7b", family: "qwen3-tts", capabilities: ["tts"], need: "native-gpu", mb: 3400 },
];

function builds(id: string, need: Need, mb: number, env: EnvironmentId) {
  const desktop = env === "desktop-gpu" || env === "desktop-cpu";
  const gpu = env === "desktop-gpu" || env === "browser-webgpu";
  const base = { id: id + "/q", precision: "int8", downloadBytes: mb * 1e6, memoryMb: mb * 1.3, installed: false };
  const runs = (backend: string, accelerator: string, acceleratorClass: "gpu" | "cpu") => [{ ...base, backend, accelerator, acceleratorClass, available: true, reasons: [] }];
  const no = (backend: string, ...codes: string[]) => [{ ...base, backend, available: false, reasons: codes.map((code) => ({ code, params: {} })) }];
  if (need === "any") return desktop ? runs("onnxruntime", gpu ? "cuda" : "cpu", gpu ? "gpu" : "cpu") : runs("transformers-js", gpu ? "webgpu" : "wasm", gpu ? "gpu" : "cpu");
  if (need === "heavy") {
    if (desktop) return runs("whisper-cpp", gpu ? "cuda" : "cpu", gpu ? "gpu" : "cpu");
    return no("transformers-js", "wasm-memory");
  }
  if (!desktop) return no("sherpa-onnx", "backend-not-in-this-build");
  if (need === "native") return runs("sherpa-onnx", "cpu", "cpu");
  return gpu ? runs("sherpa-onnx", "cuda", "gpu") : no("sherpa-onnx", "build-accelerator");
}

/** The local catalogue on `env`, as the engine lists it; iPhone Safari also lacks the memory for the big ones. */
export function catalogueFor(env: EnvironmentId): CatalogView[] {
  const models = MODELS.map((model) => ({
    id: model.id, family: model.family, capabilities: model.capabilities, parametersM: 1, license: "MIT", languages: ["en", "es"], voices: [],
    installed: false, recommendedBuild: model.id + "/q",
    builds: env === "iphone" && model.mb > 600 && model.need !== "native" && model.need !== "native-gpu"
      ? builds(model.id, "heavy", model.mb, "browser-wasm") : builds(model.id, model.need, model.mb, env),
  }));
  return [{ id: "local", name: null, status: { stale: false }, models }] as unknown as CatalogView[];
}

/** The first model of `capability` that runs on `env`: what a fresh install would have chosen. */
export function firstRunnable(env: EnvironmentId, capability: "stt" | "tts") {
  return catalogueFor(env)[0].models.find((model) => model.capabilities.includes(capability) && model.builds?.some((build) => build.available))?.id ?? "";
}
