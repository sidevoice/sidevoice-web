import { expect, test } from "vitest";
import { seededRandom } from "../rotation";
import { FISHING, IDLE_DEFS, IDLE_WEIGHT, MOODS, PASTIMES, WORKS, WORK_DURATION, fishBites, fishing, hash, nextRest, nextWork, span, spellOf } from "./schedule";

/* The design reference's lists, timings and turn-taking (reference/2026-11-04/src/acts.js and creator.js; the handover's
 * §4 table), on a seeded random stream. */

test("the lists are the reference's, in its order", () => {
  expect(WORKS).toEqual(["crank", "hammer", "files", "type", "think"]);
  expect(PASTIMES).toEqual(["quiet", "stretch", "water", "juggle", "soup", "fish", "bubbles", "music", "read", "nap"]);
  expect(MOODS).toEqual(["happy", "laugh", "love", "surprised", "angry", "sad", "confused", "dizzy", "excited", "shy", "proud", "scared"]);
});

test("the durations are the handover's table, in seconds", () => {
  expect(WORK_DURATION).toEqual({ crank: [15, 25], hammer: [8, 14], files: [20, 35], type: [15, 30], think: [8, 16] });
  expect(IDLE_DEFS).toEqual({ quiet: [4, 10], stretch: [3, 3.5], water: [4.5, 6], juggle: [20, 40], soup: [20, 40], fish: [30, 50], bubbles: [18, 35], music: [20, 40], read: [30, 60], nap: [30, 60] });
  expect(IDLE_WEIGHT).toEqual({ nap: 0.5 });
});

test("a spell is random within its range, its ends included as near as the stream gets", () => {
  const random = seededRandom("spell");
  for (const name of WORKS) {
    const got = Array.from({ length: 400 }, () => spellOf("work", name, random));
    const [lo, hi] = WORK_DURATION[name];
    expect(Math.min(...got)).toBeGreaterThanOrEqual(lo);
    expect(Math.max(...got)).toBeLessThanOrEqual(hi);
    expect(Math.min(...got)).toBeLessThan(lo + (hi - lo) * 0.02);
    expect(Math.max(...got)).toBeGreaterThan(hi - (hi - lo) * 0.02);
  }
  for (const name of PASTIMES) {
    const [lo, hi] = IDLE_DEFS[name];
    for (let i = 0; i < 200; i += 1) { const s = spellOf("rest", name, random); expect(s).toBeGreaterThanOrEqual(lo); expect(s).toBeLessThanOrEqual(hi); }
  }
  expect(span([2, 4], () => 0)).toBe(2);
  expect(span([2, 4], () => 0.5)).toBe(3);
});

test("working: a new style is never the one before, and any other is as likely", () => {
  const random = seededRandom("work");
  let prev: string | null = null;
  const count = new Map<string, number>();
  for (let i = 0; i < 20_000; i += 1) {
    const next = nextWork(prev, WORKS, random);
    expect(next).not.toBe(prev);
    count.set(next, (count.get(next) ?? 0) + 1);
    prev = next;
  }
  for (const n of count.values()) expect(Math.abs(n / 4_000 - 1)).toBeLessThan(0.05);
  // From a given style, the four others share the picks.
  const after = new Map<string, number>();
  for (let i = 0; i < 8_000; i += 1) { const x = nextWork("hammer", WORKS, random); after.set(x, (after.get(x) ?? 0) + 1); }
  expect([...after.keys()].sort()).toEqual(["crank", "files", "think", "type"]);
  for (const n of after.values()) expect(Math.abs(n / 2_000 - 1)).toBeLessThan(0.08);
  // a pool of one has nothing else to pick
  expect(nextWork("files", ["files"], random)).toBe("files");
});

test("resting: quiet first and after every pastime; after quiet, a pastime that is never the last one", () => {
  const random = seededRandom("rest");
  let step = nextRest(null, PASTIMES, random);
  expect(step).toEqual({ rest: "quiet", last: null });
  let last: string | null = null;
  for (let i = 0; i < 10_000; i += 1) {
    const next = nextRest(step, PASTIMES, random);
    if (step.rest === "quiet") {
      expect(next.rest).not.toBe("quiet");
      expect(next.rest).not.toBe(last);
      last = next.rest;
    } else expect(next).toEqual({ rest: "quiet", last: step.rest });
    step = next;
  }
});

test("resting: the nap is half as likely as each other pastime", () => {
  const random = seededRandom("nap");
  // From quiet with no last pastime: weights 1 for eight pastimes, 0.5 for the nap, out of 8.5.
  const count = new Map<string, number>();
  const N = 85_000;
  for (let i = 0; i < N; i += 1) { const { rest } = nextRest({ rest: "quiet", last: null }, PASTIMES, random); count.set(rest, (count.get(rest) ?? 0) + 1); }
  expect((count.get("nap") ?? 0) / N).toBeCloseTo(0.5 / 8.5, 2);
  for (const name of PASTIMES) if (name !== "quiet" && name !== "nap") expect((count.get(name) ?? 0) / N).toBeCloseTo(1 / 8.5, 2);
  // With the last one left out the nap keeps its half share against the rest.
  count.clear();
  for (let i = 0; i < N; i += 1) { const { rest } = nextRest({ rest: "quiet", last: "fish" }, PASTIMES, random); count.set(rest, (count.get(rest) ?? 0) + 1); }
  expect(count.get("fish")).toBeUndefined();
  expect((count.get("nap") ?? 0) / N).toBeCloseTo(0.5 / 7.5, 2);
});

test("resting: a pool with one pastime repeats it; with none it stays quiet", () => {
  const random = seededRandom("pools");
  expect(nextRest({ rest: "quiet", last: "music" }, ["quiet", "music"], random).rest).toBe("music");
  expect(nextRest({ rest: "quiet", last: null }, ["quiet"], random).rest).toBe("quiet");
});

test("fishing: 5 s slots, the first bite in the third (10–15 s in), then about one slot in three, at random each time", () => {
  expect(FISHING).toMatchObject({ SLOT: 5, LEAP: 0.7 });
  let later = 0, bites = 0;
  for (let i = 0; i < 2_000; i += 1) {
    const seed = seededRandom("fish" + i)() * 97; // the act draws its seed as Math.random() * 97
    expect(fishBites(0, seed)).toBe(false);
    expect(fishBites(1, seed)).toBe(false);
    expect(fishBites(2, seed)).toBe(true);
    for (let slot = 3; slot < 13; slot += 1) { later += 1; if (fishBites(slot, seed)) bites += 1; expect(fishBites(slot, seed)).toBe(hash(slot * 7.3 + seed) < 0.34); }
  }
  expect(bites / later).toBeGreaterThan(0.3);
  expect(bites / later).toBeLessThan(0.37);
  // at random each time: two spells do not bite in the same slots
  const pattern = (seed: number) => Array.from({ length: 10 }, (_, s) => fishBites(s + 3, seed)).join();
  expect(new Set(Array.from({ length: 50 }, (_, i) => pattern(i * 1.93))).size).toBeGreaterThan(30);
});

test("fishing: the leap takes 0.7 s, out of the water from 4.0 s into its slot; the float dips for the 0.45 s before", () => {
  const seed = 11.5;
  /** How long `key` holds between `from` and `to` (s), sampled every millisecond. */
  const held = (from: number, to: number, key: "up" | "dip") => { let n = 0; for (let i = Math.round(from * 1000); i < to * 1000; i += 1) if (fishing(i / 1000, seed)[key]) n += 1; return n / 1000; };
  // the third slot (10–15 s): out of the water 14.0–14.7 s, 0.7 s; the float down 13.55–14.0 s
  expect(held(10, 15, "up")).toBeCloseTo(0.7, 2);
  expect(fishing(13.995, seed).up).toBe(false);
  expect(fishing(14.005, seed).up).toBe(true);
  expect(fishing(14.695, seed).up).toBe(true);
  expect(fishing(14.705, seed).up).toBe(false);
  expect(held(10, 15, "dip")).toBeCloseTo(0.45, 2);
  expect(fishing(13.545, seed).dip).toBe(false);
  expect(fishing(13.555, seed).dip).toBe(true);
  expect(fishing(14.005, seed).dip).toBe(false);
  // the leap eases from 0 to 1 over it; the splash starts as it lands
  expect(fishing(14, seed).jump).toBe(0);
  expect(fishing(14.35, seed).jump).toBeCloseTo(0.5, 5);
  expect(fishing(14.7, seed).jump).toBe(1);
  expect(fishing(14.6, seed).splash).toBe(0);
  expect(fishing(14.65, seed).splash).toBeGreaterThan(0);
  // nothing in the first two slots
  expect(held(0, 10, "up")).toBe(0);
  expect(held(0, 10, "dip")).toBe(0);
});
