/* Where a stage's choice lives (ONBOARDING_AND_HOSTS.md §3): an app-wide default and, per host, an override.
 *
 * The default may only be "Este dispositivo" (place `device`): it runs on this client, so one load-and-verify here
 * makes it valid against every host. A provider (or, later, the host itself) exists only as a host's override.
 * Effective = `hosts[fp][task] ?? default[task]`. Choosing "Este dispositivo" for a host writes the default and
 * deletes that host's override; choosing anything else writes the override. Pure: no storage, no clock. */

export type Task = "stt" | "tts";
export const TASKS: Task[] = ["stt", "tts"];
export const DEVICE = "device";

export interface Stage { place: string; model: string; options: Record<string, unknown>; build: { engine: string; accelerator: string } | null }
type PerTask = Partial<Record<Task, Stage>>;
export interface StageScope { default: PerTask; hosts: Record<string, PerTask> }

export const STAGES_KEY = "sidevoice.stages";
export const emptyScope = (): StageScope => ({ default: {}, hosts: {} });

export function effectiveStage(scope: StageScope, fp: string | null, task: Task): Stage | null {
  return (fp ? scope.hosts[fp]?.[task] : undefined) ?? scope.default[task] ?? null;
}

/** Whether the host's stage is its own («Solo en esta máquina») or the general one. */
export function stageSource(scope: StageScope, fp: string | null, task: Task): "general" | "host" {
  return fp && scope.hosts[fp]?.[task] ? "host" : "general";
}

function withoutOverride(scope: StageScope, fp: string, task: Task): StageScope {
  const own = { ...(scope.hosts[fp] || {}) };
  delete own[task];
  const hosts = { ...scope.hosts };
  if (Object.keys(own).length) hosts[fp] = own; else delete hosts[fp];
  return { ...scope, hosts };
}

/** A choice made in a stage pane for the host `fp` (null with no host: only this device can be chosen then). */
export function chooseStage(scope: StageScope, fp: string | null, task: Task, stage: Stage): StageScope {
  if (stage.place === DEVICE) {
    const next = { ...scope, default: { ...scope.default, [task]: stage } };
    return fp ? withoutOverride(next, fp, task) : next;
  }
  if (!fp) throw new Error("A provider is a host's choice: there is no host to keep it.");
  return { ...scope, hosts: { ...scope.hosts, [fp]: { ...(scope.hosts[fp] || {}), [task]: stage } } };
}

/** «Usar la configuración general»: the host's override goes, the default applies. */
export function useGeneral(scope: StageScope, fp: string, task: Task): StageScope {
  return withoutOverride(scope, fp, task);
}

/** A forgotten host takes its overrides with it. */
export function forgetHost(scope: StageScope, fp: string): StageScope {
  const hosts = { ...scope.hosts };
  delete hosts[fp];
  return { ...scope, hosts };
}

/** Today's `sidevoice.stages` keeps one stage pair per fingerprint. The host in use's device stages become the
 *  default (falling back to any host's), every provider stage stays its host's override, and a device stage that
 *  differs from the default is dropped: there is one default. */
export function migrateStages(stored: unknown, inUse: string | null): StageScope {
  if (!stored || typeof stored !== "object") return emptyScope();
  const value = stored as Record<string, unknown>;
  if (value.default && typeof value.default === "object" && value.hosts && typeof value.hosts === "object") return value as unknown as StageScope;
  let scope = emptyScope();
  const order = Object.keys(value).sort((a, b) => Number(b === inUse) - Number(a === inUse));
  for (const fp of order) {
    const pair = value[fp] as PerTask | undefined;
    for (const task of TASKS) {
      const stage = pair?.[task];
      if (!stage || typeof stage !== "object") continue;
      if (stage.place === DEVICE) { if (!scope.default[task]) scope = { ...scope, default: { ...scope.default, [task]: stage } }; }
      else scope = chooseStage(scope, fp, task, stage);
    }
  }
  return scope;
}
