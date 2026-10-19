import { nextIdle, type Idle, type IdleStep } from "./engine/bichos/idle";
import { nextWork, workTurn, type Work } from "./engine/bichos/work";

/* What a bicho does with its hands is the client's, not the bicho's: a working style while it works (work.ts), an idle
 * step while it rests (idle.ts). One pick per figure, held by its state (avatar-state.ts) while it is in that state and
 * dropped when it leaves it: the next time it starts afresh. Every copy of the figure shows that one pick; the engine
 * reads it from the root (`data-work`, `data-idle`).
 *
 *   work  a random tool when work starts, swapped for another after that tool's own spell (hammering comes in short
 *         bursts, reading goes on: WORK_DURATION)
 *   idle  steps: quiet for a few seconds, then one pastime for its own spell, then quiet again, then another pastime
 *         (never the last one), and so on (nextIdle) */

/** A pick, how long it lasts, and what the next pick is made from. */
interface Step<S> { value: string; ms: number; state: S }
interface Kind<S> {
  first(pool: readonly string[]): Step<S>;
  next(state: S, pool: readonly string[]): Step<S>;
}
const work: Kind<Work> = {
  first: (pool) => workStep(nextWork(null, pool as readonly Work[])),
  next: (prev, pool) => workStep(nextWork(prev, pool as readonly Work[])),
};
const workStep = (value: Work): Step<Work> => ({ value, ms: workTurn(value), state: value });
const idle: Kind<IdleStep> = {
  first: (pool) => idleStep(nextIdle(null, pool as readonly Idle[])),
  next: (prev, pool) => idleStep(nextIdle(prev, pool as readonly Idle[])),
};
const idleStep = (step: IdleStep): Step<IdleStep> => ({ value: step.idle, ms: step.ms, state: step });
const KINDS = { work, idle } as Record<"work" | "idle", Kind<unknown>>;
export type RotationKind = keyof typeof KINDS;

interface Entry { kind: RotationKind; step: Step<unknown>; pool: readonly string[]; until: number; holders: number }
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const notify = () => listeners.forEach((listener) => listener());

function tick() {
  const now = Date.now();
  let changed = false;
  for (const entry of entries.values()) {
    if (now < entry.until) continue;
    entry.step = KINDS[entry.kind].next(entry.step.state, entry.pool);
    entry.until = now + entry.step.ms;
    changed = true;
  }
  if (changed) notify();
}

/** `key`'s avatar is in this state: start a pick if none is running. Returns its release (held more than once, it lets go
 *  once every holder has). */
export function holdRotation(kind: RotationKind, key: string, pool: readonly string[]): () => void {
  const id = kind + "\u0000" + key;
  let entry = entries.get(id);
  if (!entry || entry.pool.join(" ") !== pool.join(" ")) {
    const step = KINDS[kind].first(pool);
    entry = { kind, step, pool, until: Date.now() + step.ms, holders: entry?.holders ?? 0 };
    entries.set(id, entry);
    notify();
  }
  entry.holders += 1;
  timer ??= setInterval(tick, 500);
  return () => {
    const held = entries.get(id);
    if (held && (held.holders -= 1) <= 0) entries.delete(id);
    if (!entries.size && timer) { clearInterval(timer); timer = null; }
  };
}

/** The current pick for `key`, while it is held. */
export const rotationValue = (kind: RotationKind, key: string) => entries.get(kind + "\u0000" + key)?.step.value;

/** Calls `listener` whenever a pick is made. */
export function subscribeRotation(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
