/* What a frame of the stage's creature may cost, and how the stage gives ground, a step at a time, when it costs more.
 *
 * A phone has a fixed fill rate and a thread shared with the page's layout and input; the stage's creature is drawn by
 * WebGL, whose work (the pixels it fills, the shadow map it renders first) is what a cheap phone cannot keep up with. So
 *  - the canvas holds the pixels the tile shows (sceneSize), no more, within the stage's own 900 k px render;
 *  - a Governor watches what the frames cost and when they arrive, and steps down the resolution the creature is drawn at
 *    (TIERS), then the frame rate, until the frames hold; it steps back up when there is room and it did not just fail there.
 * Pure: the host (host.ts) feeds it and applies what it says. */

/** The canvas's height at most, as the creator's preview (960 px tall). */
export const SCENE_MAX_H = 960;
/** The canvas's area at most (px): what the stage's own 1152 × 768 render held, so no tile is drawn at more fill than before. */
export const SCENE_MAX_AREA = 900_000;
/** The canvas's height at least (px): below this the creature's outline and face would smear. SCENE_MAX_AREA wins over it, for
 *  a tile so wide and short (past about 11:1) that its area cap is lower still. */
export const SCENE_MIN_H = 288;
/** The pixel ratio the stage draws for at most: past 2 the eye cannot tell, and the fill triples. */
export const MAX_DPR = 2;

/** The canvas's size for a tile `cssW` × `cssH` (css px) on a screen of pixel ratio `dpr`, at `scale` of its full resolution
 *  (the governor's): as many device pixels as the tile shows, within SCENE_MAX_H and SCENE_MIN_H, and never over SCENE_MAX_AREA
 *  (that ceiling is the fill the stage was sized for: the minimum height gives way to it). A tile with no box yet is 3:2. */
export function sceneSize(cssW: number, cssH: number, dpr: number, scale = 1): { width: number; height: number } {
  const ar = cssW > 0 && cssH > 0 ? cssW / cssH : 1.5;
  const fits = Math.max(1, Math.floor(Math.sqrt(SCENE_MAX_AREA / ar))); // the tallest this shape may be within the area
  let h = cssH > 0 ? cssH * Math.min(Math.max(dpr, 1), MAX_DPR) : 768;
  h = Math.min(SCENE_MAX_H, h, fits);
  h = Math.min(fits, Math.max(SCENE_MIN_H, Math.round(h * scale)));
  // (whole pixels: the width is rounded down where rounding it to the shape would pass the ceiling by a few)
  return { width: Math.max(1, Math.min(Math.round(h * ar), Math.floor(SCENE_MAX_AREA / h))), height: h };
}

/** A rung of the ladder: the share of the full resolution the creature is drawn at, and the frames a second it is drawn at. */
export interface Tier { scale: number; fps: number }
/** From the full look down to the least that still reads: resolution first (the same drawing, softer), then the rate. The
 *  rates are what a 60 Hz screen shows evenly: every 2nd, 3rd or 4th refresh. */
export const TIERS: readonly Tier[] = [
  { scale: 1, fps: 30 },
  { scale: 0.85, fps: 30 },
  { scale: 0.72, fps: 30 },
  { scale: 0.6, fps: 30 },
  { scale: 0.6, fps: 20 },
  { scale: 0.5, fps: 20 },
  { scale: 0.5, fps: 15 },
];

/** What a frame may cost the thread (ms) at 30 fps: the creature's share of that frame, so layout, input and the cards keep
 *  the rest. At a lower rate the same share of the thread allows a dearer frame (limit). */
export const BUDGET_MS = 8;
/** A frame that came this much later than asked for counts as late (the GPU or the thread was behind). */
const LATE = 1.4;
/** A gap this long is a pause (the loop slept: nothing moved, a tab came back), not a slow frame. */
const PAUSE_MS = 400;
const OVER_FRAMES = 8;
/** After a change the frames are not judged for this long: the new size, the first draw of a shadow map, a program compiling. */
const SETTLE_MS = 1200;
/** Room (cost under this share of the budget, nothing late) for this long before it steps back up, doubled each time a step up failed. */
const CALM_MS = 8000, CALM_MAX_MS = 64_000;

export class Governor {
  private index = 0;
  private cost = 0;
  private late = 1;
  private over = 0;
  private since = -Infinity;
  private calm = CALM_MS;
  private calmFrom = -Infinity;
  private upAt = -Infinity;
  private pinned: number | null = null;

  constructor(private tiers: readonly Tier[] = TIERS, private budget = BUDGET_MS) {}

  get tier(): number { return this.pinned ?? this.index; }
  get scale(): number { return this.tiers[this.tier].scale; }
  /** What a frame may cost on rung `index` (ms): the budget's share of the thread, at that rung's rate. */
  private limit(index: number): number { return this.budget * 30 / this.tiers[index].fps; }
  /** The frames' spacing now (ms). On the last rung, a frame that still costs more than a sixth of the thread's time is spaced
   *  out until it does not (to 500 ms): a renderer with no GPU gets a slow creature, not a frozen page. */
  get every(): number {
    const base = 1000 / this.tiers[this.tier].fps;
    return this.tier === this.tiers.length - 1 && this.cost > this.limit(this.tier) ? Math.min(500, Math.max(base, this.cost * 6)) : base;
  }

  /** Fixed at a rung (diagnostics, tests); null lets it judge again. Whether the rung changed. */
  pin(tier: number | null): boolean {
    const before = this.tier;
    this.pinned = tier == null ? null : Math.max(0, Math.min(this.tiers.length - 1, tier));
    if (tier == null) { this.over = 0; this.cost = 0; this.late = 1; this.since = -Infinity; this.calmFrom = -Infinity; }
    return this.tier !== before;
  }

  /** Starts on this rung (a phone's, from what the device says of itself); no judging for a moment. */
  start(tier: number, now: number) { this.index = Math.max(0, Math.min(this.tiers.length - 1, tier)); this.since = now; }

  /** A frame was drawn at `now` (ms): it cost the thread `took`, and came `gap` after the last one drawn, asked for `every`
   *  after it. Whether the rung changed (the host sizes the canvas and the shadow map to it). */
  observe(now: number, took: number, gap: number): boolean {
    if (this.pinned != null) return false;
    if (now - this.since < SETTLE_MS) return false;
    if (gap > PAUSE_MS) { this.calmFrom = now; return false; } // came back from a pause: this frame says nothing
    this.cost = this.cost ? this.cost * 0.8 + took * 0.2 : took;
    this.late = this.late * 0.8 + Math.min(4, gap / this.every) * 0.2;
    const behind = this.cost > this.limit(this.index) || this.late > LATE;
    if (behind) {
      this.calmFrom = now;
      // Down after a few frames in a row: one slow frame (a program compiling, a garbage collection) is not the device.
      if (++this.over >= OVER_FRAMES && this.index < this.tiers.length - 1) {
        // Failing within a moment of going up: wait longer before trying again.
        if (now - this.upAt < this.calm) this.calm = Math.min(CALM_MAX_MS, this.calm * 2);
        return this.move(this.index + 1, now);
      }
      return false;
    }
    this.over = 0;
    if (this.calmFrom === -Infinity) this.calmFrom = now;
    if (this.index > 0 && this.cost < this.limit(this.index - 1) * 0.4 && this.late < 1.1 && now - this.calmFrom > this.calm) {
      this.upAt = now;
      return this.move(this.index - 1, now);
    }
    return false;
  }

  private move(index: number, now: number): boolean {
    this.index = index; this.since = now; this.calmFrom = now; this.over = 0; this.cost = 0; this.late = 1;
    return true;
  }
}
