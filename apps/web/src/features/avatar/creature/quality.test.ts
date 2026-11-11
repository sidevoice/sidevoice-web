import { describe, expect, it } from "vitest";
import { BUDGET_MS, DESKTOP_MAX_AREA, DESKTOP_MAX_H, Governor, SCENE_MAX_AREA, SCENE_MAX_H, SCENE_MIN_H, TIERS, sceneSize } from "./quality";

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
      expect(s.width * s.height).toBeLessThanOrEqual(SCENE_MAX_AREA);
    }
  });
  it("the area ceiling holds for any tile and scale: the minimum height gives way to it, not it to the minimum", () => {
    // 2000 × 100 css px is 20:1: its area-limited height is about 212 px, under SCENE_MIN_H.
    const wide = sceneSize(2000, 100, 1);
    expect(wide.width * wide.height).toBeLessThanOrEqual(SCENE_MAX_AREA);
    expect(wide.height).toBeLessThan(SCENE_MIN_H);
    expect(wide.width / wide.height).toBeCloseTo(20, 1); // still the tile's shape
    for (const [w, h] of [[2000, 100], [4000, 100], [1600, 120], [900, 80], [1118, 628], [364, 655], [100, 100], [120, 1400], [0, 0], [1, 1]] as const) {
      for (const dpr of [0.5, 1, 1.5, 2, 3]) {
        for (const scale of [1, 0.85, 0.72, 0.6, 0.5, 0.1]) {
          const s = sceneSize(w, h, dpr, scale);
          expect(s.width * s.height, `${w}x${h} @${dpr} x${scale}`).toBeLessThanOrEqual(SCENE_MAX_AREA);
          expect(s.width).toBeGreaterThanOrEqual(1);
          expect(s.height).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
  it("a shape that fits keeps its minimum height", () => {
    // 3:1 at 100 css px tall is 100 device px: raised to SCENE_MIN_H (288 × 3 is far under the ceiling).
    expect(sceneSize(300, 100, 1).height).toBe(SCENE_MIN_H);
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

describe("sceneSize on a desktop stage: the screen's own pixels, up to the creature canvas's 4 Mpx", () => {
  it("is drawn at the pixel ratio (2) where a phone's ceilings left it below 1 device px per css px", () => {
    for (const [w, h] of [[404, 596], [528, 796], [599, 876]] as const) {
      const s = sceneSize(w, h, 2, 1, true);
      expect(s.height).toBe(Math.round(h * 2));
      expect(s.width / w).toBeCloseTo(2, 1);
      expect(sceneSize(w, h, 2).width * sceneSize(w, h, 2).height).toBeLessThanOrEqual(SCENE_MAX_AREA); // (the phone's, unchanged)
    }
  });
  it("never passes the ceiling, whatever the window", () => {
    for (const [w, h] of [[900, 1236], [1300, 1900], [2000, 2800], [2000, 100]] as const) {
      const s = sceneSize(w, h, 2, 1, true);
      expect(s.height).toBeLessThanOrEqual(DESKTOP_MAX_H);
      expect(s.width * s.height).toBeLessThanOrEqual(DESKTOP_MAX_AREA);
    }
    const big = sceneSize(900, 1236, 2, 1, true);
    expect(big.width / 900).toBeGreaterThan(1.7);
  });
  it("the ladder steps down to the phone's own floor: its last rung draws what it always did", () => {
    for (const [w, h] of [[404, 596], [599, 876], [900, 1236]] as const) {
      expect(sceneSize(w, h, 2, 0.5, true)).toEqual(sceneSize(w, h, 2, 0.5));
      let above = Infinity; // (down the ladder, no rung draws more than the one above it)
      for (const t of TIERS) {
        const s = sceneSize(w, h, 2, t.scale, true), area = s.width * s.height;
        expect(area).toBeLessThanOrEqual(above);
        above = area;
      }
    }
  });
  it("a phone (or anything not asked as a desktop) keeps the 900 k ceiling", () => {
    expect(sceneSize(364, 655, 3, 1, false)).toEqual({ width: 533, height: 960 });
  });
});

describe("a desktop's rungs: the areas, and what the governor makes of them", () => {
  const areas = (w: number, h: number) => TIERS.map((t) => { const s = sceneSize(w, h, 2, t.scale, true); return s.width * s.height; });
  it("pins what each rung draws at 599 x 876 (the creature's canvas on a 1920 x 1080 window) at pixel ratio 2", () => {
    expect(areas(599, 876)).toEqual([2_098_896, 1_184_400, 503_646, 250_470, 250_470, 157_440, 157_440]);
  });
  /** The rate's own cost: a frame costs this many ms a million pixels (a stand-in for a GPU's fill). */
  const climb = (g: Governor, msPerMpx: number, seconds: number) => {
    let at = 0, moves = 0;
    g.start(2, at);
    for (let i = 0; i < seconds * 30; i++, at += 1000 / 30) {
      const area = areas(599, 876)[g.tier];
      if (g.observe(at, msPerMpx * area / 1e6, g.every)) moves++;
    }
    return { moves, tier: g.tier };
  };
  it("does not step up to a rung whose real area (not its scale squared) would not hold, so it does not oscillate", () => {
    // 8 ms a million px: rung 2 (0.5 M px) costs 4 ms and holds; rung 1 (1.2 M px) costs 9.5 ms and does not.
    const g = new Governor();
    g.measureBy((scale) => { const s = sceneSize(599, 876, 2, scale, true); return s.width * s.height; });
    expect(climb(g, 8, 600)).toEqual({ moves: 0, tier: 2 });
    // (the estimate by the scale alone, 1.39 for that step, tried it and failed, again after every back-off)
    expect(climb(new Governor(), 8, 600).moves).toBeGreaterThan(2);
  });
  it("still steps up where the real areas leave room", () => {
    const g = new Governor();
    g.measureBy((scale) => { const s = sceneSize(599, 876, 2, scale, true); return s.width * s.height; });
    expect(climb(g, 1.5, 600).tier).toBe(0); // rung 0 (2.1 M px) costs 3.1 ms
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
  it("frames not drawn because nobody sees the creature (pause, at each of them) hold the judging off until a moment after the first drawn", () => {
    const g = new Governor();
    let at = run(g, 0, 60, 3).at;
    // Five seconds of frames not drawn, each one a pause: nothing is judged, nothing moves.
    for (let i = 0; i < 150; i++) { at += 1000 / 30; g.pause(at); }
    expect(g.tier).toBe(0);
    // The first frames drawn after them cost a lot (the room shown again is laid out): not judged for SETTLE_MS (1.2 s)...
    expect(run(g, at, 30, BUDGET_MS * 3).moves).toEqual([]);
    expect(g.tier).toBe(0);
    // ...and judged as any after it, when they still cost it.
    expect(run(g, at + 1000, 90, BUDGET_MS * 3).moves.length).toBeGreaterThanOrEqual(1);
    expect(g.tier).toBeGreaterThan(0);
  });
  it("a pause starts the calm spell again: a rung left is not taken back before it has passed", () => {
    const g = new Governor();
    let at = run(g, 0, 90, BUDGET_MS * 2).at; // steps down
    const down = g.tier;
    expect(down).toBeGreaterThan(0);
    at = run(g, at, 150, 1).at; // cheap frames: the calm spell (8 s) is half through (5 s)
    g.pause(at);
    // Another 5 s of cheap frames is less than the spell from the pause: still on the rung (a step up needs the spell and room).
    expect(run(g, at, 150, 1).moves).toEqual([]);
    expect(g.tier).toBe(down);
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
  it("a steady frame well under budget gets the full look back: 4 ms on the second rung is under 8 ms, and about 5.5 ms on the first", () => {
    const g = new Governor();
    g.start(1, 0); // (a transient slowdown stepped it down)
    const { moves, at } = run(g, 0, 600, 4); // 20 s
    expect(moves).toEqual([0]);
    expect(g.tier).toBe(0);
    expect(at).toBeGreaterThan(8000); // after a calm spell, not at once
    expect(run(g, at, 900, 4).moves).toEqual([]); // and it holds there
  });
  it("a steady frame it expects to be over budget one rung up is left where it is", () => {
    const g = new Governor();
    g.start(1, 0);
    // 6.5 ms on the second rung is about 9 ms on the first: over its 8 ms.
    expect(run(g, 0, 5400, 6.5).moves).toEqual([]); // 3 minutes
    expect(g.tier).toBe(1);
  });
  it("the rate comes back by the same rule: 5 ms steps from 20 to 30 fps, and no further up where the resolution would cost 7 ms", () => {
    const g = new Governor();
    const slow = TIERS.findIndex((t) => t.fps === 20);
    g.start(slow, 0);
    run(g, 0, 1500, 5); // 50 s
    expect(TIERS[g.tier]).toEqual({ scale: 0.6, fps: 30 }); // the same pixels, so the same 5 ms: under 6
    expect(g.tier).toBe(slow - 1);
  });
  /** A workload whose frames cost `fill` ms at the full resolution and go with the pixels drawn (the scale squared), plus `fixed`
   *  ms that do not; `jitter` of it swings with the frames. Runs `secs` seconds from the rung `from`: the rungs it moved to, and
   *  when it last moved (s). */
  const workload = (fill: number, from: number, { secs = 600, fixed = 0, jitter = 0 } = {}) => {
    const g = new Governor(), moves: number[] = [];
    let lastAt = 0;
    g.start(from, 0);
    for (let at = 0, i = 0; at < secs * 1000; i++) {
      const gap = g.every, noise = 1 + jitter * Math.sin(i * 1.7) * Math.cos(i * 0.31);
      at += gap;
      if (g.observe(at, (fixed + fill * g.scale ** 2) * noise, gap)) { moves.push(g.tier); lastAt = at / 1000; }
    }
    return { moves, tier: g.tier, lastAt };
  };
  it("never oscillates: whatever the workload and the rung it starts on, a step up it makes is never stepped back down", () => {
    for (const fill of [2, 4, 5.5, 6.5, 7.5, 8.5, 10, 14, 30]) {
      for (const fixed of [0, 2]) {
        for (const jitter of [0, 0.15]) {
          for (let from = 0; from < TIERS.length; from++) {
            const { moves } = workload(fill, from, { fixed, jitter });
            let tier = from, up = false;
            for (const to of moves) {
              if (to > tier) expect(up, `fill ${fill} fixed ${fixed} jitter ${jitter} from ${from}: ${moves}`).toBe(false); // down after an up
              if (to < tier) up = true;
              tier = to;
            }
          }
        }
      }
    }
  });
  it("settles: a steady workload is given its rung within a minute and nothing moves for the nine after", () => {
    // 12 ms at the full look: 8.7 ms on the second rung (over 8), 6.2 ms on the third (holds); one rung up from there is 8.7 again.
    expect(workload(12, 0)).toMatchObject({ moves: [1, 2], tier: 2 });
    expect(workload(12, 0).lastAt).toBeLessThan(60);
    // 7.5 ms holds at the full look (under 8), though a rung that is stepped up to needs it under 6: where it stands it stays.
    expect(workload(7.5, 0)).toMatchObject({ moves: [], tier: 0 });
    expect(workload(7.5, 1)).toMatchObject({ moves: [], tier: 1 });
    // 4 ms recovers from any rung, a step at a time, 8 s apart
    expect(workload(4, TIERS.length - 1)).toMatchObject({ moves: [5, 4, 3, 2, 1, 0], tier: 0 });
    expect(workload(4, TIERS.length - 1).lastAt).toBeLessThan(60);
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

describe("after a burst: what the page's own work took is given back (web#573)", () => {
  // The desktop stage's creature canvas (599 x 876 css px at pixel ratio 2): its rungs fill 2.1, 1.2, 0.5 and 0.25 M px, so a step up
  // is about twice the pixels. A frame costs 3 ms whatever it fills (posing, the draw calls) and 3 ms more at the full look.
  const fill = (scale: number) => { const s = sceneSize(599, 876, 2, scale, true); return s.width * s.height; };
  const desktop = () => { const g = new Governor(); g.measureBy(fill); return g; };
  const cost = (g: Governor, slower = 1) => slower * (3 + 3 * fill(g.scale) / fill(1));
  /** `secs` seconds of frames from `at`, `late` ms apart if given (the page's thread busy elsewhere), else as asked for; with
   *  `settle`, the canvas is being resized on each. The rungs it moved to, and the time after. */
  const frames = (g: Governor, at: number, secs: number, { late = 0, slower = 1, settle = false, took = 0 } = {}) => {
    const moves: number[] = [];
    for (const end = at + secs * 1000; at < end;) {
      const gap = late || g.every;
      at += gap;
      if (settle) g.settle(at);
      if (g.observe(at, took || cost(g, slower), gap)) moves.push(g.tier);
    }
    return { moves, at };
  };

  it("frames late for a while (a launch's own work), though they cost under the limit, step it down, and the calm gives it all back", () => {
    const g = desktop();
    g.start(0, 0);
    const burst = frames(g, 0, 8, { late: 70 });
    expect(g.tier).toBeGreaterThanOrEqual(2); // a rung every 1.5 s or so
    // On the rung it fell to, one up is about twice the pixels: 3.7 ms there is 8.7 ms expected on the rung above, never under 6.
    // What it cost on the full look when it left (6 ms, under 8) is what it would cost there again.
    const after = frames(g, burst.at, 60);
    expect(after.moves).toEqual([0]);
    expect(frames(g, after.at, 600).moves).toEqual([]); // and it holds there
  });

  it("a retake that does not hold goes straight back where it came from, and is not tried again", () => {
    const g = desktop();
    g.start(0, 0);
    let { at } = frames(g, 0, 20); // the full look holds: 6 ms
    expect(g.tier).toBe(0);
    at = frames(g, at, 4, { late: 70 }).at; // a burst steps it down
    const from = g.tier;
    expect(from).toBeGreaterThan(0);
    // and the device is slower from then on: 9.6 ms on the full look, over its 8
    // One try back to the full look after the calm spell, which fails there: back to the rung it held at once (not down every rung
    // between), and no other try in ten minutes.
    expect(frames(g, at, 600, { slower: 1.6 }).moves).toEqual([0, from]);
  });

  it("a GPU that really is behind (frames late on the top rungs, each cheap on the thread) gets one retake, about 2 s, and never another", () => {
    const g = desktop();
    g.start(0, 0);
    const moves: Array<[number, number]> = [];
    for (let at = 0; at < 600_000;) {
      const gap = g.tier <= 2 ? 70 : g.every; // late on rungs 0 to 2 whatever they cost; on time from rung 3
      at += gap;
      if (g.observe(at, 2, gap)) moves.push([at, g.tier]);
    }
    const tiers = moves.map(([, tier]) => tier), retake = tiers.indexOf(0);
    expect(tiers.slice(0, 3)).toEqual([1, 2, 3]); // the slide: rungs 0 to 2 left at 2 ms, under their limit
    expect(retake).toBe(3); // so the first calm spell takes the top back once...
    expect(tiers[retake + 1]).toBe(3); // ...which fails there: straight back to where it held
    expect(moves[retake + 1][0] - moves[retake][0]).toBeLessThan(2500); // the settle and eight late frames
    expect(tiers.slice(retake + 1).filter((tier) => tier < 2)).toEqual([]); // and never again
    // (Rung 2 is still tried on the old estimate, 2 ms on rung 3 being 4 ms expected there, after 16, 32, then every 64 s: as before.)
    expect(tiers.slice(retake + 1).every((tier) => tier === 2 || tier === 3)).toBe(true);
  });

  it("frames drawn while the canvas is resized are not judged, nor the moment after", () => {
    const g = desktop();
    g.start(0, 0);
    let { at } = frames(g, 0, 10);
    const drag = frames(g, at, 3, { settle: true, took: 30, late: 60 }); // its buffers made again on every frame, and late
    expect(drag.moves).toEqual([]);
    at = drag.at;
    expect(frames(g, at, 1, { late: 70 }).moves).toEqual([]); // (the framing solved again just after)
    expect(g.tier).toBe(0);
  });

  it("a canvas made again every few seconds (the floating card's picture-in-picture, on each update of the call) does not keep the step back up waiting", () => {
    const g = desktop();
    g.start(0, 0);
    let { at } = frames(g, 0, 10);
    at = frames(g, at, 4, { late: 70 }).at; // a burst steps it down
    expect(g.tier).toBeGreaterThan(0);
    const moves: number[] = [];
    for (let n = 0; n < 10; n++) { g.settle(at); const spell = frames(g, at, 3); moves.push(...spell.moves); at = spell.at; }
    expect(moves).toContain(0); // taken back within the thirty seconds, though every 3 s a canvas took new pixels
  });

  it("the frames for a moment after a pause (a window coming back) are not judged", () => {
    const g = desktop();
    g.start(0, 0);
    let { at } = frames(g, 0, 10);
    at += 5000;
    expect(g.observe(at, 3, 5000)).toBe(false);
    expect(frames(g, at, 1, { late: 70 }).moves).toEqual([]);
    expect(g.tier).toBe(0);
  });

  it("on the last rung, one long frame does not hold the creature at its slowest: its frames are still judged, and come back", () => {
    const g = new Governor();
    g.start(TIERS.length - 1, 0);
    let at = run(g, 0, 90, 3, 1000 / 15).at;
    at += g.every; g.observe(at, 400, g.every); // a hitch spaces its frames out to near 500 ms
    expect(g.every).toBeGreaterThan(400);
    // Spaced so, each frame came more than PAUSE_MS after the last: they are frames still, not pauses.
    for (let i = 0; i < 20; i++) { const gap = g.every; at += gap; g.observe(at, 3, gap); }
    expect(g.every).toBeCloseTo(1000 / 15, 1);
    const back = run(g, at, 900, 3, 1000 / 15);
    expect(back.moves.length).toBeGreaterThan(0); // and it climbs again
    expect(g.tier).toBeLessThan(TIERS.length - 1);
  });
});
