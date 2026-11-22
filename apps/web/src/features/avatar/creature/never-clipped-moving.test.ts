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
import { aimAt, footActs, footprintNow, heightReach, holds, measureReach, POSE_EXTREMES, posedPoints, provisionalReach, run, STARTLE_HOP, widthReach, type Vec3 } from "./extent";
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
/** The tallest of what a creature can wear, which leans furthest out as the head tips to the pointer's gaze. */
const TALL: [string, CreatureChoice] = ["round in a wizard hat", { ...base, body: "round", head: "wizard hat" }];

/** A stage framer on a creature (the real rig), asked for a tile `w` × `h` (`phone`: a phone's portrait rules), `held` still or
 *  moving, its reach measured where it measures it (resolves once it has, or at once where it does not). */
async function framed(choice: CreatureChoice, w: number, h: number, { phone = false, held = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * 2); canvas.height = Math.round(h * 2);
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, w, h);
  const stage = new Stage("paint", 768, "wide", { fixed: true });
  const item = stage.add(rigSpec(choice), canvas, { turn: 0, off: 0 }) as Item;
  const frame = new StageFrame();
  let done = false;
  const framer = new StageFramer({ stage, item, canvas, render() {}, mood: () => "idle", drawn: () => true, poke() {}, aspect: () => w / h, measured() { done = true; } }, frame);
  framer.hold(held);
  frame.ask({ w, h, dx: 0, dy: 0, phone, desktop: !phone, rest: true, cards: null, opener: null });
  framer.cameraForAsk(); // (asks for the reach where it is measured)
  const until = Date.now() + 120_000;
  if ((!held || phone) && !footprintNow(item.spec)) while (!done && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
  return { stage, item, framer };
}

/** Where every pose `extremes` puts it reaches through `camera` (a square's aspect: a share of the half width over the tile's aspect in it). */
async function reachOf(stage: Stage, item: Item, camera: ReturnType<StageFramer["cameraFor"]>, extremes: ReadonlyArray<Record<string, number> | undefined>, still = false) {
  const most = { width: 0, top: -Infinity, bottom: Infinity };
  const keep = (points: Vec3[]) => { most.width = Math.max(most.width, widthReach(camera, points)); const [top, bottom] = heightReach(camera, points); most.top = Math.max(most.top, top); most.bottom = Math.min(most.bottom, bottom); };
  if (still) for (const extra of extremes) { item.spec.state = "idle"; item.opts = { ...item.opts, extra }; stage.pose(item, 0, 0, true); keep(posedPoints(item.c, { stride: 3 })); }
  else await everyPose(stage, item, extremes, keep, 6);
  return most;
}

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

/** Desktop tiles, from a short, wide window held at 21:9 to a tall, narrow one held at 9:16 (call-view.css --stage-ratio), and a phone
 *  on its side (the desktop's rules: its framing has no landscape). */
const TILES = [[1598, 876], [1120, 698], [2000, 857], [695, 298], [820, 351], [848, 1509], [622, 1107], [467, 796]] as const;

it.each([...MOVING.slice(0, 2), TALL])("the stage's creature stays inside its canvas and its tile, both ways, at every shape of tile and in every pose, before its reach is measured and after (%s)", async (_name, choice) => {
  const [W, H] = TILES[0];
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, W, H);
  const stage = new Stage("paint", 768, "wide", { fixed: true });
  const item = stage.add(rigSpec(choice), canvas, { turn: 0, off: 0 }) as Item;
  const frame = new StageFrame();
  frame.ask({ w: W, h: H, dx: 0, dy: 0, phone: false, desktop: true, rest: true, cards: null, opener: null });
  let done = false;
  const framer = new StageFramer({ stage, item, canvas, render() {}, mood: () => "idle", drawn: () => true, poke() {}, aspect: () => W / H, measured() { done = true; } }, frame);
  // Before the reach is measured: the provisional reach frames it (the first frame), the canvas is the whole tile.
  expect(framer.reach(W, H)).toBeNull();
  const framing = (tag: string) => TILES.map(([w, h]) => ({ tag, w, h, ...framer.restFraming(w, h), share: cropShare(framer.reach(w, h) ?? Number.NaN, w) }));
  const before = framing("provisional");
  const until = Date.now() + 120_000;
  while (!done && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
  expect(done).toBe(true);
  const after = framing("measured");
  // The cameras the stage draws these framings with (framer.cameraFor: rig.js Stage.aim), at a square's aspect: what reaches a share of
  // a tile's half width there reaches that over the tile's aspect in the tile; up and down, the same (the camera's height is the tile's).
  const all = [...before, ...after], key = (t: { zk: number; lift: number }) => t.zk.toFixed(5) + "|" + t.lift.toFixed(5);
  const cams = new Map(all.map((t) => [key(t), { camera: framer.cameraFor(1, 1, t), width: 0, top: -Infinity, bottom: Infinity }]));
  framer.dispose();
  await everyPose(stage, item, POSE_EXTREMES, (points) => {
    for (const c of cams.values()) { c.width = Math.max(c.width, widthReach(c.camera, points)); const [top, bottom] = heightReach(c.camera, points); c.top = Math.max(c.top, top); c.bottom = Math.min(c.bottom, bottom); }
  }, 6);
  const cut = all.flatMap((t) => {
    const c = cams.get(key(t))!, width = c.width / (t.w / t.h), out: string[] = [];
    if (width > Math.min(1, t.share)) out.push(`${t.tag} ${t.w}x${t.h} zk ${t.zk.toFixed(3)}: ${width.toFixed(3)} of the half width, canvas ${t.share}`);
    if (c.top > 1 || c.bottom < -1) out.push(`${t.tag} ${t.w}x${t.h} zk ${t.zk.toFixed(3)}: from ${c.bottom.toFixed(3)} to ${c.top.toFixed(3)} of the height`);
    return out;
  });
  expect(cut).toEqual([]);
  // a landscape tile with room keeps the reference's framing (zk 1) once measured, and its canvas is cropped to the creature
  for (const t of after.filter((t) => t.w / t.h > 1.5 && t.h > 600)) { expect(t.zk).toBe(1); expect(t.share).toBeLessThan(1); }
  // every value the stage lays out is a finite number
  for (const t of all) for (const v of [t.zk, t.lift, t.share]) expect(Number.isFinite(v)).toBe(true);
}, 300_000);

it.each(MOVING)("what a creature acts out stays inside the envelope round its pose at rest that frames it before it is measured (%s)", (_name, choice) => {
  const stage = new Stage("paint", 256);
  const item = stage.add({ ...rigSpec(choice), state: "idle" }, document.createElement("canvas"), { off: 0, turn: 0 }) as Item;
  item.c.root.visible = true;
  stage.pose(item, 0, 0, true);
  const box = provisionalReach(item.c), lo = [0, 1, 2].map((i) => Math.min(...box.map((p) => [p.x, p.y, p.z][i]))), hi = [0, 1, 2].map((i) => Math.max(...box.map((p) => [p.x, p.y, p.z][i])));
  const F = run(measureReach(stage, item.spec));
  const out = F.reach.filter((p) => [p.x, p.y, p.z].some((v, i) => v < lo[i] - 1e-6 || v > hi[i] + 1e-6)).map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`);
  expect(out).toEqual([]);
}, 120_000);

it("a creature held still (reduced motion, no GPU) is framed by the key pose it shows: a normal size on a tall tile, whole, both ways", async () => {
  for (const [w, h] of [[848, 1509], [622, 1107], [1598, 876]] as const) {
    const { stage, item, framer } = await framed(REPORTED, w, h, { held: true });
    const zk = framer.floorZk(w, h), camera = framer.cameraFor(1, 1, framer.restFraming(w, h));
    framer.dispose();
    // the provisional envelope (widest acts) would step it back about half again on a 9:16 tile: its key pose does not need it
    expect(zk, `${w}x${h}`).toBeLessThan(1.1);
    const r = await reachOf(stage, item, camera, POSE_EXTREMES, true);
    expect(r.width / (w / h), `${w}x${h} width`).toBeLessThanOrEqual(1);
    expect(r.top, `${w}x${h} top`).toBeLessThanOrEqual(1);
    expect(r.bottom, `${w}x${h} foot`).toBeGreaterThanOrEqual(-1);
  }
}, 300_000);

it("on a phone (portrait tiles, held still or moving) and on its side, the creature is whole, both ways, in every pose; held still it is the size it is moving", async () => {
  const views: number[] = [];
  for (const [w, h, phone] of [[336, 456, true], [366, 655, true], [296, 390, true], [818, 186, false]] as const) {
    const { stage, item, framer } = await framed(REPORTED, w, h, { phone });
    const camera = framer.cameraForAsk()!, zoom = (camera as unknown as { position: { z: number } }).position.z;
    framer.dispose();
    const r = await reachOf(stage, item, camera, POSE_EXTREMES);
    const aspect = (camera as unknown as { aspect: number }).aspect;
    expect(r.width, `${w}x${h} width`).toBeLessThanOrEqual(1);
    expect(r.top, `${w}x${h} top`).toBeLessThanOrEqual(1);
    expect(r.bottom, `${w}x${h} foot`).toBeGreaterThanOrEqual(-1);
    expect(aspect).toBeCloseTo(w / h, 1);
    if (phone) {
      const held = await framed(REPORTED, w, h, { phone, held: true });
      const heldZ = (held.framer.cameraForAsk() as unknown as { position: { z: number } }).position.z;
      held.framer.dispose();
      expect(heldZ, `${w}x${h} held`).toBeCloseTo(zoom, 3);
      views.push(zoom);
    }
  }
  expect(views.length).toBe(3);
}, 300_000);
