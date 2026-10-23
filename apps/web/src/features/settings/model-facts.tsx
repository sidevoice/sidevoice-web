import type { ReactNode } from "react";
import type { ModelBuild } from "@sidevoice/engine";
import type { Translate } from "../../i18n/translator";
import { useVariant } from "../../lib/variants";
import { Badge } from "../../components/ui/Badge";
import { sizeText } from "./ModelSetup";

/* What a model of this device takes and where it runs, from the build it runs as: its download, its memory, and the
 * hardware it runs on (each left out while the engine does not say it). The hardware is the engine's pick for this
 * device, for the build that runs or will once downloaded — known before any download, never measured. The builds list
 * of "Advanced: how it runs" (ModelRuntime) says them per build; with Advanced closed, the model's block says them in its
 * spec sheet (ModelSheet, sidevoice-web#340), and the Model list under each model. */

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

/** The hardware's technical name: a graphics card by its API ("Metal"), the Neural Engine, the CPU. "" when the engine
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

/** The hardware's plain class: GPU, NPU, CPU. "" for a build that does not run here, or a class the engine does not
 *  give or does not know. */
function hardwareClass(build: ModelBuild, t: Translate) {
  if (!build.available) return "";
  switch (build.acceleratorClass) {
    case "gpu": return t("runtime.hardware.gpu");
    case "neural-engine": return t("runtime.hardware.npu");
    case "cpu": return t("runtime.hardware.cpu");
    default: return "";
  }
}

/* How the spec sheet's hardware and the Model list name it, still being compared (sidevoice-web#340); the builds list of
 * "Advanced: how it runs" keeps runsOn's words:
 * - "both": the class, then the technical name in lighter text ("GPU · Metal");
 * - "class": the plain class ("GPU"), its technical name ("Metal") as the chip's title and said to screen readers;
 * - "technical": the technical name ("Metal", "Neural Engine", "CPU"). */
const HARDWARE_LABELS = ["both", "class", "technical"] as const;

export type HardwareLabelMode = (typeof HARDWARE_LABELS)[number];

export const useHardwareLabel = () => useVariant("hardwareLabel", HARDWARE_LABELS);

/** The hardware as `mode` names it: `main`, what is shown; `name`, the technical name after it, in lighter text ("both"); `hint`, the technical name as a title and for screen readers
 *  only ("class"). The technical part only where it says more than the class: none for the CPU, whatever its
 *  accelerator. The class alone is known enough for "class" and "both" (a graphics card with no API is "GPU"); not for
 *  "technical". Null when nothing is known. */
export function hardwareLabel(build: ModelBuild, t: Translate, mode: HardwareLabelMode): { main: string; name: string; hint: string } | null {
  const technical = hardwareName(build, t);
  if (mode === "technical") return technical ? { main: technical, name: "", hint: "" } : null;
  const plain = hardwareClass(build, t);
  if (!plain) return null;
  const more = build.acceleratorClass !== "cpu" && technical !== plain ? technical : "";
  return mode === "both" ? { main: plain, name: more, hint: "" } : { main: plain, name: "", hint: more };
}

/** The hardware as a chip, as the hardware label names it: beside its label in the spec sheet, which says whether it runs
 *  on it or will (`expected`: the model is not here yet, a lighter look). None when the engine does not say. */
export function HardwareChip({ build, expected, t }: { build: ModelBuild; expected: boolean; t: Translate }) {
  const label = hardwareLabel(build, t, useHardwareLabel());
  if (!label) return null;
  return <Badge tone="accent" className="model-hardware" data-expected={expected || undefined} title={label.hint || undefined}>
    {label.main}
    {label.name && <span className="model-hardware-name"> · {label.name}</span>}
    {label.hint && <span className="sr-only"> ({label.hint})</span>}
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

/** Its sizes as the spec sheet says them: before it is here, its download and memory ("145 MB download · 190 MB in
 *  memory"); once here, what it takes on this device and its memory ("145 MB on this device · 190 MB in memory"). */
export function sizeFacts(build: ModelBuild, installed: boolean, t: Translate) {
  if (!installed) return buildSizes(build, t);
  const [bytes, memoryText] = [download(build), memory(build)];
  return [bytes && t("voice.prepare.onDevice", { size: bytes }), memoryText && t("runtime.memory", { memory: memoryText })].filter(Boolean).join(" · ");
}

type Listed = { builds?: ModelBuild[]; recommendedBuild?: string; installed?: boolean };

/** The build a model of the Model list is described by — its recommended one, else its first that runs here (none is
 *  chosen for a model not picked yet) — and whether it is on this device (the model, or that build). */
function listedBuild(model: Listed) {
  const build = model.builds?.find((candidate) => candidate.id === model.recommendedBuild) ?? model.builds?.find((candidate) => candidate.available);
  return build ? { build, installed: model.installed === true || build.installed } : null;
}

/** A model of the list as the Model list describes it under its name: its sizes, then its hardware as the hardware label
 *  names it (its technical name said to screen readers only, with "class"). Null when it has no build. */
export function listedFacts(model: Listed, t: Translate, mode: HardwareLabelMode): ReactNode {
  const listed = listedBuild(model);
  if (!listed) return null;
  const hardware = hardwareLabel(listed.build, t, mode);
  const text = [sizeFacts(listed.build, listed.installed, t), hardware?.main, hardware?.name].filter(Boolean).join(" · ");
  return text ? <>{text}{hardware?.hint && <span className="sr-only"> ({hardware.hint})</span>}</> : null;
}

/** The spec sheet: what the model is, as rows left out when they have nothing — its languages (`languages`, only when
 *  it lists some) with the notice that the language in use is not one of them on the same row (its region kept), the
 *  hardware it runs on, or will once here (`expected`), and its sizes. */
export function ModelSheet({ build, languages, notice, expected, t }: { build: ModelBuild; languages?: ReactNode; notice?: ReactNode; expected: boolean; t: Translate }) {
  const mode = useHardwareLabel();
  const sizes = sizeFacts(build, !expected, t);
  return <div className="model-prepare-sheet">
    <dl className="model-sheet">
      {languages && <><dt>{t("runtime.fact.languages")}</dt><dd className="model-sheet-languages"><span>{languages}</span>{notice}</dd></>}
      {hardwareLabel(build, t, mode) && <><dt>{t(expected ? "runtime.fact.willRunOn" : "runtime.fact.runsOn")}</dt>
        <dd><HardwareChip build={build} expected={expected} t={t} /></dd></>}
      {sizes && <><dt>{t("runtime.fact.size")}</dt><dd className="model-sheet-size">{sizes}</dd></>}
    </dl>
  </div>;
}
