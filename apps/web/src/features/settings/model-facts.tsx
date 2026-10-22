import type { ModelBuild } from "@sidevoice/engine";
import type { Translate } from "../../i18n/translator";
import { useVariant } from "../../lib/variants";
import { sizeText } from "./ModelSetup";

/* What a model of this device takes and where it runs, from the build it runs as: its download, its memory, and the
 * hardware it runs on (each left out while the engine does not say it). The builds list of "Advanced: how it runs"
 * (ModelRuntime) says them per build; with Advanced closed, where the model's block says them is still being compared
 * (sidevoice-web#340), for the transcription, voice and end-of-turn blocks alike (ModelPrepare):
 * - "status": on the status line, beside Not downloaded or Ready; Advanced's line keeps engine and precision.
 * - "facts": a labelled row of their own (Size, Memory, Runs on); Advanced's line keeps engine and precision.
 * - "advanced": on Advanced's line, as its open panel says them for the build. */
export const MODEL_SUMMARIES = ["status", "facts", "advanced"] as const;

export const useModelSummary = () => useVariant("modelSummary", MODEL_SUMMARIES);

const ENGINES: Record<string, string> = {
  "transformers-js": "Transformers.js", "sherpa-onnx": "Sherpa-ONNX", "whisper-cpp": "whisper.cpp", onnxruntime: "ONNX Runtime", mlx: "MLX",
};

/** What a build runs on, from the class the engine resolved for this device. The accelerator is only the API name
 *  shown beside a graphics card; absent or unrecognized classes have no hardware label. */
export function runsOn(build: ModelBuild, t: Translate) {
  switch (build.acceleratorClass) {
    case "gpu": {
      if (!build.accelerator) return "";
      const names: Record<string, string> = { metal: "Metal", cuda: "CUDA", webgpu: "WebGPU" };
      const api = names[build.accelerator] ?? build.accelerator;
      return t("runtime.on.gpu", { api });
    }
    case "neural-engine": return t("runtime.on.neuralEngine");
    case "cpu": return t("runtime.on.cpu");
    default: return "";
  }
}

/** Its engine and precision. */
export const engineOf = (build: ModelBuild) => [ENGINES[build.backend] ?? build.backend, build.precision].filter(Boolean).join(" · ");

/** Its engine, precision and what it runs on: a build as the builds list names it. */
export const describeBuild = (build: ModelBuild, t: Translate) => [engineOf(build), runsOn(build, t)].filter(Boolean).join(" · ");

const download = (build: ModelBuild) => sizeText(build.downloadBytes);
// The engine gives megabytes; none, or 0, is not known.
const memory = (build: ModelBuild) => build.memoryMb ? sizeText(build.memoryMb * 1e6) : "";

/** Its download and its memory, as the builds list says them; one alone when the other is not known. */
export function buildSizes(build: ModelBuild, t: Translate) {
  const [bytes, memoryText] = [download(build), memory(build)];
  if (bytes && memoryText) return t("runtime.sizes", { download: bytes, memory: memoryText });
  return bytes || (memoryText ? t("runtime.memory", { memory: memoryText }) : "");
}

/** The whole of it on one line, as the open panel says it for the build ("advanced"). */
export const buildSummary = (build: ModelBuild, t: Translate) => [describeBuild(build, t), buildSizes(build, t)].filter(Boolean).join(" · ");

/** Its facts as a model's status says them, joined by " · ": before it is here, its download and memory then what it
 *  runs on ("145 MB download · 190 MB in memory · processor"); once here, what it takes on this device, its memory,
 *  and what it runs on ("145 MB on this device · 190 MB in memory · processor"). The status line ("status") and the
 *  Model list say them so. */
export function modelFacts(build: ModelBuild, installed: boolean, t: Translate) {
  const [bytes, memoryText] = [download(build), memory(build)];
  const sizes = installed ? [bytes && t("voice.prepare.onDevice", { size: bytes }), memoryText && t("runtime.memory", { memory: memoryText })] : [buildSizes(build, t)];
  return [...sizes, runsOn(build, t)].filter(Boolean).join(" · ");
}

/** A model of the list as the Model list describes it: by its recommended build, else its first that runs here; on
 *  this device when it, or that build, is installed. "" when it has no build. */
export function listedFacts(model: { builds?: ModelBuild[]; recommendedBuild?: string; installed?: boolean }, t: Translate) {
  const build = model.builds?.find((candidate) => candidate.id === model.recommendedBuild) ?? model.builds?.find((candidate) => candidate.available);
  return build ? modelFacts(build, model.installed === true || build.installed, t) : "";
}

/** Its facts as a labelled row ("facts"): Size, Memory, Runs on, each while it is known. */
export function ModelFacts({ build, t }: { build: ModelBuild; t: Translate }) {
  const facts = [[t("runtime.fact.size"), download(build)], [t("runtime.fact.memory"), memory(build)], [t("runtime.fact.runsOn"), runsOn(build, t)]]
    .filter(([, value]) => value);
  if (!facts.length) return null;
  return <dl className="model-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
