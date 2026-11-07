import { expect, it, vi } from "vitest";

/* Nothing a creature acts out is cut at its canvas's edge. The acts (acts.js) keep their props and effects inside the reference
 * creator's frame, which is wider than the face render's: the floating card's avatar, a creature on nothing, is framed whole
 * (host.ts WHOLE_FACE) so that every act, its props beside it on the floor, its antics overhead and the shadows they throw, is inside
 * its square; and the stage's scene canvas, cropped to the creature's reach (host.ts cropFor), holds every act as it is drawn (tilts,
 * shakes and hops included, which the framer's measure leaves out). Here the real rig and the real acts play every act over the state
 * it plays in, and every pose is measured by its vertices as each camera projects them. The renderer draws nothing (the test's DOM has
 * no WebGL). */

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
import { ACTS, Stage } from "./rig.js";
import { creatureFromSeed, rigSpec } from "./catalogue";
import { cropShare, WHOLE_FACE } from "./host";
import { StageFrame } from "./stage-frame";
import { StageFramer } from "./stage-framer";

/** The face render's framing (host.ts FACE), which the title card's face and every still face keep. */
const FACE = { fit: true, zoom: 1.5, lookY: 0.22 };
const WORKS = ["crank", "hammer", "files", "type", "think"];
const PASTIMES = ["stretch", "water", "juggle", "soup", "fish", "bubbles", "music", "read", "nap"];
const MOODS = ["happy", "laugh", "love", "surprised", "angry", "sad", "confused", "dizzy", "excited", "shy", "proud", "scared"];
/** The stage's key lights (rig.js): its default, and the cast-shadow variants'. */
const LIGHTS = [[-2.2, 4.2, 5], [-2.5, 4.4, 4.6]];
/** The startle's hop at its height (host.ts STARTLE: 9 px of the pose's dy a unit of hop, 1.1 of it). */
const HOP = -9 * 1.1;

/** Each act with the state it is played over: the working styles while working, the pastimes at rest, a mood over listening. */
const ACTED: Array<[layer: string, name: string, opts: object, state: string]> = [
  ...["listening", "speaking", "working", "idle"].map((state): [string, string, object, string] => ["", "", {}, state]),
  ...WORKS.map((w): [string, string, object, string] => ["base", "work-" + w, { cogs: true }, "working"]), ["cogs", "cogs", {}, "working"],
  ...PASTIMES.map((p): [string, string, object, string] => ["base", "rest-" + p, {}, "idle"]),
  ...MOODS.map((m): [string, string, object, string] => ["mood", m, {}, "listening"])];

interface V3 { x: number; y: number; z: number; set(x: number, y: number, z: number): V3; applyMatrix4(m: unknown): V3; project(c: unknown): V3 }
interface Obj { visible: boolean; isMesh?: boolean; castShadow?: boolean; userData: Record<string, unknown>; children: Obj[]; matrixWorld: unknown; geometry?: { attributes: { position: { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } } } }
interface Acting { root: Obj & { position: { constructor: new () => V3 }; updateMatrixWorld(force: boolean): void }; minY: number; setAct(layer: string, name: string | null, opts?: object): void }
/** The furthest a pose reaches on each side, in the camera's normalised coordinates (-1 to 1 across the canvas). */
interface Extent { left: number; right: number; top: number; bottom: number }

/** Every pose of every act (and of each state alone, and at the startle's hop), drawn as `stage` draws `item`, measured by `camera`
 *  (what the canvas shows, as the host windows it): the widest each act reaches, by its name. */
function widest(stage: { draw(item: unknown, t: number, lvl: number, still: boolean): void }, item: { c: unknown; spec: { state?: string }; opts: Record<string, unknown> },
  camera: () => unknown, opts: Record<string, unknown>, only?: string): Map<string, Extent> {
  const c = item.c as Acting, V = c.root.position.constructor, q = new V(), r = new V(), out = new Map<string, Extent>();
  for (const [layer, name, actOpts, state] of ACTED) {
    if (only && name !== only) continue;
    if (name && !(name in (ACTS as Record<string, unknown>))) continue;
    item.spec.state = state;
    if (name) c.setAct(layer, name, { hold: true, ...actOpts });
    const e: Extent = { left: 0, right: 0, top: 0, bottom: 0 };
    for (let t = 0.07; t <= 12; t += 0.37) for (const hop of [0, HOP]) {
      item.opts = { ...opts, off: 0, extra: hop ? { dy: hop } : undefined };
      stage.draw(item, t, 0.5, false);
      c.root.updateMatrixWorld(true); // (the renderer would; it draws nothing here)
      const cam = camera();
      const keep = (p: V3) => { r.set(p.x, p.y, p.z).project(cam); e.left = Math.min(e.left, r.x); e.right = Math.max(e.right, r.x); e.top = Math.max(e.top, r.y); e.bottom = Math.min(e.bottom, r.y); };
      const visit = (o: Obj) => {
        if (!o.visible || o.userData.noFit) return; // noFit: a burst of light meant to run off the frame
        if (o.isMesh && o.geometry) {
          const pa = o.geometry.attributes.position;
          for (let i = 0; i < pa.count; i += 3) {
            q.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(o.matrixWorld);
            // The proud confetti falls away past the floor and out of view, as the reference's does: not a pose cut short.
            if (name === "proud" && q.y < c.minY) continue;
            keep(q);
            // ...and the shadow it throws on the floor, along each key light.
            if (o.castShadow && i % 6 === 0) for (const l of LIGHTS) { const k = Math.max(0, q.y - c.minY) / l[1]; keep(new V().set(q.x - l[0] * k, c.minY, q.z - l[2] * k)); }
          }
        }
        for (const ch of o.children) visit(ch);
      };
      visit(c.root);
    }
    if (name) c.setAct(layer, null);
    out.set(name || state, e);
  }
  return out;
}

/** The floating card's creature on its stage ("card": a square canvas, the face framings' camera), as host.ts mounts it. */
function cardCreature(seed: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 320;
  const stage = new Stage("paint", 256) as unknown as { draw(item: unknown, t: number, lvl: number, still: boolean): void; camera: { updateMatrixWorld(): void }; add(spec: object, canvas: HTMLCanvasElement, opts: object): { c: unknown; spec: { state?: string }; opts: Record<string, unknown> } };
  const item = stage.add({ ...rigSpec(creatureFromSeed(seed)), state: "idle" }, canvas, { ...WHOLE_FACE, off: 0 });
  return { stage, item, camera: () => { stage.camera.updateMatrixWorld(); return stage.camera; } };
}

const outside = (all: Map<string, Extent>) => [...all].filter(([, e]) => e.left < -1 || e.right > 1 || e.top > 1 || e.bottom < -1)
  .map(([name, e]) => `${name}: ${e.left.toFixed(3)} ${e.right.toFixed(3)} ${e.top.toFixed(3)} ${e.bottom.toFixed(3)}`);

it("framed as a portrait, the music's boombox beside the creature reaches past the canvas's left edge", () => {
  // The operator's report (2026-11-07): the creature docked right, a gesture cut a few pixels on the left. Not the dock: the canvas.
  const { stage, item, camera } = cardCreature("t1");
  const music = widest(stage, item, camera, FACE, "rest-music").get("rest-music")!;
  expect(music.left).toBeLessThan(-1);
}, 60_000);

it.each(["t1", "seed-2", "sidevoice-web"])("the floating card's avatar holds every act it plays, and the shadows they throw, inside its square (%s)", (seed) => {
  const { stage, item, camera } = cardCreature(seed);
  const all = widest(stage, item, camera, WHOLE_FACE);
  expect(all.size).toBe(ACTED.filter(([, name]) => !name || name in (ACTS as Record<string, unknown>)).length);
  expect(outside(all)).toEqual([]);
  // Still a creature of a fair size in it: it reaches well toward the edges.
  const most = Math.max(...[...all.values()].map((e) => Math.max(-e.left, e.right)));
  expect(most).toBeGreaterThan(0.8);
}, 120_000);

/** The stage's tile on a desktop (1920 x 1080's), and the camera it draws the creature with at rest (zoom 1.32 over its 0.5 size). */
const TILE = { w: 1598, h: 876 }, SCENE = { turn: 0, zoom: 1.32 / 0.5 };

it.each(["t1", "seed-2"])("the stage's cropped canvas holds every act as it is drawn, tilts, shakes and hops included (%s)", async (seed) => {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, TILE.w, TILE.h);
  type SceneStage = Parameters<typeof widest>[0] & { camera: { aspect: number; updateProjectionMatrix(): void; updateMatrixWorld(): void }; add(spec: object, canvas: HTMLCanvasElement, opts: object): Parameters<typeof widest>[1] };
  const stage = new Stage("paint", 768, "wide", { fixed: true }) as unknown as SceneStage;
  const item = stage.add(rigSpec(creatureFromSeed(seed)), canvas, { ...SCENE, off: 0 });
  const frame = new StageFrame();
  frame.ask({ w: TILE.w, h: TILE.h, dx: 0, dy: 0, phone: false, desktop: true, rest: true, cards: null, opener: null });
  let done = false;
  const framer = new StageFramer({ stage, item, canvas, render() {}, mood: () => "idle", drawn: () => true, poke() {}, aspect: () => TILE.w / TILE.h, measured() { done = true; } } as unknown as ConstructorParameters<typeof StageFramer>[0], frame);
  framer.reach(TILE.w, TILE.h);
  const until = Date.now() + 60_000;
  while (!done && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
  const share = cropShare(framer.reach(TILE.w, TILE.h)!, TILE.w);
  framer.dispose();
  expect(share).toBeLessThan(1); // cropped: the case this is about
  stage.camera.aspect = TILE.w / TILE.h;
  stage.camera.updateProjectionMatrix();
  // The canvas is the middle `share` of the tile, centred on the creature: what it shows is within `share` of the tile's middle.
  const cut = [...widest(stage, item, () => { stage.camera.updateMatrixWorld(); return stage.camera; }, SCENE)]
    .filter(([, e]) => e.left < -share || e.right > share).map(([name, e]) => `${name}: ${e.left.toFixed(3)} ${e.right.toFixed(3)} of ${share}`);
  expect(cut).toEqual([]);
}, 120_000);
