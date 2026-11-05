import { describe, expect, it } from "vitest";
import { BUDGET_MS, Governor, SCENE_MAX_AREA, SCENE_MAX_H, SCENE_MIN_H, TIERS, sceneSize } from "./quality";

describe("sceneSize: as many pixels as the tile shows", () => {
  it("a phone's tall tile at pixel ratio 3 is drawn for 2, up to the creator's 960 px", () => {
    expect(sceneSize(364, 655, 3)).toEqual({ width: 533, height: 960 });
  });
  it("a desktop tile at pixel ratio 1 is drawn at its own pixels, not at 960 px", () => {
    expect(sceneSize(1118, 628, 1)).toEqual({ width: 1118, height: 628 });
  });
  it("never more fill than the stage's own render, nor more than 960 px tall", () => {
    for (const [w, h, dpr] of [[1118, 628, 2], [1600, 900, 3], [700, 700, 2], [364, 655, 3], [2000, 400, 2]] as const) {
      const s = sceneSize(w, h, dpr);
      expect(s.height).toBeLessThanOrEqual(SCENE_MAX_H);
      expect(s.width * s.height).toBeLessThanOrEqual(SCENE_MAX_AREA * 1.005) // (rounded to whole pixels);
    }
  });
  it("keeps the tile's shape whatever the scale", () => {
    for (const scale of [1, 0.85, 0.72, 0.6, 0.5]) {
      const s = sceneSize(364, 655, 3, scale);
      expect(s.width / s.height).toBeCloseTo(364 / 655, 2);
    }
  });
  it("shrinks with the scale, and not below a creature that still reads", () => {
    expect(sceneSize(364, 655, 3, 0.5).height).toBe(480);
    expect(sceneSize(100, 100, 1, 0.1).height).toBe(SCENE_MIN_H);
  });
  it("a tile with no box yet is 3:2", () => {
    const s = sceneSize(0, 0, 2);
    expect(s.width / s.height).toBeCloseTo(1.5, 2);
  });
});

/** Feeds `frames` frames of `took` ms, `gap` ms apart, from `at`; returns the time after and the rungs it moved to. */
function run(g: Governor, at: number, frames: number, took: number, gap = 1000 / 30) {
  const moves: number[] = [];
  for (let i = 0; i < frames; i++) { at += gap; if (g.observe(at, took, gap)) moves.push(g.tier); }
  return { at, moves };
}

describe("Governor: gives ground a step at a time, and takes it back", () => {
  it("stays on the full look while frames are cheap and on time", () => {
    const g = new Governor();
    expect(run(g, 0, 600, 3).moves).toEqual([]);
    expect(g.tier).toBe(0);
    expect(g.scale).toBe(1);
    expect(g.every).toBeCloseTo(33.3, 1);
  });
  it("steps down when frames cost the thread more than its budget, one rung per spell, not all at once", () => {
    const g = new Governor();
    const { moves } = run(g, 0, 90, BUDGET_MS * 2); // 3 s
    expect(moves.length).toBeGreaterThanOrEqual(1);
    expect(moves.length).toBeLessThanOrEqual(3);
    expect(moves).toEqual([...moves].sort((a, b) => a - b));
    expect(g.scale).toBeLessThan(1);
  });
  it("steps down when frames arrive late though they cost little (the GPU is behind)", () => {
    const g = new Governor();
    const { moves } = run(g, 0, 90, 2, 70);
    expect(moves.length).toBeGreaterThanOrEqual(1);
  });
  it("one slow frame (a program compiling) is not the device", () => {
    const g = new Governor();
    let at = run(g, 0, 60, 3).at;
    at += 200; g.observe(at, 90, 200);
    expect(run(g, at, 60, 3).moves).toEqual([]);
    expect(g.tier).toBe(0);
  });
  it("a pause (the loop slept) says nothing about the frames", () => {
    const g = new Governor();
    const at = run(g, 0, 60, 3).at;
    expect(g.observe(at + 5000, 40, 5000)).toBe(false);
    expect(g.tier).toBe(0);
  });
  it("lowers the rate only after the resolution is as low as it goes, and the rates are even on a 60 Hz screen", () => {
    const g = new Governor();
    run(g, 0, 3000, BUDGET_MS * 3);
    expect(g.tier).toBe(TIERS.length - 1);
    for (const t of TIERS) expect([30, 20, 15]).toContain(t.fps);
    const lowest = Math.min(...TIERS.map((t) => t.scale));
    expect(g.scale).toBe(lowest);
    const fps = TIERS.map((t) => t.fps);
    expect(fps).toEqual([...fps].sort((a, b) => b - a));
    const stepsAtFullRate = TIERS.filter((t) => t.fps === 30).every((t, i, all) => i === 0 || t.scale < all[i - 1].scale);
    expect(stepsAtFullRate).toBe(true);
  });
  it("on the last rung a frame that still costs too much is spaced out, never beyond 500 ms", () => {
    const g = new Governor();
    run(g, 0, 3000, 200);
    expect(g.every).toBeGreaterThan(1000 / 15);
    expect(g.every).toBeLessThanOrEqual(500);
  });
  /** Frames of `took` ms until the rung moves (at most `max`): the time it did, and the rung. */
  const until = (g: Governor, at: number, took: number, max = 3000) => {
    for (let i = 0; i < max; i++) { at += 1000 / 30; if (g.observe(at, took, 1000 / 30)) return { at, tier: g.tier }; }
    return { at, tier: g.tier };
  };
  it("steps back up after a calm spell, and waits twice as long once a step up failed", () => {
    const g = new Governor();
    const down = until(g, 0, BUDGET_MS * 2);
    expect(down.tier).toBe(1);
    const up = until(g, down.at, 1);
    expect(up.tier).toBe(0);
    expect(up.at - down.at).toBeGreaterThan(8000); // not before a calm spell
    expect(up.at - down.at).toBeLessThan(12_000);
    // it fails there at once: down again, and the next calm spell is twice as long
    const failed = until(g, up.at, BUDGET_MS * 2);
    expect(failed.tier).toBe(1);
    const back = until(g, failed.at, 1);
    expect(back.tier).toBe(0);
    expect(back.at - failed.at).toBeGreaterThan(16_000);
    expect(back.at - failed.at).toBeLessThan(20_000);
  });
  it("at a lower rate the same share of the thread allows a dearer frame: 10 ms holds at 20 fps, not at 30", () => {
    const slow = new Governor();
    slow.start(TIERS.findIndex((t) => t.fps === 20), 0);
    expect(run(slow, 0, 600, 10, 50).moves).toEqual([]);
    const fast = new Governor();
    expect(run(fast, 0, 600, 10).moves.length).toBeGreaterThan(0);
  });
  it("starts on the rung a device asks for, and judges nothing while it settles", () => {
    const g = new Governor();
    g.start(2, 1000);
    expect(g.tier).toBe(2);
    expect(run(g, 1000, 30, BUDGET_MS * 3).moves).toEqual([]); // 1 s
  });
  it("pinned: fixed at its rung whatever the frames cost, and judging again when let go", () => {
    const g = new Governor();
    expect(g.pin(3)).toBe(true);
    expect(run(g, 0, 600, 100).moves).toEqual([]);
    expect(g.tier).toBe(3);
    expect(g.pin(null)).toBe(true);
    expect(g.tier).toBe(0);
  });
});
