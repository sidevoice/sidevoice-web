/* W4's proposal (ONBOARDING_AND_HOSTS.md §5.1, model-first D14): the best combination for this device, sizes in
 * view, accepted with one tap. On a computer: this device's best offer per stage. On a phone: the host's provider
 * when it has a key (the host's own models are #124 phase 5), else the best the phone can run. Pure: it reads the
 * stage context stage-settings.js reads. */
import { defaultStage, withPlace, withVoicesChosen, familyOf, providerOf, taskOffers, DEVICE } from "../stage-settings.js";
import type { Stage, Task } from "./stage-scope";

export interface ProposalRow {
  task: Task;
  stage: Stage;
  place: "device" | "provider";
  placeLabel: string;
  model: string;
  /** Bytes the first use downloads, 0 when already on disk or at a provider. */
  bytes: number;
  installed: boolean;
}

export interface Proposal { rows: ProposalRow[]; missing: Task[]; bytes: number }

interface Ctx {
  catalog: { providers?: { id: string; label?: string; tasks?: string[] }[] } | null;
  offers: { task: string; model: string; engine: string; download_size: number }[] | null;
  installed: { model: string; engine: string }[];
  keyed(id: string): "ready" | "missing" | "absent";
}

function providerStage(ctx: Ctx, task: Task): Stage | null {
  for (const provider of ctx.catalog?.providers || []) {
    if (!(provider.tasks || []).includes(task) || ctx.keyed(provider.id) !== "ready") continue;
    const stage = withPlace(ctx, task, null, provider.id, null) as Stage | null;
    if (stage?.model) return (task === "tts" ? withVoicesChosen(ctx, stage) : stage) as Stage;
  }
  return null;
}

export function proposeStages(ctx: Ctx, phone: boolean): Proposal {
  const rows: ProposalRow[] = [];
  const missing: Task[] = [];
  for (const task of ["stt", "tts"] as Task[]) {
    const device = defaultStage(ctx, task) as Stage | null;
    const provider = providerStage(ctx, task);
    const stage = phone ? provider ?? device : device ?? provider;
    if (!stage) { missing.push(task); continue; }
    if (stage.place === DEVICE) {
      const offer = taskOffers(ctx.offers, task).find((o: { model: string }) => o.model === stage.model);
      const installed = !!offer && ctx.installed.some((b) => b.model === offer.model && b.engine === offer.engine);
      rows.push({ task, stage, place: "device", placeLabel: "", model: familyOf(ctx.catalog, stage.model)?.model?.label || stage.model,
        bytes: installed ? 0 : offer?.download_size ?? 0, installed });
    } else {
      rows.push({ task, stage, place: "provider", placeLabel: providerOf(ctx.catalog, stage.place, task)?.label || stage.place, model: stage.model, bytes: 0, installed: true });
    }
  }
  return { rows, missing, bytes: rows.reduce((sum, row) => sum + row.bytes, 0) };
}

export function sizeText(bytes: number, language = "es"): string {
  const unit = bytes >= 1e9 ? "gigabyte" : "megabyte";
  return new Intl.NumberFormat(language, { style: "unit", unit, maximumFractionDigits: bytes >= 1e9 ? 1 : 0 }).format(bytes >= 1e9 ? bytes / 1e9 : bytes / 1e6);
}
