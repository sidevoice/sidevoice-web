/* What TypeScript reads of backdrops.js: the port is plain JavaScript, kept diffable line by line against the design
 * reference, so its surface is declared here, as far as the app uses it. */

/** How the offline poster hangs on a backdrop: a scene's own mount (a post, a lamp post, balloons, an anchor's rope, a
 *  candy cane), one tack on a wall or a plain ground, one nail in the forest's trunk, standing on a floor, or floating in
 *  space. */
export type Hang = "mount" | "pin" | "nail" | "lean" | "float";

/** A backdrop's own poster place, in frame units (800 × 440): its centre's x and its top and bottom. */
export interface PosterSpot { cx: number; top: number; bottom: number }

export interface Backdrop {
  label: string;
  kind: "plain" | "scene";
  /** Skips the soft vignette (the tone tint stays exactly as it was). */
  flat?: boolean;
  hang?: Hang;
  poster?: PosterSpot;
}

/** The catalogue, in the product's order (the seeded pick depends on it). */
export const BACKDROPS: Record<string, Backdrop>;

/** The seed's backdrop: a quarter keep the tone tint, the rest roll any other one. `rand`: the seed's stream, 0 ≤ x < 1. */
export function backdropFromSeed(rand: () => number): string;

/** The scene's frame on a W × H tile: its scale, and where its origin lands. `feet`: the creature's feet, px from the
 *  tile's top (the frame's ground line, y 357, sits on them); none: the frame is pinned to the tile's bottom. */
export function frameOf(W: number, H: number, feet?: number | null): { s: number; tx: number; ty: number };

/** How the poster hangs on backdrop `id` (an unknown one: pinned). */
export function hangOf(id: string): Hang;

/** The poster's box on the tile, in px, unrotated: what its mount is drawn for. */
export interface PosterBox { cx: number; top: number; bottom: number; half: number }

export interface BackdropOptions {
  /** The creature's colour (the tone tint). */
  tone?: string;
  dark?: boolean;
  /** The creature's feet, px from the tile's top. */
  feet?: number | null;
  /** Offline: the poster's box; the scene's mount is drawn for it, under the vignette. */
  poster?: PosterBox;
  /** The moving mounts' clock (the clouds' balloons), seconds. */
  t?: number;
}

/** Draws backdrop `id` over a W × H tile (an unknown id: the tone tint). */
export function drawBackdrop(g: CanvasRenderingContext2D, W: number, H: number, id: string, o?: BackdropOptions): void;
