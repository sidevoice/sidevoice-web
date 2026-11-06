import { Stage, ACTS, type Creature3D, type StageItem } from "./rig.js";
import "./accessories.js";
import "./acts.js";
import type { AvatarMood } from "../avatar-spec";
import { creatureFromSeed, rigSpec, type CreatureChoice, type RigSpec } from "./catalogue";
import type { StageFrame } from "./stage-frame";
import { StageFramer } from "./stage-framer";
import { Governor, sceneSize } from "./quality";

/* Where creatures are drawn on a page: two three.js stages (one WebGL context each, whatever the number of creatures),
 * each creature built once into a stage's scene and blitted into its own 2D canvas, as the design reference's creator
 * draws (reference/2026-11-04/src/creator.js): its stage into a canvas as tall as the tile shows, up to 960 px (the reference
 * rendered 1152 × 768 and resampled it; this renders at the canvas's own pixels, quality.ts), and its 256 px square
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
 * A face can also be live and sharp (`sharp`: the floating card's creature): drawn about 30 times a second like the
 * stage's, on a stage of its own ("card") whose renderer takes the canvas's size, and the canvas takes its box's size in
 * device pixels (capped at CARD_MAX_PX), so it is neither a still nor a 144 px picture stretched over a 2x screen.
 *
 * A canvas that moves is drawn about 30 times a second (the creator's frame loop); one that holds still is drawn once per
 * change, in its state's key pose, as the creator draws under reduced motion. The eyes follow the pointer, or the finger
 * on touch, over the stage (the creator's gazeAt and easedGaze, T23); nothing else answers a touch.
 *
 * What it acts out is its state and, on top, its acts (acts.js), on the rig's layers as the creator plays them: the
 * working style or the pastime its state has on the go (`base`: avatar-state.ts picks it, by creature/schedule.ts), the
 * busy cogs while it works (`cogs`), and a mood a host plays over all of it (`mood`). */

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

/** What it has on the go besides its state (avatar-state.ts AvatarState: work, idle, since, until): a working style
 *  while it works, a pastime while it rests (quiet: none). */
export interface CreatureStep {
  work?: string;
  idle?: string;
  /** When it began, wall-clock (Date.now()): the act's clock starts there, so a copy drawn later shows the same moment
   *  of it. Default: now. */
  since?: number;
  /** When it is due to end, wall-clock: a pastime runs for its spell (the creator's dur, secs + 0.5). None: its own. */
  until?: number;
  /** While it listens, when it came into listening from another mood (avatar-state.ts `enteredAt`, wall-clock): its startle
   *  runs from here. */
  entered?: number;
}

/** The startle on entering listening, as the creator plays it on a change of mode (creator.js react): surprised, a hop of
 *  1.1 over its first 0.45 s, 0.55 s in all. */
const STARTLE = { expr: "surprised", hop: 1.1, secs: 0.55 } as const;

/** The reference's desktop stage distance (creator.js VIEWS.desktop). */
export const SCENE_ZOOM = 1.32;
/** The face render (creator.js renderFace): fitted, stepped back and aimed a little higher, so a hat or ears fit. */
const FACE = { fit: true, zoom: 1.5, lookY: 0.22 } as const;
/** The face canvas's height, as the creator's. The stage's canvas is as large as the tile shows (quality.ts sceneSize). */
const FACE_PX = 144;
/** A sharp live face's canvas: its box in device pixels, within these (the stage draws exactly as many pixels as it shows). */
const CARD_MIN_PX = 64, CARD_MAX_PX = 512;

// ---------- the stages ----------
type Item = StageItem<RigSpec>;
type RigStage = Stage;

/** The page's three stages: "scene" draws the stage's creature, "face" every still face (and a live face), "card" the sharp
 *  live faces (the floating card's creature), a renderer of their own so a still face's 256 px render is never stretched. */
export type Slot = "scene" | "face" | "card";

/* WebGL can be missing (hardware acceleration off, a test's DOM), refused (no context to be had now), or taken away (the
 * browser loses a context on a GPU reset, or when a page holds too many). None of these leaves an avatar empty for the
 * rest of the page's life, and each of the two stages answers for itself: one that is down never takes the other's
 * creatures with it.
 *  - A stage that could not be made is tried again by a creature mounted on it a while later (RETRY_MS).
 *  - A lost context draws nothing until the browser gives it back. Each canvas keeps its last frame meanwhile. When it is
 *    back, the stage gets a new renderer, with the same scene, camera and creatures, and its creatures are drawn again.
 *  - A context not given back within LOST_GRACE_MS counts as missing until it is. While a stage is down, CharacterAvatar
 *    shows the fallback (fallback.ts) for the creatures it draws, told by onCreaturesChange. */

/** How each stage is made, again for a new renderer when a lost context comes back. */
const MAKE: Record<Slot, () => RigStage> = { scene: () => new Stage("paint", 768, "wide", { fixed: true }), face: () => new Stage("paint", 256), card: () => new Stage("paint", 256) };
const RETRY_MS = 10_000, LOST_GRACE_MS = 3000;

/** A stage and how it is: `lost`, its context taken away (it draws nothing until it is back); `down`, it cannot draw (no
 *  WebGL, a context refused, or lost and not back in time). */
interface Seat { stage: RigStage | null; lost: boolean; down: boolean; triedAt: number; giveUp?: ReturnType<typeof setTimeout>; unwatch?: () => void }
const seat0 = (): Seat => ({ stage: null, lost: false, down: false, triedAt: -Infinity });
const seats: Record<Slot, Seat> = { scene: seat0(), face: seat0(), card: seat0() };
let warned = false;
const watchers = new Set<() => void>();

function setDown(slot: Slot, down: boolean) {
  const seat = seats[slot];
  if (down === seat.down) return;
  seat.down = down;
  if (down && slot === "face") dropFaces();
  for (const watcher of watchers) watcher();
}

/** A renderer let go of: its context too, unless the browser already took it. */
function release(renderer: Stage["renderer"]) {
  try { if (!renderer.getContext().isContextLost()) renderer.forceContextLoss(); } catch { /* nothing left to let go */ }
  renderer.dispose();
}

/** A new renderer for the stage in `slot`, made as the stage made its own; its scene, camera and creatures are kept.
 *  Throws where no context can be had. */
function renew(slot: Slot) {
  const seat = seats[slot], stage = seat.stage!, fresh = MAKE[slot]();
  seat.unwatch?.();
  release(stage.renderer);
  stage.renderer = fresh.renderer;
  if (fresh.w !== stage.w || fresh.h !== stage.h) stage.renderer.setSize(stage.w, stage.h);
  watchContext(slot);
}

/** Its context is back, or it has a new one: drawn into again. */
function backUp(slot: Slot) {
  const seat = seats[slot];
  seat.lost = false;
  clearTimeout(seat.giveUp);
  seat.giveUp = undefined;
  setDown(slot, false);
  for (const live of lives) if (live.drawnBy(seat.stage)) live.redraw();
  if (slot === "face" && queue.length && !queued) queued = requestAnimationFrame(drain);
}

function watchContext(slot: Slot) {
  const seat = seats[slot], canvas = seat.stage!.renderer.domElement;
  const onLost = (event: Event) => {
    event.preventDefault(); // it is wanted back (three.js asks too)
    seat.lost = true;
    clearTimeout(seat.giveUp);
    seat.giveUp = setTimeout(() => { seat.giveUp = undefined; if (seat.lost) { seat.triedAt = performance.now(); setDown(slot, true); } }, LOST_GRACE_MS);
  };
  const onBack = () => {
    try { renew(slot); } catch (error) {
      // No new one to be had: the old renderer, which three.js has set up again on the restored context, carries on.
      console.warn("[creature] kept the restored renderer:", error instanceof Error ? error.message : error);
    }
    backUp(slot);
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onBack);
  seat.unwatch = () => {
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onBack);
    seat.unwatch = undefined;
  };
}

/** The stage in `slot`, made the first time a creature is drawn on it; null while it cannot draw. A lost one is given
 *  (it draws when its context is back). */
function stageOf(slot: Slot): RigStage | null {
  const seat = seats[slot];
  if (seat.stage && !seat.down) return seat.stage;
  if (seat.down && performance.now() - seat.triedAt < RETRY_MS) return null;
  seat.triedAt = performance.now();
  try {
    if (typeof WebGLRenderingContext === "undefined") throw new Error("no WebGL");
    if (!seat.stage) { seat.stage = MAKE[slot](); watchContext(slot); } else renew(slot);
    backUp(slot);
  } catch (error) {
    if (!warned) console.warn("[creature] cannot draw creatures:", error instanceof Error ? error.message : error);
    warned = true;
    setDown(slot, true);
  }
  return seat.down ? null : seat.stage;
}

/** Whether creatures can be drawn on the stage for `framing` ("scene": the stage's creature; "face": still faces):
 *  makes it on first use, and tries again a while after it could not be had. */
export const canDrawCreatures = (framing: Slot) => stageOf(framing) !== null;
/** Whether creatures can be drawn for `framing`, as last found, without trying (for a render). True until tried. */
export const creaturesDrawable = (framing: Slot) => !seats[framing].down;
/** `watcher` is told each time creatures can no longer be drawn on a stage, or can again. Returns what stops it. */
export function onCreaturesChange(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => { watchers.delete(watcher); };
}

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
// About 30 frames a second, as the creator. Where they cost the thread more than its share (BUDGET_MS) or arrive late, the
// governor (quality.ts) draws the creature at fewer pixels first, then at fewer frames, until they hold, and back up when
// there is room. At the bottom of its ladder a frame that still costs more than a sixth of the page's thread is spaced
// out until it does not (a renderer without a GPU, which the page only meets when the motion is forced on: lib/motion.ts
// holds the drawings still there).
const lives = new Set<LiveCreature>();
const governor = new Governor();
// What a step costs is judged on the pixels the stage draws at each rung: the biggest scene on the page (sceneSize, as it fits).
governor.measureBy((scale) => { let most = 0; for (const live of lives) most = Math.max(most, live.areaAt(scale)); return most; });
/** Whether the governor has been started (on the first frame of motion: the first frames, which compile programs, are not judged). */
let judging = false;
/** For diagnostics and tests: the creature's quality rung now, or fixed at one (null: judged again). */
export const creatureQuality = {
  tier: () => governor.tier,
  pin(tier: number | null) { if (governor.pin(tier)) retier(); },
};
function retier() { for (const live of lives) live.requality(); }
/** Renderers that have drawn acts: their act outline shader is compiled (LiveCreature.draw). */
const warmed = new WeakSet<object>();
let frameId = 0, last = 0;
/** A refresh's jitter: a frame asked for every 33.3 ms is drawn on the refresh within this of it (a 60, 90 or 120 Hz screen alike). */
const SLACK_MS = 4;
const wanted = () => { for (const live of lives) if (live.wantsFrames()) return true; return false; };
function frame(ms: number) {
  frameId = 0;
  const gap = ms - last;
  if (gap >= governor.every - SLACK_MS) {
    last = ms;
    const t0 = performance.now();
    // Only motion is judged: a creature held still (reduced motion, a key pose drawn on a change) asks for few frames, and
    // drawing it at fewer pixels would only change what it shows.
    let animated = false;
    for (const live of lives) if (live.tick(ms / 1000) && live.animates()) animated = true;
    if (animated) {
      if (!judging) { judging = true; governor.start(0, ms); }
      else if (governor.observe(ms, performance.now() - t0, gap)) retier();
    }
  }
  // (not when a creature woke the loop while it drew: that one is already asked for)
  if (!frameId && wanted()) frameId = requestAnimationFrame(frame);
}
function wake() { if (!frameId && wanted()) frameId = requestAnimationFrame(frame); }

const nowS = () => performance.now() / 1000;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));
/** The scene canvas's crop (cropFor): the creature's reach is taken at CROP_MARGIN of its measure, plus CROP_PAD_PX css px, in whole
 *  1/CROP_STEPS of the tile's width; a crop that would be more than CROP_WHOLE of it is the whole tile. */
const CROP_MARGIN = 1.1, CROP_PAD_PX = 14, CROP_STEPS = 64, CROP_WHOLE = 0.9;
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
  /** The stage's framing (stage-frame.ts): with one, a scene is framed as the stage's voice text needs (the creature at the
   *  tile's optical centre, stepping back for a turn's card), and `scene` is not asked. */
  frame?: StageFrame;
  /** Where the pointer is followed (the stage's tile); none: the eyes keep their own gaze. */
  gazeFrom?: HTMLElement | null;
  /** The voice's level now, 0..1: the agent's while it speaks, the person's while it listens. */
  level?: (mood: AvatarMood) => number;
  /** The state it starts in, and what it has on the go (a startle only if the step says an entrance is under way). */
  mood?: AvatarMood;
  step?: CreatureStep;
  /** Moving (default), or holding still in its key pose. */
  moving?: boolean;
  /** A face drawn sharp: on the "card" stage, its canvas as many device pixels as its box (the floating card's creature). */
  sharp?: boolean;
}

const slotOf = ({ framing, sharp }: Pick<LiveOptions, "framing" | "sharp">): Slot => (framing === "face" && sharp ? "card" : framing);

/** `changed` is called each time the page's pixel ratio changes (a window moved to another screen, the browser zoomed): a canvas's
 *  css box stays as it was then, which is all a ResizeObserver says. A media query for one ratio says once that it stopped
 *  matching, so each change arms the next. Returns what stops it. */
function watchPixelRatio(changed: () => void): () => void {
  let query: MediaQueryList | undefined;
  function arm() {
    query = globalThis.matchMedia?.(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`);
    query?.addEventListener("change", on, { once: true });
  }
  function on() { arm(); changed(); } // (armed first: the next change is not lost to what `changed` does)
  arm();
  return () => query?.removeEventListener("change", on);
}

/** A creature drawn into a canvas for as long as it is mounted: moving (its state's motion, about 30 frames a second) or
 *  still (its key pose, drawn again on each change and while the pointer moves its eyes). */
export class LiveCreature {
  private stage: RigStage;
  private slot: Slot;
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
  /** The canvas's box as last laid out (css px), and the governor's scale its pixels were sized for. */
  private css = { w: 0, h: 0 };
  private scaled = 1;
  /** The share of the stage's width the scene canvas is laid out at (1: the whole tile; see cropFor). */
  private laid = 1;
  private step: CreatureStep = {};
  /** The base act built for the step (its name and start), so the same step is not built again. */
  private baseKey: string | null = null;
  private moodTimer: ReturnType<typeof setTimeout> | undefined;
  /** The start of the last entrance it was startled for (wall-clock). */
  private startledAt: number | null = null;
  /** The stage's framing, where it has one (`frame`), and whether it is still easing toward its target. */
  private framer: StageFramer | null = null;
  private easing = false;

  constructor(stage: RigStage, private opts: LiveOptions) {
    this.stage = stage;
    this.slot = slotOf(opts);
    const face = opts.framing === "face";
    this.item = stage.add(rigSpec(opts.choice ?? creatureFromSeed(opts.seed)), opts.canvas, face ? { ...FACE, off: 0 } : { turn: 0, off: 0 });
    this.moving = opts.moving ?? true; // (before the first fit: a held creature is sized at a phone's pixels)
    this.fit();
    if (opts.frame && !face) {
      this.framer = new StageFramer({ stage, item: this.item, canvas: opts.canvas, poke: () => this.poke(),
        render: (zoom, lookY, state, into) => { const shown = this.item.canvas; this.item.canvas = into; try { this.draw(nowS(), true, { zoom, lookY, state }); } finally { this.item.canvas = shown; } },
        mood: () => this.mood, drawn: () => !MODES[this.mood].poster, aspect: () => this.fullAspect(),
        measured: () => { if (this.fit(false)) { this.framer?.invalidate(); this.poke(); } } }, opts.frame);
      this.framer.hold(!this.moving);
      this.fit(false); // (asks the framer for the creature's reach: its acts are measured from here, and the canvas cropped when they are)
    }
    this.setMood(opts.mood ?? "idle", { step: opts.step });
    const box = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { this.fit(); this.hidden = false; this.framer?.invalidate(); this.poke(); });
    // A sharp face also follows its pixel ratio (a window moved to another screen), where the browser says so.
    if (opts.sharp) { try { box?.observe(opts.canvas, { box: "device-pixel-content-box" }); } catch { box?.observe(opts.canvas); } } else box?.observe(opts.canvas);
    this.off.push(() => box?.disconnect());
    // The stage's ceilings follow what it says it is (its first ask, a window turned between a phone's rules and a desktop's).
    if (opts.frame && !face) this.off.push(opts.frame.listen(() => { if (this.fit(false)) { this.framer?.invalidate(); this.poke(); } }));
    // Where the pixels depend on the pixel ratio (the stage's, a sharp face's), the ratio is watched too: a window moved between
    // a 1× and a 2× screen keeps its css box, so no observer above would refit the canvas (blurry on the sharper screen, wasted
    // fill on the other); and not every browser has the device-pixel box the sharp face asks for.
    if (opts.framing !== "face" || opts.sharp) this.off.push(watchPixelRatio(() => { if (this.fit()) { this.framer?.invalidate(); this.poke(); } }));
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

  /** Whether this scene is drawn at a desktop's ceilings: its stage's framing says the device is a desktop (a fine pointer or the
   *  desktop app, never a handset in any orientation: FrameAsk.desktop) and it is drawn moving. A scene with no framing, not asked
   *  yet, held still (reduced motion, a renderer with no GPU: one draw, at the floor's size) or a handset's keeps the phone's. */
  private desktop(): boolean { return this.moving && this.opts.frame?.request?.desktop === true; }

  /** The canvas takes its box's shape, so nothing is stretched, and as many pixels as the box shows (quality.ts sceneSize, at
   *  the governor's scale), up to the creator's 960 px tall. `measure`: the box is read again (a layout), else it is as last read. */
  private fit(measure = true): boolean {
    // the box as laid out, fractions kept (the creator's getBoundingClientRect): a scaled scene keeps its shape
    const { canvas } = this.opts;
    if (measure) { const box = canvas.getBoundingClientRect(); this.css = { w: box.width, h: box.height }; }
    if (this.opts.framing !== "face" && this.cropTo()) { const box = canvas.getBoundingClientRect(); this.css = { w: box.width, h: box.height }; }
    const { w, h } = this.css;
    let W: number, H: number;
    if (this.opts.framing === "face") {
      // A sharp one: its box's device pixels (a box not laid out yet: the still face's size, until it is and the observer asks again)
      W = H = this.opts.sharp && (w > 0 || h > 0) ? Math.min(CARD_MAX_PX, Math.max(CARD_MIN_PX, Math.ceil(Math.max(w, h) * (globalThis.devicePixelRatio || 1)))) : FACE_PX;
    } else {
      this.scaled = governor.scale;
      ({ width: W, height: H } = sceneSize(w, h, globalThis.devicePixelRatio || 1, this.scaled, this.desktop()));
    }
    const key = W + "x" + H;
    if (key === this.sized) return false;
    this.sized = key;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    return true;
  }

  /** The scene canvas is laid out over the middle of the tile that the creature can reach, not the whole of it (the creature is about
   *  half the stage's height and a fraction of its width; the rest was fill for nothing): the share of the tile's width it needs on a
   *  desktop (the framer measures the widest of its acts), 1 elsewhere. Its box stays the tile's full height and centred on the
   *  creature, so every row of the framing is the tile's. Whole 1/CROP_STEPS, so a resize does not shift it by a pixel. */
  private cropFor(fullW: number, h: number): number {
    if (!this.framer || !this.desktop() || !(fullW > 0 && h > 0)) return 1;
    const reach = this.framer.reach(fullW, h); // css px from the middle, or null while it is being measured
    if (reach == null) return 1;
    const share = Math.ceil((2 * (reach * CROP_MARGIN + CROP_PAD_PX) / fullW) * CROP_STEPS) / CROP_STEPS;
    return share > CROP_WHOLE ? 1 : share;
  }

  /** Lays the canvas out at the share cropFor says (a custom property styles/call.css reads); whether that changed. */
  private cropTo(): boolean {
    const { canvas } = this.opts, fullW = this.css.w / this.laid, want = this.cropFor(fullW, this.css.h);
    if (want === this.laid) return false;
    this.laid = want;
    if (want === 1) canvas.style.removeProperty("--crop"); else canvas.style.setProperty("--crop", String(want));
    return true;
  }

  /** The camera's aspect: the tile's, whatever part of it the canvas shows. */
  fullAspect(): number { const { canvas } = this.opts; return canvas.width / (this.laid * canvas.height); }

  /** The scene's camera for the canvas's shape now. */
  private framingNow(): Framing | null {
    if (this.opts.framing === "face") return null;
    // Worked out again only when the canvas changed shape (fit): a place is asked of the page's layout once, not per frame.
    if (this.look && this.lookKey === this.sized) return this.look;
    const { canvas } = this.opts, ar = this.fullAspect(), asked = this.opts.scene;
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
    // (over the whole tile: the canvas may be only the middle of it, cropFor)
    const c = this.opts.canvas.getBoundingClientRect(), width = c.width / this.laid, left = c.left - (width - c.width) / 2;
    return [clamp(((e.clientX - left) / width * 2 - 1) * 0.9) * 0.6, clamp(((e.clientY - c.top) / c.height * 2 - 1) * 0.9 - 0.05) * 0.5];
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

  /** What it acts out: the product's state, and what it has on the go (`step`: kept from before when not given). Making
   *  an entrance into listening, it is startled for a moment (syncStartle). */
  setMood(mood: AvatarMood, { step }: { step?: CreatureStep } = {}) {
    let changed = mood !== this.mood;
    this.mood = mood;
    if (step) this.step = step;
    const c = this.item.c, M = MODES[mood];
    // the busy cogs: over the head in every working style (T17), none otherwise; the poster clears every act (applyMode)
    const cogs = mood === "working" ? "cogs" : null;
    if (c.act("cogs") !== cogs) { c.setAct("cogs", cogs); changed = true; }
    if (M.poster && c.act("mood")) { this.playMood(null); changed = true; }
    // Entering listening, whatever it had going goes at once, as the creator's applyMode drops the base act and the cogs
    // (the 2D figure's props fell away over its entrance instead): the startle is the whole transition.
    if (this.syncBase()) changed = true;
    if (this.syncStartle()) changed = true;
    // Drawn again only when what it shows changed: told the same state again (its rest restamped while it is quiet, a new
    // state object), a creature held still asks for no frame (the motion guard's rule, e2e/moving-layers.spec.mjs).
    if (changed) this.poke();
  }

  /** What it has on the go, its state unchanged. */
  setStep(step: CreatureStep) { this.step = step; const startled = this.syncStartle(); if (this.syncBase() || startled) this.poke(); }

  /** The creator's startle (STARTLE) on coming into listening, as the reference plays it on every change into listening, a
   *  barge-in on its speech included (creator.js: the mode change, interrupt()). Its clock starts when it came in
   *  (avatar-state.ts `enteredAt`: the room's stamp, the same in every window, kept while it listens), so a copy drawn
   *  late, a remount or another window, plays what is left of it, or nothing once it is over. The reference's 0.55 s, not
   *  the 2D figure's 420 ms entrance (ENTER_MS). Each entrance startles once. Whether it started one. */
  private syncStartle(): boolean {
    const s = this.step;
    if (!MODES[this.mood].enter || s.entered == null || s.entered === this.startledAt) return false;
    this.startledAt = s.entered;
    const k = Math.max(0, Date.now() - s.entered) / 1000;
    if (k >= STARTLE.secs) return false;
    const t0 = nowS() - k;
    this.react = { expr: STARTLE.expr, hop: STARTLE.hop, t0, until: t0 + STARTLE.secs };
    return true;
  }

  /** The act its state and step ask for on the base layer: the working style while it works, the pastime while it rests. */
  private baseAct(): string | null {
    const s = this.step;
    if (MODES[this.mood].poster) return null;
    const name = this.mood === "working" && s.work ? "work-" + s.work : this.mood === "idle" && s.idle && s.idle !== "quiet" ? "rest-" + s.idle : null;
    return name && name in ACTS ? name : null;
  }

  /** Builds the base act the step asks for (the creator's setBase), its clock started where the step began; whether it
   *  changed. */
  private syncBase(): boolean {
    const c = this.item.c, s = this.step, name = this.baseAct();
    const key = name && name + "@" + (s.since ?? "");
    if (key === this.baseKey) return false;
    this.baseKey = key;
    if (!name) { c.setAct("base", null); return true; }
    // A pastime runs for its spell and half a second more: the rotation moves on first (the creator's idleStep). A working
    // style loops until the next one; a pastime with no spell given runs its own (the creator's pinned pastime).
    const spell = s.since != null && s.until != null ? (s.until - s.since) / 1000 : null;
    const L = c.setAct("base", name, name.startsWith("rest-") && spell != null ? { dur: spell + 0.5 } : {});
    if (L) {
      // Its clock from the step's start (the same moment in every window), on the clock the frames are drawn with.
      L.t0 = nowS() - (s.since != null ? Math.max(0, Date.now() - s.since) / 1000 : 0);
      // The cogs came on with the work (setMood, a moment ago, not drawn yet): they turn from the same moment.
      const cogs = c.layers.cogs;
      if (cogs && cogs.t0 == null && name.startsWith("work-")) cogs.t0 = L.t0;
    }
    return true;
  }

  /** Plays a mood over whatever it is doing (the creator's playMood): for `dur` seconds (default: the mood's own, about
   *  3 s), or until replaced (`hold`); null ends the one playing. Meant to be picked from the conversation (DESIGN.md:
   *  "Programmatic moods"); offline (the poster) plays none. */
  playMood(name: string | null, { dur, hold = false }: { dur?: number; hold?: boolean } = {}) {
    clearTimeout(this.moodTimer);
    this.moodTimer = undefined;
    const c = this.item.c, play = !!name && name in ACTS && !MODES[this.mood].poster;
    const L = c.setAct("mood", play ? name : null, { hold, dur });
    // Moving, the rig ends a timed mood itself (it fades out over its last 0.35 s). Held still, no frame comes to end it
    // (the reference's mood stayed until pressed again): it is ended here, on time.
    if (L && !L.hold && L.dur) {
      const it = L;
      this.moodTimer = setTimeout(() => {
        this.moodTimer = undefined;
        if (this.item.c.layers.mood === it && !this.active()) { this.item.c.setAct("mood", null); this.poke(); }
      }, L.dur * 1000);
    }
    this.poke();
  }

  /** The acts playing now, by layer (base, cogs, mood): their names, how far into them it is and how long they run
   *  (seconds; null: on until replaced). */
  acting(): Record<string, { name: string; k: number | null; dur: number | null }> {
    const out: Record<string, { name: string; k: number | null; dur: number | null }> = {};
    for (const [layer, L] of Object.entries(this.item.c.layers)) out[layer] = { name: L.name, k: L.t0 == null ? null : nowS() - L.t0, dur: L.hold ? null : L.dur };
    return out;
  }

  /** Draws the frame `t` seconds into everything it acts out (its state's motion and every act from its start), at once,
   *  whatever the clock says; `still`: its key pose, the acts at `t` (the creator's captureSheet `at`). For the lab's
   *  comparison against the design reference at fixed times. */
  frameAt(t: number, still = false) {
    for (const L of Object.values(this.item.c.layers)) { if (still) L.keyAt = t; else { L.t0 = 0; delete L.keyAt; } }
    this.needDraw = false;
    this.draw(still ? 0 : t, still);
  }

  /** Moving, or holding still in its key pose (reduced motion, no GPU). */
  setMoving(moving: boolean) {
    if (moving === this.moving) return;
    this.moving = moving; this.framer?.hold(!moving);
    if (this.fit(false)) this.framer?.invalidate(); // (a held creature is drawn at a phone's pixels: desktop())
    this.poke();
  }

  /** The governor moved to another rung: a creature in motion has this canvas sized to it by its next frame (in the task that
   *  draws it, so it is never shown cleared), and drawn then. One held still (reduced motion, a key pose) is left as it is: it
   *  was not what the governor judged, and resizing it would clear and redraw a picture nothing changed; it takes the rung
   *  the governor is on when it is next drawn (tick). */
  requality() { if (this.slot === "scene" && this.animates() && this.scaled !== governor.scale) this.poke(); }

  /** Drawn again at once (a framing or a level source changed). */
  redraw() { this.poke(); }

  /** Its scene's framing is asked again (`scene`), though the canvas kept its shape: the room around it changed. */
  reframe() { this.look = null; this.lookKey = ""; this.poke(); }

  private active(): boolean {
    const M = MODES[this.mood];
    return !M.poster && (!!this.ix.gaze || this.ix.w > 0 || !!this.react || this.moving || this.easing);
  }

  /** The pixels its scene is drawn with at `scale` of the full size (0: not a scene). */
  areaAt(scale: number): number {
    if (this.slot !== "scene") return 0;
    const { width, height } = sceneSize(this.css.w, this.css.h, globalThis.devicePixelRatio || 1, scale, this.desktop());
    return width * height;
  }

  /** Its frames are motion (it moves, and is not the poster), so the governor judges what they cost. */
  animates(): boolean { return this.moving && !MODES[this.mood].poster; }

  /** It has a frame to draw: a change not drawn yet, or motion (its own, the pointer's gaze, a startle). */
  wantsFrames(): boolean { return !this.hidden && !seats[this.slot].lost && (this.needDraw || this.active()); }

  /** Whether `stage` is the one it is drawn by. */
  drawnBy(stage: RigStage | null): boolean { return stage === this.stage; }

  /** Draws its frame if it has one; whether it drew. */
  tick(t: number): boolean {
    const { canvas } = this.opts;
    const on = this.active();
    if (!on && !this.needDraw) return false;
    // Its stage's context is gone: the canvas keeps its last frame, and it is drawn again when the context is back.
    if (seats[this.slot].lost) { this.needDraw = true; return false; }
    // Nobody sees a canvas out of the page or with no box (a closed panel, the phone's hidden list): it is drawn when it
    // has one again (its box observer asks for it).
    if (!canvas.isConnected || canvas.getClientRects().length === 0) { this.needDraw = true; this.hidden = true; return false; }
    this.needDraw = false;
    if (this.slot === "scene" && this.scaled !== governor.scale) this.fit(false);
    this.draw(t, !this.moving || !on);
    return true;
  }

  private draw(t: number, still: boolean, camera?: { zoom: number; lookY: number | undefined; state?: string }) {
    const M = MODES[this.mood];
    if (M.poster) return; // offline: the poster stands in for the creature
    if (this.opts.canvas.width === 0 || this.opts.canvas.height === 0) return;
    if (this.react && nowS() > this.react.until) this.react = null;
    // A trial framing (camera.state) is drawn without the pointer's gaze or a startle: the same pose whenever it is drawn.
    const r = camera?.state ? null : this.react, extra: Record<string, unknown> = {};
    const g = this.opts.gazeFrom && !camera?.state ? this.easedGaze() : null;
    if (g) { extra.gx = g[0]; extra.gy = g[1]; }
    if (r) {
      const k = nowS() - r.t0;
      if (r.hop) extra.dy = -Math.sin(Math.min(1, k / 0.45) * Math.PI) * 9 * r.hop;
      extra.expr = r.expr;
    }
    const item = this.item, framed = camera ?? this.framer?.step() ?? null, view = framed ? null : this.framingNow();
    if (!camera) this.easing = !!framed && "moving" in framed && !!framed.moving;
    if (view || framed) {
      // As the creator draws its stage (viewCam): the camera takes the canvas's shape. The renderer takes it too (sizeStage), so
      // the frame is rendered at the pixels it is shown in; the reference rendered 1152 × 768 and resampled it into the canvas.
      const cam = this.stage.camera, ar = this.fullAspect();
      if (cam.aspect !== ar) { cam.aspect = ar; cam.updateProjectionMatrix(); }
    }
    item.spec.state = camera?.state ?? M.state;
    item.spec.expr = item.spec.state ? undefined : "neutral";
    item.opts.extra = extra;
    if (framed) { item.opts.zoom = framed.zoom; item.opts.lookY = framed.lookY; }
    else if (view) { item.opts.zoom = view.zoom; item.opts.lookY = view.lookY; }
    const lvl = M.voice && this.opts.level ? this.opts.level(this.mood) : 0;
    // The scene's and the card's stage draw as many pixels as the canvas holds (and are drawn into it one to one; a trial
    // render's smaller canvas takes the same frame resampled).
    if (this.slot !== "face") this.sizeStage();
    this.warm(t, lvl, still);
    // A cropped canvas shows its part of the tile's frame: the same camera, windowed (the view offset is only on for the draw).
    const { canvas } = this.opts, camera3 = this.stage.camera, windowed = this.slot === "scene" && this.laid < 1 && canvas.width > 0;
    if (windowed) { const fullW = canvas.width / this.laid; camera3.setViewOffset(fullW, canvas.height, (fullW - canvas.width) / 2, 0, canvas.width, canvas.height); }
    try { this.stage.draw(item, t, lvl, still); } finally { if (windowed) camera3.clearViewOffset(); }
  }

  /** The scene's and the card's stage renderer take their canvas's size, when that changed. */
  private sizeStage() {
    const { width, height } = this.opts.canvas;
    this.stage.setRenderSize(width, height);
  }

  /** product: the first time a renderer draws acts, it first draws the reference's first two frames of them (k = 0, then
   *  a frame later), so its act outlines compile in the reference's order. An outline's thickness is baked into its shader
   *  (rig.js addOutline) and three.js reuses the first such program it compiles for every later one, so the first act
   *  outline drawn sets every act outline's thickness: with a working style on, the props' (0.038), never the cogs' puff's
   *  (0.030), as in the reference, whose acts always start at k = 0 on their first frame. Here a step's clock starts where
   *  the step began (a creature drawn mid-way is at that moment), so a first frame could show the puff before the props.
   *  Drawn and drawn over in this same task: never seen. A first frame drawn still is the reference's too (reduced motion). */
  private warm(t: number, lvl: number, still: boolean) {
    const layers = Object.values(this.item.c.layers), renderer = this.stage.renderer;
    if (!layers.length || warmed.has(renderer)) return;
    warmed.add(renderer);
    if (still) return;
    const keep = layers.map((L) => [L, L.t0] as const);
    for (const k of [0, 1 / 30]) { for (const L of layers) L.t0 = t - k; this.stage.draw(this.item, t, lvl, false); }
    for (const [L, t0] of keep) L.t0 = t0;
  }

  dispose() {
    clearTimeout(this.moodTimer);
    this.framer?.dispose();
    // Its canvas may be drawn into next by another creature (a conversation switched on the stage): it never shows this one.
    const { canvas } = this.opts;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    lives.delete(this);
    for (const off of this.off) off();
    dispose(this.item, this.stage);
  }
}

/** A creature drawn into `canvas` until disposed; null where creatures cannot be drawn. */
export function mountCreature(opts: LiveOptions): LiveCreature | null {
  const stage = stageOf(slotOf(opts));
  return stage ? new LiveCreature(stage, opts) : null;
}

// ---------- still faces ----------
// A face that does not move is one render, kept: the sidebar, the transcript and the header draw the same conversation
// many times. Rendered a few per frame, so a long list does not hold the page up.
const FACES = 48;
const faces = new Map<string, HTMLCanvasElement>();
const built = new Map<string, Item>();
const queue: Array<{ key: string; seed: string; expr: string; choice?: CreatureChoice; done: Set<(face: HTMLCanvasElement | null) => void> }> = [];
let queued = 0;

/** The faces waiting are not rendered (the face stage cannot draw): each is told so, with null. */
function dropFaces() {
  for (const job of queue.splice(0)) for (const done of job.done) done(null);
}

function renderFace(seed: string, expr: string, choice?: CreatureChoice): HTMLCanvasElement | null {
  const stage = stageOf("face");
  if (!stage) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = FACE_PX;
  let item = built.get(seed);
  if (!item) {
    if (built.size >= 12) { const [old, it] = built.entries().next().value!; built.delete(old); dispose(it, stage); }
    item = stage.add(rigSpec(choice ?? creatureFromSeed(seed)), canvas, { ...FACE, off: 0 });
    built.set(seed, item);
  }
  item.canvas = canvas;
  // As the reference draws every still face (creator.js specOf, animate on: renderFace, the card's states row): the idle
  // key pose, with the state's expression over it.
  item.spec.state = "idle";
  item.spec.expr = expr;
  item.opts.extra = {};
  stage.draw(item, 0, 0, true);
  return canvas;
}

/** The face of `key`, kept once rendered (the oldest let go past FACES); null where its stage cannot draw. */
function faceOf(key: string, seed: string, expr: string, choice?: CreatureChoice): HTMLCanvasElement | null {
  const kept = faces.get(key);
  if (kept) return kept;
  const face = renderFace(seed, expr, choice);
  if (!face) return null;
  if (faces.size >= FACES) faces.delete(faces.keys().next().value!);
  faces.set(key, face);
  return face;
}

function drain() {
  queued = 0;
  // A lost context renders blank: the faces wait for it to be back (or are dropped if it is not, setDown).
  if (seats.face.lost) return;
  const until = performance.now() + 12;
  while (queue.length && performance.now() < until) {
    const job = queue.shift()!;
    const face = faceOf(job.key, job.seed, job.expr, job.choice);
    if (!face) { for (const done of job.done) done(null); dropFaces(); return; }
    for (const done of job.done) done(face);
  }
  if (queue.length) queued = requestAnimationFrame(drain);
}

/** How a still face is drawn: `now`, rendered before drawFace returns when it is not yet (a face that must never show
 *  blank: the transcript's, T40), rather than with the faces queued a few a frame; `drawn`, told each time the canvas
 *  is painted with it. */
export interface FaceDrawing { now?: boolean; drawn?: (face: HTMLCanvasElement) => void }

/** Where a still face's creature stands inside its FACE_PX square, in pixels of the render: the extent of what is drawn
 *  (hats and ears included; the floor shadow, which is translucent, is not: it would pull the creature off its centre and its feet
 *  off the baseline), measured once per kept face. A card that stands the creature out of its square
 *  fits it from this (../fit-pop.ts). */
export interface FaceBox { t: number; b: number; l: number; r: number; w: number; h: number }
/** The alpha above which a pixel is the creature and not its shadow (its ink outline is opaque). */
const SOLID = 140;
const boxes = new WeakMap<HTMLCanvasElement, FaceBox | null>();
export function faceBox(face: HTMLCanvasElement): FaceBox | null {
  if (boxes.has(face)) return boxes.get(face)!;
  let box: FaceBox | null = null;
  const g = face.getContext("2d");
  if (g) {
    const { width: w, height: h } = face, d = g.getImageData(0, 0, w, h).data;
    let t = h, b = -1, l = w, r = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > SOLID) { if (y < t) t = y; if (y > b) b = y; if (x < l) l = x; if (x > r) r = x; }
    if (b >= 0) box = { t, b, l, r, w, h };
  }
  boxes.set(face, box);
  return box;
}

/** The still face of `seed` with `expr` (STILL_EXPR), drawn into `canvas` (a FACE_PX square) as soon as it is rendered:
 *  at once when it already is. The canvas keeps what it showed until then. Returns what cancels it. `choice`: a creature
 *  picked by hand, keyed by `seed`. */
export function drawFace(canvas: HTMLCanvasElement, seed: string, expr: string, choice?: CreatureChoice, { now = false, drawn }: FaceDrawing = {}): () => void {
  const key = seed + "\u0000" + expr;
  const put = (face: HTMLCanvasElement | null) => {
    if (!face) return;
    if (canvas.width !== FACE_PX || canvas.height !== FACE_PX) { canvas.width = canvas.height = FACE_PX; }
    const g = canvas.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(face, 0, 0);
    drawn?.(face);
  };
  const ready = faces.get(key);
  if (ready) { put(ready); return () => {}; }
  if (!canDrawCreatures("face")) return () => {};
  // Asked for at once: rendered here, unless its stage's context is lost (it renders blank then: the face waits with the
  // queued ones for the context to be back).
  if (now && !seats.face.lost) {
    const face = faceOf(key, seed, expr, choice);
    if (face) { put(face); return () => {}; }
  }
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

/** Every act the rig knows (ACTS: the moods, the working styles, the pastimes, the cogs). */
export const actNames = () => Object.keys(ACTS as Record<string, unknown>);

/** The still face of `seed` with `expr`, once rendered (a FACE_PX square), or null where creatures cannot be drawn. */
export function faceImage(seed: string, expr: string): Promise<HTMLCanvasElement | null> {
  if (!canDrawCreatures("face")) return Promise.resolve(null);
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

// ---------- the offline poster's portrait ----------
// The wanted poster's photo (../scene/poster.js): the creature laughing — smiling eyes and a big open grin, facing straight
// on, without its floor shadow — rendered on the scene's stage into a 768 px square, and measured from its pixels (hats
// and ears included), as the creator's posterPortrait draws it (reference/2026-11-04/src/creator.js). Kept per creature:
// the poster is drawn again on every resize and theme change, the portrait is not.
const PORTRAIT_PX = 768;
const portraits = new Map<string, { img: HTMLCanvasElement; box: [number, number, number, number] }>();
/** The poster's portrait of `seed`'s creature (`choice`: one picked by hand), or null where the stage cannot draw. */
export function posterPortrait(seed: string, choice?: CreatureChoice): { img: HTMLCanvasElement; box: [number, number, number, number] } | null {
  const key = choice ? JSON.stringify(choice) : seed, ready = portraits.get(key);
  if (ready) return ready;
  const stage = stageOf("scene");
  if (!stage || seats.scene.lost) return null;
  const off = document.createElement("canvas"); off.width = off.height = PORTRAIT_PX;
  const item = stage.add(rigSpec(choice ?? creatureFromSeed(seed)), off, { off: 0 });
  // Stage.draw takes the canvas's shape: the stage is put back as it was after (its creature is drawn at its own shape).
  const s = stage as Stage & { floor: { visible: boolean }; camera: Stage["camera"] }, keep = { w: stage.w, h: stage.h, aspect: stage.camera.aspect };
  const c = item.c as Creature3D & { contact?: { visible: boolean }; setProps(kind: null): void };
  try {
    stage.camera.clearViewOffset(); stage.camera.aspect = 1; stage.camera.updateProjectionMatrix(); stage.setRenderSize(PORTRAIT_PX, PORTRAIT_PX); // (a fixed stage is sized by its host)
    item.spec.state = undefined; item.spec.expr = "happy"; c.setProps(null); item.opts.zoom = 1.5; item.opts.turn = 0; item.opts.lookY = undefined;
    // very happy: smiling eyes (the happy lower-lid curve, relaxed lids) and a big open grin, facing straight on
    item.opts.extra = { expr: "happy", bot: 0.42, lid: 0.06, grin: true, gx: 0, gy: 0, tilt: 0, dx: 0, dy: 0, breathe: 0, squash: 0 };
    s.floor.visible = false; if (c.contact) c.contact.visible = false;
    stage.draw(item, 0, 0.7, true);
  } finally {
    s.floor.visible = true;
    dispose(item, stage);
    stage.setRenderSize(keep.w, keep.h);
    stage.camera.aspect = keep.aspect; stage.camera.updateProjectionMatrix();
  }
  // its real extent (hats and ears included), from the pixels
  const g = off.getContext("2d");
  if (!g) return null;
  const d = g.getImageData(0, 0, off.width, off.height).data; let x0 = off.width, y0 = off.height, x1 = 0, y1 = 0;
  for (let y = 0; y < off.height; y += 2) for (let x = 0; x < off.width; x += 2) if (d[(y * off.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const portrait = { img: off, box: (x1 > x0 ? [x0, y0, x1 - x0 + 2, y1 - y0 + 2] : [0, 0, off.width, off.height]) as [number, number, number, number] };
  if (portraits.size >= 8) portraits.delete(portraits.keys().next().value!);
  portraits.set(key, portrait);
  return portrait;
}

// The microphone permission hero (the setup's permissions step, Settings › Permissions): its own stage, in this chunk.
export { mountMicHero, type MicHero } from "./mic-hero";
