import { expect, test } from "vitest";
import { IDLE_DEFS } from "./engine/bichos/idle";
import { WORK_DURATION, type Work } from "./engine/bichos/work";
import { CYCLE_MS, rotationAt, seededRandom } from "./rotation";

const WORKS = ["crank", "hammer", "read", "type"] as const;
const IDLES = ["quiet", "music", "bubbles", "stretch"] as const;

/** The steps from the start, by walking `rotationAt` step to step. */
function walk(kind: "work" | "idle", seed: string, pool: readonly string[], until: number) {
  const steps: { value: string; start: number; end: number }[] = [];
  for (let t = 0; t < until; t = steps[steps.length - 1].end) steps.push(rotationAt(kind, seed, pool, t));
  return steps;
}

test("the generator is seeded: the same seed gives the same numbers, another seed other ones", () => {
  const a = seededRandom("x"), b = seededRandom("x"), c = seededRandom("y");
  const first = [a(), a(), a()];
  expect([b(), b(), b()]).toEqual(first);
  expect([c(), c(), c()]).not.toEqual(first);
  for (const n of first) { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(1); }
});

test("the same (seed, time) gives the same pick whoever asks, whenever, in any order", () => {
  const times = [0, 1, 9_999, 10_000, 55_555, 123_456, 3_000_000];
  const forward = times.map((t) => rotationAt("idle", "s\u00001000", IDLES, t));
  const backward = [...times].reverse().map((t) => rotationAt("idle", "s\u00001000", IDLES, t)).reverse();
  expect(backward).toEqual(forward);
  expect(rotationAt("idle", "other", IDLES, 55_555)).not.toBe(undefined);
});

test("work: a tool from the pool, kept for its own spell, then another one, never the same", () => {
  const steps = walk("work", "w", WORKS, 300_000);
  expect(steps[0].start).toBe(0);
  steps.forEach((step, index) => {
    expect(WORKS).toContain(step.value);
    const [lo, hi] = WORK_DURATION[step.value as Work];
    expect(step.end - step.start).toBeGreaterThanOrEqual(lo - 1);
    expect(step.end - step.start).toBeLessThanOrEqual(hi + 1);
    if (index) { expect(step.start).toBe(steps[index - 1].end); expect(step.value).not.toBe(steps[index - 1].value); }
  });
});

test("rest goes in steps: quiet, a pastime for its own spell, quiet again, another pastime", () => {
  const steps = walk("idle", "i", IDLES, 400_000);
  steps.forEach((step, index) => {
    const [lo, hi] = IDLE_DEFS[step.value as keyof typeof IDLE_DEFS].duration;
    expect(step.end - step.start).toBeGreaterThanOrEqual(lo - 1);
    expect(step.end - step.start).toBeLessThanOrEqual(hi + 1);
    expect(step.value === "quiet").toBe(index % 2 === 0);
    if (index > 2 && index % 2) expect(step.value).not.toBe(steps[index - 2].value);
  });
});

test("boundaries: a step owns its start and not its end, which is the next step's start", () => {
  const [first, second] = walk("idle", "b", IDLES, 20_000);
  expect(rotationAt("idle", "b", IDLES, first.end - 1)).toEqual(first);
  expect(rotationAt("idle", "b", IDLES, first.end)).toEqual(second);
  expect(rotationAt("idle", "b", IDLES, first.start)).toEqual(first);
});

test("a pool with only quiet stays quiet; the pool decides the picks", () => {
  expect(walk("idle", "q", ["quiet"], 100_000).every((step) => step.value === "quiet")).toBe(true);
  expect(walk("work", "q", ["read"], 100_000).every((step) => step.value === "read")).toBe(true);
});

test("a very long rest repeats the sequence by whole cycles, arithmetically: the hours cost what the minutes do", () => {
  const inside = rotationAt("idle", "long", IDLES, 123_456);
  // Whole cycles later the same step shows; its bounds move by the cycles.
  const cycle = walk("idle", "long", IDLES, CYCLE_MS).at(-1)!.end;
  expect(cycle).toBeGreaterThanOrEqual(CYCLE_MS);
  const later = rotationAt("idle", "long", IDLES, 123_456 + 1000 * cycle);
  expect(later.value).toBe(inside.value);
  expect(later.start - inside.start).toBe(1000 * cycle);
  expect(later.end - inside.end).toBe(1000 * cycle);
  const started = performance.now();
  rotationAt("idle", "long", IDLES, 40 * 24 * 3_600_000);
  expect(performance.now() - started).toBeLessThan(200);
});
