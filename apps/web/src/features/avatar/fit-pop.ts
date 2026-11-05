import type { FaceBox } from "./creature/host";

/* How a creature stands in its card's square when it pops out of it (the state-colours demo's fitAll). Everything is a
 * fraction of the square's side, so it holds for any size of square. Every creature stands on the same baseline: its feet
 * a hair above the square's foot, never lifted. What differs is its size, worked out from the extent of what is drawn
 * (FaceBox: hats, ears and floor shadow included):
 *   - its natural height is 120% of the square, which puts its head above the square's top by 10% and more;
 *   - never wider than 110%, never taller than 150% (the extent holds the hat, so the natural height is the one that rules): a short, wide creature stops growing at the width cap, even where its
 *     head then pops out by less than that (the cap wins; the baseline never moves, and it never grows past the card's title).
 * It is centred on the square. */
export interface PopFit {
  /** Of the face's whole square render (FACE_PX), as the canvas is drawn: its size, and where it sits in the square. */
  width: number;
  height: number;
  left: number;
  bottom: number;
}

const MAX_W = 1.1, MAX_H = 1.5, BASE_H = 1.2;
/** The feet's distance above the square's foot: 2px of a 56px square. */
const FOOT = 2 / 56;

export function popFit(box: FaceBox): PopFit {
  const ch = box.b - box.t + 1, cw = box.r - box.l + 1;
  const k = Math.min(BASE_H / ch, MAX_W / cw, MAX_H / ch);
  // The render's transparent margin below the feet, scaled, is what the feet stand above the render's own foot.
  const below = (box.h - 1 - box.b) * k;
  return { width: box.w * k, height: box.h * k, left: 0.5 - ((box.l + box.r) / 2) * k, bottom: FOOT - below };
}
