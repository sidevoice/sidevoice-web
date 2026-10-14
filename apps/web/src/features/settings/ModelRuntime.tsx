import { useId, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { ChevronIcon } from "../../components/ui/Icons";
import { useRoomStore } from "../../state/room-store";
import type { ModelBuild } from "@sidevoice/engine";
import { translator, type Translate, type MessageKey } from "../../i18n/translator";
import { sizeText, type ModelState } from "./ModelSetup";

/* How a model of this device runs, under its block, folded until asked for: what this device offers (a graphics card
 * the browser can use, its memory and cores — read at once, no benchmark) and each build of the model the engine has —
 * its engine, precision and what it runs on, its download and memory, whether it is the recommended one, on disk, or
 * why it does not run here. Automatic is the engine's recommended build; another can be chosen, and is downloaded and
 * loaded as such. */

const ENGINES: Record<string, string> = {
  "transformers-js": "Transformers.js", "sherpa-onnx": "Sherpa-ONNX", "whisper-cpp": "whisper.cpp", onnxruntime: "ONNX Runtime", mlx: "MLX",
};

/** What a build runs on, from the accelerator the engine resolved for it on this device and nothing else: a graphics
 *  card through Metal, CUDA or WebGPU, the Neural Engine through Core ML, the processor natively or as WebAssembly.
 *  Nothing for a remote build, for one that does not run here (the engine gives it no accelerator), or for an
 *  accelerator this page does not know: no label rather than a guess. */
function runsOn(build: ModelBuild, t: Translate) {
  switch (build.accelerator) {
    case "metal": return t("runtime.on.gpu", { api: "Metal" });
    case "cuda": return t("runtime.on.gpu", { api: "CUDA" });
    case "webgpu": return t("runtime.on.gpu", { api: "WebGPU" });
    case "coreml": return t("runtime.on.neuralEngine");
    case "cpu": case "wasm": return t("runtime.on.cpu");
    default: return "";
  }
}

/** This device as the engine sees it in a browser: a graphics card it can use, memory and cores. */
function DeviceLine({ t }: { t: Translate }) {
  const inApp = useRoomStore((state) => state.facts.inApp);
  if (inApp || typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
  const parts = [nav.gpu ? t("runtime.device.gpu") : t("runtime.device.noGpu"),
    nav.deviceMemory ? t("runtime.device.memory", { gb: nav.deviceMemory }) : "",
    nav.hardwareConcurrency ? t("runtime.device.cores", { n: nav.hardwareConcurrency }) : ""].filter(Boolean);
  return <p className="model-runtime-device">{t("runtime.device", { what: parts.join(" · ") })}</p>;
}

export function ModelRuntime({ task, state, locked }: { task: "stt" | "tts"; state: ModelState; locked: boolean }) {
  const t = translator();
  const [open, setOpen] = useState(false);
  const panel = useId();
  const builds = state.model?.builds ?? [];
  if (!state.local || !builds.length) return null;
  const recommended = state.model?.recommendedBuild;
  const choose = (build: string | null) => window.sidevoiceActions?.editVoice({ [task]: { build } });
  const option = (value: string | null, title: string, detail: string, badges: { text: string; tone: "accent" | "positive" | "neutral" }[], available = true, why = "") => {
    const checked = value === null ? !state.buildChosen : state.buildChosen && state.build?.id === value;
    return (
      <label key={value ?? "auto"} className="model-runtime-option" data-checked={checked || undefined} data-disabled={!available || locked || undefined}>
        <input type="radio" name={task + "-build"} checked={checked} disabled={!available || locked} onChange={() => choose(value)} />
        <span className="model-runtime-copy">
          <span className="model-runtime-title">{title}{badges.map((badge) => <Badge key={badge.text} tone={badge.tone}>{badge.text}</Badge>)}</span>
          <span className="model-runtime-detail">{detail}</span>
          {why && <span className="model-runtime-why">{why}</span>}
        </span>
      </label>
    );
  };
  const describe = (build: ModelBuild) => [ENGINES[build.backend] ?? build.backend, build.precision, runsOn(build, t)].filter(Boolean).join(" · ");
  const sizes = (build: ModelBuild) => t("runtime.sizes", { download: sizeText(build.downloadBytes), memory: sizeText(build.memoryMb * 1e6) });
  const reasons = (build: ModelBuild) => build.available ? "" : t("runtime.notHere", {
    reasons: build.reasons.map((reason) => t(("voice.unfit." + reason.code) as MessageKey)).join("; ") || t("voice.model.unfitUnknown"),
  });
  const auto = builds.find((build) => build.id === recommended);
  return (
    <div className="model-runtime">
      <div className="model-runtime-head">
        <button type="button" className="model-runtime-toggle" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
          <ChevronIcon size={16} className={open ? "model-runtime-chevron-open" : undefined} />{t("runtime.advanced")}
        </button>
        <span className="model-runtime-summary">{state.build ? describe(state.build) : ""}</span>
      </div>
      {open && <div className="model-runtime-panel" id={panel}>
        {/* What this is, and that most people can leave it. */}
        <p className="model-runtime-info">{t("runtime.info")}</p>
        <DeviceLine t={t} />
        <fieldset className="model-runtime-options">
          <legend className="sr-only">{t("runtime.title")}</legend>
          {option(null, t("runtime.auto"), auto ? describe(auto) + " · " + sizes(auto) : t("runtime.autoHint"), [])}
          {builds.map((build) => option(build.id, describe(build), sizes(build), [
            ...(build.id === recommended ? [{ text: t("runtime.recommended"), tone: "accent" as const }] : []),
            ...(build.installed ? [{ text: t("runtime.onDisk"), tone: "positive" as const }] : []),
          ], build.available, reasons(build)))}
        </fieldset>
        {locked && <p className="model-runtime-device">{t("voice.prepare.lockedHint")}</p>}
      </div>}
    </div>
  );
}
