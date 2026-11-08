import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { GENERATOR_VERSION, pcg32, rng } from "./engine/core";

/* The streams every avatar decision draws from: SHA-256 of the whole versioned tuple into PCG32, exact. */

test("PCG32 matches the reference demo vectors (seed 42, stream 54)", () => {
  const next = pcg32(42n, 54n);
  expect(Array.from({ length: 6 }, () => next().toString(16))).toEqual(["a15c02b7", "7b47f409", "ba1d3330", "83d2f293", "bfa4784b", "cbed606e"]);
});

test("a stream is keyed by the SHA-256 of the versioned (identity, decision) tuple", () => {
  const digest = createHash("sha256").update(JSON.stringify([GENERATOR_VERSION, "thread-1", "body"])).digest();
  const state = digest.readBigUInt64LE(0), sequence = digest.readBigUInt64LE(8);
  const reference = pcg32(state, sequence), stream = rng("thread-1", "body");
  for (let i = 0; i < 8; i += 1) expect(stream.uint32()).toBe(reference());
});

test("the same identity and decision replay; another decision or identity does not", () => {
  const take = (seed: string, part: string) => Array.from({ length: 4 }, ((r) => () => r.uint32())(rng(seed, part)));
  expect(take("a", "x")).toEqual(take("a", "x"));
  expect(take("a", "x")).not.toEqual(take("a", "y"));
  expect(take("a", "x")).not.toEqual(take("b", "x"));
});

test("rejection sampling: a bound that does not divide 2³² is drawn by the reference loop, and is not skewed toward the low end", () => {
  const bound = 3 * 2 ** 30, limit = 2 ** 32 - (2 ** 32 % bound);
  const stream = rng("reject", "check"), reference = rng("reject", "check");
  let low = 0, rejected = 0;
  for (let i = 0; i < 6000; i += 1) {
    let x = reference.uint32();
    while (x >= limit) { x = reference.uint32(); rejected += 1; }
    const got = stream.below(bound);
    expect(got).toBe(x % bound);
    if (got < 2 ** 30) low += 1;
  }
  expect(rejected).toBeGreaterThan(500); // a quarter of the draws are over the limit
  expect(Math.abs(low / 6000 - 1 / 3)).toBeLessThan(0.03); // a plain modulo would give one half
});

test("a bounded pick is uniform: rejection sampling, no modulo bias", () => {
  const r = rng("uniform", "check"), counts = new Array(6).fill(0);
  for (let i = 0; i < 60000; i += 1) counts[r.below(6)] += 1;
  for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(400);
  expect(r.below(1)).toBe(0);
  for (let i = 0; i < 1000; i += 1) { const x = r.int(3, 5); expect(x >= 3 && x <= 5).toBe(true); }
});
