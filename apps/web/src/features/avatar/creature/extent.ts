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

/** The furthest the pointer's gaze turns the head either way (rig.js pose: the eyes' gaze, at most 0.85, times 0.42), radians. */
export const GAZE_TURN = 0.85 * 0.42;
/** The startle's hop at its height, world units (host.ts STARTLE: 9 px of the pose's dy a unit of hop, 1.1 of it; rig.js pose: 0.012 a px). */
export const HOP_LIFT = 9 * 1.1 * 0.012;

/** Visits what a creature draws as it stands now: every drawn mesh's vertices (`exact`: one in `stride`; else its outline points,
 *  outlineOf), and, for what casts a shadow, where those points fall on the floor along the key light. The bursts meant to run off
 *  the frame (noFit) and the ink hulls (outline: the same geometry, INK_PAD covers them) are left out.
 *  `gaze`: what turns with the head (the pivot) is also kept turned to each of the pointer's widest gazes (GAZE_TURN), from where
 *  the pose has it, as a host's gaze would turn it (the rest of the pose kept); `lift`: everything also kept raised by this much
 *  (the startle's hop). Both without posing it again. */
export function visitDrawn(c: Pick<Creature3D, "root" | "minY">, keep: (p: Vec3) => void, { exact = false, stride = 2, shadows = true, gaze = false, lift = 0, drawn }: { exact?: boolean; stride?: number; shadows?: boolean; gaze?: boolean; lift?: number;
  /** Also handed each point drawn as posed (no shadow, no turned or raised copy). */ drawn?: (p: Vec3) => void } = {}) {
  const root = c.root as unknown as Obj3 & { position: { constructor: new () => Vec3 } }, V = root.position.constructor, v = new V(), s = new V(), u = new V(), r = new V();
  const gone = c.minY - FALLEN;
  // the key light the stage turns for this creature (rig.js Stage.draw: the cast-shadow variants' for a paint that casts)
  const light = (c as { P?: { cast?: boolean } }).P?.cast ? KEY_LIGHTS[1] : KEY_LIGHTS[0];
  const shadow = (p: Vec3) => {
    const k = Math.max(0, p.y - c.minY) / light[1];
    keep(s.set(p.x - light[0] * k, c.minY, p.z - light[2] * k));
  };
  const put = (p: Vec3, cast: boolean) => {
    keep(p); if (shadows && cast) shadow(p);
    if (lift) { u.set(p.x, p.y + lift, p.z); keep(u); if (shadows && cast) shadow(u); }
  };
  // the head's pivot, where it stands in the world, and the turns from its pose to the gaze's widest each way
  const pivot = gaze ? (c as unknown as { pivot?: Obj3 & { rotation: { y: number }; matrixWorld: { elements: number[] } } }).pivot : undefined;
  const turns = pivot ? [GAZE_TURN - pivot.rotation.y, -GAZE_TURN - pivot.rotation.y].map((a) => [Math.cos(a), Math.sin(a)] as const) : [];
  let px = 0, pz = 0;
  const emit = (p: Vec3, cast: boolean, turned: boolean) => {
    drawn?.(p);
    put(p, cast);
    if (turned) for (const [cos, sin] of turns) { const dx = p.x - px, dz = p.z - pz; put(r.set(px + dx * cos + dz * sin, p.y, pz - dx * sin + dz * cos), cast); }
  };
  const visit = (o: Obj3, top = false, turned = false) => {
    // (the creature's own root counts as shown: a stage hides every creature but the one it draws, between draws)
    if ((!o.visible && !top) || o.userData.noFit || o.userData.outline) return;
    turned ||= o === pivot;
    const g = o.geometry;
    if (g && (o.isMesh || o.isSprite || o.isLine || o.isPoints)) {
      const pa = g.attributes?.position, cast = !!o.castShadow;
      if (exact && pa) {
        for (let i = 0; i < pa.count; i += stride) { v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(o.matrixWorld); if (v.y >= gone) emit(v, cast, turned); }
      } else if (pa) {
        const pts = outlineOf(pa);
        for (let i = 0; i < pts.length; i += 3) { v.set(pts[i], pts[i + 1], pts[i + 2]).applyMatrix4(o.matrixWorld); if (v.y >= gone) emit(v, cast, turned); }
      } else {
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox!;
        for (let i = 0; i < 8; i++) { v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(o.matrixWorld); if (v.y >= gone) emit(v, cast, turned); }
      }
    }
    for (const ch of o.children) visit(ch, false, turned);
  };
  root.updateMatrixWorld(true);
  if (pivot) { const e = pivot.matrixWorld.elements; px = e[12]; pz = e[14]; }
  visit(root, true);
}

/** The directions a reach is kept along: each side of the frame (±x, ±y), leaning toward the camera by a little to a lot, so that
 *  for a camera at any of the distances the stage and the faces use, the point furthest out in its frame is one of these. */
const DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [1, -1].flatMap((s) => [0, 0.2, 0.4].flatMap((k) => [[s, 0, k], [0, s, k]] as const));

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

/** How far up and down the frame the points reach (INK_PAD round them), in the camera's normalised height (-1 at the foot, 1 at
 *  the top): [the highest, the lowest]. */
export function heightReach(camera: RigCamera, points: Vec3[], pad = INK_PAD): [number, number] {
  const cam = camera as Camera, t = Math.tan((cam.fov * Math.PI) / 360);
  cam.updateMatrixWorld();
  let top = -Infinity, bottom = Infinity;
  for (const p of points) {
    const q = p.clone().applyMatrix4(cam.matrixWorldInverse), depth = Math.max(0.01, -q.z), proj = cam as unknown as { projectionMatrix: { elements: number[] } };
    // the camera's own vertical offset (a view window) is in its projection: y in clip space is f·y/depth plus that
    const f = proj.projectionMatrix.elements[5], off = proj.projectionMatrix.elements[9];
    const y = (f * q.y) / depth - off, pad1 = (f * pad) / depth;
    top = Math.max(top, y + pad1); bottom = Math.min(bottom, y - pad1);
  }
  return [top, bottom];
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

/** What a moving creature can reach: `reach`, the points furthest out in every pose of every act it can play (ReachSet), its shadow,
 *  the pointer's gaze and the startle included; `pts`, each pose's leftmost and rightmost point drawn as posed, as a camera ~14 units
 *  away sees them (the phone's framing, which the reach then holds to: StageFramer.view); `minY`, its feet; `top`, its own top at rest. */
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

/** The overrides a host may lay over a pose (rig.js Stage.pose `extra`): none, and the pointer's gaze at its widest each way (the head
 *  turns with it: a boxy body is wider turned). The measure adds them without posing again (visitDrawn `gaze`); the tests pose them. */
export const POSE_EXTREMES: ReadonlyArray<Record<string, number> | undefined> = [undefined, { gx: 1, gy: 0.6 }, { gx: -1, gy: -0.6 }];
/** The startle's hop at its height (host.ts STARTLE: 9 px of the pose's dy a unit of hop, 1.1 of it), on coming into listening. */
export const STARTLE_HOP = { dy: -9 * 1.1 } as const;
/** Where in each act the poses are sampled (seconds) and the voice's level they are posed at (its loudest). */
const SAMPLE = { from: 0, to: 12, step: 0.4 } as const, LOUD = 1;

/** Every act stepped through on a scratch copy of the creature, posed as a frame poses it (Stage.pose), its head also turned to the
 *  pointer's widest gazes and, coming into listening, raised by the startle's hop (visitDrawn): a generator, one pose at a time (a
 *  live page measures between frames, a few milliseconds at a time: footprintOf). */
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
      if (name) c.setAct(layer, name, { hold: true, ...opts });
      const lift = state === "listening" && !name ? HOP_LIFT : 0;
      for (let t = SAMPLE.from; t <= SAMPLE.to; t += SAMPLE.step) {
        it.opts = { off: 0, turn: 0 };
        stage.pose(it, t, LOUD, false);
        let L: { k: number; p: Vec3 } | null = null, R: { k: number; p: Vec3 } | null = null;
        visitDrawn(c, set.keep, { gaze: true, lift, drawn: (q) => {
          const k = q.x / (14 - q.z);
          if (!L || k < L.k) L = { k, p: q.clone() };
          if (!R || k > R.k) R = { k, p: q.clone() };
        } });
        if (L && R) pts.push((L as { p: Vec3 }).p, (R as { p: Vec3 }).p);
        yield;
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

/** How far, past the pose a creature rests in (its own vertices), what it acts out can reach, world units, each way: its props beside
 *  it, what flies over it, the shadows they throw (to the right and back: the key light is to the left and in front). The most
 *  measureReach found over the catalogue's bodies in their widest parts, a fifth on top (never-clipped-moving.test.ts holds them
 *  to it). What frames a creature before its own reach is measured: never cut, if a little small for a moment. */
export const ACTS_ENVELOPE = { left: 1.2, right: 1.9, up: 1.1, down: 0.6, front: 1.2, back: 2.7 } as const;

/** A creature's reach until it is measured: the box round the pose it stands in now (posed by the caller) and ACTS_ENVELOPE round
 *  that, as world points (its corners). */
export function provisionalReach(c: Pick<Creature3D, "root" | "minY">): Vec3[] {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let any: Vec3 | null = null;
  visitDrawn(c, (p) => { any ??= p.clone(); lo[0] = Math.min(lo[0], p.x); lo[1] = Math.min(lo[1], p.y); lo[2] = Math.min(lo[2], p.z); hi[0] = Math.max(hi[0], p.x); hi[1] = Math.max(hi[1], p.y); hi[2] = Math.max(hi[2], p.z); }, { exact: true, stride: 3, shadows: false });
  if (!any || !lo.concat(hi).every(Number.isFinite)) return [];
  const E = ACTS_ENVELOPE, x = [lo[0] - E.left, hi[0] + E.right], y = [lo[1] - E.down, hi[1] + E.up], z = [lo[2] - E.back, hi[2] + E.front];
  const out: Vec3[] = [];
  for (let i = 0; i < 8; i++) out.push((any as Vec3).clone().set(x[i & 1], y[(i >> 1) & 1], z[(i >> 2) & 1]));
  return out;
}

/** Runs a generator to its end at once. */
export function run<T>(steps: Generator<void, T>): T {
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}

/** The shape a measure is kept for: creatures that differ only in colour reach as far. */
export const shapeKey = (spec: object) => { const s = spec as { body?: unknown; parts?: unknown; eyeStyle?: unknown }; return JSON.stringify([s.body, s.parts, s.eyeStyle]); };

/** How long a task of a measure runs at most (ms): a few poses, then the page's turn (a frame, input) before the next. */
const MEASURE_SLICE_MS = 8;
/** The measures made on this page, by shape, and the ones under way: one per shape, whoever asks (the stage, the floating card). */
const footprints = new Map<string, Footprint>();
const measuring = new Map<string, Set<{ done: (f: Footprint) => void; failed?: () => void }>>();

/** The footprint of `spec`'s shape if it has been measured. */
export const footprintNow = (spec: object): Footprint | null => footprints.get(shapeKey(spec)) ?? null;

/** `done` gets the footprint of `spec`'s shape: at once if measured, else when its measure, stepped on `stage` a slice at a time
 *  between the page's tasks, ends; `failed` if it throws (nothing is kept then: the next ask measures again). Returns what cancels the
 *  wait (a measure others wait for goes on). */
export function footprintOf(stage: Stage, spec: object, done: (f: Footprint) => void, failed?: () => void): () => void {
  const key = shapeKey(spec), ready = footprints.get(key);
  if (ready) { done(ready); return () => {}; }
  let waiting = measuring.get(key);
  if (!waiting) {
    measuring.set(key, (waiting = new Set()));
    const all = waiting, fail = (error: unknown) => {
      measuring.delete(key);
      console.warn("[creature] could not measure its reach:", error instanceof Error ? error.message : error);
      for (const w of all) w.failed?.();
    };
    let gen: Generator<void, Footprint>;
    try { gen = measureReach(stage, spec); } catch (error) { fail(error); return () => {}; }
    const step = () => {
      let r: IteratorResult<void, Footprint>;
      const until = performance.now() + MEASURE_SLICE_MS;
      try { do r = gen.next(); while (!r.done && performance.now() < until); } catch (error) { fail(error); return; }
      if (!r.done) { setTimeout(step, 0); return; }
      footprints.set(key, r.value);
      measuring.delete(key);
      for (const w of all) w.done(r.value);
    };
    setTimeout(step, 0);
  }
  const mine = { done, failed };
  waiting.add(mine);
  const set = waiting;
  return () => { set.delete(mine); };
}
