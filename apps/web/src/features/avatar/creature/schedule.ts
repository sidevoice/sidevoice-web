/* What a creature acts out, and for how long: the lists, the timings and the turn-taking rules of the design reference
 * (reference/2026-11-04/src/acts.js: MOODS, WORKS, PASTIMES, IDLE_DEFS, IDLE_WEIGHT, WORK_DURATION; src/creator.js:
 * startWork, idleStep, other, span; DESIGN.md "How long each animation lasts"), and the fishing's bite pattern
 * (acts.js 'rest-fish'). No three.js: the room works out which act shows (avatar-state.ts, rotation.ts) without loading
 * the rig, and the rig's acts (acts.js) read the fishing's slots from here.
 *
 *   working  a style for its own spell (random within its range), then another style, never the same one twice in a row
 *   resting  quiet for 4–10 s, then a pastime for its own spell, then quiet, then another pastime: drawn at random, never
 *            the last one again, the nap half as likely as the others
 *
 * Times are in seconds, as the reference keeps them. */

/** The moods: reactions, not states, played over whatever is going on (the creator's menu, in order). */
export const MOODS = ["happy", "laugh", "love", "surprised", "angry", "sad", "confused", "dizzy", "excited", "shy", "proud", "scared"] as const;
export type CreatureMood = (typeof MOODS)[number];

/** The working styles (T16: files replaces read; think: the operator's addition, 2026-11-04). */
export const WORKS = ["crank", "hammer", "files", "type", "think"] as const;
export type CreatureWork = (typeof WORKS)[number];

/** The pastimes; quiet is the rest between them (it has no act). Read is a pastime (T15). */
export const PASTIMES = ["quiet", "stretch", "water", "juggle", "soup", "fish", "bubbles", "music", "read", "nap"] as const;
export type CreaturePastime = (typeof PASTIMES)[number];

type Range = readonly [number, number];
/** How long each spell lasts, in seconds: a random length within its range (the longer pastimes lengthened on
 *  2026-11-04: idle, it can potter about on its own; fishing ran out before a bite). */
export const IDLE_DEFS: Record<CreaturePastime, Range> = {
  quiet: [4, 10], stretch: [3, 3.5], water: [4.5, 6], juggle: [20, 40], soup: [20, 40], fish: [30, 50], bubbles: [18, 35],
  music: [20, 40], read: [30, 60], nap: [30, 60],
};
/** How often a pastime comes up against the others (1 when not listed): the nap half as often. */
export const IDLE_WEIGHT: Partial<Record<CreaturePastime, number>> = { nap: 0.5 };
export const WORK_DURATION: Record<CreatureWork, Range> = { crank: [15, 25], hammer: [8, 14], files: [20, 35], type: [15, 30], think: [8, 16] };

/** A length within `range` (the creator's span). */
export const span = ([a, b]: Range, random: () => number = Math.random) => a + random() * (b - a);

/** A working style from `pool`, never `prev` (the creator's other(WORKS, run.work)): a swap always changes style. */
export function nextWork(prev: string | null, pool: readonly string[] = WORKS, random: () => number = Math.random): string {
  const options = pool.filter((x) => x !== prev);
  if (!options.length) return pool[0] ?? WORKS[0];
  return options[Math.floor(random() * options.length)];
}

/** One step of resting: what shows (quiet or a pastime) and the last pastime played. */
export interface RestStep { rest: string; last: string | null }

/** The next step of resting (the creator's idleStep): going idle (`prev` null) and after every pastime, quiet; after
 *  quiet, a pastime from `pool`, weighted (IDLE_WEIGHT), never the last one played (unless it is the only one). A pool
 *  with no pastime stays quiet. */
export function nextRest(prev: RestStep | null, pool: readonly string[] = PASTIMES, random: () => number = Math.random): RestStep {
  const last = prev?.last ?? null;
  if (!prev || prev.rest !== "quiet") return { rest: "quiet", last };
  const pastimes = pool.filter((x) => x !== "quiet"), fresh = pastimes.filter((x) => x !== last);
  const options = fresh.length ? fresh : pastimes;
  if (!options.length) return { rest: "quiet", last };
  const weight = (x: string) => IDLE_WEIGHT[x as CreaturePastime] ?? 1;
  let r = random() * options.reduce((t, x) => t + weight(x), 0);
  const rest = options.find((x) => (r -= weight(x)) < 0) ?? options[0];
  return { rest, last: rest };
}

/** How long a spell of `name` lasts this time, in seconds: a working style's or a resting step's. */
export function spellOf(kind: "work" | "rest", name: string, random: () => number = Math.random): number {
  const range = kind === "work" ? WORK_DURATION[name as CreatureWork] : IDLE_DEFS[name as CreaturePastime];
  return span(range ?? IDLE_DEFS.quiet, random);
}

// ---------- the fishing's bites (acts.js 'rest-fish') ----------

/** The acts' noise: a stable value in [0, 1) for any number (acts.js uses it for its scatter, the fishing for its bites). */
export const hash = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** In slots of 5 s, a 0.7 s leap that ends 0.3 s before the slot does; the float dips for 0.45 s before it. The first bite
 *  in the third slot (10–15 s in), then about one slot in three, at random each time it fishes (`seed`, drawn when the
 *  act is built: a fixed pattern left it without a bite for 25 s, every time). Operator, 2026-11-04. */
export const FISHING = { SLOT: 5, LEAP: 0.7, J0: 5 - 0.7 - 0.3, DIP: 0.45, FIRST: 2, ODDS: 0.34, SPLASH: 0.19 } as const;

/** Whether the fish bites in slot `slot` (0 from the start) of a spell drawn with `seed`. */
export const fishBites = (slot: number, seed: number) => slot === FISHING.FIRST || (slot > FISHING.FIRST && hash(slot * 7.3 + seed) < FISHING.ODDS);

/** The fishing at `k` seconds into the spell: the slot, whether it bites in it, the float's dip, the leap's progress
 *  (0..1, eased), whether the fish is out of the water, and the splash's progress (0 none; the drops show while 0 < f < 2). */
export function fishing(k: number, seed: number) {
  const { SLOT, LEAP: J, J0, DIP, SPLASH } = FISHING, slot = Math.floor(k / SLOT), w = k - slot * SLOT;
  const leaps = fishBites(slot, seed);
  return {
    slot, w, leaps,
    dip: leaps && w > J0 - DIP && w < J0,
    jump: leaps ? sstep(J0, J0 + J, w) : 0,
    up: leaps && w > J0 && w < J0 + J,
    splash: leaps && w > J0 + J - 0.08 ? (w - (J0 + J - 0.08)) / SPLASH : 0,
  };
}
