import type { ReactNode } from "react";
import type { ModelBuild } from "@sidevoice/engine";
import type { Translate } from "../../i18n/translator";
import { useVariant } from "../../lib/variants";
import { Badge } from "../../components/ui/Badge";
import type { SelectOption } from "../../components/ui/Select";
import { sizeText } from "./ModelSetup";

/* What a model of this device takes and where it runs, from the build it runs as: its download, its memory, and the
 * hardware it runs on (each left out while the engine does not say it). The hardware is the engine's pick for this
 * device, for the build that runs or will once downloaded — known before any download, never measured. The builds list
 * of "Advanced: how it runs" (ModelRuntime) says them per build; with Advanced closed, where the model's block says them
 * is still being compared (sidevoice-web#340), for the transcription, voice and end-of-turn blocks alike (ModelPrepare):
 * - "status": on the status line, beside Not downloaded or Ready; Advanced's line keeps engine and precision.
 * - "facts": a labelled row of their own (Size, Memory, Runs on); Advanced's line keeps engine and precision.
 * - "advanced": on Advanced's line, as its open panel says them for the build.
 * - "chip": the hardware as a chip beside Not downloaded or Ready, the sizes as text after it.
 * - "chipfacts": the labelled row, the hardware first as a chip.
 * - "chipadvanced": the hardware as a chip on Advanced's line, the sizes on the status line (a block with no Advanced,
 *   the end of turn's, has the chip beside its state, as "chip"). */
export const MODEL_SUMMARIES = ["status", "facts", "advanced", "chip", "chipfacts", "chipadvanced"] as const;

export const useModelSummary = () => useVariant("modelSummary", MODEL_SUMMARIES);

const ENGINES: Record<string, string> = {
  "transformers-js": "Transformers.js", "sherpa-onnx": "Sherpa-ONNX", "whisper-cpp": "whisper.cpp", onnxruntime: "ONNX Runtime", mlx: "MLX",
};

/** A graphics card's API as people write it; another is said as the engine names it. */
const GPU_APIS: Record<string, string> = { metal: "Metal", cuda: "CUDA", webgpu: "WebGPU" };

/** What a build runs on, from the class the engine resolved for this device. The accelerator is only the API name
 *  shown beside a graphics card; absent or unrecognized classes have no hardware label. */
export function runsOn(build: ModelBuild, t: Translate) {
  switch (build.acceleratorClass) {
    case "gpu": {
      if (!build.accelerator) return "";
      const api = GPU_APIS[build.accelerator] ?? build.accelerator;
      return t("runtime.on.gpu", { api });
    }
    case "neural-engine": return t("runtime.on.neuralEngine");
    case "cpu": return t("runtime.on.cpu");
    default: return "";
  }
}

/** The hardware as a chip names it: a graphics card by its API ("Metal"), the Neural Engine, the CPU. "" when the engine
 *  does not say: a build that does not run here, a class it does not give or does not know, a graphics card with no
 *  API. */
export function hardwareName(build: ModelBuild, t: Translate) {
  if (!build.available) return "";
  switch (build.acceleratorClass) {
    case "gpu": return build.accelerator ? GPU_APIS[build.accelerator] ?? build.accelerator : "";
    case "neural-engine": return t("runtime.on.neuralEngine");
    case "cpu": return t("runtime.hardware.cpu");
    default: return "";
  }
}

/** The hardware as a chip ("chip", "chipfacts", "chipadvanced"). `expected`: the model is not here yet, so it is what
 *  the engine expects — a lighter look, and said in words ("Will run on Metal"), unless `bare`, where a label beside it
 *  says so. None when the engine does not say. */
export function HardwareChip({ build, expected, bare = false, t }: { build: ModelBuild; expected: boolean; bare?: boolean; t: Translate }) {
  const hardware = hardwareName(build, t);
  if (!hardware) return null;
  return <Badge tone="accent" className="model-hardware" data-expected={expected || undefined}>
    {expected && !bare ? t("runtime.hardware.expected", { hardware }) : hardware}
  </Badge>;
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

/** Its sizes as a model's status says them: before it is here, its download and memory ("145 MB download · 190 MB in
 *  memory"); once here, what it takes on this device and its memory ("145 MB on this device · 190 MB in memory"). */
export function sizeFacts(build: ModelBuild, installed: boolean, t: Translate) {
  if (!installed) return buildSizes(build, t);
  const [bytes, memoryText] = [download(build), memory(build)];
  return [bytes && t("voice.prepare.onDevice", { size: bytes }), memoryText && t("runtime.memory", { memory: memoryText })].filter(Boolean).join(" · ");
}

/** Its facts as a model's status says them, joined by " · ": its sizes, then what it runs on ("145 MB download · 190 MB
 *  in memory · processor"). The status line ("status") and the Model list ("sized") say them so. */
export function modelFacts(build: ModelBuild, installed: boolean, t: Translate) {
  return [sizeFacts(build, installed, t), runsOn(build, t)].filter(Boolean).join(" · ");
}

type Listed = { builds?: ModelBuild[]; recommendedBuild?: string; installed?: boolean };

/** The build a model of the Model list is described by — its recommended one, else its first that runs here (none is
 *  chosen for a model not picked yet) — and whether it is on this device (the model, or that build). */
function listedBuild(model: Listed) {
  const build = model.builds?.find((candidate) => candidate.id === model.recommendedBuild) ?? model.builds?.find((candidate) => candidate.available);
  return build ? { build, installed: model.installed === true || build.installed } : null;
}

/** A model of the list as the Model list describes it under its name ("sized"). "" when it has no build. */
export function listedFacts(model: Listed, t: Translate) {
  const listed = listedBuild(model);
  return listed ? modelFacts(listed.build, listed.installed, t) : "";
}

/** A model of the list on two lines ("twolines"): its memory on its name's line, at the end (the option's `badge`), then
 *  its download — or what it takes here — and its hardware (its `description`). What is not known is left out. The
 *  memory is said in the description too, for whatever reads it rather than sees it: the option's badge is not read. */
export function listedLines(model: Listed, t: Translate): Pick<SelectOption, "badge" | "description"> {
  const listed = listedBuild(model);
  if (!listed) return {};
  const bytes = download(listed.build);
  const memoryText = memory(listed.build) && t("runtime.memory", { memory: memory(listed.build) });
  const line = [bytes && t(listed.installed ? "voice.prepare.onDevice" : "runtime.download", { size: bytes }), hardwareName(listed.build, t)].filter(Boolean).join(" · ");
  return {
    ...(memoryText ? { badge: <span className="model-list-memory" aria-hidden>{memoryText}</span> } : {}),
    ...(line || memoryText ? { description: <>{line}{memoryText && <span className="sr-only">{(line ? " · " : "") + memoryText}</span>}</> } : {}),
  };
}

/** Its facts as a labelled row ("facts"): Size, Memory, Runs on, each while it is known. With `chip` ("chipfacts"), the
 *  hardware first, as a chip, labelled as what it will run on while the model is not here (`expected`). */
export function ModelFacts({ build, chip = false, expected = false, t }: { build: ModelBuild; chip?: boolean; expected?: boolean; t: Translate }) {
  const sizes: [string, ReactNode][] = [[t("runtime.fact.size"), download(build)], [t("runtime.fact.memory"), memory(build)]];
  const facts = (chip
    ? [[t(expected ? "runtime.fact.willRunOn" : "runtime.fact.runsOn"), hardwareName(build, t) && <HardwareChip build={build} expected={expected} bare t={t} />], ...sizes]
    : [...sizes, [t("runtime.fact.runsOn"), runsOn(build, t)]]) as [string, ReactNode][];
  const known = facts.filter(([, value]) => value);
  if (!known.length) return null;
  return <dl className="model-facts">{known.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
