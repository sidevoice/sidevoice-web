import { Stage, ACTS, type Creature3D, type StageItem } from "./rig.js";
import "./accessories.js";
import "./acts.js";
import type { AvatarMood } from "../avatar-spec";
import { creatureFromSeed, rigSpec, type CreatureChoice, type RigSpec } from "./catalogue";

/* Where creatures are drawn on a page: two three.js stages (one WebGL context each, whatever the number of creatures),
 * each creature built once into a stage's scene and blitted into its own 2D canvas, as the design reference's creator
 * draws (reference/2026-11-04/src/creator.js): its 1152 × 768 stage into a canvas 960 px tall, and its 256 px square
 * stage for small faces, into a 144 px square. A canvas is drawn from one of two framings:
 *
 *  - "scene": the stage's tile. The camera at the reference's desktop distance (VIEWS.desktop, zoom 1.32: "the figure
 *    ~56% of the tile, as the product sizes it"), stepping back where the tile is narrower than a square, and aimed so
 *    the creature's feet stand where the scene's ground is. The stage's own framing (the creature at the tile's optical
 *    centre, stepping back for a turn's card: fitFrame, capCentre) comes with the stage's voice text, and plugs in here
 *    as a framing ({ zoom, lookY }).
 *  - "face": the whole creature fitted in a square, never cropped from the stage: the creator's face render (renderFace,
 *    T35: fit, zoom 1.5, look height 0.22), the transcript's 44 px face and the floating card's.
 *
 * A canvas that moves is drawn about 30 times a second (the creator's frame loop); one that holds still is drawn once per
 * change, in its state's key pose, as the creator draws under reduced motion. The eyes follow the pointer, or the finger
 * on touch, over the stage (the creator's gazeAt and easedGaze, T23); nothing else answers a touch. */

/** The product's states, as the creator plays them (creator.js MODES): offline is the wanted poster, not the creature. */
const MODES: Record<AvatarMood, { state?: string; voice?: boolean; enter?: boolean; poster?: boolean }> = {
  idle: { state: "idle" },
  listening: { state: "listening", voice: true, enter: true },
  speaking: { state: "speaking", voice: true },
  working: { state: "working" },
  present: { state: "idle" },
  offline: { poster: true },
};

export { ATTENTION_EXPR, STILL_EXPR } from "./faces";

/** Where the camera stands and looks: the creator's item options (zoom: distance over 6.7; lookY: the height it aims at). */
export interface Framing { zoom: number; lookY: number }
/** A scene framing by place: the creature's feet at `ground` and the top of its body (its head, without what it wears)
 *  at `crown`, both shares of the canvas's height from its top. */
export interface FigureFraming { ground: number; crown: number }

/** The reference's desktop stage distance (creator.js VIEWS.desktop). */
export const SCENE_ZOOM = 1.32;
/** The face render (creator.js renderFace): fitted, stepped back and aimed a little higher, so a hat or ears fit. */
const FACE = { fit: true, zoom: 1.5, lookY: 0.22 } as const;
/** The canvases' heights, as the creator's: the stage's preview, and the face. */
const SCENE_PX = 960, FACE_PX = 144;

// ---------- the stages ----------
type Item = StageItem<RigSpec>;
type RigStage = Stage;

let stages: { scene: RigStage; face: RigStage } | null | undefined;
/** The page's two stages, made the first time a creature is drawn; null where WebGL cannot be had (a test's DOM, a
 *  browser without it): the avatar's canvas then stays empty. */
function stagesOf(): { scene: RigStage; face: RigStage } | null {
  if (stages !== undefined) return stages;
  try {
    if (typeof WebGLRenderingContext === "undefined") throw new Error("no WebGL");
    stages = { scene: new Stage("paint", 768, "wide"), face: new Stage("paint", 256) };
  } catch (error) {
    console.warn("[creature] cannot draw creatures:", error instanceof Error ? error.message : error);
    stages = null;
  }
  return stages;
}
export const canDrawCreatures = () => stagesOf() !== null;

function dispose(item: StageItem, stage: RigStage) {
  stage.scene.remove(item.c.root);
  item.c.root.traverse((o) => {
    o.geometry?.dispose();
    // Materials are the creature's own (the toon shader is made per mesh); textures are cached and shared: left.
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) m.dispose();
  });
  stage.items = stage.items.filter((x) => x !== item);
}

/** The camera height that puts the creature's feet at `ground` of a canvas `aspect` wide, at `zoom` (the creator's
 *  phoneFit place(): halving on the height it looks at). */
export function lookForGround(stage: RigStage, c: Creature3D, aspect: number, zoom: number, ground: number): number {
  const cam = stage.camera.clone(), V3 = c.root.position.constructor, want = 1 - 2 * ground;
  cam.aspect = aspect; cam.updateProjectionMatrix();
  let lo = -8, hi = 8;
  for (let i = 0; i < 32; i++) {
    const L = (lo + hi) / 2;
    cam.position.set(0, 0.6, 6.7 * zoom); cam.lookAt(0, L, 0); cam.updateMatrixWorld();
    if (new V3(0, c.minY, 0).project(cam).y < want) hi = L; else lo = L;
  }
  return (lo + hi) / 2;
}

/** The camera that stands the creature with its feet at `ground` and the top of its body at `crown` (shares of the
 *  canvas's height): halving on the distance, each distance aimed by lookForGround. */
export function placeFigure(stage: RigStage, c: Creature3D, aspect: number, { ground, crown }: FigureFraming): Framing {
  const cam = stage.camera.clone(), V3 = c.root.position.constructor, top = c.body.geometry.boundingBox.max.y;
  cam.aspect = aspect; cam.updateProjectionMatrix();
  const topAt = (zoom: number, lookY: number) => { cam.position.set(0, 0.6, 6.7 * zoom); cam.lookAt(0, lookY, 0); cam.updateMatrixWorld(); return (1 - new V3(0, top, 0).project(cam).y) / 2; };
  let lo = 0.2, hi = 12;
  for (let i = 0; i < 32; i++) {
    const zoom = (lo + hi) / 2;
    // further away (a larger zoom), the body is smaller and its top lower
    if (topAt(zoom, lookForGround(stage, c, aspect, zoom, ground)) < crown) lo = zoom; else hi = zoom;
  }
  const zoom = (lo + hi) / 2;
  return { zoom, lookY: lookForGround(stage, c, aspect, zoom, ground) };
}

// ---------- the frame loop ----------
// One loop for the page, running only while a creature has something to draw: a page where every creature holds still
// asks for no frame at all (the motion guard's rule, e2e/motion-guard.spec.mjs).
// About 30 frames a second, as the creator; fewer where a frame costs more than an eighth of that (a renderer without a
// GPU, which the page only meets when the motion is forced on: lib/motion.ts holds the drawings still there), so the
// creature never takes more than an eighth of the page's thread.
const lives = new Set<LiveCreature>();
let frameId = 0, last = 0, every = 33, cost = 0;
const wanted = () => { for (const live of lives) if (live.wantsFrames()) return true; return false; };
function frame(ms: number) {
  frameId = 0;
  if (ms - last >= every) {
    last = ms;
    const t0 = performance.now();
    let drew = false;
    for (const live of lives) drew = live.tick(ms / 1000) || drew;
    if (drew) { const took = performance.now() - t0; cost = cost ? cost * 0.8 + took * 0.2 : took; every = Math.max(33, Math.min(500, cost * 8)); }
  }
  if (wanted()) frameId = requestAnimationFrame(frame);
}
function wake() { if (!frameId && wanted()) frameId = requestAnimationFrame(frame); }

const nowS = () => performance.now() / 1000;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));
const GAZE_IN = 0.35, GAZE_HOLD = 0.4, GAZE_OUT = 0.8;

export interface LiveOptions {
  seed: string;
  /** A creature chosen by hand (the lab, a creature shared as a link), instead of the one `seed` rolls. */
  choice?: CreatureChoice;
  canvas: HTMLCanvasElement;
  /** "scene": the stage's tile; "face": the whole creature in a square. */
  framing: "scene" | "face";
  /** The scene's framing, asked each time the canvas changes shape: a camera (the creator's), or a place for the
   *  creature (default: the reference's desktop distance, the feet on the stage scene's ground line). */
  scene?: Framing | FigureFraming | (() => Framing | FigureFraming | null);
  /** Where the pointer is followed (the stage's tile); none: the eyes keep their own gaze. */
  gazeFrom?: HTMLElement | null;
  /** The voice's level now, 0..1: the agent's while it speaks, the person's while it listens. */
  level?: (mood: AvatarMood) => number;
  /** The state it starts in (no startle for it). */
  mood?: AvatarMood;
  /** Moving (default), or holding still in its key pose. */
  moving?: boolean;
}

/** A creature drawn into a canvas for as long as it is mounted: moving (its state's motion, about 30 frames a second) or
 *  still (its key pose, drawn again on each change and while the pointer moves its eyes). */
export class LiveCreature {
  private stage: RigStage;
  private item: Item;
  private mood: AvatarMood = "idle";
  private moving = true;
  private needDraw = true;
  /** Its canvas had no box when last asked to draw: it waits for one (its box observer) instead of asking for frames. */
  private hidden = false;
  private react: { expr?: string; hop?: number; t0: number; until: number } | null = null;
  private ix = { gaze: null as [number, number] | null, gz: [0, 0] as [number, number], w: 0, left: -1e9, last: 0 };
  private look: Framing | null = null;
  private lookKey = "";
  private off: Array<() => void> = [];
  private sized = "";

  constructor(stage: RigStage, private opts: LiveOptions) {
    this.stage = stage;
    const face = opts.framing === "face";
    this.item = stage.add(rigSpec(opts.choice ?? creatureFromSeed(opts.seed)), opts.canvas, face ? { ...FACE, off: 0 } : { turn: 0, off: 0 });
    this.fit();
    this.moving = opts.moving ?? true;
    this.setMood(opts.mood ?? "idle", false);
    const box = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { this.fit(); this.hidden = false; this.poke(); });
    box?.observe(opts.canvas);
    this.off.push(() => box?.disconnect());
    const from = opts.gazeFrom;
    if (from) {
      // T23: only the gaze follows the pointer (the finger while touching); touching does nothing else
      const at = (e: PointerEvent) => { this.ix.gaze = this.gazeAt(e); this.poke(); };
      const leave = () => { this.ix.gaze = null; this.ix.left = nowS(); this.poke(); };
      from.addEventListener("pointermove", at);
      from.addEventListener("pointerdown", at);
      from.addEventListener("pointerleave", leave);
      this.off.push(() => { from.removeEventListener("pointermove", at); from.removeEventListener("pointerdown", at); from.removeEventListener("pointerleave", leave); });
    }
    lives.add(this);
    wake();
  }

  /** The canvas takes its box's shape (960 px tall for the scene, as the creator's preview), so nothing is stretched. */
  private fit(): boolean {
    // the box as laid out, fractions kept (the creator's getBoundingClientRect): a scaled scene keeps its shape
    const { canvas } = this.opts, box = canvas.getBoundingClientRect(), w = box.width, h = box.height;
    let W: number, H: number;
    if (this.opts.framing === "face") { W = H = FACE_PX; } else {
      const ar = w > 0 && h > 0 ? w / h : 1.5;
      H = SCENE_PX; W = Math.round(SCENE_PX * ar);
    }
    const key = W + "x" + H;
    if (key === this.sized) return false;
    this.sized = key;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    return true;
  }

  /** The scene's camera for the canvas's shape now. */
  private framingNow(): Framing | null {
    if (this.opts.framing === "face") return null;
    // Worked out again only when the canvas changed shape (fit): a place is asked of the page's layout once, not per frame.
    if (this.look && this.lookKey === this.sized) return this.look;
    const { canvas } = this.opts, ar = canvas.width / canvas.height, asked = this.opts.scene;
    const scene = typeof asked === "function" ? asked() : asked;
    this.lookKey = this.sized;
    if (scene && "lookY" in scene) return (this.look = scene);
    if (scene) this.look = placeFigure(this.stage, this.item.c, ar, scene);
    else {
      // Narrower than a square, the creature takes the width's share instead of the height's.
      const zoom = SCENE_ZOOM / Math.min(1, ar);
      this.look = { zoom, lookY: lookForGround(this.stage, this.item.c, ar, zoom, 357 / 440) };
    }
    return this.look;
  }

  // pointer → gaze, kept moderate: the head also turns toward the gaze, and full range looks cross-eyed (creator.js gazeAt)
  private gazeAt(e: PointerEvent): [number, number] {
    const r = this.opts.canvas.getBoundingClientRect();
    return [clamp(((e.clientX - r.left) / r.width * 2 - 1) * 0.9) * 0.6, clamp(((e.clientY - r.top) / r.height * 2 - 1) * 0.9 - 0.05) * 0.5];
  }
  // the eased pointer gaze for this frame: [gx, gy] scaled by how present the pointer is (0 → the creature's own gaze):
  // it eases in on entering (~0.35 s) and, on leaving, holds a moment (0.4 s), then eases calmly back (~0.8 s)
  private easedGaze(): [number, number] | null {
    const ix = this.ix, t = nowS(), dt = Math.min(0.1, Math.max(0, t - ix.last)); ix.last = t;
    if (ix.gaze) { const k = 1 - Math.exp(-dt / 0.07); ix.gz = [ix.gz[0] + (ix.gaze[0] - ix.gz[0]) * k, ix.gz[1] + (ix.gaze[1] - ix.gz[1]) * k]; }
    const want = ix.gaze || t - ix.left < GAZE_HOLD ? 1 : 0;
    ix.w = want > ix.w ? Math.min(1, ix.w + dt / GAZE_IN) : Math.max(0, ix.w - dt / GAZE_OUT);
    const e = ix.w * ix.w * (3 - 2 * ix.w); // smoothstep: soft at both ends
    return e > 0.001 ? [ix.gz[0] * e, ix.gz[1] * e] : null;
  }

  private poke() { this.needDraw = true; wake(); }

  /** What it acts out: the product's state. Starting to listen, it is startled for a moment (the creator's mode change). */
  setMood(mood: AvatarMood, startle = true) {
    const was = this.mood;
    this.mood = mood;
    const c = this.item.c, M = MODES[mood];
    // the busy cogs: over the head in every working style (T17), none otherwise; the poster clears every act
    const cogs = mood === "working" ? "cogs" : null;
    if (c.act("cogs") !== cogs) c.setAct("cogs", cogs);
    if (M.enter && startle && was !== mood) this.react = { expr: "surprised", hop: 1.1, t0: nowS(), until: nowS() + 0.55 };
    this.poke();
  }

  /** Moving, or holding still in its key pose (reduced motion, no GPU). */
  setMoving(moving: boolean) { if (moving !== this.moving) { this.moving = moving; this.poke(); } }

  /** Drawn again at once (a framing or a level source changed). */
  redraw() { this.poke(); }

  private active(): boolean {
    const M = MODES[this.mood];
    return !M.poster && (!!this.ix.gaze || this.ix.w > 0 || !!this.react || this.moving);
  }

  /** It has a frame to draw: a change not drawn yet, or motion (its own, the pointer's gaze, a startle). */
  wantsFrames(): boolean { return !this.hidden && (this.needDraw || this.active()); }

  /** Draws its frame if it has one; whether it drew. */
  tick(t: number): boolean {
    const { canvas } = this.opts;
    const on = this.active();
    if (!on && !this.needDraw) return false;
    // Nobody sees a canvas out of the page or with no box (a closed panel, the phone's hidden list): it is drawn when it
    // has one again (its box observer asks for it).
    if (!canvas.isConnected || canvas.getClientRects().length === 0) { this.needDraw = true; this.hidden = true; return false; }
    this.needDraw = false;
    this.draw(t, !this.moving || !on);
    return true;
  }

  private draw(t: number, still: boolean) {
    const M = MODES[this.mood];
    if (M.poster) return; // offline: the poster stands in for the creature
    if (this.opts.canvas.width === 0 || this.opts.canvas.height === 0) return;
    if (this.react && nowS() > this.react.until) this.react = null;
    const r = this.react, extra: Record<string, unknown> = {};
    const g = this.opts.gazeFrom ? this.easedGaze() : null;
    if (g) { extra.gx = g[0]; extra.gy = g[1]; }
    if (r) {
      const k = nowS() - r.t0;
      if (r.hop) extra.dy = -Math.sin(Math.min(1, k / 0.45) * Math.PI) * 9 * r.hop;
      extra.expr = r.expr;
    }
    const item = this.item, view = this.framingNow();
    if (view) {
      // As the creator draws its stage (viewCam): the camera takes the canvas's shape, and the renderer keeps the stage's
      // own size (1152 × 768), so Stage.draw does not resize it and the frame is resampled into the canvas, whatever its
      // shape. Rendered at the canvas's own shape instead, a phone's tile came out a pixel off along every edge.
      const cam = this.stage.camera, ar = this.opts.canvas.width / this.opts.canvas.height;
      if (cam.aspect !== ar) { cam.aspect = ar; cam.updateProjectionMatrix(); }
    }
    item.spec.state = M.state;
    item.spec.expr = item.spec.state ? undefined : "neutral";
    item.opts.extra = extra;
    if (view) { item.opts.zoom = view.zoom; item.opts.lookY = view.lookY; }
    const lvl = M.voice && this.opts.level ? this.opts.level(this.mood) : 0;
    this.stage.draw(item, t, lvl, still);
  }

  dispose() {
    lives.delete(this);
    for (const off of this.off) off();
    dispose(this.item, this.stage);
  }
}

/** A creature drawn into `canvas` until disposed; null where creatures cannot be drawn. */
export function mountCreature(opts: LiveOptions): LiveCreature | null {
  const s = stagesOf();
  if (!s) return null;
  return new LiveCreature(opts.framing === "face" ? s.face : s.scene, opts);
}

// ---------- still faces ----------
// A face that does not move is one render, kept: the sidebar, the transcript and the header draw the same conversation
// many times. Rendered a few per frame, so a long list does not hold the page up.
const FACES = 48;
const faces = new Map<string, HTMLCanvasElement>();
const built = new Map<string, Item>();
const queue: Array<{ key: string; seed: string; expr: string; choice?: CreatureChoice; done: Set<(face: HTMLCanvasElement) => void> }> = [];
let queued = 0;

function renderFace(seed: string, expr: string, choice?: CreatureChoice): HTMLCanvasElement | null {
  const s = stagesOf();
  if (!s) return null;
  const stage = s.face, canvas = document.createElement("canvas");
  canvas.width = canvas.height = FACE_PX;
  let item = built.get(seed);
  if (!item) {
    if (built.size >= 12) { const [old, it] = built.entries().next().value!; built.delete(old); dispose(it, stage); }
    item = stage.add(rigSpec(choice ?? creatureFromSeed(seed)), canvas, { ...FACE, off: 0 });
    built.set(seed, item);
  }
  item.canvas = canvas;
  item.spec.state = undefined;
  item.spec.expr = expr;
  item.opts.extra = {};
  stage.draw(item, 0, 0, true);
  return canvas;
}

function drain() {
  queued = 0;
  const until = performance.now() + 12;
  while (queue.length && performance.now() < until) {
    const job = queue.shift()!;
    const face = faces.get(job.key) ?? renderFace(job.seed, job.expr, job.choice);
    if (!face) { queue.length = 0; return; }
    if (!faces.has(job.key)) { if (faces.size >= FACES) faces.delete(faces.keys().next().value!); faces.set(job.key, face); }
    for (const done of job.done) done(face);
  }
  if (queue.length) queued = requestAnimationFrame(drain);
}

/** The still face of `seed` with `expr` (STILL_EXPR), drawn into `canvas` (a FACE_PX square) as soon as it is rendered:
 *  at once when it already is. Returns what cancels it. `choice`: a creature picked by hand, keyed by `seed`. */
export function drawFace(canvas: HTMLCanvasElement, seed: string, expr: string, choice?: CreatureChoice): () => void {
  const key = seed + "\u0000" + expr;
  const put = (face: HTMLCanvasElement) => {
    if (canvas.width !== FACE_PX || canvas.height !== FACE_PX) { canvas.width = canvas.height = FACE_PX; }
    const g = canvas.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(face, 0, 0);
  };
  const ready = faces.get(key);
  if (ready) { put(ready); return () => {}; }
  if (!canDrawCreatures()) return () => {};
  let job = queue.find((x) => x.key === key);
  if (!job) queue.push((job = { key, seed, expr, choice, done: new Set() }));
  job.done.add(put);
  if (!queued) queued = requestAnimationFrame(drain);
  return () => { job.done.delete(put); };
}

/** The creature `seed` rolls, and what its rig is built from (for a page that shows it: the lab, the tests). */
export function creatureOf(seed: string): { choice: CreatureChoice; spec: RigSpec } {
  const choice = creatureFromSeed(seed);
  return { choice, spec: rigSpec(choice) };
}

/** Every act the rig knows (ACTS): what C2 (the moods, the working styles, the pastimes) registers into. */
export const actNames = () => Object.keys(ACTS as Record<string, unknown>);

/** The still face of `seed` with `expr`, once rendered (a FACE_PX square), or null where creatures cannot be drawn. */
export function faceImage(seed: string, expr: string): Promise<HTMLCanvasElement | null> {
  if (!canDrawCreatures()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    drawFace(canvas, seed, expr);
    const key = seed + "\u0000" + expr, ready = faces.get(key);
    if (ready) { resolve(ready); return; }
    const job = queue.find((x) => x.key === key);
    if (!job) { resolve(null); return; }
    job.done.add((face) => resolve(face));
  });
}
