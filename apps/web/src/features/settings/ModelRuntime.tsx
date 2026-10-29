import { useId, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { ChevronIcon } from "../../components/ui/Icons";
import { useRoomStore } from "../../state/room-store";
import type { ModelBuild } from "@sidevoice/engine";
import { translator, type Translate, type MessageKey } from "../../i18n/translator";
import type { ModelState } from "./ModelSetup";
import { buildSizes, describeBuild, engineOf } from "./model-facts";
import { whereItRuns } from "../../services/voice-settings.js";
import type { CatalogModel } from "../../services/model-catalogs.js";

/* How a model of this device runs, under its block, folded until asked for: what this device offers (a graphics card
 * the browser can use, its memory and cores — read at once, no benchmark) and each build of the model the engine has —
 * its engine, precision and what it runs on, its download and memory, whether it is the recommended one, on disk, or
 * why it does not run here. Automatic is the engine's recommended build; another can be chosen, and is downloaded and
 * loaded as such. */

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

/** Every model of this device's catalogue for the task, grouped by family, the ones that do not run here too, each with
 *  where it does run when that can be told: read only, nothing here is chosen or downloaded. */
function AllModels({ task, t }: { task: "stt" | "tts"; t: Translate }) {
  const inApp = !!useRoomStore((state) => state.facts.inApp);
  const models = useRoomStore((state) => state.facts.voiceCatalogue.catalogs.find((catalog) => catalog.id === "local")?.models) as CatalogModel[] | undefined;
  const families = new Map<string, CatalogModel[]>();
  for (const model of models ?? []) if (model.capabilities.includes(task)) families.set(model.family ?? "", [...(families.get(model.family ?? "") ?? []), model]);
  if (!families.size) return null;
  return (
    <div className="model-runtime-all">
      <p className="model-runtime-info">{t("runtime.all.title")}</p>
      <ul className="model-runtime-families">
        {[...families].map(([family, list]) => <li key={family}>
          <strong>{family.charAt(0).toUpperCase() + family.slice(1)}</strong>
          <ul>{list.map((model) => {
            const where = whereItRuns(model, inApp);
            return <li key={model.id} data-runs={where === null || undefined}>
              <span>{model.id}</span>
              {where === null ? <Badge tone="positive">{t("runtime.all.runs")}</Badge> : <Badge>{t(("runtime.where." + where) as MessageKey)}</Badge>}
            </li>;
          })}</ul>
        </li>)}
      </ul>
    </div>
  );
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
  const describe = (build: ModelBuild) => describeBuild(build, t);
  const sizes = (build: ModelBuild) => buildSizes(build, t);
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
        {/* Its line, closed or open: engine and precision; the spec sheet says its hardware and sizes. */}
        <span className="model-runtime-summary">{state.build ? engineOf(state.build) : ""}</span>
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
        <AllModels task={task} t={t} />
        {locked && <p className="model-runtime-device">{t("voice.prepare.lockedHint")}</p>}
      </div>}
    </div>
  );
}
