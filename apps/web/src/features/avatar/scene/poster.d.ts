/* What TypeScript reads of poster.js: the port is plain JavaScript, kept diffable line by line against the design
 * reference's creator, so its surface is declared here, as far as the app uses it. */
import type { Hang, PosterBox } from "./backdrops.js";

/** The creature's portrait for the poster's photo: a render, and the box its pixels fill (hats and ears included). */
export interface Portrait { img: CanvasImageSource; box: [x: number, y: number, w: number, h: number] }

/** The poster's words, in the interface's language (i18n, stage.poster.*). */
export interface PosterWords { title: string; status: string; fine: [string, string, string] }

/** Where the poster goes on the tile, and how large: its scale (art px per poster unit), its centre, and its box. */
export interface PosterPlace { pk: number; cx: number; cy: number; box: PosterBox }

export const INK: string;
/** The poster's size, in its own units, and the margin its art keeps for the drop shadow. */
export const PW: number;
export const PH: number;
export const MARGIN: number;

/** The creator's string hash (FNV-1a), and its seeded stream (mulberry32). */
export function seedNum(str: string): number;
export function rngOf(seed: number): () => number;

/** The seed a creature's paper and bounty are rolled from: its choices, joined as the creator joins them. */
export function posterSeed(choice: { body: string; color: string; accent: string; iris: string; ears: string; head: string; face: string }): string;
/** The bounty, as the creator rolls it from `seed` (posterSeed), written in `language`. */
export function posterBounty(seed: string, language: string): string;

/** Where the poster goes on a W × PX tile: centred, or where backdrop `id` places it; `feet`, the creature's feet in px. */
export function posterPlace(W: number, PX: number, id: string | null, feet: number | null | undefined): PosterPlace;
/** The poster's art, drawn once at scale `pk` (a canvas with a margin for its drop shadow). */
export function posterArt(pic: Portrait | null, pk: number, seed: string, words: PosterWords, bounty: string): HTMLCanvasElement;
/** Whether the poster moves on its own: floating in space, or under the clouds' balloons. */
export function posterMoves(id: string, hang: Hang): boolean;

export interface LayOptions {
  W: number;
  PX: number;
  id: string;
  hang: Hang;
  place: PosterPlace;
  art: CanvasImageSource;
  /** The backdrop with its mount, as drawn for the poster at rest. */
  ground: CanvasImageSource;
  /** Draws the backdrop and its mount for `box` at `t` on the tile's canvas (the clouds' balloons move with t). */
  drawBg(box: PosterBox, t: number): void;
}
/** The poster laid on the backdrop at moment `t`, seconds. */
export function layPoster(bg: CanvasRenderingContext2D, o: LayOptions, t: number): void;
