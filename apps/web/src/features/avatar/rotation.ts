import { idleTurn, nextIdle, type Idle, type IdleStep } from "./engine/bichos/idle";
import { nextWork, workTurn, type Work } from "./engine/bichos/work";

/* What a bicho does with its hands is the client's, not the bicho's: a working style while it works (work.ts), an idle
 * step while it rests (idle.ts). Which one is showing is a PURE FUNCTION of (seed, time since the sequence began): the
 * steps are drawn from a seeded generator, so every window that asks the same question gets the same answer, with no
 * owner window and nothing relayed (web#334). The caller says where the sequence began (the figure's `restStart`) and the
 * engine reads the current pick from the root (`data-work`, `data-idle`).
 *
 *   work  a tool when work starts, swapped for another after that tool's own spell (hammering comes in short bursts,
 *         reading goes on: WORK_DURATION)
 *   idle  steps: quiet for a few seconds, then one pastime for its own spell, then quiet again, then another pastime
 *         (never the last one), and so on (nextIdle)
 *
 * A sequence is generated up to CYCLE_MS and then repeats: a figure that rests for hours costs the same as one that has
 * rested for ten minutes (`t` is reduced by whole cycles, arithmetically). */

/** A pick, how long it lasts, and what the next pick is made from. */
interface Step<S> { value: string; ms: number; state: S }
interface Kind<S> {
  first(pool: readonly string[], random: () => number): Step<S>;
  next(state: S, pool: readonly string[], random: () => number): Step<S>;
}
const work: Kind<Work> = {
  first: (pool, random) => workStep(nextWork(null, pool as readonly Work[], random), random),
  next: (prev, pool, random) => workStep(nextWork(prev, pool as readonly Work[], random), random),
};
const workStep = (value: Work, random: () => number): Step<Work> => ({ value, ms: Math.round(workTurn(value, random)), state: value });
const idle: Kind<IdleStep> = {
  first: (pool, random) => idleStep(nextIdle(null, pool as readonly Idle[], random)),
  next: (prev, pool, random) => idleStep(nextIdle(prev, pool as readonly Idle[], random)),
};
const idleStep = (step: IdleStep): Step<IdleStep> => ({ value: step.idle, ms: step.ms, state: step });
const KINDS = { work, idle } as Record<"work" | "idle", Kind<unknown>>;
export type RotationKind = keyof typeof KINDS;

/** How much of a sequence is generated before it repeats (a step that crosses this line is whole). */
export const CYCLE_MS = 10 * 60_000;

/** A small, well-known seeded generator (mulberry32) over a string seed hashed with FNV-1a. */
export function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* The sequence repeats, so its end meets its start: a cycle ends on a pastime (never mid-quiet), and its first pastime or
 * tool is changed, if it is the same as its last, to one that is neither that nor the one after it (the same rule as
 * between any two steps: never the same twice in a row). */
interface Cycle { values: string[]; ends: number[]; length: number }
const cycles = new Map<string, Cycle>();

function cycleOf(kind: RotationKind, seed: string, pool: readonly string[]): Cycle {
  const id = [kind, seed, ...pool].join("\u0000");
  let cycle = cycles.get(id);
  if (cycle) return cycle;
  const random = seededRandom(id);
  const values: string[] = [], spells: number[] = [];
  let step = KINDS[kind].first(pool, random), length = 0;
  for (;;) {
    values.push(step.value);
    spells.push(Math.max(1, step.ms));
    length += spells[spells.length - 1];
    if (length >= CYCLE_MS && (step.value !== "quiet" || !pool.some((v) => v !== "quiet"))) break;
    step = KINDS[kind].next(step.state, pool, random);
  }
  const first = kind === "idle" ? 1 : 0, last = values.length - 1;
  if (last > first + 1 && values[first] === values[last]) {
    const options = pool.filter((v) => v !== "quiet" && v !== values[last] && v !== values[first + (kind === "idle" ? 2 : 1)]);
    if (options.length) {
      const pick = options[Math.floor(random() * options.length)];
      values[first] = pick;
      spells[first] = Math.max(1, kind === "idle" ? idleTurn(pick as Idle, random) : Math.round(workTurn(pick as Work, random)));
    }
  }
  const ends = spells.map((_, i) => spells.slice(0, i + 1).reduce((a, b) => a + b, 0));
  length = ends[ends.length - 1];
  if (cycles.size >= 64) cycles.clear();
  cycles.set(id, (cycle = { values, ends, length }));
  return cycle;
}

/** How long one cycle of the sequence `seed` names is, in ms. */
export const cycleLength = (kind: RotationKind, seed: string, pool: readonly string[]) => cycleOf(kind, seed, pool).length;

/** The pick showing `t` ms into the sequence `seed` names (t >= 0), and when it began and ends, in ms from the same start. */
export function rotationAt(kind: RotationKind, seed: string, pool: readonly string[], t: number): { value: string; start: number; end: number } {
  const cycle = cycleOf(kind, seed, pool);
  const base = Math.floor(Math.max(0, t) / cycle.length) * cycle.length;
  const into = Math.max(0, t) - base;
  let lo = 0, hi = cycle.ends.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cycle.ends[mid] > into) hi = mid; else lo = mid + 1; }
  return { value: cycle.values[lo], start: base + (lo ? cycle.ends[lo - 1] : 0), end: base + cycle.ends[lo] };
}
