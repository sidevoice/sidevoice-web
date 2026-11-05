import { drawBackdrop, hangOf, backdropFromSeed, type PosterBox } from "./backdrops.js";
import { layPoster, posterArt, posterMoves, posterPlace, rngOf, seedNum, type LayOptions, type Portrait, type PosterWords } from "./poster.js";
import { drawFallback } from "../creature/fallback";

/* The stage's scene on its own canvas, under the creature's (creature/host.ts draws that one): the backdrop the
 * conversation's creature rolls (backdrops.js), with its ground line on the creature's feet; and while the room cannot
 * reach the agent, the wanted poster in its place, hung from what the backdrop has to hang it from (poster.js). This is
 * the design reference's creator's background canvas (reference/2026-11-04/src/creator.js: backdropName, drawBg,
 * drawPoster and its timer), drawn as it draws it: 960 px tall, as wide as the tile's shape, so the pixels are the
 * reference's whatever the tile's size on screen. The backdrops are still; the poster moves on its own only where the
 * reference moves it (it floats in space; on the clouds the balloons bob and it sways), and only where the page's drawings
 * move (lib/motion.ts). */

/** The canvas's height, as the creator's preview (and the creature's canvas). */
export const STAGE_PX = 960;
/** Where the scene's ground line stands when no framing says where the creature's feet are: y 357 of the 440 the stage
 *  scene is laid out in (styles/call.css .stage-agent; CharacterAvatar stands the creature's feet there). */
export const SCENE_GROUND = 357 / 440;

/** The backdrop a creature rolls, as the creator's backdropName: its body, colour and accent seed the pick (a quarter keep
 *  the tone tint, the rest roll any other backdrop). */
export function backdropOf(choice: { body: string; color: string; accent: string }): string {
  return backdropFromSeed(rngOf(seedNum([choice.body, choice.color, choice.accent].join("|") + "|backdrop")));
}

/** The poster, offline. */
export interface PosterInput {
  /** What its paper and bounty are rolled from (poster.js posterSeed). */
  seed: string;
  words: PosterWords;
  bounty: string;
  /** The creature's portrait (creature/host.ts posterPortrait); null: the fallback's outline in its colour. */
  portrait: Portrait | null;
  /** The creature's colour, for the fallback. */
  color: string;
}

export interface PaintInput {
  id: string;
  tone: string;
  dark: boolean;
  /** The creature's feet, as a share of the tile's height from its top. */
  feet: number;
  poster: PosterInput | null;
  /** The poster moves on its own (where the backdrop moves it); else it holds still. */
  moving: boolean;
}

/** What stands in for the portrait where no creature can be drawn: the fallback's outline (creature/fallback.ts). */
const fallbacks = new Map<string, Portrait>();
function fallbackPortrait(color: string): Portrait | null {
  const ready = fallbacks.get(color);
  if (ready) return ready;
  const img = document.createElement("canvas"); img.width = img.height = 768;
  const g = img.getContext("2d");
  if (!g) return null;
  drawFallback(g, 768, color);
  // the outline's own box: x 18–82 and its crown to its feet (fallback.ts), of 100
  const portrait: Portrait = { img, box: [138, 128, 492, 552] };
  fallbacks.set(color, portrait);
  return portrait;
}

const nowS = () => performance.now() / 1000;

/** Paints the scene into `canvas` for as long as it is kept: again whenever what it shows or the tile's shape changes. */
export class StagePainter {
  private input: PaintInput | null = null;
  private sized = "";
  private timer: ReturnType<typeof setInterval> | undefined;
  private art: { key: string; canvas: HTMLCanvasElement } | null = null;
  private off: () => void;

  constructor(private canvas: HTMLCanvasElement) {
    const box = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { if (this.fit()) this.paint(); });
    box?.observe(canvas);
    this.off = () => box?.disconnect();
  }

  set(input: PaintInput) { this.input = input; this.fit(); this.paint(); }

  /** The canvas takes its box's shape, 960 px tall (the creator's preview), so nothing is stretched; whether it changed.
   *  A canvas with no box (not laid out, or hidden) is painted once it has one (its box observer). */
  private fit(): boolean {
    const { canvas } = this, box = canvas.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return false;
    const W = Math.round(STAGE_PX * (box.width / box.height)), H = STAGE_PX, key = W + "x" + H;
    if (key === this.sized) return false;
    this.sized = key;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    return true;
  }

  private paint() {
    clearInterval(this.timer);
    this.timer = undefined;
    if (!this.input || !this.sized) return;
    const input = this.input, g = this.canvas.getContext("2d");
    if (!g) return;
    const W = this.canvas.width, H = this.canvas.height, feet = input.feet * H, { id, tone, dark } = input;
    // the creator's drawBg: the backdrop, its ground line under the creature's feet (and, for a poster, its mount)
    const drawBg = (poster?: PosterBox, t = 0) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); drawBackdrop(g, W, H, id, { tone, dark, feet, poster, t }); };
    const P = input.poster;
    if (!P) { drawBg(); return; }
    // the creator's drawPoster: the art at the size it is shown, the backdrop with its mount kept, the poster laid on it
    const hang = hangOf(id), place = posterPlace(W, H, id, feet), portrait = P.portrait ?? fallbackPortrait(P.color);
    const key = JSON.stringify([place.pk, P.seed, P.words, P.bounty, P.color, !!P.portrait]);
    if (this.art?.key !== key) this.art = { key, canvas: posterArt(portrait, place.pk, P.seed, P.words, P.bounty) };
    drawBg(place.box);
    const ground = document.createElement("canvas"); ground.width = W; ground.height = H; ground.getContext("2d")?.drawImage(this.canvas, 0, 0);
    const o: LayOptions = { W, PX: H, id, hang, place, art: this.art.canvas, ground, drawBg: (box, t) => drawBg(box, t) };
    layPoster(g, o, 0);
    // it floats in space, and on the clouds it sways under the balloons, while the page's drawings move
    // (the reference's 50 ms timer, from the moment it is drawn; nothing is drawn while nobody can see the canvas)
    if (input.moving && posterMoves(id, hang)) {
      const t0 = nowS(), shown = () => this.canvas.isConnected && this.canvas.getClientRects().length > 0;
      this.timer = setInterval(() => { if (shown()) layPoster(g, o, nowS() - t0); }, 50);
    }
  }

  dispose() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.off();
    this.input = null;
  }
}
