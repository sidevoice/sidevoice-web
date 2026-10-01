/* Where a stage's choice lives (ONBOARDING_AND_HOSTS.md §3; operator, 2026-10-02): per machine. Each machine has its
 * own transcription and voice — a model on this device, a provider whose key that machine keeps, or the machine
 * itself (place `host`) — and nothing is inherited between machines: «Copiar de…» on a machine's page copies what can
 * be copied. A general level does not work: a machine set up with everything at the machine («En NUC») has nothing a
 * second machine could use.
 *
 * `default` is only what was chosen with no machine at all (this device's models, the one place there is then); the
 * first machine paired adopts it. Pure: no storage, no clock. */

export type Task = "stt" | "tts";
export const TASKS: Task[] = ["stt", "tts"];
export const DEVICE = "device";
export const HOST = "host";

export interface Stage { place: string; model: string; options: Record<string, unknown>; build: { engine: string; accelerator: string } | null }
type PerTask = Partial<Record<Task, Stage>>;
export interface StageScope { default: PerTask; hosts: Record<string, PerTask> }

export const STAGES_KEY = "sidevoice.stages";
export const emptyScope = (): StageScope => ({ default: {}, hosts: {} });

/** The machine's own stage; with no machine, what was chosen for this device. */
export function effectiveStage(scope: StageScope, fp: string | null, task: Task): Stage | null {
  return (fp ? scope.hosts[fp]?.[task] : scope.default[task]) ?? null;
}

/** Whether a machine has a configuration of its own at all (one stage is enough). */
export function hasStages(scope: StageScope, fp: string): boolean {
  return TASKS.some((task) => !!scope.hosts[fp]?.[task]);
}

/** A choice made in a stage pane for the machine `fp` (null with no machine: only this device can be chosen then). */
export function chooseStage(scope: StageScope, fp: string | null, task: Task, stage: Stage): StageScope {
  if (!fp) {
    if (stage.place !== DEVICE) throw new Error("A provider or a machine is a machine's choice: there is no machine to keep it.");
    return { ...scope, default: { ...scope.default, [task]: stage } };
  }
  return { ...scope, hosts: { ...scope.hosts, [fp]: { ...(scope.hosts[fp] || {}), [task]: stage } } };
}

/** A machine takes, for each stage it has none of its own, what was chosen with no machine — the first machine
 *  paired, and every machine of a configuration kept from before stages were per machine (where the general one
 *  was what each machine had unless it had its own). */
export function adoptDefault(scope: StageScope, fp: string): StageScope {
  const missing = TASKS.filter((task) => scope.default[task] && !scope.hosts[fp]?.[task]);
  if (!missing.length) return scope;
  const own = { ...(scope.hosts[fp] || {}) };
  for (const task of missing) own[task] = scope.default[task];
  return { ...scope, hosts: { ...scope.hosts, [fp]: own } };
}

export interface CopyResult { scope: StageScope; copied: Task[]; needsKey: Task[]; notCopied: Task[] }

/** «Copiar de…»: what another machine uses, for this one. This device's models copy as they are; a provider copies
 *  as a choice (the key stays on the machine it was entered on, so the target may still need its own — `needsKey`);
 *  what runs at the other machine itself cannot run here and is not copied. */
export function copyStages(scope: StageScope, from: string, to: string, hasKey: (provider: string) => boolean): CopyResult {
  let next = scope;
  const copied: Task[] = [], needsKey: Task[] = [], notCopied: Task[] = [];
  for (const task of TASKS) {
    const stage = scope.hosts[from]?.[task];
    if (!stage) continue;
    if (stage.place === HOST) { notCopied.push(task); continue; }
    next = chooseStage(next, to, task, stage);
    copied.push(task);
    if (stage.place !== DEVICE && !hasKey(stage.place)) needsKey.push(task);
  }
  return { scope: next, copied, needsKey, notCopied };
}

/** A forgotten machine takes its stages with it. */
export function forgetHost(scope: StageScope, fp: string): StageScope {
  const hosts = { ...scope.hosts };
  delete hosts[fp];
  return { ...scope, hosts };
}

/** Today's `sidevoice.stages` keeps one stage pair per fingerprint: exactly a stage pair per machine. A scope
 *  already in this shape is kept as it is. */
export function migrateStages(stored: unknown): StageScope {
  if (!stored || typeof stored !== "object") return emptyScope();
  const value = stored as Record<string, unknown>;
  if (value.default && typeof value.default === "object" && value.hosts && typeof value.hosts === "object") return value as unknown as StageScope;
  let scope = emptyScope();
  for (const [fp, pair] of Object.entries(value)) {
    for (const task of TASKS) {
      const stage = (pair as PerTask | undefined)?.[task];
      if (stage && typeof stage === "object") scope = chooseStage(scope, fp, task, stage);
    }
  }
  return scope;
}
