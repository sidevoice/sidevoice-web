/* The stage's framing, as the design reference frames it (reference/2026-11-04/src/creator.js fitFrame, capCentre; T21,
 * T24d, T28, T33, T43), and the channel between the stage's voice text and the creature drawn under it.
 *
 * The creature stands in one place whatever is said: its drawn middle (from the highest drawn row, a hat or the cogs
 * included, to the lowest, its shadow included) at the tile's optical centre, OPTIC from the top, the same on every turn.
 * It steps back (smaller: the camera's distance times `zk`) only when the largest card of either turn would not fit under
 * or over it. Where the card needs a step back with it at the optical centre, it rises off the centre instead whenever that lets it
 * stand larger (the least step at which it clears the card and keeps all it acts out on the tile: the largest creature that stands
 * between the tile's top and the card), as near the centre as that allows; so its size follows the tile's height without a jump where
 * the centre starts to hold the card at the furthest step, and in a tile too short for the card at the centre at any step it is this
 * one. A card keeps a gap to it, always: max(14px, 3.5% of the tile's height). The creature is as large at rest (idle,
 * working, present: nothing said) as during a turn, whenever no card needs it to step back; a phone keeps one framing for
 * all. Framing changes ease at FRAME_EASE a frame.
 *
 * What is drawn is measured on the pixels (`FrameProbe`, the creature host renders a trial framing and reads its rows):
 * seen from above, a body's front bulge, its ink and its shadow come lower than its centre's foot, and a hat higher than
 * its head. This file is the arithmetic and the channel only; it draws nothing. */

/** Where the creature's drawn middle sits: a little over the tile's middle, where a centred thing looks centred (T28). */
export const OPTIC = 0.46;
/** The headroom kept over the creature, a share of its drawn height: the marks the moods draw over the head (the "!", the
 *  rain cloud). */
export const TURN_HEAD = 1 / 3;
/** How far the framing moves toward its target each frame drawn. */
export const FRAME_EASE = 0.22;
/** The furthest step back the solver tries, and its step. */
const ZK_MAX = 3.4, ZK_STEP = 0.08;

/** The creature's drawn rows at a trial framing, in css px of the tile from its top: the lowest within the cards'
 *  columns (`low`), the highest anywhere (`top`), the lowest anywhere (`lowAny`). */
export interface Rows { low: number; top: number; lowAny: number }

/** What the solver asks of the creature: its rows drawn at a lift and a step back, and how many px a unit of lift moves
 *  its feet up the tile at a step back (from the projection: no render). */
export interface FrameProbe {
  rows(lift: number, zk: number, xa: number, xb: number): Rows;
  slope(zk: number): number;
  /** How far up and down the tile everything the creature can act out reaches at a framing (css px from the tile's top): what is
   *  kept inside the tile, above the cards' concerns. None: only the pose's rows are kept in. */
  reachRows?(lift: number, zk: number): { top: number; bottom: number };
}

/** A framing: the camera's lift (it looks lower by this much) and step back. */
export interface Framing { lift: number; zk: number }

/** The framing solved, and where the creature then stands: its lowest drawn row within the cards' columns, its highest,
 *  and the headroom kept over it. */
export interface FrameTarget extends Framing { low: number; top: number; head: number;
  /** The lowest drawn row of every pose the creature may take while a turn's card shows (resting or working while what the
   *  person sent still shows), where it is lower than `low`. */
  reach?: number }

/** The tile's bands for a tile `vh` tall: what the cards may use (from `ceil` down to `floor`) and the gap kept to the
 *  creature. A phone keeps room for the name over the tile's top and the badge and the transcript's button at its foot. */
export function stageBands(vh: number, phone: boolean): { floor: number; ceil: number; gap: number } {
  return { floor: vh - (phone ? 58 : 10), ceil: phone ? 70 : 10, gap: Math.max(14, vh * 0.035) };
}

/** The most of a tile's height the card the creature steps back for may take (the agent's: three lines, always). A tile too short for
 *  it at the type's floor (a phone on its side: 186 px of tile, a card of 102) takes the type down instead, so the creature keeps the
 *  rest of the tile. */
const CARD_SHARE = 0.42;
/** The least either type steps down to for it (px): the agent's, and the person's, which goes down with it in the proportion they have at
 *  the floors until it is there. */
const TYPE_LEAST = 12;

/** The agent's card's height for a line `line` px tall (stage-voice.css, .vcap.card.agent): its three lines, the padding over and
 *  under them (.275 of a line and 5.5px each) and the border. What the person sent is as tall for its own line (3.55 lines and 13px
 *  too: its first line's room above and the padding add up the same). */
export const cardHeight = (line: number) => 3.55 * line + 13;

/** The voice text's unit and type, sized by the tile (the product's stage text, call-view.css, as the reference sizes
 *  it): u = min(w/900, h/600); the agent's words clamp(25.6u, 18, 34), the person's clamp(22.4u, 16, 28), each line on
 *  whole pixels. Where the agent's card would take more than CARD_SHARE of the tile's height at those floors (a tile under
 *  about 242 px tall, whatever the device), both step down from them together to the type whose card does not, and neither lower
 *  than TYPE_LEAST. */
export function voiceType(w: number, h: number) {
  const u = Math.min(w / 900, h / 600), clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  let agent = clamp(25.6 * u, 18, 34), person = clamp(22.4 * u, 16, 28);
  if (cardHeight(Math.round(agent * 1.375)) > CARD_SHARE * h) {
    const line = Math.floor((CARD_SHARE * h - 13) / 3.55 + 1e-9), fit = Math.min(agent, Math.max(TYPE_LEAST, line / 1.375));
    person = Math.min(person, Math.max(TYPE_LEAST, (person * fit) / agent));
    agent = fit;
  }
  return { u, agent, agentLine: Math.round(agent * 1.375), person, personLine: Math.round(person * 1.4286) };
}

/** The framing that stands the creature's drawn middle at the optical centre, stepped back from `zk0` (1, or more where the tile
 *  is too narrow for the creature at 1: StageFramer.floorZk) only as far as the cards need: `hBot` px under it (the largest card below, its gap counted once), `hTop` over it, within `ceil`..`floor`
 *  of a tile `vh` tall; `xa`..`xb` the cards' columns (the creature's lowest row is taken there). Where no step back fits
 *  at the centre, it rises off it: its lowest row a gap over the card below at its largest (T33).
 *
 *  The answer is the reference's: the first step of ZK_STEP from zk0 at which the cards fit. It is found without trying
 *  every step (each try is a few trial renders of the creature): the drawn height scales as 1/zk, so the step that fits is
 *  predicted from the first try, then confirmed (it fits, the step before it does not). */
export function capCentre(probe: FrameProbe, hTop: number, hBot: number, vh: number, ceil: number, floor: number, gap: number, xa: number, xb: number, zk0 = 1, sway = 0): FrameTarget {
  return finish(capCentreSteps(probe, hTop, hBot, vh, ceil, floor, gap, xa, xb, zk0, sway));
}

/** Runs a solver to its answer at once. */
export function finish<T>(steps: Generator<void, T>): T {
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}

/** capCentre a trial render at a time: it yields before each (a host draws them between frames, so the page never waits
 *  on all of them at once). */
export function* capCentreSteps(probe: FrameProbe, hTop: number, hBot: number, vh: number, ceil: number, floor: number, gap: number, xa: number, xb: number, zk0 = 1, sway = 0): Generator<void, FrameTarget> {
  // `sway`: the share of its drawn height a creature that is not held still moves below its key pose (breathing, squash with the
  // voice). The cards' gap is kept to the lowest it goes, so the room is kept under it besides the gap, on what is below it.
  const swayRoom = (low: number, top: number) => sway * Math.max(0, low - top);
  const headK = TURN_HEAD, want = vh * OPTIC, mid = (m: Rows) => (m.top + m.lowAny) / 2, last = Math.max(0, Math.floor((ZK_MAX - zk0) / ZK_STEP + 1e-6));
  const inside = (lift: number, zk: number) => { if (!probe.reachRows) return true; const r = probe.reachRows(lift, zk); return !(r.top < 0) && !(r.bottom > vh); };
  const tried = new Map<number, { f: FrameTarget; fits: boolean }>();
  const at = function* (i: number): Generator<void, { f: FrameTarget; fits: boolean }> {
    const seen = tried.get(i);
    if (seen) return seen;
    const zk = zk0 + i * ZK_STEP;
    yield;
    let lift = 0, m = probe.rows(0, zk, xa, xb);
    for (let n = 0; n < 7 && Math.abs(mid(m) - want) > 1; n++) { lift += (mid(m) - want) / probe.slope(zk); yield; m = probe.rows(lift, zk, xa, xb); }
    const head = (m.low - m.top) * headK, f = { lift, zk, low: m.low, top: m.top, head };
    // ...and everything it can act out inside the tile, whatever the cards need (a step back, if not)
    const r = { f, fits: m.low + swayRoom(m.low, m.top) + gap + hBot <= floor && m.top - head - gap - hTop >= ceil && inside(lift, zk) };
    tried.set(i, r);
    return r;
  };
  let i = 0, r = yield* at(0);
  if (!r.fits) {
    // the tallest the creature may be drawn at the centre for the cards to fit, from its height at the first try
    const h0 = r.f.low - r.f.top, room = Math.min(2 * (floor - want - gap - sway * h0 - hBot), (want - gap - hTop - ceil) / (0.5 + headK));
    const guess = room > 0 && h0 > 0 ? Math.ceil(((zk0 * h0) / room - zk0) / ZK_STEP - 1e-6) : last;
    i = Math.max(1, Math.min(last, guess));
    r = yield* at(i);
    if (r.fits) { while (i > 1 && (yield* at(i - 1)).fits) i--; r = yield* at(i); }
    else { while (i < last && !r.fits) r = yield* at(++i); }
  }
  let best = r.f;
  if (!r.fits || (i > 0 && (hBot > 0 || hTop > 0))) {
    // The centre holds the cards only at a step back (or at none): it may stand larger risen off the centre, its lowest row a gap over the
    // card at its largest, which ends on the floor. The risen creature takes the least step back at which it still keeps its head's room and a
    // gap under the tile's top, and all it acts out inside the tile (a tile as short as a phone on its side: the card, 102 px of its 186,
    // left a creature of 20 px at the furthest step, where one of 45 fits over it). So where the least risen step is nearer than the centre's
    // (the centre's own, where it is not), the creature is the larger of the two, whichever tile it is in: its size does not jump where the
    // centre starts to fit at the furthest step, and with no centre fitting at any it is the risen one. At rest, with no card to make room
    // for, the optical centre is the creature's place (T28) and it steps back only for the tile itself (the rise is then only where no step fits).
    // The creature is `h` tall (1/zk of its height at the nearest step), its lowest row at floor - hBot - gap - sway·h, and its top,
    // headroom and gap over that, so the tallest it can be drawn is what the band between the ceiling and the card leaves.
    const h0 = (tried.get(0) ?? r).f, tall = h0.low - h0.top, cap = r.fits ? i : last;
    const risen = function* (j: number, from: number): Generator<void, { lift: number; zk: number; m: Rows; ok: boolean }> {
      const zk = zk0 + j * ZK_STEP;
      yield;
      let lift = from, m = probe.rows(lift, zk, xa, xb);
      // its lowest row as near the optical centre's as the band between the ceiling and the card allows: the lowest that clears the card (the
      // risen one) where the centre is under the card's top, the highest that keeps its head's room where the centre would put it too high
      const h = m.low - m.top, lowMax = floor - hBot - gap - swayRoom(m.low, m.top), lowMin = ceil + gap + hTop + (1 + headK) * h, lowC = want + (m.low - mid(m));
      const wantLow = Math.max(lowMin <= lowMax ? Math.max(lowMin, Math.min(lowC, lowMax)) : lowMax, h);
      for (let n = 0; n < 7 && Math.abs(m.low - wantLow) > 1; n++) { lift += (m.low - wantLow) / probe.slope(zk); yield; m = probe.rows(lift, zk, xa, xb); }
      return { lift, zk, m, ok: m.top - (m.low - m.top) * headK - gap - hTop >= ceil && inside(lift, zk) };
    };
    const band = floor - hBot - 2 * gap - hTop - ceil, hMax = band / (1 + headK + sway);
    let j = hMax > 0 && tall > 0 ? Math.max(0, Math.min(cap, Math.ceil(((zk0 * tall) / hMax - zk0) / ZK_STEP - 1e-6))) : cap;
    let up = yield* risen(j, r.f.lift);
    if (up.ok) { while (j > 0) { const nearer = yield* risen(j - 1, up.lift); if (!nearer.ok) break; up = nearer; j--; } }
    else { while (j < cap && !up.ok) up = yield* risen(++j, up.lift); }
    if (!r.fits || (up.ok && j < i)) {
      // ... but never out of the tile: its top stays on it (a tile too short for a card and the creature both, as a phone on
      // its side: the card then waits, unseen, rather than cover it: StageVoice)
      const zk = up.zk, lift = up.lift;
      let m = up.m;
      best = { lift, zk, low: m.low, top: m.top, head: (m.low - m.top) * headK };
      // What it acts out stays on the tile too, both ends (the card then waits, unseen): where it is taller than the tile, stepped back
      // until it is not; then its lift kept between what keeps its top on the tile and what keeps its foot on it, as near the cards'
      // as that allows. A larger lift raises it: its rows go up the tile.
      const reach = probe.reachRows;
      if (reach) {
        let z = zk, rr = reach(best.lift, z);
        for (let n = 0; n < 60 && rr.bottom - rr.top > vh; n++) { z += ZK_STEP; rr = reach(best.lift, z); }
        if (rr.top < 0 || rr.bottom > vh || z !== zk) {
          const bound = (ok: (L: number) => boolean, from: number, towards: number) => { let a = from, b = towards; for (let n = 0; n < 40; n++) { const L = (a + b) / 2; if (ok(L)) a = L; else b = L; } return a; };
          // the highest lift that keeps its top on the tile, the lowest that keeps its foot on it
          const topOk = (L: number) => !(reach(L, z).top < 0), footOk = (L: number) => !(reach(L, z).bottom > vh);
          const hiL = topOk(best.lift) ? bound(topOk, best.lift, best.lift + 8) : bound(topOk, best.lift - 8, best.lift);
          const loL = footOk(best.lift) ? bound(footOk, best.lift, best.lift - 8) : bound(footOk, best.lift + 8, best.lift);
          const L = Math.min(hiL, Math.max(loL, best.lift));
          yield;
          m = probe.rows(L, z, xa, xb);
          best = { lift: L, zk: z, low: m.low, top: m.top, head: (m.low - m.top) / 3 };
        }
      }
    }
  }
  return best;
}

/** One frame's move of the framing toward its target: FRAME_EASE of the way, landing once within 1e-3. */
export function easeFraming(now: Framing, to: Framing): Framing {
  const e = (a: number, b: number) => (Math.abs(b - a) < 1e-3 ? b : a + (b - a) * FRAME_EASE);
  return { lift: e(now.lift, to.lift), zk: e(now.zk, to.zk) };
}

/** The cards a turn can put under and over the creature, at their largest, measured on the tile (css px): the agent's
 *  card (always three lines tall) and the person's (the icon pill, or what was sent, three lines at most), their columns
 *  (`xa`..`xb`, the agent's card: the widest), all under the creature. */
export interface FrameCards { below: number; above: number; xa: number; xb: number }

/** What the stage asks of the framing: the tile's inner size, where the creature's canvas sits in it (`dx`, `dy`: its
 *  top left corner, css px from the tile's inner top left: the scene it is drawn in may overhang the tile's border),
 *  whether it is a phone, whether nothing is said (a desktop then needs no cards measured), and the cards measured (none yet:
 *  the turn's framing waits for them). Everything the stage reads back is in the tile's inner px too. */
export interface FrameAsk { w: number; h: number; dx: number; dy: number; phone: boolean;
  /** Whether the device is a desktop's (a fine pointer, or the desktop app's window), not a handset: a phone on its side asks
   *  `phone: false` (its framing has no landscape) but is not a desktop, and keeps a phone's fill. */
  desktop: boolean; rest: boolean; cards: FrameCards | null;
  /** Whose turn the agent's state says it is (the pose a turn opened by it is fitted on); null: none (a card up while it works). */
  opener: "listening" | "speaking" | null }

/** Whether the device is a desktop's, for what the creature is drawn with (FrameAsk.desktop): never a handset (the layout's phone
 *  rule, in whatever orientation), and the desktop app's own window, or a fine pointer with no coarse one present anywhere
 *  (`anyCoarse`: any-pointer: coarse). A phone with a mouse matches (pointer: fine) but has a touch screen, so it is not a desktop;
 *  neither is a touch laptop in a browser (it keeps the phone's fill, and the Governor judges it from there). A touch screen too
 *  wide for the phone rule (a phone's landscape past 900 px) is neither, so it keeps a phone's fill. */
export function desktopDevice({ handset, finePointer, anyCoarse, app }: { handset: boolean; finePointer: boolean; anyCoarse: boolean; app: boolean }): boolean {
  return !handset && (app || (finePointer && !anyCoarse));
}

/** What the stage reads back: the framing's target, where it puts the cards (`below`: the top of a card under the
 *  creature), and where the creature's feet are drawn now (eased), css px from the tile's top. */
export interface FrameSolved { target: FrameTarget; gap: number; below: number; above: number; key: string;
  /** Where a card goes that may show while the agent leaves the turn's state (what the person sent): under the lowest of
   *  its poses. */
  belowAny: number }

/** A framing change as it will play, said once when it starts: from `t0` (performance.now), every `step` ms, the cards'
 *  floor (a gap under the creature's lowest drawn row as it eases, css px of the tile) and where its feet are drawn; the
 *  last of each where it settles. One of each: taken at once. The stage plays it as composited animations, writing nothing
 *  a frame. */
export interface FrameMotion { t0: number; step: number; floor: number[]; feet: number[] }

/** The stage's framing channel: the stage says what it shows (FrameAsk); the creature host, which can draw trial framings,
 *  solves it and says where the cards go (FrameSolved) and where its feet are drawn. One per stage tile. */
export class StageFrame {
  private asked: FrameAsk | null = null;
  private solved: FrameSolved | null = null;
  /** What the stage reads: the answer, and whether its latest ask is still being solved (the answer is the last one). */
  private snap: { solved: FrameSolved | null; pending: boolean } = { solved: null, pending: false };
  private feetAt: number | null = null;
  private motionAt: FrameMotion | null = null;
  private onMotion = new Set<(motion: FrameMotion | null) => void>();
  private onAsk = new Set<() => void>();
  private onSolved = new Set<() => void>();
  private onFeet = new Set<(feet: number | null) => void>();

  /** The stage's ask, from the DOM side; the host is told when it changed. */
  ask(next: FrameAsk) {
    const was = this.asked;
    if (was && was.w === next.w && was.h === next.h && was.dx === next.dx && was.dy === next.dy && was.phone === next.phone && was.desktop === next.desktop && was.rest === next.rest
      && was.opener === next.opener && sameCards(was.cards, next.cards)) return;
    this.asked = next;
    for (const fn of this.onAsk) fn();
  }
  get request(): FrameAsk | null { return this.asked; }
  /** The host listens for asks. */
  listen(fn: () => void): () => void { this.onAsk.add(fn); return () => { this.onAsk.delete(fn); }; }

  /** The host's answer. */
  /** The host's answer; `pending`: an estimate, its pixel solve still to come. */
  solve(next: FrameSolved | null, pending = false) {
    const same = next === this.solved || (!!next && !!this.solved && next.key === this.solved.key && next.below === this.solved.below && next.above === this.solved.above && next.belowAny === this.solved.belowAny);
    if (same && this.snap.pending === pending) return;
    this.solved = next;
    this.snap = { solved: next, pending };
    for (const fn of this.onSolved) fn();
  }
  /** The host is solving the latest ask: the answer stands until it has. */
  working() {
    if (this.snap.pending) return;
    this.snap = { ...this.snap, pending: true };
    for (const fn of this.onSolved) fn();
  }
  get answer(): FrameSolved | null { return this.solved; }
  /** For useSyncExternalStore: the cards' place changes. */
  subscribe = (fn: () => void): (() => void) => { this.onSolved.add(fn); return () => { this.onSolved.delete(fn); }; };
  snapshot = (): { solved: FrameSolved | null; pending: boolean } => this.snap;

  /** Where the creature's feet are drawn now, css px from the tile's top (null: none drawn, the poster). */
  feet(next: number | null) {
    if (next === this.feetAt || (next != null && this.feetAt != null && Math.abs(next - this.feetAt) < 0.25)) return;
    this.feetAt = next;
    for (const fn of this.onFeet) fn(next);
  }
  watchFeet(fn: (feet: number | null) => void): () => void { this.onFeet.add(fn); fn(this.feetAt); return () => { this.onFeet.delete(fn); }; }

  /** A framing change starting (null: no creature drawn, the poster): how the cards' floor and the feet will move. */
  motion(next: FrameMotion | null) {
    this.motionAt = next;
    for (const fn of this.onMotion) fn(next);
  }
  watchMotion(fn: (motion: FrameMotion | null) => void): () => void { this.onMotion.add(fn); fn(this.motionAt); return () => { this.onMotion.delete(fn); }; }
}

function sameCards(a: FrameCards | null, b: FrameCards | null) {
  return a === b || (!!a && !!b && a.below === b.below && a.above === b.above && a.xa === b.xa && a.xb === b.xb);
}
