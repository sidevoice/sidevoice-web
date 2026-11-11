import { expect, it, vi } from "vitest";

/* The scene canvas is only as wide as the creature reaches (host.ts cropFor): StageFramer.reach is what it holds. Here the real
 * rig, the real acts and the real framer measure a creature, and every pose of every act is then checked, on its own sampling
 * and by its vertices (not the boxes the framer keeps), to be inside it: what the creature draws, and what it casts on the floor
 * along the key lights. The renderer draws nothing (the test's DOM has no WebGL). */

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
import { HOP_LIFT } from "./extent";
import { StageFrame } from "./stage-frame";
import { StageFramer } from "./stage-framer";

const W = 1598, H = 876;
const WORKS = ["crank", "hammer", "files", "type", "think"];
const PASTIMES = ["stretch", "water", "juggle", "soup", "fish", "bubbles", "music", "read", "nap"];
const MOODS = ["happy", "laugh", "love", "surprised", "angry", "sad", "confused", "dizzy", "excited", "shy", "proud", "scared"];
/** The stage's key lights (rig.js): its default, and the cast-shadow variants'. */
const LIGHTS = [[-2.2, 4.2, 5], [-2.5, 4.4, 4.6]];

interface V3 { x: number; y: number; z: number; set(x: number, y: number, z: number): V3; applyMatrix4(m: unknown): V3; project(c: unknown): V3; constructor: new () => V3 }
interface Mesh { isMesh?: boolean; visible: boolean; castShadow?: boolean; userData: Record<string, unknown>; children: Mesh[]; matrixWorld: unknown; geometry?: { attributes: { position: { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } } } }

async function measured(seed: string) {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, W, H);
  const stage = new Stage("paint", 768, "wide", { fixed: true }) as unknown as Stage & { camera: { aspect: number; position: { set(x: number, y: number, z: number): void }; lookAt(x: number, y: number, z: number): void; updateProjectionMatrix(): void; updateMatrixWorld(): void } };
  const item = stage.add(rigSpec(creatureFromSeed(seed)), canvas, { turn: 0, off: 0 });
  const frame = new StageFrame();
  frame.ask({ w: W, h: H, dx: 0, dy: 0, phone: false, desktop: true, rest: true, cards: null, opener: null });
  let done = false;
  const framer = new StageFramer({ stage, item, canvas, render() {}, mood: () => "idle", drawn: () => true, poke() {}, aspect: () => W / H, measured() { done = true; } }, frame);
  expect(framer.reach(W, H)).toBeNull(); // not measured yet: asks for it
  const until = Date.now() + 60_000;
  while (!done && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
  expect(done).toBe(true);
  const reach = framer.reach(W, H)!;
  framer.dispose();
  return { stage, item, reach };
}

it.each(["t1", "sidevoice-web"])("the reach holds every pose of every act, and the shadow they cast (%s)", async (seed) => {
  const { stage, item, reach } = await measured(seed);
  expect(reach).toBeGreaterThan(20);
  expect(reach).toBeLessThan(W / 2);
  // the camera the stage draws a desktop's creature with at rest (zoom 1.32 over its 0.5 size, no lift)
  const zoom = 1.32 / 0.5, cam = stage.camera;
  cam.aspect = W / H; cam.updateProjectionMatrix();
  cam.position.set(0, 0.6, 6.7 * zoom); cam.lookAt(0, 0.3 - (zoom - 1) * 0.55, 0); cam.updateMatrixWorld();
  const c = item.c as unknown as { root: Mesh & { rotation: { y: number }; updateMatrixWorld(force: boolean): void }; minY: number; setAct(layer: string, name: string | null, opts?: object): void; actFrame(t: number, still: boolean, st: Record<string, number>, lvl: number): void };
  const V = (c.root as unknown as { position: V3 }).position.constructor, q = new V(), r = new V();
  c.root.visible = true;
  const acts: Array<[string, string, object]> = [...WORKS.map((w): [string, string, object] => ["base", "work-" + w, { cogs: true }]), ["cogs", "cogs", {}],
    ...PASTIMES.map((p): [string, string, object] => ["base", "rest-" + p, {}]), ...MOODS.map((m): [string, string, object] => ["mood", m, {}])];
  let drawnMost = 0, shadowMost = 0, poses = 0;
  const x = (p: V3) => Math.abs(r.set(p.x, p.y, p.z).project(cam).x) * W / 2;
  for (const [layer, name, opts] of acts) {
    if (!(name in (ACTS as Record<string, unknown>))) continue;
    c.setAct(layer, name, { hold: true, ...opts });
    for (let t = 0.07; t <= 12; t += 0.37) {
      const st: Record<string, number> = {};
      c.actFrame(t, false, st, 0.5); c.root.rotation.y = st.turn || 0; c.root.updateMatrixWorld(true);
      poses++;
      const visit = (o: Mesh) => {
        if (!o.visible || o.userData.noFit) return;
        if (o.isMesh && o.geometry) {
          const pa = o.geometry.attributes.position;
          for (let i = 0; i < pa.count; i += 4) {
            q.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(o.matrixWorld);
            drawnMost = Math.max(drawnMost, x(q));
            if (o.castShadow) for (const l of LIGHTS) { const k = Math.max(0, q.y - c.minY) / l[1]; shadowMost = Math.max(shadowMost, x(new V().set(q.x - l[0] * k, c.minY, q.z - l[2] * k))); }
          }
        }
        for (const ch of o.children) visit(ch);
      };
      visit(c.root);
    }
    c.setAct(layer, null);
  }
  expect(poses).toBeGreaterThan(250);
  expect(drawnMost).toBeGreaterThan(20);
  expect(shadowMost).toBeGreaterThan(20);
  // (the host adds its margin and padding to this: a sample between two of the framer's falls short of it by a hair at most)
  expect(reach).toBeGreaterThanOrEqual(drawnMost * 0.98);
  expect(reach).toBeGreaterThanOrEqual(shadowMost * 0.98);
}, 90_000);

it("a creature held still while it listens is framed with room for the startle's hop it still plays", async () => {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, W, H);
  const stage = new Stage("paint", 768, "wide", { fixed: true }) as unknown as Stage;
  const item = stage.add(rigSpec(creatureFromSeed("t1")), canvas, { turn: 0, off: 0 });
  const frame = new StageFrame();
  frame.ask({ w: W, h: H, dx: 0, dy: 0, phone: false, desktop: true, rest: true, cards: null, opener: null });
  const top = (mood: string) => {
    const framer = new StageFramer({ stage, item, canvas, render() {}, mood: () => mood, drawn: () => true, poke() {}, aspect: () => W / H, measured() {} }, frame);
    framer.hold(true);
    const { points } = (framer as unknown as { heldReach(): { points: Array<{ y: number }> } }).heldReach();
    framer.dispose();
    return Math.max(...points.map((p) => p.y));
  };
  // listening's key pose is the idle one's lifted by the hop: the same rig pose, plus HOP_LIFT
  expect(top("listening") - top("idle")).toBeGreaterThanOrEqual(HOP_LIFT * 0.9);
});
