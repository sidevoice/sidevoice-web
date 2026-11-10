import { ACTS, type Creature3D, type RigCamera, type Stage, type StageItem } from "./rig.js";

/* How far a creature reaches, and how far back a camera stands to hold all of it. Every place a creature is drawn into a box
 * (the stage's tile, a still face, the floating card's creature, the microphone hero) fits it from this: what is drawn, every
 * part, prop and effect, its ink, and the shadow it throws on the floor, measured on the pose a frame shows (rig.js
 * Stage.pose), never on a guess of it. A creature too large for its box steps back (it is drawn smaller); it is never cut at
 * the box's edge (operator, 2026-11-10: "a creature must never be clipped, at any window size or aspect ratio").
 *
 * Two measures: `posedPoints`, everything drawn in the pose it stands in now (a still face, the poster's photo), and
 * `measureReach`, every pose of every act it can play over the state it plays in, at the pointer's widest gaze and the voice
 * at its loudest (a creature that moves). This file draws nothing. */

/** Where the stage's key light stands (rig.js Stage: its default, and the cast-shadow variants' higher, more lateral one): a shadow
 *  falls from a point to the floor along the direction from the light, so a point at height y lands y / light.y of the way back along it. */
export const KEY_LIGHTS: ReadonlyArray<readonly [number, number, number]> = [[-2.2, 4.2, 5], [-2.5, 4.4, 4.6]];

/** World units round every point measured: the ink (the inverted hull, `v1` paint: 0.028 × 1.9 out along the normals, rig.js
 *  addOutline) and the shadow map's soft edge (its filter's reach on the floor), with a little to spare. */
export const INK_PAD = 0.08;
/** How far through the floor a thing falls before it has left the scene: the proud's confetti falls away out of view, as the
 *  reference's does (a pose that ends there is not one cut short). Nothing else a creature draws goes a third of this deep. */
const FALLEN = 0.5;

export interface Vec3 { x: number; y: number; z: number; set(x: number, y: number, z: number): Vec3; applyMatrix4(m: unknown): Vec3; clone(): Vec3; copy(v: Vec3): Vec3; project(camera: RigCamera): Vec3 }
interface Obj3 {
  castShadow?: boolean; visible: boolean; userData: Record<string, unknown>; children: Obj3[]; matrixWorld: unknown;
  isMesh?: boolean; isSprite?: boolean; isLine?: boolean; isPoints?: boolean;
  geometry?: { boundingBox: { min: Vec3; max: Vec3 } | null; computeBoundingBox(): void; attributes?: { position?: { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } } };
  updateMatrixWorld(force?: boolean): void;
}
type Camera = RigCamera & { fov: number; matrixWorldInverse: unknown };

type Positions = { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number };
/** Directions spread evenly over the sphere (a Fibonacci lattice), for a mesh's outline points (outlineOf): 64 of them leave at most
 *  about 4% of a round part's radius between the furthest outline point and its true furthest point, well within INK_PAD. */
const SPHERE = Array.from({ length: 64 }, (_, i) => { const y = 1 - (2 * (i + 0.5)) / 64, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5)); return [Math.cos(a) * r, y, Math.sin(a) * r] as const; });
const outlines = new WeakMap<object, Float32Array>();
/** A geometry's outline points, in its own space: its vertices furthest out along each of SPHERE's directions (every vertex of a small
 *  one). However the mesh is turned and stretched, the point furthest out in any direction is one of these or within a hair of
 *  one (INK_PAD covers the hair), at a fraction of the vertices. Worked out once per geometry. */
function outlineOf(pa: Positions): Float32Array {
  let kept = outlines.get(pa);
  if (kept) return kept;
  if (pa.count <= 2 * SPHERE.length) {
    kept = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) kept.set([pa.getX(i), pa.getY(i), pa.getZ(i)], i * 3);
  } else {
    const best = new Float64Array(SPHERE.length).fill(-Infinity), at = new Int32Array(SPHERE.length);
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      for (let d = 0; d < SPHERE.length; d++) { const v = x * SPHERE[d][0] + y * SPHERE[d][1] + z * SPHERE[d][2]; if (v > best[d]) { best[d] = v; at[d] = i; } }
    }
    const unique = [...new Set(at)];
    kept = new Float32Array(unique.length * 3);
    unique.forEach((i, n) => kept!.set([pa.getX(i), pa.getY(i), pa.getZ(i)], n * 3));
  }
  outlines.set(pa, kept);
  return kept;
}

/** Visits what a creature draws as it stands now: every drawn mesh's vertices (`exact`: one in `stride`; else its outline points,
 *  outlineOf), and, for what casts a shadow, where those points fall on the floor along each key light. The bursts meant to run off
 *  the frame (noFit) and the ink hulls (outline: the same geometry, INK_PAD covers them) are left out. */
export function visitDrawn(c: Pick<Creature3D, "root" | "minY">, keep: (p: Vec3) => void, { exact = false, stride = 2, shadows = true } = {}) {
  const root = c.root as unknown as Obj3 & { position: { constructor: new () => Vec3 } }, V = root.position.constructor, v = new V(), s = new V();
  const gone = c.minY - FALLEN;
  // the key light the stage turns for this creature (rig.js Stage.draw: the cast-shadow variants' for a paint that casts)
  const light = (c as { P?: { cast?: boolean } }).P?.cast ? KEY_LIGHTS[1] : KEY_LIGHTS[0];
  const shadow = (p: Vec3) => {
    const k = Math.max(0, p.y - c.minY) / light[1];
    keep(s.set(p.x - light[0] * k, c.minY, p.z - light[2] * k));
  };
  const visit = (o: Obj3, top = false) => {
    // (the creature's own root counts as shown: a stage hides every creature but the one it draws, between draws)
    if ((!o.visible && !top) || o.userData.noFit || o.userData.outline) return;
    const g = o.geometry;
    if (g && (o.isMesh || o.isSprite || o.isLine || o.isPoints)) {
      const pa = g.attributes?.position;
      if (exact && pa) {
        for (let i = 0; i < pa.count; i += stride) { v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(o.matrixWorld); if (v.y < gone) continue; keep(v); if (shadows && o.castShadow) shadow(v); }
      } else if (pa) {
        const pts = outlineOf(pa);
        for (let i = 0; i < pts.length; i += 3) { v.set(pts[i], pts[i + 1], pts[i + 2]).applyMatrix4(o.matrixWorld); if (v.y < gone) continue; keep(v); if (shadows && o.castShadow) shadow(v); }
      } else {
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox!;
        for (let i = 0; i < 8; i++) { v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(o.matrixWorld); if (v.y < gone) continue; keep(v); if (shadows && o.castShadow) shadow(v); }
      }
    }
    for (const ch of o.children) visit(ch);
  };
  root.updateMatrixWorld(true);
  visit(root, true);
}

/** The directions a reach is kept along: each side of the frame (±x, ±y), leaning toward the camera by a little to a lot, so that
 *  for a camera at any of the distances the stage and the faces use, the point furthest out in its frame is one of these. */
const DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [1, -1].flatMap((s) => [0, 0.12, 0.25, 0.4].flatMap((k) => [[s, 0, k], [0, s, k]] as const));

/** The points furthest out along each of DIRECTIONS among all those kept: a handful of world points that hold the reach of as many
 *  poses as are measured into it. */
const FLAT = Float64Array.from(DIRECTIONS.flat());
export class ReachSet {
  private best = new Float64Array(DIRECTIONS.length).fill(-Infinity);
  private kept: Array<Vec3 | null> = DIRECTIONS.map(() => null);
  keep = (p: Vec3) => {
    const { x, y, z } = p, best = this.best;
    for (let i = 0, j = 0; i < best.length; i++, j += 3) {
      const d = x * FLAT[j] + y * FLAT[j + 1] + z * FLAT[j + 2];
      if (d > best[i]) { best[i] = d; this.kept[i] = (this.kept[i] ?? p.clone()).copy(p); }
    }
  };
  get points(): Vec3[] { return this.kept.filter((p): p is Vec3 => !!p); }
}

/** Every few vertices of what the creature draws as it stands now, and its shadow (`shadows`: drawn, as on every stage but the
 *  poster's photo): a still pose, measured exactly. */
export function posedPoints(c: Pick<Creature3D, "root" | "minY">, { stride = 2, shadows = true } = {}): Vec3[] {
  const set = new ReachSet();
  visitDrawn(c, set.keep, { exact: true, stride, shadows });
  return set.points;
}

/** Whether every point, INK_PAD round it, is inside `camera`'s frame with `margin` (a share of the frame's half width and half
 *  height) to spare: measured in the camera's own space, so the pad is a size in the world wherever the point stands. */
export function holds(camera: RigCamera, points: Vec3[], margin = 0, pad = INK_PAD): boolean {
  const cam = camera as Camera, t = Math.tan((cam.fov * Math.PI) / 360), room = 1 - margin;
  cam.updateMatrixWorld();
  for (const p of points) {
    const q = p.clone().applyMatrix4(cam.matrixWorldInverse), depth = -q.z;
    if (!(depth > 0.01)) return false;
    if (Math.abs(q.x) + pad > room * depth * t * cam.aspect || Math.abs(q.y) + pad > room * depth * t) return false;
  }
  return true;
}

/** The share of the frame's half width, from its middle, that the points reach (INK_PAD round them): over 1, past its sides. */
export function widthReach(camera: RigCamera, points: Vec3[], pad = INK_PAD): number {
  const cam = camera as Camera, t = Math.tan((cam.fov * Math.PI) / 360);
  cam.updateMatrixWorld();
  let most = 0;
  for (const p of points) { const q = p.clone().applyMatrix4(cam.matrixWorldInverse), depth = Math.max(0.01, -q.z); most = Math.max(most, (Math.abs(q.x) + pad) / (depth * t * cam.aspect)); }
  return most;
}

/** The nearest a camera may stand and hold every point: the least zoom from `from` (a framing's own) at which `aim(zoom)` (the camera
 *  placed at that zoom) holds them with `margin` to spare. `from` itself where it already does: a creature that fits keeps its
 *  framing exactly. */
export function fitZoom(aim: (zoom: number) => RigCamera, points: Vec3[], from: number, margin = 0.02, pad = INK_PAD): number {
  if (!points.length || holds(aim(from), points, margin, pad)) return from;
  let lo = from, hi = from * 1.25;
  for (let n = 0; n < 12 && !holds(aim(hi), points, margin, pad); n++) { lo = hi; hi *= 1.25; }
  for (let n = 0; n < 24; n++) { const mid = (lo + hi) / 2; if (holds(aim(mid), points, margin, pad)) hi = mid; else lo = mid; }
  return hi;
}

/** A camera like the stage's, `aspect` wide, placed as the stage draws `c` with these item options (rig.js Stage.aim). */
export function aimAt(stage: Stage, c: Creature3D, aspect: number): (opts: Record<string, unknown>) => RigCamera {
  const cam = stage.camera.clone();
  cam.clearViewOffset();
  cam.aspect = aspect; cam.updateProjectionMatrix();
  return (opts) => { stage.aim(cam, opts, c); cam.updateMatrixWorld(); return cam; };
}

// ---------- every pose it can play ----------

/** What a moving creature can reach: `reach`, the points furthest out in every pose of every act it can play (ReachSet), its shadow
 *  included; `pts`, each pose's leftmost and rightmost point as a camera ~14 units away sees them (the phone's framing); `minY`,
 *  its feet; `top`, its own top at rest. */
export interface Footprint { reach: Vec3[]; pts: Vec3[]; minY: number; top: number }

/** The acts as the reference's FOOT_ACTS lists them (creator.js; acts.js WORKS, PASTIMES, MOODS), each with the state it plays
 *  over (the working styles while working, the pastimes at rest, a mood over speaking, whose voice squashes it widest), and each
 *  state alone; those registered. */
const WORKS = ["crank", "hammer", "files", "type", "think"];
const PASTIMES = ["stretch", "water", "juggle", "soup", "fish", "bubbles", "music", "read", "nap"];
const MOODS = ["happy", "laugh", "love", "surprised", "angry", "sad", "confused", "dizzy", "excited", "shy", "proud", "scared"];
type FootAct = [layer: string, name: string, opts: object, state: string];
export function footActs(): FootAct[] {
  const all: FootAct[] = [...["idle", "listening", "speaking", "working"].map((state): FootAct => ["", "", {}, state]),
    ...WORKS.map((w): FootAct => ["base", "work-" + w, { cogs: true }, "working"]), ["cogs", "cogs", {}, "working"],
    ...PASTIMES.map((p): FootAct => ["base", "rest-" + p, {}, "idle"]), ...MOODS.map((m): FootAct => ["mood", m, {}, "speaking"])];
  return all.filter(([, name]) => !name || name in (ACTS as Record<string, unknown>));
}

/** The overrides a host may lay over a pose (rig.js Stage.pose `extra`): none; the pointer's gaze at its widest each way (the head
 *  turns with it: a boxy body is wider turned); the startle's hop at its height (host.ts STARTLE). */
export const POSE_EXTREMES: ReadonlyArray<Record<string, number> | undefined> = [undefined, { gx: 1, gy: 0.6 }, { gx: -1, gy: -0.6 }];
/** The startle's hop at its height (host.ts STARTLE: 9 px of the pose's dy a unit of hop, 1.1 of it), on coming into listening. */
export const STARTLE_HOP = { dy: -9 * 1.1 } as const;
/** Where in each act the poses are sampled (seconds) and the voice's level they are posed at (its loudest). */
const SAMPLE = { from: 0, to: 12, step: 0.3 } as const, LOUD = 1;

/** Every act stepped through on a scratch copy of the creature, posed as a frame poses it (Stage.pose), at each of POSE_EXTREMES:
 *  a generator, one pose at a time (a live page measures between frames, a few milliseconds at a time: footprintOf). */
export function* measureReach(stage: Stage, spec: object): Generator<void, Footprint> {
  const it = stage.add({ ...spec, state: "idle", expr: undefined }, null, { off: 0, turn: 0 }) as StageItem<{ state?: string; expr?: string }>;
  const c = it.c, root = c.root as unknown as Obj3;
  root.visible = true; // a scratch copy: measured, never drawn
  let top = -Infinity;
  visitDrawn(c, (q) => { top = Math.max(top, q.y); });
  const set = new ReachSet(), pts: Vec3[] = [];
  try {
    for (const [layer, name, opts, state] of footActs()) {
      it.spec.state = state;
      // built once (its clock starts at its first pose, t = 0) and posed at every override
      if (name) c.setAct(layer, name, { hold: true, ...opts });
      for (const extra of state === "listening" && !name ? [...POSE_EXTREMES, STARTLE_HOP] : POSE_EXTREMES) {
        // an override's pose differs from the act's own by the head's turn or a hop: every third sample of it is enough
        for (let t = SAMPLE.from; t <= SAMPLE.to; t += extra ? 3 * SAMPLE.step : SAMPLE.step) {
          it.opts = { off: 0, turn: 0, extra };
          stage.pose(it, t, LOUD, false);
          let L: { k: number; p: Vec3 } | null = null, R: { k: number; p: Vec3 } | null = null;
          visitDrawn(c, (q) => {
            set.keep(q);
            const k = q.x / (14 - q.z);
            if (!L || k < L.k) L = { k, p: q.clone() };
            if (!R || k > R.k) R = { k, p: q.clone() };
          });
          if (L && R) pts.push((L as { p: Vec3 }).p, (R as { p: Vec3 }).p);
          yield;
        }
      }
      if (name) c.setAct(layer, null);
    }
    return { reach: set.points, pts, minY: c.minY, top };
  } finally {
    stage.scene.remove(it.c.root);
    it.c.root.traverse((o) => { o.geometry?.dispose(); });
    stage.items = stage.items.filter((x) => x !== it);
  }
}

/** Runs a generator to its end at once. */
export function run<T>(steps: Generator<void, T>): T {
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}

/** The shape a measure is kept for: creatures that differ only in colour reach as far. */
export const shapeKey = (spec: object) => { const s = spec as { body?: unknown; parts?: unknown; eyeStyle?: unknown }; return JSON.stringify([s.body, s.parts, s.eyeStyle]); };

/** How long a task of a measure runs at most (ms): a few poses, then the page's turn. */
const MEASURE_SLICE_MS = 6;
/** The measures made on this page, by shape, and the ones under way: one per shape, whoever asks (the stage, the floating card). */
const footprints = new Map<string, Footprint>();
const measuring = new Map<string, Set<(f: Footprint) => void>>();

/** The footprint of `spec`'s shape if it has been measured. */
export const footprintNow = (spec: object): Footprint | null => footprints.get(shapeKey(spec)) ?? null;

/** `done` gets the footprint of `spec`'s shape: at once if measured, else when its measure, stepped between frames on `stage`,
 *  ends. Returns what cancels the wait (a measure others wait for goes on). */
export function footprintOf(stage: Stage, spec: object, done: (f: Footprint) => void): () => void {
  const key = shapeKey(spec), ready = footprints.get(key);
  if (ready) { done(ready); return () => {}; }
  let waiting = measuring.get(key);
  if (!waiting) {
    measuring.set(key, (waiting = new Set()));
    const gen = measureReach(stage, spec), all = waiting;
    // A few poses per task, MEASURE_SLICE_MS of them at most and in the page's idle time where the browser says when that is, so
    // its frames and input come between them.
    const later = (fn: (idle?: { timeRemaining(): number }) => void) => {
      if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: 200 }); else setTimeout(fn, 0);
    };
    const step = (idle?: { timeRemaining(): number }) => {
      let r: IteratorResult<void, Footprint>;
      const until = performance.now() + Math.max(1, Math.min(MEASURE_SLICE_MS, idle ? idle.timeRemaining() : MEASURE_SLICE_MS));
      try { do r = gen.next(); while (!r.done && performance.now() < until); } catch (error) { measuring.delete(key); console.warn("[creature] could not measure its reach:", error instanceof Error ? error.message : error); return; }
      if (!r.done) { later(step); return; }
      footprints.set(key, r.value);
      measuring.delete(key);
      for (const fn of all) fn(r.value);
    };
    setTimeout(() => later(step), 30);
  }
  waiting.add(done);
  const mine = waiting;
  return () => { mine.delete(done); };
}
