import { ACTS, type RigCamera, type RigVector, type Stage, type StageItem } from "./rig.js";
import { capCentre, capCentreSteps, easeFraming, REST_HEAD, REST_ZK, stageBands, type FrameAsk, type FrameProbe, type FrameSolved, type Framing, type FrameTarget, type Rows,
  type StageFrame } from "./stage-frame";

/* The creature host's side of the stage's framing (stage-frame.ts): it draws trial framings of the creature into its own
 * canvas and reads their rows (the reference's drawnRows), solves the framing the stage asks for (capCentre), eases its
 * camera toward it a step a frame and says where the cards go and where its feet are drawn.
 *
 * The camera is the reference's (creator.js viewCam): its distance the view's zoom times the step back (`zk`), aimed at
 * the view's look height less the lift. A desktop's view is the reference's desktop stage (zoom 1.32, its look height
 * worked out from the zoom); a phone's is framed per creature from the widest act it can play (phoneFit: every working
 * style, pastime and mood stepped through on a scratch copy and measured in 3D, the camera then as close as keeps all of
 * it inside the tile's sides with a 5% margin, the creature centred), measured between frames once per creature shape. */

/** The reference's desktop stage distance (creator.js VIEWS.desktop). */
const DESKTOP_ZOOM = 1.32;
/** The phone's framing until measured, and its side margin and centre (creator.js PHONE). */
const PHONE = { side: 0.05, mid: 0.5, zoom: 2.6 };

/** How long a step of a solve waits, at most, for the page to be idle. */
const SOLVE_WAIT_MS = 500;

/** The poses the creature can take while a turn's card shows: the turn's own, and resting or working after it. */
const TURN_POSES = ["speaking", "listening", "idle", "working"];

/** The view a framing scales: the camera's distance factor, and an exact look height where the view has one (the phone). */
interface View { zoom: number; lookY?: number }

// ---------- the phone's framing, from the widest act (creator.js measure, footprint, phoneFit) ----------
interface Obj3 {
  visible: boolean; userData: Record<string, unknown>; children: Obj3[]; matrixWorld: unknown;
  isMesh?: boolean; isSprite?: boolean; isLine?: boolean; isPoints?: boolean;
  geometry?: { boundingBox: { min: Vec3; max: Vec3 } | null; computeBoundingBox(): void; dispose(): void };
  rotation: { y: number }; updateMatrixWorld(force?: boolean): void;
}
interface Vec3 extends RigVector { set(x: number, y: number, z: number): Vec3; applyMatrix4(m: unknown): Vec3; clone(): Vec3; copy(v: Vec3): Vec3 }
interface Footprint { pts: Vec3[]; minY: number; top: number }
interface ActingCreature { root: Obj3; minY: number; setAct(layer: string, name: string | null, opts?: object): unknown; actFrame(t: number, still: boolean, st: Record<string, number>, lvl: number): unknown }

/** What the creature can act out, as the reference's FOOT_ACTS lists it (creator.js; acts.js WORKS, PASTIMES, MOODS): the
 *  working styles (with the cogs), the cogs, the pastimes and the moods; those registered (the acts are acts.js's). */
const WORKS = ["crank", "hammer", "files", "type", "think"];
const PASTIMES = ["stretch", "water", "juggle", "soup", "fish", "bubbles", "music", "read", "nap"];
const MOODS = ["happy", "laugh", "love", "surprised", "angry", "sad", "confused", "dizzy", "excited", "shy", "proud", "scared"];
type FootAct = [layer: string, name: string, opts: object];
function footActs(): FootAct[] {
  const all: FootAct[] = [...WORKS.map((w): FootAct => ["base", "work-" + w, { cogs: true }]), ["cogs", "cogs", {}],
    ...PASTIMES.map((p): FootAct => ["base", "rest-" + p, {}]), ...MOODS.map((m): FootAct => ["mood", m, {}])];
  return all.filter(([, name]) => name in (ACTS as Record<string, unknown>));
}

const footprints = new Map<string, Footprint>();
const shapeKey = (spec: object) => { const s = spec as { body?: unknown; parts?: unknown; eyeStyle?: unknown }; return JSON.stringify([s.body, s.parts, s.eyeStyle]); };

/** Every act stepped through on a scratch copy of the creature, one act per step (a generator: a live page measures
 *  between frames): the points furthest out at each side as a camera ~14 units away sees them, and its own top at rest. */
function* measure(stage: Stage, spec: object): Generator<void, Footprint> {
  const it = stage.add({ ...spec, state: "idle", expr: undefined }, null, { off: 0 }), c = it.c as unknown as ActingCreature;
  const V = (c.root as unknown as { position: Vec3 }).position.constructor as unknown as new () => Vec3, v = new V(), pts: Vec3[] = [];
  c.root.visible = true; // a scratch copy: measured, never drawn
  c.root.updateMatrixWorld(true);
  let top = -Infinity;
  const visit = (o: Obj3, keep: (q: Vec3) => void) => {
    if (!o.visible || o.userData.noFit) return; // noFit: a burst of light meant to run off the frame
    const g = o.geometry;
    if (g && (o.isMesh || o.isSprite || o.isLine || o.isPoints)) {
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox!;
      for (let i = 0; i < 8; i++) { v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(o.matrixWorld); keep(v); }
    }
    for (const ch of o.children) visit(ch, keep);
  };
  visit(c.root, (q) => { top = Math.max(top, q.y); });
  try {
    for (const [layer, name, opts] of footActs()) {
      c.setAct(layer, name, { hold: true, ...opts });
      for (let t = 0; t <= 12; t += 0.3) {
        const s: Record<string, number> = {};
        c.actFrame(t, false, s, 0.5); c.root.rotation.y = s.turn || 0; c.root.updateMatrixWorld(true);
        let L: { k: number; p: Vec3 } | null = null, R: { k: number; p: Vec3 } | null = null;
        visit(c.root, (q) => { const k = q.x / (14 - q.z); if (!L || k < L.k) L = { k, p: q.clone() }; if (!R || k > R.k) R = { k, p: q.clone() }; });
        if (L && R) pts.push((L as { p: Vec3 }).p, (R as { p: Vec3 }).p);
      }
      c.setAct(layer, null);
      yield;
    }
    return { pts, minY: c.minY, top };
  } finally {
    stage.scene.remove(it.c.root);
    it.c.root.traverse((o) => { o.geometry?.dispose(); });
    stage.items = stage.items.filter((x) => x !== it);
  }
}

/** The phone's camera for a canvas `aspect` wide: the nearest distance at which every footprint point is inside the side
 *  margins, the creature centred (its feet to the top of its ears or hat). Without a footprint, the last zoom, the body
 *  centred. */
function phoneFit(stage: Stage, item: StageItem, aspect: number, F: Footprint | null, last: number | null): View {
  const cam = stage.camera.clone() as RigCamera & { position: { set(x: number, y: number, z: number): void } };
  const c = item.c, V = c.root.position.constructor, q = new V() as Vec3;
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
  private measuring: { key: string; gen: Generator<void, Footprint> } | null = null;
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
    if (this.measuring) { this.measuring.gen.return(undefined as unknown as Footprint); this.measuring = null; }
    this.frame.feet(null); this.frame.edge(null);
  }

  /** Held still (reduced motion, no GPU): a new framing is taken at once instead of eased into (the reference under
   *  reduced motion). */
  hold(still: boolean) { this.held = still; }

  /** The canvas's box, css px, and where it sits in the tile (the stage's ask). */
  private box() {
    if (!this.boxed) { const r = this.host.canvas.getBoundingClientRect(); this.boxed = { w: r.width, h: r.height }; }
    const a = this.frame.request;
    return { w: this.boxed.w, h: this.boxed.h, dx: a?.dx ?? 0, dy: a?.dy ?? 0 };
  }
  /** The canvas's box on screen, read once per layout change (its resize, a new ask), never on the frames' path where the
   *  cards' and the backdrop's positions are written. */
  private boxed: { w: number; h: number } | null = null;

  /** The view the framing scales: the desktop's, or the phone's measured one (measured between frames when the creature
   *  is new to the page; the last framing holds meanwhile). */
  private view(phone: boolean): View {
    if (!phone) return { zoom: DESKTOP_ZOOM };
    const { canvas, stage, item } = this.host, aspect = canvas.width / canvas.height, key = shapeKey(item.spec) + "|" + aspect.toFixed(4);
    if (this.phone && this.phoneKey === key) return this.phone;
    const F = footprints.get(shapeKey(item.spec)) ?? null;
    if (F || !this.phone) { this.phone = phoneFit(stage, item, aspect, F, this.phone?.zoom ?? null); this.phoneKey = F ? key : ""; }
    if (!F) this.measure();
    return this.phone;
  }

  private measure() {
    const { stage, item } = this.host, key = shapeKey(item.spec);
    if (this.measuring?.key === key) return;
    this.measuring?.gen.return(undefined as unknown as Footprint);
    const job = (this.measuring = { key, gen: measure(stage, item.spec) });
    const step = () => {
      if (this.measuring !== job) return;
      const r = job.gen.next();
      if (!r.done) { setTimeout(step, 0); return; }
      footprints.set(key, r.value);
      this.measuring = null;
      this.phone = null; this.key = ""; // framed again on what it measured
      this.solve();
      this.host.poke();
    };
    setTimeout(step, 30);
  }

  /** The camera for a framing (creator.js viewCam, zoomOf, baseLook). The desktop at no lift and no step back keeps the
   *  rig's own look height, as the reference draws it. */
  private camera(v: View, f: Framing): { zoom: number; lookY: number | undefined } {
    const zoom = v.zoom * f.zk;
    if (v.lookY == null && f.lift === 0 && f.zk === 1) return { zoom, lookY: undefined };
    return { zoom, lookY: (v.lookY != null ? v.lookY : 0.3 - (zoom - 1) * 0.55) - f.lift };
  }

  /** A camera for a framing, as the stage draws it, for projecting points (no render). */
  private projector(v: View, f: Framing) {
    const { stage, item, canvas } = this.host, cam = stage.camera.clone(), c = item.c, { zoom, lookY } = this.camera(v, f);
    cam.aspect = canvas.width / canvas.height; cam.updateProjectionMatrix();
    cam.position.set(0, 0.6, 6.7 * zoom); cam.lookAt(0, lookY != null ? lookY : 0.3 + ((c as unknown as { float?: number }).float || 0) * 0.5 - (zoom - 1) * 0.55, 0); cam.updateMatrixWorld();
    return cam;
  }

  /** The creature's rows at a trial framing, in css px of the tile (creator.js drawnRows). */
  private probe(v: View, state: string): FrameProbe {
    const { host } = this, { dx, dy } = this.box();
    // In the tile's px: the canvas's rows moved by where it sits in the tile; the cards' columns moved back onto it.
    const rows = (lift: number, zk: number, xa: number, xb: number): Rows => {
      xa -= dx; xb -= dx;
      const cam = this.camera(v, { lift, zk }), shown = host.canvas, W = shown.width, H = shown.height;
      const cv = (this.trial ??= document.createElement("canvas"));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      host.render(cam.zoom, cam.lookY, state, cv);
      const k = W / this.box().w;
      const x0 = Math.max(0, Math.floor(xa * k)), x1 = Math.min(W, Math.ceil(xb * k));
      const d = cv.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, W, H).data;
      let low = -1, top = H, lowAny = -1;
      for (let y = H - 1; y >= 0 && low < 0; y--) for (let x = x0; x < x1; x++) if (d[(y * W + x) * 4 + 3] > 16) { low = y; break; }
      for (let y = 0; y < H && top === H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 16) { top = y; break; }
      for (let y = H - 1; y >= 0 && lowAny < 0; y--) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 16) { lowAny = y; break; }
      return { low: (low < 0 ? 0 : low + 1) / k + dy, top: top / k + dy, lowAny: (lowAny + 1) / k + dy };
    };
    return { rows, slope: (zk) => this.slope(v, zk) };
  }

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

  /** Solves what the stage asks, if it changed (creator.js fitFrame): at rest on a desktop, closer, with less headroom;
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
    else if (!this.turnPose) this.turnPose = ask.opener ?? "speaking";
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
      this.host.poke();
      // The other framings (at rest, or a turn's, opened by either) worked out while nothing happens, so the first card is
      // not held up by them.
      if (!pending) this.prefetch(ask, rest, v);
    }
    this.frame.solve({ target: to, gap, below: to.low + gap, belowAny: Math.max(to.low, to.reach ?? 0) + gap, above: to.top - to.head - gap, key }, pending);
  }

  /** Whether trial framings can be drawn now: the creature drawn, its canvas laid out. */
  private ready() { const { canvas } = this.host; return this.host.drawn() && !!canvas.width && canvas.isConnected && canvas.getClientRects().length > 0; }

  /** What a framing is solved for: at rest or a turn, the pose it is fitted on, the tile and the cards, the creature. */
  private keyOf(ask: FrameAsk, rest: boolean, pose: string, v: View): string | null {
    if (!(ask.h > 0 && ask.w > 0) || (!rest && !ask.cards)) return null;
    return [rest ? "rest" : "turn", pose, ask.phone, ask.w.toFixed(1), ask.h.toFixed(1), ask.dy.toFixed(1), v.zoom, v.lookY, shapeKey(this.host.item.spec), rest ? "" : JSON.stringify(ask.cards)].join("|");
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
    const steps = rest ? capCentreSteps(probe, 0, 0, ask.h, ceil, floor, gap, 0, ask.w, REST_ZK, REST_HEAD) : this.turnSteps(v, probe, pose, ask.cards!, ask.h, ceil, floor, gap);
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
    return rest ? capCentre(probe, 0, 0, ask.h, ceil, floor, gap, 0, ask.w, REST_ZK, REST_HEAD)
      : capCentre(probe, Math.max(0, ask.cards!.above), ask.cards!.below, ask.h, ceil, floor, gap, ask.cards!.xa, ask.cards!.xb);
  }

  /** A turn's framing: fitted on the pose that opened it, as the reference fits it (the agent's reply and the person's
   *  pill show only in the turn's own states). What the person sent may show while the agent rests or works: how low every
   *  pose it can take then reaches is kept (`reach`), and that card goes under the lowest, the gap kept. */
  private *turnSteps(v: View, probe: FrameProbe, pose: string, cards: NonNullable<FrameAsk["cards"]>, vh: number, ceil: number, floor: number, gap: number): Generator<void, FrameTarget> {
    const { xa, xb } = cards, hTop = Math.max(0, cards.above);
    const to = yield* capCentreSteps(probe, hTop, cards.below, vh, ceil, floor, gap, xa, xb);
    let reach = to.low;
    for (const other of TURN_POSES.filter((p) => p !== pose)) { yield; reach = Math.max(reach, this.probe(v, other).rows(to.lift, to.zk, xa, xb).low); }
    return reach > to.low ? { ...to, reach } : to;
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

  /** The creature's lowest drawn row where it stands now (eased), css px of the tile: its projected bounds, moved by how
   *  they differ from the pixels at the framings eased between (all of it at the target). Mid-way, care besides: a couple
   *  of px, and while it moves the room its breathing and its squash with the voice take below its key pose; none once it
   *  stands at the target, so a card settles exactly where the framing puts it. */
  private lowNow(v: View, est: Rows): number {
    const e = this.ease, to = this.to!, p = e.span > 1e-6 ? Math.max(0, Math.min(1, 1 - Math.hypot(to.lift - this.cap.lift, to.zk - this.cap.zk) / e.span)) : 1;
    const sway = this.held ? 0 : (to.low - to.top) * MOTION_ROOM + 1;
    return est.low + e.corrFrom + (e.corrTo - e.corrFrom) * p + (1 - p) * (2 + sway);
  }

  /** The camera to draw this frame with, eased a step toward the target (creator.js draw); whether it is still moving. Says
   *  where the feet are drawn and the cards' floor: a gap under the creature as it stands now, so no card is ever over it
   *  while it eases back for one. */
  step(): { zoom: number; lookY: number | undefined; moving: boolean } | null {
    const ask = this.frame.request, pose = this.host.mood() === "working" ? "working" : "idle";
    if (ask && (!this.to || pose !== this.pose)) { this.pose = pose; this.solve(); }
    if (!ask || !this.to) return null;
    const v = this.view(ask.phone), to = this.to;
    if (this.held) this.cap = { lift: to.lift, zk: to.zk };
    else if (this.cap.lift !== to.lift || this.cap.zk !== to.zk) this.cap = easeFraming(this.cap, to);
    const moving = this.cap.lift !== to.lift || this.cap.zk !== to.zk;
    // everything read first (the cached box, projections), then written (the feet, the cards' floor)
    const box = this.box(), { gap } = stageBands(ask.h, ask.phone), est = moving ? this.estimate(v, this.cap) : null;
    const feet = this.footAt(v, this.cap, box.h) + box.dy, low = est ? this.lowNow(v, est) : to.low, reach = Math.max(0, (to.reach ?? to.low) - to.low);
    this.frame.feet(feet);
    this.frame.edge({ floor: low + gap, floorAny: low + reach + gap });
    return { ...this.camera(v, this.cap), moving };
  }

  /** Forgets the framing solved (the canvas changed shape, or the creature's room did): solved again when next asked. */
  invalidate() {
    this.key = ""; this.phone = null; this.solved.clear(); this.boxed = null;
    for (const j of this.jobs) j.steps.return(undefined as unknown as FrameTarget);
    this.jobs = [];
    this.solve();
  }
}

/** How long the first framing is solved for at once, on the pixels, before an estimate stands in for it. */
const FIRST_BUDGET_MS = 600;
/** How far a moving creature reaches below its key pose, a share of its drawn height (the rig's breathing, and its
 *  squash with the voice: 0.045 at full voice against 0.027 in the key pose). */
const MOTION_ROOM = 0.01;
/** Care around the projected bounds (px): the estimate errs on the side of a larger creature. */
const ESTIMATE_MARGIN = 3;
