import type { ReactNode } from "react";
import type { ModelBuild } from "@sidevoice/engine";
import type { Translate } from "../../i18n/translator";
import { Badge } from "../../components/ui/Badge";
import type { SelectOption } from "../../components/ui/Select";
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

/** The hardware as the spec sheet and the Model list name it (sidevoice-web#340): `main`, the plain class ("GPU",
 *  "NPU", "CPU"); `name`, the technical name after it, in lighter text ("Metal"), only where it says more than the class —
 *  none for the CPU, whatever its accelerator, nor for a graphics card with no API. Null when the engine gives no class,
 *  or the build does not run here. */
export function hardwareLabel(build: ModelBuild, t: Translate): { main: string; name: string } | null {
  const main = hardwareClass(build, t);
  if (!main) return null;
  const technical = hardwareName(build, t);
  return { main, name: build.acceleratorClass !== "cpu" && technical !== main ? technical : "" };
}

/** The hardware with its technical name lighter: "GPU · Metal". */
function HardwareText({ label }: { label: { main: string; name: string } }) {
  return <>{label.main}{label.name && <span className="model-hardware-name"> · {label.name}</span>}</>;
}

/** The hardware as a chip, beside its label in the spec sheet, which says whether it runs on it or will (`expected`:
 *  the model is not here yet, a lighter look). None when the engine does not say. */
export function HardwareChip({ build, expected, t }: { build: ModelBuild; expected: boolean; t: Translate }) {
  const label = hardwareLabel(build, t);
  if (!label) return null;
  return <Badge tone="accent" className="model-hardware" data-expected={expected || undefined}><HardwareText label={label} /></Badge>;
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

/** The build a model of the Model list is described by: its recommended one, else its first that runs here (none is
 *  chosen for a model not picked yet). */
function listedBuild(model: Listed) {
  return model.builds?.find((candidate) => candidate.id === model.recommendedBuild) ?? model.builds?.find((candidate) => candidate.available);
}

/** A model of the list as the Model list shows it: its download size at the end of its name's line (the option's
 *  `badge`), and its hardware under it (its `description`). The badge is not read aloud: the size is said at the start
 *  of the description too, for screen readers only. With no hardware known, the size alone is the line under the name;
 *  what is not known is left out. Whether it is here, and its memory, are the spec sheet's. */
export function listedOption(model: Listed, t: Translate): Pick<SelectOption, "badge" | "description"> {
  const build = listedBuild(model);
  if (!build) return {};
  const size = download(build);
  const hardware = hardwareLabel(build, t);
  if (!hardware) return size ? { description: size } : {};
  return {
    ...(size ? { badge: <span className="model-list-size" aria-hidden>{size}</span> } : {}),
    description: <>{size && <span className="sr-only">{size} · </span>}<HardwareText label={hardware} /></>,
  };
}

/** The spec sheet: what the model is, as rows left out when they have nothing — its languages (`languages`, only when
 *  it lists some) with the notice that the language in use is not one of them on the same row (its region kept), the
 *  hardware it runs on, or will once here (`expected`), and its sizes. */
export function ModelSheet({ build, languages, notice, expected, t }: { build: ModelBuild; languages?: ReactNode; notice?: ReactNode; expected: boolean; t: Translate }) {
  const sizes = sizeFacts(build, !expected, t);
  return <div className="model-prepare-sheet">
    <dl className="model-sheet">
      {languages && <><dt>{t("runtime.fact.languages")}</dt><dd className="model-sheet-languages"><span>{languages}</span>{notice}</dd></>}
      {hardwareLabel(build, t) && <><dt>{t(expected ? "runtime.fact.willRunOn" : "runtime.fact.runsOn")}</dt>
        <dd><HardwareChip build={build} expected={expected} t={t} /></dd></>}
      {sizes && <><dt>{t("runtime.fact.size")}</dt><dd className="model-sheet-size">{sizes}</dd></>}
    </dl>
  </div>;
}
