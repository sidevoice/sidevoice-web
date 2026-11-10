import { describe, expect, test } from "vitest";
// @ts-expect-error: three.js has no types in this repository (the rig is plain JavaScript, declared in rig.d.ts)
import { PerspectiveCamera, Vector3 } from "three";
import { fitZoom, holds, INK_PAD, ReachSet, widthReach, type Vec3 } from "./extent";

/* The arithmetic every framing is fitted with (extent.ts): which points are kept of a creature's reach, whether a camera holds them,
 * and the nearest a camera may stand to hold them all. On three.js's own camera (the rig's: 26° tall), placed as the rig's stage
 * places it for a zoom (0, 0.6, 6.7 × zoom), looking at the creature's middle. */
const camAt = (aspect = 1) => (zoom: number) => {
  const cam = new PerspectiveCamera(26, aspect, 0.1, 60);
  cam.position.set(0, 0.6, 6.7 * zoom); cam.lookAt(0, 0.3, 0); cam.updateMatrixWorld();
  return cam as never;
};
const v = (x: number, y: number, z: number) => new Vector3(x, y, z) as unknown as Vec3;

describe("a reach kept along each side", () => {
  test("of many points, the ones furthest out at each side (and leaning toward the camera) are kept, and only those", () => {
    const set = new ReachSet();
    for (let i = 0; i < 500; i++) set.keep(v(Math.sin(i) * 1.2, Math.cos(i * 1.3) * 0.9, Math.sin(i * 0.7) * 0.5));
    set.keep(v(3, 0, 0)); set.keep(v(0, -2, 0));
    const pts = set.points;
    expect(pts.length).toBeLessThanOrEqual(16);
    expect(pts.some((p) => p.x === 3)).toBe(true);
    expect(pts.some((p) => p.y === -2)).toBe(true);
    // what it keeps is what reaches furthest through a camera: as far as all the points do
    const all = [...Array.from({ length: 500 }, (_, i) => v(Math.sin(i) * 1.2, Math.cos(i * 1.3) * 0.9, Math.sin(i * 0.7) * 0.5)), v(3, 0, 0), v(0, -2, 0)];
    expect(widthReach(camAt(1)(1.4), pts)).toBeCloseTo(widthReach(camAt(1)(1.4), all), 2);
  });
});

describe("the nearest a camera may stand", () => {
  const body = [v(-1, -0.8, 0), v(1, -0.8, 0), v(0, 1.4, 0.3), v(1.6, -0.8, 0.4)];

  test("a creature that already fits keeps its framing exactly", () => {
    expect(fitZoom(camAt(1), body, 2.5)).toBe(2.5);
  });

  test("one that reaches past is stepped back to the least zoom that holds it, with the room asked for and its ink round every point", () => {
    const zoom = fitZoom(camAt(1), body, 1, 0.02);
    expect(zoom).toBeGreaterThan(1);
    expect(holds(camAt(1)(zoom), body, 0.02)).toBe(true);
    expect(holds(camAt(1)(zoom * 0.99), body, 0.02)).toBe(false);
    // the ink: a point exactly at the frame's edge is past it once padded
    const edge = widthReach(camAt(1)(zoom), body, 0);
    expect(widthReach(camAt(1)(zoom), body)).toBeGreaterThan(edge);
    expect(INK_PAD).toBeGreaterThan(0);
  });

  test("a narrower frame needs a camera further back, in proportion to its share of the width it gives", () => {
    const square = fitZoom(camAt(1), body, 1, 0), tall = fitZoom(camAt(9 / 16), body, 1, 0);
    expect(tall).toBeGreaterThan(square);
    // what reaches a share of a frame's half width reaches that share over the aspect in another of the same height
    expect(widthReach(camAt(9 / 16)(3), body)).toBeCloseTo(widthReach(camAt(1)(3), body) / (9 / 16), 6);
  });

  test("no points, nothing to fit: the framing's own zoom", () => {
    expect(fitZoom(camAt(1), [], 1.5)).toBe(1.5);
  });
});
