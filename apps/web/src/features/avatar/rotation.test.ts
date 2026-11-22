import { expect, test } from "vitest";
import { IDLE_DEFS, PASTIMES, WORKS, WORK_DURATION, type CreaturePastime, type CreatureWork } from "./creature/schedule";
import { CYCLE_MS, cycleLength, rotationAt, seededRandom } from "./rotation";

/* The creature's turn-taking on a seeded clock: every pick is a pure function of (seed, time since its sequence began),
 * so these walk whole sequences, deterministically, and check the design reference's rules on them (creature/schedule.ts,
 * DESIGN.md "How long each animation lasts"). */

const IDLES = ["quiet", "music", "bubbles", "stretch"] as const;

/** The steps from the start, by walking `rotationAt` step to step. */
function walk(kind: "work" | "idle", seed: string, pool: readonly string[], until: number) {
  const steps: { value: string; start: number; end: number }[] = [];
  for (let t = 0; t < until; t = steps[steps.length - 1].end) steps.push(rotationAt(kind, seed, pool, t));
  return steps;
}
/** A spell's range in ms, a millisecond of rounding either side. */
const within = (ms: number, [lo, hi]: readonly [number, number]) => ms >= lo * 1000 - 1 && ms <= hi * 1000 + 1;

test("the generator is seeded: the same seed gives the same numbers, another seed other ones", () => {
  const a = seededRandom("x"), b = seededRandom("x"), c = seededRandom("y");
  const first = [a(), a(), a()];
  expect([b(), b(), b()]).toEqual(first);
  expect([c(), c(), c()]).not.toEqual(first);
  for (const n of first) { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(1); }
});

test("the same (seed, time) gives the same pick whoever asks, whenever, in any order", () => {
  const times = [0, 1, 9_999, 10_000, 55_555, 123_456, 3_000_000];
  const forward = times.map((t) => rotationAt("idle", "s\u00001000", PASTIMES, t));
  const backward = [...times].reverse().map((t) => rotationAt("idle", "s\u00001000", PASTIMES, t)).reverse();
  expect(backward).toEqual(forward);
  expect(rotationAt("idle", "other", PASTIMES, 55_555)).not.toBe(undefined);
});

test("work: one of the creature's five styles, kept for its own spell (WORK_DURATION), then another, never the same", () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 40; seed += 1) {
    const steps = walk("work", `w${seed}`, WORKS, 600_000);
    expect(steps[0].start).toBe(0);
    steps.forEach((step, index) => {
      expect(WORKS).toContain(step.value);
      seen.add(step.value);
      expect(within(step.end - step.start, WORK_DURATION[step.value as CreatureWork]), `${step.value} ${step.end - step.start} ms`).toBe(true);
      if (index) { expect(step.start).toBe(steps[index - 1].end); expect(step.value).not.toBe(steps[index - 1].value); }
    });
  }
  expect([...seen].sort()).toEqual([...WORKS].sort());
});

test("rest: quiet and a pastime take turns, quiet first; each for its own spell (IDLE_DEFS); never the last pastime again", () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 40; seed += 1) {
    const steps = walk("idle", `i${seed}`, PASTIMES, 900_000);
    expect(steps[0]).toMatchObject({ value: "quiet", start: 0 });
    steps.forEach((step, index) => {
      expect(PASTIMES).toContain(step.value);
      seen.add(step.value);
      expect(within(step.end - step.start, IDLE_DEFS[step.value as CreaturePastime]), `${step.value} ${step.end - step.start} ms`).toBe(true);
      expect(step.value === "quiet").toBe(index % 2 === 0);
      if (index > 2 && index % 2) expect(step.value).not.toBe(steps[index - 2].value);
    });
  }
  expect([...seen].sort()).toEqual([...PASTIMES].sort());
});

test("the nap comes up half as often as any other pastime", () => {
  const count = new Map<string, number>();
  for (let seed = 0; seed < 700; seed += 1)
    for (const step of walk("idle", `n${seed}`, PASTIMES, CYCLE_MS)) if (step.value !== "quiet") count.set(step.value, (count.get(step.value) ?? 0) + 1);
  const others = PASTIMES.filter((x) => x !== "quiet" && x !== "nap").map((x) => count.get(x) ?? 0);
  const mean = others.reduce((a, b) => a + b, 0) / others.length;
  // About 12,000 picks: the nap's share against the mean of the others is 0.5 within a few hundredths.
  expect(others.reduce((a, b) => a + b, 0)).toBeGreaterThan(11_000);
  expect((count.get("nap") ?? 0) / mean).toBeGreaterThan(0.44);
  expect((count.get("nap") ?? 0) / mean).toBeLessThan(0.56);
  // and the others alike
  for (const n of others) expect(Math.abs(n / mean - 1)).toBeLessThan(0.08);
});

test("spells spread over their whole range: a style's or a pastime's length is random within it", () => {
  const lengths = new Map<string, number[]>();
  for (let seed = 0; seed < 200; seed += 1) for (const step of walk("idle", `s${seed}`, PASTIMES, 300_000)) {
    const list = lengths.get(step.value) ?? [];
    list.push(step.end - step.start);
    lengths.set(step.value, list);
  }
  for (const [name, list] of lengths) {
    if (list.length < 40) continue;
    const [lo, hi] = IDLE_DEFS[name as CreaturePastime], span = (hi - lo) * 1000;
    expect(Math.min(...list) - lo * 1000, name).toBeLessThan(span * 0.15);
    expect(hi * 1000 - Math.max(...list), name).toBeLessThan(span * 0.15);
  }
});

test("boundaries: a step owns its start and not its end, which is the next step's start", () => {
  const [first, second] = walk("idle", "b", IDLES, 20_000);
  expect(rotationAt("idle", "b", IDLES, first.end - 1)).toEqual(first);
  expect(rotationAt("idle", "b", IDLES, first.end)).toEqual(second);
  expect(rotationAt("idle", "b", IDLES, first.start)).toEqual(first);
});

test("a pool with only quiet stays quiet; the pool decides the picks", () => {
  expect(walk("idle", "q", ["quiet"], 100_000).every((step) => step.value === "quiet")).toBe(true);
  expect(walk("work", "q", ["files"], 100_000).every((step) => step.value === "files")).toBe(true);
  expect(walk("idle", "p", IDLES, 300_000).every((step) => (IDLES as readonly string[]).includes(step.value))).toBe(true);
});

test("a very long rest repeats the sequence by whole cycles, arithmetically: the hours cost what the minutes do", () => {
  const inside = rotationAt("idle", "long", PASTIMES, 123_456);
  // Whole cycles later the same step shows; its bounds move by the cycles.
  const cycle = cycleLength("idle", "long", PASTIMES);
  // about CYCLE_MS: whole steps, the last one or two trimmed where the cycle would end on the pastime it starts with
  expect(cycle).toBeGreaterThan(CYCLE_MS - 70_000);
  const later = rotationAt("idle", "long", PASTIMES, 123_456 + 1000 * cycle);
  expect(later.value).toBe(inside.value);
  expect(later.start - inside.start).toBe(1000 * cycle);
  expect(later.end - inside.end).toBe(1000 * cycle);
  const started = performance.now();
  rotationAt("idle", "long", PASTIMES, 40 * 24 * 3_600_000);
  expect(performance.now() - started).toBeLessThan(200);
});

test("the wrap of a cycle keeps the rule too: the pastime or style that ends it is not the one that starts the next", () => {
  for (let seed = 0; seed < 150; seed += 1) {
    for (const [kind, pool] of [["idle", PASTIMES], ["idle", IDLES], ["work", WORKS]] as const) {
      const id = `wrap${seed}`;
      const into = cycleLength(kind, id, pool);
      const steps = walk(kind, id, pool, into + 90_000).filter((step) => step.end > into - 1);
      const shown = steps.map((step) => step.value).filter((value) => value !== "quiet");
      shown.forEach((value, index) => { if (index) expect(value, `${kind} ${id}`).not.toBe(shown[index - 1]); });
    }
  }
});

test("the wrap holds for a pool of two pastimes too", () => {
  const pool = ["quiet", "music", "bubbles"] as const;
  for (const id of Array.from({ length: 150 }, (_, i) => `two${i}`)) {
    const into = cycleLength("idle", id, pool);
    const shown = walk("idle", id, pool, into + 90_000).filter((step) => step.end > into - 1).map((step) => step.value).filter((value) => value !== "quiet");
    shown.forEach((value, index) => { if (index) expect(value, id).not.toBe(shown[index - 1]); });
  }
});
