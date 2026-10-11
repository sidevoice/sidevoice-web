import { useLayoutEffect, useSyncExternalStore } from "react";
import { idleTurn, nextIdle, type Idle } from "./engine/bichos/idle";
import { nextWork, workTurn, type Work } from "./engine/bichos/work";

/* What a bicho does with its hands is the client's, not the bicho's: a working style while it works (work.ts), an idle
 * pastime while it rests (idle.ts). Each is picked at random when the state begins and swapped for another every so
 * often while it lasts, like picking up a different tool. One pick per conversation, shared by every copy of its
 * avatar on the page (the stage, the header, the sidebar), and dropped when no copy is in that state any more: the
 * next time it starts with a fresh pick. The engine reads the pick from the root (`data-work`, `data-idle`). */

interface Kind<T extends string> {
  next(prev: string | null, pool: readonly T[]): T;
  /** How long one pick lasts, in ms. */
  turn(): number;
}
const KINDS = {
  work: { next: (prev, pool) => nextWork(prev, pool), turn: () => workTurn() } satisfies Kind<Work>,
  idle: { next: (prev, pool) => nextIdle(prev, pool), turn: () => idleTurn() } satisfies Kind<Idle>,
};
export type RotationKind = keyof typeof KINDS;

interface Entry { kind: RotationKind; value: string; pool: readonly string[]; until: number; holders: number }
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const notify = () => listeners.forEach((listener) => listener());

function tick() {
  const now = Date.now();
  let changed = false;
  for (const entry of entries.values()) {
    if (now < entry.until) continue;
    const kind = KINDS[entry.kind] as Kind<string>;
    entry.value = kind.next(entry.value, entry.pool);
    entry.until = now + kind.turn();
    changed = true;
  }
  if (changed) notify();
}

/** A copy of `key`'s avatar is in this state: start a pick if none is running. Returns its release. */
export function holdRotation(kind: RotationKind, key: string, pool: readonly string[]): () => void {
  const id = kind + "\u0000" + key;
  let entry = entries.get(id);
  if (!entry || entry.pool.join(" ") !== pool.join(" ")) {
    const k = KINDS[kind] as Kind<string>;
    entry = { kind, value: k.next(null, pool), pool, until: Date.now() + k.turn(), holders: entry?.holders ?? 0 };
    entries.set(id, entry);
    notify();
  }
  entry.holders += 1;
  timer ??= setInterval(tick, 1000);
  return () => {
    const held = entries.get(id);
    if (held && (held.holders -= 1) <= 0) entries.delete(id);
    if (!entries.size && timer) { clearInterval(timer); timer = null; }
  };
}

/** The current pick for `key`, if a copy holds one. */
export const rotationValue = (kind: RotationKind, key: string) => entries.get(kind + "\u0000" + key)?.value;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The pick of `kind` for `key` while `active` and the pool has something; nothing otherwise. Held before the first
 *  paint, so a bicho starts its state with the pick in hand. */
export function useRotation(kind: RotationKind, key: string, pool: readonly string[], active: boolean): string | undefined {
  const on = active && pool.length > 0;
  // The pool is compared by its contents: a new array with the same styles is the same pool.
  const poolKey = pool.join(" ");
  useLayoutEffect(() => (on ? holdRotation(kind, key, pool) : undefined), [on, kind, key, poolKey]);
  return useSyncExternalStore(subscribe, () => (on ? rotationValue(kind, key) : undefined), () => undefined);
}
