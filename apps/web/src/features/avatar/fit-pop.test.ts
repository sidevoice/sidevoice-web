import { expect, test } from "vitest";
import { popFit } from "./fit-pop";
import type { FaceBox } from "./creature/host";

/** A creature `w` by `h` px in a 144 px render, centred horizontally, its feet `below` px above the render's foot. */
const box = (w: number, h: number, below: number, centre = 71.5): FaceBox => ({ l: Math.round(centre - w / 2), r: Math.round(centre - w / 2) + w - 1, b: 143 - below, t: 143 - below - h + 1, w: 144, h: 144 });
/** Where the creature's feet and head land, as fractions of the square (0 at its foot). */
const stands = (b: FaceBox) => { const fit = popFit(b), k = fit.width / b.w; return { feet: fit.bottom + (b.h - 1 - b.b) * k, head: fit.bottom + (b.h - b.t) * k, width: (b.r - b.l + 1) * k, centre: fit.left + ((b.l + b.r) / 2) * k }; };

test("every creature stands on the same baseline, whatever its shape: its feet a hair above the square's foot", () => {
  for (const shape of [box(60, 100, 20), box(110, 50, 5), box(40, 120, 0), box(100, 100, 30, 60)]) expect(stands(shape).feet).toBeCloseTo(2 / 56, 6);
});

test("a creature of ordinary shape is 120% of the square tall, its head well over the square's top, and centred", () => {
  const shape = box(60, 100, 20), at = stands(shape);
  expect(at.head - at.feet).toBeCloseTo(1.2, 6);
  expect(at.head).toBeGreaterThan(1.1);
  expect(at.centre).toBeCloseTo(0.5, 6);
});

test("it never overflows the square's sides by more than 5% each: 110% wide at most, even where the head then comes out less", () => {
  const wide = stands(box(110, 50, 5));
  expect(wide.width).toBeCloseTo(1.1, 6);
  expect(wide.head - wide.feet).toBeLessThan(1.2);
});

test("a tall creature, hat and all, is no taller than the others: the extent already holds its hat, and 150% is the ceiling", () => {
  const tall = stands(box(30, 120, 0));
  expect(tall.head - tall.feet).toBeCloseTo(1.2, 6);
  expect(tall.head - tall.feet).toBeLessThanOrEqual(1.5);
});
