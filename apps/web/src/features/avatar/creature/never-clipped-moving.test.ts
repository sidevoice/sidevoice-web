import { expect, it, vi } from "vitest";

/* (never-clipped.test.ts: the still faces and the microphone hero; here, what moves.) A creature is never cut at the edge of the box it is drawn in, at any size or shape of that box (operator, 2026-11-10: a wide
 * body in headphones in a conversation's card, its headphone cup and its shadow sliced at the same x). Every framing is fitted to
 * what the creature reaches (extent.ts): a still face to the pose it holds, a moving one and the stage to every act it can play.
 * Here the real rig and the real acts are posed as a frame poses them, and every pose is checked by its vertices (not the points
 * the fit kept), its ink and its shadow on the floor included, against the camera the product draws it with. The renderer draws
 * nothing (the test's DOM has no WebGL). */

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<Record<string, unknown>>();
  class WebGLRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false, type: 0, autoUpdate: true };
    autoClear = true;
    setPixelRatio() {}
    setSize() {}
    render() {}
    clearDepth() {}
  }
  return { ...three, WebGLRenderer };
});

/** A 2D context that draws nothing (the rig paints its textures with one): every method answers with another such thing. */
const blank = (): unknown => new Proxy(function () {}, { get: (_t, key) => (key === "data" ? new Uint8ClampedArray(4) : key === "width" ? 0 : key === Symbol.toPrimitive ? () => 0 : blank()), set: () => true, apply: () => blank() });
vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => blank()) as never);

import "./accessories.js";
import "./acts.js";
import { Stage, type StageItem } from "./rig.js";
import { creatureFromSeed, rigSpec, type CreatureChoice, type RigSpec } from "./catalogue";
import { aimAt, footActs, holds, measureReach, POSE_EXTREMES, posedPoints, run, STARTLE_HOP, widthReach, type Vec3 } from "./extent";
import { cropShare, FACE, fittedFace, WHOLE_FACE } from "./host";
import { StageFrame } from "./stage-frame";
import { StageFramer } from "./stage-framer";

type Item = StageItem<RigSpec>;
const base: CreatureChoice = { body: "round", color: "#58c46a", accent: "#7a56c0", iris: "#3d78c4", ears: "none", head: "none", face: "none", eyewear: "none", eyes: "normal" };
/** The operator's report: a rounded-square green body in purple headphones. */
const REPORTED: CreatureChoice = { ...base, body: "box", head: "headphones" };
/** Lets the test's worker breathe between long stretches of posing (it reports to the runner meanwhile). */
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));
/** A few creatures for the moving framings, which play every act: the report's, the widest still face, a tall one, a rolled one. */
const MOVING: Array<[string, CreatureChoice]> = [["box in headphones", REPORTED], ["can in a straw hat", { ...base, body: "can", head: "straw hat" }],
  ["peanut with bunny ears", { ...base, body: "peanut", ears: "bunny" }], ["rolled t1", creatureFromSeed("t1")]];

/** Every pose of every act over the state it plays in, with the overrides a host lays over it (`extremes`), sampled at other times
 *  than the measure's: each pose's vertices (one in `stride`) and their shadows, handed to `check`. */
async function everyPose(stage: Stage, item: Item, extremes: ReadonlyArray<Record<string, number> | undefined>, check: (points: Vec3[], what: string) => void, stride = 3) {
  const c = item.c;
  for (const [layer, name, opts, state] of footActs()) {
    await breathe();
    for (const extra of state === "listening" && !name ? [...extremes, STARTLE_HOP] : extremes) {
      item.spec.state = state;
      if (name) c.setAct(layer, name, { hold: true, ...opts });
      for (let t = 0.07; t <= 12; t += 0.37) {
        item.opts = { ...item.opts, extra };
        stage.pose(item, t, 1, false);
        check(posedPoints(c, { stride }), `${name || state} at ${t.toFixed(2)} s ${JSON.stringify(extra ?? {})}`);
      }
      if (name) c.setAct(layer, null);
    }
  }
}

it.each(MOVING.slice(0, 3))("the floating card's creature holds every act it plays inside its square, framed whole or as the title card's face (%s)", async (_name, choice) => {
  const stage = new Stage("paint", 256);
  const item = stage.add({ ...rigSpec(choice), state: "idle" }, document.createElement("canvas"), { ...WHOLE_FACE, off: 0 }) as Item;
  // as host.ts fits a sharp face: from its framing, to everything its footprint reaches
  const reach = run(measureReach(stage, item.spec)).reach;
  const cameras = [WHOLE_FACE, FACE].map((framing) => aimAt(stage, item.c, 1)({ ...framing, zoom: fittedFace(stage, item, framing, reach) }));
  const cut: string[] = [];
  // a card's creature has no pointer gaze: every act as it plays, and the startle
  await everyPose(stage, item, [undefined], (points, what) => { cameras.forEach((camera, i) => { if (!holds(camera, points)) cut.push(`${i ? "title" : "whole"}: ${what}`); }); });
  expect(cut.slice(0, 5)).toEqual([]);
}, 300_000);

/** Desktop tiles, from a short, wide window held at 21:9 to a tall, narrow one held at 9:16 (call-view.css --stage-ratio). */
const TILES = [[1598, 876], [1120, 698], [2000, 857], [695, 298], [848, 1509], [622, 1107], [467, 796]] as const;

it.each(MOVING.slice(0, 2))("the stage's creature stays inside its canvas and its tile, at every shape of tile and in every pose (%s)", async (_name, choice) => {
  const [W, H] = TILES[0];
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, W, H);
  const stage = new Stage("paint", 768, "wide", { fixed: true });
  const item = stage.add(rigSpec(choice), canvas, { turn: 0, off: 0 }) as Item;
  const frame = new StageFrame();
  frame.ask({ w: W, h: H, dx: 0, dy: 0, phone: false, desktop: true, rest: true, cards: null, opener: null });
  let done = false;
  const framer = new StageFramer({ stage, item, canvas, render() {}, mood: () => "idle", drawn: () => true, poke() {}, aspect: () => W / H, measured() { done = true; } }, frame);
  expect(framer.reach(W, H)).toBeNull(); // not measured yet: asks for it
  const until = Date.now() + 120_000;
  while (!done && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
  expect(done).toBe(true);
  // the closest framing each tile is drawn at (zk at its floor), the canvas's share of the tile there, and the camera: as the stage's
  // at rest (zoom 1.32 over the creature's 0.5 size, times the step back), at a square's aspect (what reaches a share of a tile's half
  // width is that over the tile's aspect), its look raised and lowered as the framing lifts it.
  const tiles = TILES.map(([w, h]) => ({ w, h, zk: framer.floorZk(w, h), share: cropShare(framer.reach(w, h)!, w) }));
  framer.dispose();
  const zks = [...new Set(tiles.map((t) => t.zk))], c = item.c;
  const camOf = (zk: number, lift: number) => {
    const zoom = (1.32 * zk) / 0.5;
    return aimAt(stage, c, 1)({ zoom, lookY: lift === 0 && zk === 1 ? undefined : 0.3 - (zoom - 1) * 0.55 - lift });
  };
  const cams = zks.flatMap((zk) => [-0.8, 0, 0.8].map((lift) => ({ zk, camera: camOf(zk, lift) })));
  const most = new Map<number, number>(zks.map((zk) => [zk, 0]));
  await everyPose(stage, item, POSE_EXTREMES, (points) => { for (const { zk, camera } of cams) most.set(zk, Math.max(most.get(zk)!, widthReach(camera, points))); }, 6);
  const cut = tiles.map((t) => ({ ...t, reach: most.get(t.zk)! / (t.w / t.h) }))
    .filter((t) => t.reach > Math.min(1, t.share)).map((t) => `${t.w}x${t.h} zk ${t.zk.toFixed(3)}: reaches ${t.reach.toFixed(3)} of the half width, canvas ${t.share}`);
  expect(cut).toEqual([]);
  // a landscape tile keeps the reference's framing (zk 1) and its canvas is cropped to the creature
  for (const t of tiles.filter((t) => t.w / t.h > 1.5)) { expect(t.zk).toBe(1); expect(t.share).toBeLessThan(1); }
}, 300_000);

