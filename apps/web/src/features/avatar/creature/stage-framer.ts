import type { RigCamera, Stage, StageItem } from "./rig.js";
import { footprintNow, footprintOf, heightReach, HOP_LIFT, provisionalReach, ReachSet, shapeKey, visitDrawn, widthReach, type Footprint, type Vec3 } from "./extent";
import { capCentre, capCentreSteps, FRAME_EASE, OPTIC, stageBands, type FrameAsk, type FrameMotion, type FrameProbe, type FrameSolved, type Framing, type FrameTarget, type Rows,
  type StageFrame } from "./stage-frame";

/* The creature host's side of the stage's framing (stage-frame.ts): it draws trial framings of the creature into its own
 * canvas and reads their rows (the reference's drawnRows), solves the framing the stage asks for (capCentre), eases its
 * camera toward it a step a frame and says where the cards go and where its feet are drawn.
 *
 * The camera is the reference's (creator.js viewCam): its distance the view's zoom times the step back (`zk`), aimed at
 * the view's look height less the lift. A desktop's view is the reference's desktop stage (zoom 1.32, its look height
 * worked out from the zoom), stepped back where the tile is too narrow for everything the creature can act out to fit
 * between its sides (floorZk: a tall window's tile is sized by its height, and the creature with it); a phone's is framed
 * per creature from the widest act it can play (phoneFit, the camera as close as keeps all of it inside the tile's sides with
 * a 5% margin, the creature centred). Both from the creature's footprint (extent.ts measureReach: every working style,
 * pastime and mood posed on a scratch copy as a frame poses it, at the pointer's widest gaze, and measured in 3D), measured
 * between frames once per creature shape. */

/** The reference's desktop stage distance (creator.js VIEWS.desktop). */
const DESKTOP_ZOOM = 1.32;
/** The creature's size on the stage, a share of what the framing alone gives (operator, 2026-11-05): half on a desktop;
 *  on a phone, whose creature is framed to the screen's width and its scene to its height, a little more, so the two keep
 *  the same proportion as on a desktop. */
const CREATURE_SIZE = { desktop: 0.5, phone: 0.65 };
/** The phone's framing until measured, and its side margin and centre (creator.js PHONE). */
const PHONE = { side: 0.05, mid: 0.5, zoom: 2.6 };

/** How long a step of a solve waits, at most, for the page to be idle. */
const SOLVE_WAIT_MS = 500;


/** The view a framing scales: the camera's distance factor, and an exact look height where the view has one (the phone). */
interface View { zoom: number; lookY?: number }

// ---------- the phone's framing, from the widest act (creator.js footprint, phoneFit) ----------
interface Obj3 {
  visible: boolean; userData: Record<string, unknown>; children: Obj3[]; matrixWorld: unknown;
  isMesh?: boolean; isSprite?: boolean; isLine?: boolean; isPoints?: boolean;
  geometry?: { boundingBox: { min: Vec3; max: Vec3 } | null; computeBoundingBox(): void; dispose(): void };
  updateMatrixWorld(force?: boolean): void;
}
interface ActingCreature { root: Obj3; minY: number }

/** The phone's camera for a canvas `aspect` wide: the nearest distance at which every footprint point is inside the side
 *  margins, the creature centred (its feet to the top of its ears or hat). Without a footprint, the last zoom, the body
 *  centred. */
function phoneFit(stage: Stage, item: StageItem, aspect: number, F: Footprint | null, last: number | null): View {
  const cam = stage.camera.clone() as RigCamera & { position: { set(x: number, y: number, z: number): void } };
  const c = item.c, V = c.root.position.constructor, q = new V() as unknown as Vec3;
  const minY = F ? F.minY : c.minY, top = F ? F.top : c.body.geometry.boundingBox.max.y + 0.25;
  cam.aspect = aspect; cam.updateProjectionMatrix();
  const aim = (D: number, L: number) => { cam.position.set(0, 0.6, D); cam.lookAt(0, L, 0); cam.updateMatrixWorld(); };
  const mid = () => (q.set(0, minY, 0).project(cam).y + q.set(0, top, 0).project(cam).y) / 2;
  const place = (D: number) => { let lo = -8, hi = 8; for (let i = 0; i < 32; i++) { const L = (lo + hi) / 2; aim(D, L); if (mid() < 1 - 2 * PHONE.mid) hi = L; else lo = L; } aim(D, (lo + hi) / 2); return (lo + hi) / 2; };
  const fits = (D: number) => { place(D); for (const p of F!.pts) if (Math.abs(q.copy(p).project(cam).x) > 1 - 2 * PHONE.side) return false; return true; };
  let D = (last ?? PHONE.zoom) * 6.7;
  if (F) { let lo = 6.7, hi = 6.7 * 8; for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; } D = hi; }
  const L = place(D);
  return { zoom: D / 6.7, lookY: L };
}

// ---------- the framer ----------
export interface FramerHost {
  stage: Stage;
  item: StageItem;
  canvas: HTMLCanvasElement;
  /** Draws the creature in `state`'s key pose (its acts as they are, no gaze, no startle) with the camera at `zoom` and
   *  `lookY` (undefined: the rig's own): a trial framing, the same whenever it is drawn. */
  render(zoom: number, lookY: number | undefined, state: string, into: HTMLCanvasElement): void;
  /** What it acts out now (the product's state). */
  mood(): string;
  /** Whether the creature is drawn at all (offline, the poster stands in for it: nothing to frame). */
  drawn(): boolean;
  /** Something changed that needs a frame drawn. */
  poke(): void;
  /** The camera's aspect: the tile's, whatever part of it the canvas shows (the scene canvas may be only its middle). */
  aspect(): number;
  /** The creature's widest reach was measured (reach() has an answer now). */
  measured(): void;
}

/** A solve in progress: its steps (a trial render each), what to do with its answer, and whether the stage waits for it. */
interface Job { key: string; steps: Generator<void, FrameTarget>; done: (to: FrameTarget) => void; wanted: boolean }

export class StageFramer {
  private cap: Framing = { lift: 0, zk: 1 };
  private to: FrameTarget | null = null;
  /** What the framing applied was solved for, "~" after it while it is the estimate (its pixel solve still to come). */
  private key = "";
  private phone: View | null = null;
  private phoneKey = "";
  /** The shape whose footprint is asked for, and what stops waiting for it. */
  private measuring: { key: string; stop: () => void } | null = null;
  private off: () => void;
  private held = false;
  private pose = "";
  /** The pose the open turn was fitted on (null at rest). */
  private turnPose: string | null = null;
  /** The framings solved on the pixels, by what they were solved for (a few: the tile's sizes, at rest and for a turn). */
  private solved = new Map<string, FrameTarget>();
  /** Solves on the pixels in progress, a trial render per step in the page's idle time: the stage's ask first, the others
   *  worked out ahead after it. */
  private jobs: Job[] = [];
  private running: ReturnType<typeof setTimeout> | undefined;
  private cancelIdle: (() => void) | null = null;
  /** Where trial framings are drawn: off screen, so none shows between two frames. */
  private trial: HTMLCanvasElement | null = null;
  /** The creature's bounds, as points in the world (its drawn box and its shadow's front on the floor): projected through
   *  any camera they give where it stands without a render (`low`, the cards' floor while it eases). */
  private points: Vec3[] | null = null;
  /** How the projected bounds' lowest row differs from the one measured on the pixels, at the framing eased from and at the
   *  target, and how far the ease from one to the other has come (the cards' floor follows it). */
  private ease = { from: { lift: 0, zk: 1 } as Framing, corrFrom: 0, corrTo: 0, span: 0 };

  constructor(private host: FramerHost, private frame: StageFrame) {
    this.off = frame.listen(() => { this.boxed = null; this.solve(); this.host.poke(); });
  }

  dispose() {
    clearTimeout(this.running); this.cancelIdle?.(); this.jobs = []; this.off();
    this.measuring?.stop(); this.measuring = null;
    this.frame.feet(null); this.frame.motion(null);
  }

  /** Held still (reduced motion, no GPU): a new framing is taken at once instead of eased into (the reference under
   *  reduced motion). */
  hold(still: boolean) { const was = this.held; this.held = still; if (was && !still && !footprintNow(this.host.item.spec)) this.measure(); }

  /** The canvas's box, css px, and where it sits in the tile (the stage's ask). */
  private box() {
    if (!this.boxed) { const r = this.host.canvas.getBoundingClientRect(); this.boxed = { w: r.width, h: r.height }; }
    const a = this.frame.request;
    return { w: this.boxed.w, h: this.boxed.h, dx: a?.dx ?? 0, dy: a?.dy ?? 0 };
  }
  /** The canvas's box on screen, read once per layout change (its resize, a new ask), never on the frames' path where the
   *  cards' and the backdrop's positions are written. */
  private boxed: { w: number; h: number } | null = null;
  /** When the ease running started (performance.now). */
  private easeT0 = 0;

  /** The view the framing scales: the desktop's, or the phone's from the creature's footprint (until it is measured, from its
   *  provisional reach: never cut, if a little small for a moment). */
  private view(phone: boolean): View {
    if (!phone) return { zoom: DESKTOP_ZOOM };
    const { canvas, stage, item } = this.host, aspect = canvas.width / canvas.height, F = this.footprint();
    const key = shapeKey(item.spec) + "|" + aspect.toFixed(4) + "|" + this.reachTag();
    if (this.phone && this.phoneKey === key) return this.phone;
    const fit = phoneFit(stage, item, aspect, F, this.phone?.zoom ?? null);
    // ...then whatever its acts throw past what they draw (a shadow, the head turned to the finger) is held inside the tile's sides too:
    // stepped back where it would not be (the creature's own size kept where it is)
    const pts = this.reachPoints(), room = 1 - SIDE_ROOM;
    for (let n = 0; n < 12 && pts.length; n++) {
      const r = widthReach(this.cameraAt(aspect, fit, { lift: 0, zk: 1 }), pts);
      if (!(r > room)) break;
      fit.zoom *= (r / room) * 1.002;
    }
    if (Number.isFinite(fit.zoom) && fit.zoom > 0 && Number.isFinite(fit.lookY ?? 0)) { this.phone = fit; this.phoneKey = key; }
    return this.phone ?? { zoom: PHONE.zoom };
  }

  /** Whether the creature's own footprint is measured (else its provisional reach stands in). */
  private measured(): boolean { return !!footprintNow(this.host.item.spec); }

  /** Asks for the creature's footprint (extent.ts, measured once per shape on the page). When it comes, the framing is solved again
   *  only where it moves (a phone's, or a tile whose floor it changes); the canvas's crop follows it (host.measured). A measure that
   *  fails is asked for again a while later; the provisional reach holds meanwhile. */
  private measure() {
    const { stage, item } = this.host, key = shapeKey(item.spec);
    if (this.measuring?.key === key || performance.now() < this.retryAt) return;
    this.measuring?.stop();
    const job: { key: string; stop: () => void } = { key, stop: () => {} };
    this.measuring = job;
    const ask = this.frame.request, before = ask && !ask.phone ? this.floorZk(ask.w, ask.h) : null;
    job.stop = footprintOf(stage, item.spec, () => {
      if (this.measuring !== job) return;
      this.measuring = null;
      this.reached = null;
      const now = this.frame.request, after = now && !now.phone ? this.floorZk(now.w, now.h) : null;
      if (!now || now.phone || before !== after) { this.phone = null; this.key = ""; this.solved.clear(); }
      this.host.measured();
      // (solve draws again only where the framing it applies changed: a creature held still asks for no frame for this)
      this.solve();
    }, () => { if (this.measuring === job) { this.measuring = null; this.retryAt = performance.now() + MEASURE_RETRY_MS; } });
  }
  private retryAt = -Infinity;

  /** The camera for a framing (creator.js viewCam, zoomOf, baseLook). The desktop at no lift and no step back keeps the
   *  rig's own look height, as the reference draws it. */
  private camera(v: View, f: Framing): { zoom: number; lookY: number | undefined } {
    // A phone's view comes with its look height (phoneFit); a desktop's does not.
    const zoom = (v.zoom * f.zk) / (v.lookY != null ? CREATURE_SIZE.phone : CREATURE_SIZE.desktop);
    if (v.lookY == null && f.lift === 0 && f.zk === 1) return { zoom, lookY: undefined };
    return { zoom, lookY: (v.lookY != null ? v.lookY : 0.3 - (zoom - 1) * 0.55) - f.lift };
  }

  /** The camera the stage draws a framing with (rig.js Stage.aim, the one place it is placed), `aspect` wide, for projecting points. */
  private cameraAt(aspect: number, v: View, f: Framing): RigCamera {
    const { stage, item } = this.host, cam = stage.camera.clone();
    cam.clearViewOffset(); cam.aspect = aspect; cam.updateProjectionMatrix();
    stage.aim(cam, this.camera(v, f), item.c); cam.updateMatrixWorld();
    return cam;
  }
  /** The camera the stage's framing stands at for what it is asked now, at rest and before a card: a phone's view (lift 0: centred),
   *  or a desktop tile's rest framing (the tests project through it). */
  cameraForAsk(): RigCamera | null {
    const ask = this.frame.request;
    if (!ask || !(ask.w > 0 && ask.h > 0)) return null;
    return ask.phone ? this.cameraAt(this.host.aspect(), this.view(true), { lift: 0, zk: 1 }) : this.cameraFor(ask.w, ask.h, this.restFraming(ask.w, ask.h));
  }

  /** The desktop camera for a tile `w` × `h` at a framing (the tests project through it too). */
  cameraFor(w: number, h: number, f: Framing): RigCamera { return this.cameraAt(w / h, { zoom: DESKTOP_ZOOM }, f); }

  /** A camera for a framing, as the stage draws it, for projecting points (no render). */
  private projector(v: View, f: Framing) { return this.cameraAt(this.host.aspect(), v, f); }

  /** The creature's rows at a trial framing, in css px of the tile (creator.js drawnRows), and how far its reach goes up and down
   *  the tile there (`reachRows`: what capCentre keeps inside it). */
  private probe(v: View, state: string): FrameProbe {
    const { host } = this, { dx, dy } = this.box();
    // In the tile's px: the canvas's rows moved by where it sits in the tile; the cards' columns moved back onto it.
    const rows = (lift: number, zk: number, xa: number, xb: number): Rows => {
      xa -= dx; xb -= dx;
      // A trial is read at one pixel to the css px at most (rows are wanted to a px of the tile, and the readback and the
      // scans over it cost by area): the frame is rendered as the stage renders it and resampled into the smaller canvas.
      const cam = this.camera(v, { lift, zk }), shown = host.canvas, cssW = this.box().w, shrink = Math.min(1, cssW / shown.width) || 1;
      const W = Math.max(1, Math.round(shown.width * shrink)), H = Math.max(1, Math.round(shown.height * shrink));
      const cv = (this.trial ??= document.createElement("canvas"));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      host.render(cam.zoom, cam.lookY, state, cv);
      const k = W / cssW;
      const x0 = Math.max(0, Math.floor(xa * k)), x1 = Math.min(W, Math.ceil(xb * k));
      const d = cv.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, W, H).data;
      let low = -1, top = H, lowAny = -1;
      for (let y = H - 1; y >= 0 && low < 0; y--) for (let x = x0; x < x1; x++) if (d[(y * W + x) * 4 + 3] > 16) { low = y; break; }
      for (let y = 0; y < H && top === H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 16) { top = y; break; }
      for (let y = H - 1; y >= 0 && lowAny < 0; y--) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 16) { lowAny = y; break; }
      return { low: (low < 0 ? 0 : low + 1) / k + dy, top: top / k + dy, lowAny: (lowAny + 1) / k + dy };
    };
    return { rows, slope: (zk) => this.slope(v, zk), reachRows: (lift, zk) => this.reachRows(v, { lift, zk }) };
  }

  /** How far up and down the tile everything the creature can act out reaches at a framing (its footprint, or its provisional
   *  reach), css px of the tile from its top, its ink included. */
  private reachRows(v: View, f: Framing): { top: number; bottom: number } {
    const { h, dy } = this.box();
    const [top, bottom] = heightReach(this.projector(v, f), this.reachPoints());
    return { top: ((1 - top) / 2) * h + dy, bottom: ((1 - bottom) / 2) * h + dy };
  }

  /** How far from the tile's middle the creature reaches at its closest framing (zk at its floor), css px, over every act it can
   *  play, posed as frames pose it, its ink and its shadow (what the scene canvas must hold, host.ts cropFor) for a desktop tile
   *  `w` × `h`; null while its acts are measured (this starts that: until then the canvas is the whole tile) or on a phone, whose
   *  framing is made to the tile's width. Always a finite, non-negative number when it is one. */
  reach(w: number, h: number): number | null {
    const ask = this.frame.request;
    if (!ask || ask.phone || !(w > 0 && h > 0)) return null;
    if (!this.footprint()) return null;
    const at = shapeKey(this.host.item.spec) + "|" + w.toFixed(1) + "|" + h.toFixed(1);
    if (this.reached?.at !== at) this.reached = { at, px: (widthReach(this.cameraFor(w, h, this.restFraming(w, h)), this.reachPoints()) * w) / 2 };
    return Number.isFinite(this.reached.px) && this.reached.px >= 0 ? this.reached.px : null;
  }
  private reached: { at: string; px: number } | null = null;

  /** The footprint of the creature's shape, or null while it is measured (this starts that, for a creature that moves, and on a
   *  phone, whose framing is made from it; a desktop's creature held still shows its key pose only, which heldReach holds exactly,
   *  and the page does no work for it). */
  private footprint(): Footprint | null {
    const F = footprintNow(this.host.item.spec);
    if (!F && (!this.held || this.frame.request?.phone)) this.measure();
    return F;
  }

  /** What a creature held still reaches: the key pose it is drawn in (its state's, with what it has on the go: a working style's key
   *  pose, the cogs), its head turned to the pointer's widest gazes (it still follows the pointer), raised by the startle's hop while
   *  it listens (a held creature still plays it on coming into listening), its ink and shadow; worked out on
   *  the rig as the stage poses it still, again when what it shows changes. */
  private heldReach(): { key: string; points: Vec3[] } {
    const { stage, item } = this.host, c = item.c, state = RIG_STATE[this.host.mood()] ?? "idle";
    const key = state + "|" + Object.entries(c.layers).map(([layer, L]) => layer + ":" + L.name).sort().join(",");
    if (this.held0?.key === key) return this.held0;
    const was = { state: item.spec.state, expr: item.spec.expr, opts: item.opts }, set = new ReachSet();
    try { item.spec.state = state; item.spec.expr = undefined; item.opts = { ...item.opts, extra: undefined }; stage.pose(item, 0, 0, true); visitDrawn(c, set.keep, { exact: true, stride: 3, gaze: true, lift: state === "listening" ? HOP_LIFT : 0 }); }
    finally { item.spec.state = was.state; item.spec.expr = was.expr; item.opts = was.opts; }
    return (this.held0 = { key, points: set.points });
  }
  private held0: { key: string; points: Vec3[] } | null = null;

  /** Which reach frames the creature now, for what is kept by it: its footprint, its held pose's, or its provisional one. */
  private reachTag(): string { return this.measured() ? "m" : this.held ? "h:" + this.heldReach().key : "p"; }

  /** What the creature can reach, as world points: its footprint, or until it is measured its provisional reach (extent.ts: the
   *  box round its pose at rest and every act's envelope round that), worked out once from the rig at rest. */
  private reachPoints(): Vec3[] {
    const F = this.footprint();
    if (F) return F.reach;
    if (this.held) return this.heldReach().points;
    if (!this.provisional) {
      const { stage, item } = this.host, was = { state: item.spec.state, expr: item.spec.expr, opts: item.opts };
      try { item.spec.state = "idle"; item.spec.expr = undefined; item.opts = { ...item.opts, extra: undefined }; stage.pose(item, 0, 0, true); this.provisional = provisionalReach(item.c); }
      finally { item.spec.state = was.state; item.spec.expr = was.expr; item.opts = was.opts; }
    }
    return this.provisional;
  }
  private provisional: Vec3[] | null = null;

  /** The framing a desktop tile `w` × `h` rests at: its floor (floorZk), the creature's middle at rest (feet to the top of its head
   *  and what it wears) at the optical centre, as capCentre stands it. */
  restFraming(w: number, h: number): Framing {
    const zk = this.floorZk(w, h);
    return { zk, lift: this.opticLift(w, h, zk) };
  }

  /** The lift that stands the creature's middle at rest at the tile's optical centre at a step back (from the projection). */
  private opticLift(w: number, h: number, zk: number): number {
    const c = this.host.item.c, F = footprintNow(this.host.item.spec), V = c.root.position.constructor, q = new V() as unknown as Vec3;
    const mid = ((F ? F.minY : c.minY) + (F ? F.top : c.body.geometry.boundingBox.max.y + 0.25)) / 2, want = 1 - 2 * OPTIC;
    let lo = -4, hi = 4;
    for (let i = 0; i < 30; i++) { const L = (lo + hi) / 2, y = q.set(0, mid, 0).project(this.cameraFor(w, h, { lift: L, zk })).y; if (y > want) hi = L; else lo = L; } // a larger lift aims lower: the creature rises in the frame
    const lift = (lo + hi) / 2;
    return Number.isFinite(lift) ? lift : 0;
  }

  /** The least step back at which everything the creature can act out (its footprint, or its provisional reach; ink and shadow
   *  included) fits a desktop tile, its middle at rest at the optical centre: between its sides with SIDE_ROOM to spare and
   *  between its top and its foot with UPRIGHT_ROOM. 1 where the tile has the room (a landscape tile mostly does); more on a tall,
   *  narrow one, whose height alone would size the creature past its sides, or a short one its acts would leave. Always finite,
   *  from 1 to ZK_CAP. */
  floorZk(w: number, h: number): number {
    if (!(w > 0 && h > 0)) return 1;
    const pts = this.reachPoints();
    if (!pts.length) return 1;
    const key = shapeKey(this.host.item.spec) + "|" + (w / h).toFixed(4) + "|" + this.reachTag();
    const kept = this.floors.get(key);
    if (kept != null) return kept;
    const fits = (zk: number) => {
      const cam = this.cameraFor(w, h, { lift: this.opticLift(w, h, zk), zk }), [top, bottom] = heightReach(cam, pts);
      return widthReach(cam, pts) <= 1 - SIDE_ROOM && top <= 1 - 2 * UPRIGHT_ROOM && bottom >= -1 + 2 * UPRIGHT_ROOM;
    };
    let zk = 1;
    for (let n = 0; n < 60 && zk < ZK_CAP && !fits(zk); n++) zk = Math.min(ZK_CAP, zk * 1.03);
    if (!Number.isFinite(zk) || zk < 1) zk = 1;
    if (this.floors.size > 16) this.floors.clear();
    this.floors.set(key, zk);
    return zk;
  }
  private floors = new Map<string, number>();

  /** How many px a unit of lift moves the creature's feet up the tile at a step back (from the projection). */
  private slope(v: View, zk: number) {
    const vh = this.box().h, a = this.footAt(v, { lift: 0, zk }, vh), b = this.footAt(v, { lift: 0.1, zk }, vh);
    return Math.max(1, (a - b) / 0.1);
  }

  /** The creature's bounds where it stands now: its drawn box (hats, props, the cogs) and its shadow's front edge on the
   *  floor, as world points; taken again with each new framing (its pose may have changed). */
  private bounds(): Vec3[] {
    const c = this.host.item.c as unknown as ActingCreature, root = c.root, V = (root as unknown as { position: Vec3 }).position.constructor as unknown as new () => Vec3;
    const was = root.visible; root.visible = true; root.updateMatrixWorld(true);
    const v = new V(), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const visit = (o: Obj3) => {
      if (!o.visible || o.userData.noFit) return;
      const g = o.geometry;
      if (g && (o.isMesh || o.isSprite || o.isLine || o.isPoints)) {
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox!;
        for (let i = 0; i < 8; i++) {
          v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(o.matrixWorld);
          lo[0] = Math.min(lo[0], v.x); lo[1] = Math.min(lo[1], v.y); lo[2] = Math.min(lo[2], v.z); hi[0] = Math.max(hi[0], v.x); hi[1] = Math.max(hi[1], v.y); hi[2] = Math.max(hi[2], v.z);
        }
      }
      for (const ch of o.children) visit(ch);
    };
    visit(root);
    root.visible = was;
    const pts: Vec3[] = [];
    if (!(hi[1] > lo[1])) return pts;
    for (let i = 0; i < 8; i++) pts.push(new V().set(i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]));
    // the shadow on the floor reaches a little in front of the body, and a little wider
    const floor = Math.min(lo[1], c.minY), wide = (hi[0] - lo[0]) * 0.6, front = hi[2] + (hi[2] - lo[2]) * 0.3;
    for (const x of [-wide, 0, wide]) pts.push(new V().set(x, floor, front));
    return pts;
  }

  /** The projected bounds' rows at a framing, css px of the tile: the estimate drawn before the pixels have been read. */
  private estimate(v: View, f: Framing): Rows | null {
    const pts = this.points;
    if (!pts?.length) return null;
    const cam = this.projector(v, f), q = pts[0].clone(), { h, dy } = this.box();
    let top = Infinity, low = -Infinity;
    for (const p of pts) { const y = ((1 - q.copy(p).project(cam).y) / 2) * h + dy; top = Math.min(top, y); low = Math.max(low, y); }
    return { top: top - ESTIMATE_MARGIN, low: low + ESTIMATE_MARGIN, lowAny: low + ESTIMATE_MARGIN };
  }

  /** Where the creature's feet are at a framing, css px from the canvas's top (from the projection: no render). */
  private footAt(v: View, f: Framing, vh: number): number {
    const c = this.host.item.c, V = c.root.position.constructor, cam = this.projector(v, f);
    return ((1 - new V(0, c.minY, 0).project(cam).y) / 2) * vh;
  }

  /** Solves what the stage asks, if it changed (creator.js fitFrame): at rest on a desktop, as large as a turn's;
   *  for a turn, stepped back as far as its largest card needs. The pixels' answer where it is known (solved now for the
   *  first framing, within FIRST_BUDGET_MS); else at once an estimate from the creature's projected bounds, the pixels'
   *  answer worked out in the page's idle time and taken when it comes. Then says where the cards go. */
  solve() {
    const ask = this.frame.request;
    if (!ask || !this.ready()) return;
    const rest = ask.rest && !ask.phone;
    if (!rest && !ask.cards) return; // the turn's framing waits for its cards to be measured
    // A turn is fitted on the pose of the turn that opened it (the reference fits on entering the state), and keeps that
    // framing whoever speaks next, until the stage is at rest again.
    if (rest) this.turnPose = null;
    else if (ask.phone) {
      // A phone's one framing is fitted again each time the agent enters idle, working or present (on that pose), and kept
      // through the turns after it, as the reference does (it fits again on every state without voice).
      const m = this.host.mood();
      if (m === "idle" || m === "present") this.turnPose = "idle";
      else if (m === "working") this.turnPose = "working";
      else if (!this.turnPose) this.turnPose = ask.opener ?? (m === "listening" ? "listening" : "speaking");
    } else if (!this.turnPose) this.turnPose = ask.opener ?? "speaking";
    const pose = rest ? (this.host.mood() === "working" ? "working" : "idle") : this.turnPose!;
    const v = this.view(ask.phone), key = this.keyOf(ask, rest, pose, v);
    if (!key) return;
    const { gap } = stageBands(ask.h, ask.phone);
    let to = this.solved.get(key), pending = false;
    if (!to) {
      const job = this.job(ask, rest, pose, v, key, () => this.solve());
      // The first framing: solved now, within the budget (on a GPU it all fits: the stage opens framed).
      if (!this.to) to = this.drive(job, FIRST_BUDGET_MS) ?? undefined;
      if (!to) {
        this.points = this.bounds();
        const guess = this.points.length ? this.estimated(ask, rest, pose, v) : null;
        if (!guess) { this.frame.working(); return; }
        to = guess; pending = true;
      }
    }
    // A framing that is not a number (a trial read from a canvas with no box, a projection through a degenerate camera) is never
    // applied: the creature would be drawn nowhere. It stands at the closest framing the tile allows instead.
    if (!Number.isFinite(to.lift) || !Number.isFinite(to.zk) || !Number.isFinite(to.low) || !Number.isFinite(to.top)) {
      const zk0 = ask.phone ? 1 : this.floorZk(ask.w, ask.h);
      to = { lift: 0, zk: zk0, low: ask.h * 0.7, top: ask.h * 0.3, head: ask.h * 0.1 };
    }
    const applied = key + (pending ? "~" : "");
    if (applied !== this.key) {
      this.key = applied;
      const first = !this.to;
      this.points = this.bounds();
      // the cards' floor follows the ease: from the framing it stands at now, to the new one
      const now = this.estimate(v, this.cap), at = this.estimate(v, to);
      const corrNow = this.to && now ? this.lowNow(v, now) - now.low : 0;
      this.ease = { from: { ...this.cap }, corrFrom: corrNow, corrTo: at ? to.low - at.low : 0, span: Math.hypot(to.lift - this.cap.lift, to.zk - this.cap.zk) };
      this.to = to;
      // The first framing is taken at once (the stage opens with the creature where it stands); every change after it is
      // eased into, or taken at once while it holds still.
      if (first || this.held) { this.cap = { lift: to.lift, zk: to.zk }; this.ease.span = 0; }
      this.easeT0 = performance.now();
      this.frame.motion(this.motionOf(v, gap));
      this.host.poke();
      // The other framings (at rest, or a turn's, opened by either) worked out while nothing happens, so the first card is
      // not held up by them.
      if (!pending) this.prefetch(ask, rest, v);
    }
    this.frame.solve({ target: to, gap, below: to.low + this.sway(to) + gap, belowAny: Math.max(to.low, to.reach ?? 0) + this.sway(to) + gap, above: to.top - to.head - gap, key }, pending);
  }

  /** Whether trial framings can be drawn now: the creature drawn, its canvas laid out. */
  private ready() { const { canvas } = this.host; return this.host.drawn() && !!canvas.width && canvas.isConnected && canvas.getClientRects().length > 0; }

  /** What a framing is solved for: at rest or a turn, the pose it is fitted on, the tile and the cards, the creature. */
  private keyOf(ask: FrameAsk, rest: boolean, pose: string, v: View): string | null {
    if (!(ask.h > 0 && ask.w > 0) || (!rest && !ask.cards)) return null;
    const zk0 = ask.phone ? 1 : this.floorZk(ask.w, ask.h);
    return [rest ? "rest" : "turn", pose, ask.phone, ask.w.toFixed(1), ask.h.toFixed(1), ask.dy.toFixed(1), v.zoom, v.lookY, zk0.toFixed(4), shapeKey(this.host.item.spec), rest ? "" : JSON.stringify(ask.cards), this.held].join("|");
  }

  /** The solve on the pixels for `key` (queued, or found queued): `then` once it is done. */
  private job(ask: FrameAsk, rest: boolean, pose: string, v: View, key: string, then?: () => void, ahead = false): Job {
    const queued = this.jobs.find((j) => j.key === key);
    if (queued) {
      // asked for now: it goes first, and says when it is done (once)
      if (then && !queued.wanted) { const was = queued.done; queued.done = (t) => { was(t); then(); }; queued.wanted = true; this.jobs = [queued, ...this.jobs.filter((j) => j !== queued)]; this.run(); }
      return queued;
    }
    const { floor, ceil, gap } = stageBands(ask.h, ask.phone), probe = this.probe(v, pose);
    const zk0 = ask.phone ? 1 : this.floorZk(ask.w, ask.h);
    const sway = this.held ? 0 : MOTION_ROOM;
    const steps = rest ? capCentreSteps(probe, 0, 0, ask.h, ceil, floor, gap, 0, ask.w, zk0, sway) : this.turnSteps(v, probe, pose, ask.cards!, ask.h, ceil, floor, gap, zk0, sway);
    const job: Job = { key, steps, wanted: !!then, done: (t) => { this.solved.set(key, t); if (this.solved.size > 8) this.solved.delete(this.solved.keys().next().value!); then?.(); } };
    if (ahead) this.jobs.push(job); else this.jobs.unshift(job);
    this.run();
    return job;
  }

  /** Steps `job` now for `budget` ms at most: its answer if it got there (the job is done then), else null (it goes on in
   *  the page's idle time). */
  private drive(job: Job, budget: number): FrameTarget | null {
    const until = performance.now() + budget;
    while (performance.now() < until) {
      const r = job.steps.next();
      if (r.done) { this.jobs = this.jobs.filter((j) => j !== job); this.solved.set(job.key, r.value); return r.value; }
    }
    return null;
  }

  /** The framing estimated from the creature's projected bounds: the same solver, no render. */
  private estimated(ask: FrameAsk, rest: boolean, pose: string, v: View): FrameTarget | null {
    const { floor, ceil, gap } = stageBands(ask.h, ask.phone);
    const probe: FrameProbe = { rows: (lift, zk) => this.estimate(v, { lift, zk }) ?? { top: 0, low: 0, lowAny: 0 }, slope: (zk) => this.slope(v, zk) };
    void pose;
    const zk0 = ask.phone ? 1 : this.floorZk(ask.w, ask.h);
    const sway = this.held ? 0 : MOTION_ROOM;
    return rest ? capCentre(probe, 0, 0, ask.h, ceil, floor, gap, 0, ask.w, zk0, sway)
      : capCentre(probe, Math.max(0, ask.cards!.above), ask.cards!.below, ask.h, ceil, floor, gap, ask.cards!.xa, ask.cards!.xb, zk0, sway);
  }

  /** A turn's framing: fitted on the pose it was entered in, as the reference fits it. Every card of the turn goes where
   *  it puts them, what the person sent where their pill was (it pops out of it), even while the agent rests or works by
   *  then (a pose that may reach a few px lower: recorded for the human, PR "Decisions"). */
  private *turnSteps(v: View, probe: FrameProbe, pose: string, cards: NonNullable<FrameAsk["cards"]>, vh: number, ceil: number, floor: number, gap: number, zk0 = 1, sway = 0): Generator<void, FrameTarget> {
    void v; void pose;
    return yield* capCentreSteps(probe, Math.max(0, cards.above), cards.below, vh, ceil, floor, gap, cards.xa, cards.xb, zk0, sway);
  }

  /** Steps the solves a trial render at a time, in the page's idle time (its layout, input and frames come first; a
   *  step waits SOLVE_WAIT_MS at most), while the creature can be drawn. */
  private run() {
    if (this.running !== undefined || this.cancelIdle) return;
    const later = (fn: () => void, ms: number) => { this.running = setTimeout(fn, ms); };
    const idle = (fn: () => void) => {
      if (typeof requestIdleCallback === "function") { const id = requestIdleCallback(fn, { timeout: SOLVE_WAIT_MS }); this.cancelIdle = () => cancelIdleCallback(id); }
      else later(fn, 16);
    };
    const tick = () => {
      this.running = undefined; this.cancelIdle = null;
      const job = this.jobs[0];
      if (!job) return;
      if (!this.ready()) { later(tick, 250); return; }
      const r = job.steps.next();
      if (r.done) { this.jobs.shift(); job.done(r.value); }
      if (this.jobs.length) idle(tick);
    };
    idle(tick);
  }

  private prefetch(ask: FrameAsk, rest: boolean, v: View) {
    const todo: Array<[boolean, string]> = rest ? [[false, "listening"], [false, "speaking"]] : ask.phone ? [] : [[true, this.host.mood() === "working" ? "working" : "idle"]];
    for (const [r, pose] of todo) {
      const a = { ...ask, rest: r }, key = this.keyOf(a, r, pose, v);
      if (key && !this.solved.has(key)) this.job(a, r, pose, v, key, undefined, true);
    }
  }

  /** The room a creature that is not held still takes below its key pose, kept under it for good (it breathes and squashes with the
   *  voice all the while a card shows); none for one held still, which is drawn in its key pose only. */
  private sway(to: { low: number; top: number }): number { return this.held ? 0 : Math.max(0, to.low - to.top) * MOTION_ROOM; }
  /** The creature's lowest drawn row where it stands now (eased), css px of the tile: its projected bounds, moved by how
   *  they differ from the pixels at the framings eased between (all of it at the target). Mid-way, care besides: a couple
   *  of px, tapering off as it lands. While it is not held still, the room its breathing and its squash with the voice take below
   *  its key pose (sway) is kept too, mid-way and once it stands at the target. */
  private lowNow(v: View, est: Rows): number { void v; return this.lowAt(est, this.cap); }
  private lowAt(est: Rows, at: Framing): number {
    const e = this.ease, to = this.to!, p = e.span > 1e-6 ? Math.max(0, Math.min(1, 1 - Math.hypot(to.lift - at.lift, to.zk - at.zk) / e.span)) : 1;
    return est.low + e.corrFrom + (e.corrTo - e.corrFrom) * p + this.sway(to) + (1 - p) * (2 + (this.held ? 0 : 1));
  }

  /** Where the ease stands `n` steps (1/30 s each) after it started: FRAME_EASE of the way a step, as the reference's
   *  frames at 30 a second, landing once within 1e-3. */
  private easedAt(n: number): Framing {
    const { from } = this.ease, to = this.to!, k = (1 - FRAME_EASE) ** n;
    const f = { lift: to.lift + (from.lift - to.lift) * k, zk: to.zk + (from.zk - to.zk) * k };
    return Math.abs(f.lift - to.lift) < 1e-3 && Math.abs(f.zk - to.zk) < 1e-3 ? { lift: to.lift, zk: to.zk } : f;
  }

  /** The change starting now, as it will play: every step, the cards' floor (a gap under the creature's lowest drawn row,
   *  that row from its projected bounds corrected to the pixels, with care mid-way) and where its feet are drawn. */
  private motionOf(v: View, gap: number): FrameMotion {
    const to = this.to!, { h, dy } = this.box(), floor: number[] = [], feet: number[] = [];
    for (let n = 0; n <= MOTION_STEPS; n++) {
      const f = this.ease.span > 0 ? this.easedAt(n) : { lift: to.lift, zk: to.zk }, settled = f.lift === to.lift && f.zk === to.zk;
      const est = settled ? null : this.estimate(v, f);
      floor.push((est ? this.lowAt(est, f) : to.low + this.sway(to)) + gap);
      feet.push(this.footAt(v, f, h) + dy);
      if (settled) break;
    }
    return { t0: performance.now(), step: STEP_MS, floor, feet };
  }

  /** The camera to draw this frame with, where the ease stands now (creator.js draw, on the clock rather than per frame
   *  drawn, so a slow renderer's frames show it where the cards' animation has it); whether it is still moving. Nothing is
   *  written here: the change was said once, as it started (motionOf). */
  step(): { zoom: number; lookY: number | undefined; moving: boolean } | null {
    const ask = this.frame.request, pose = this.host.mood();
    if (ask && (!this.to || pose !== this.pose)) { this.pose = pose; this.solve(); }
    if (!ask || !this.to) return null;
    const v = this.view(ask.phone), to = this.to;
    if (this.held || this.ease.span === 0) this.cap = { lift: to.lift, zk: to.zk };
    else if (this.cap.lift !== to.lift || this.cap.zk !== to.zk) this.cap = this.easedAt((performance.now() - this.easeT0) / STEP_MS);
    const moving = this.cap.lift !== to.lift || this.cap.zk !== to.zk;
    return { ...this.camera(v, this.cap), moving };
  }

  /** The canvas's box changed but not the tile (its crop): read again when next needed, the framings solved kept. */
  reboxed() { this.boxed = null; }

  /** Forgets the framing solved (the canvas changed shape, or the creature's room did): solved again when next asked. */
  invalidate() {
    this.key = ""; this.phone = null; this.solved.clear(); this.boxed = null;
    for (const j of this.jobs) j.steps.return(undefined as unknown as FrameTarget);
    this.jobs = [];
    this.solve();
  }
}

/** The rig's state a product's state is drawn in (host.ts MODES). */
const RIG_STATE: Record<string, string> = { idle: "idle", present: "idle", listening: "listening", speaking: "speaking", working: "working" };
/** The room kept between what the creature can reach and a desktop tile's sides, a share of the tile's half width, and between it and
 *  the tile's top and foot, a share of its height (floorZk). */
const SIDE_ROOM = 0.04, UPRIGHT_ROOM = 0.015;
/** The furthest a floor steps the creature back (a tile far too small for it: it is drawn small rather than cut). */
const ZK_CAP = 4;
/** How long after a measure failed it is tried again (ms). */
const MEASURE_RETRY_MS = 5000;
/** The ease's step (the reference's frame at 30 a second), and the most steps a change is sampled for (it lands sooner). */
const STEP_MS = 1000 / 30, MOTION_STEPS = 60;
/** How long the first framing is solved for at once, on the pixels, before an estimate stands in for it (a renderer without
 *  a GPU takes a second or so; on a GPU it all takes a fraction of that). */
const FIRST_BUDGET_MS = 1500;
/** How far a moving creature reaches below its key pose, a share of its drawn height (the rig's breathing, and its
 *  squash with the voice: 0.045 at full voice against 0.027 in the key pose). */
const MOTION_ROOM = 0.01;
/** Care around the projected bounds (px): the estimate errs on the side of a larger creature. */
const ESTIMATE_MARGIN = 3;
