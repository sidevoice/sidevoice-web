/* What every style shares: the seed (the conversation's identity), a seeded random stream per decision, and the contract a style fulfils. A style draws once per seed and size; how it
 * moves is CSS keyed on the root's `data-mood`, `data-size` and `data-beat`, like the web's avatar. */

export type Mood = "idle" | "speaking" | "listening" | "working" | "waiting";
export type Size = "stage" | "sidebar" | "rail";

import { sha256 } from "@noble/hashes/sha2.js";

/** The generator's version: part of every stream's key, so a new one rolls every identity afresh. */
export const GENERATOR_VERSION = "avatar-v5";

export interface Rng {
  /** 0 ≤ n < 1 */
  next(): number;
  /** The next 32 random bits. */
  uint32(): number;
  /** An integer in [0, bound), by rejection sampling: no modulo bias. */
  below(bound: number): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(options: readonly T[]): T;
  chance(p: number): boolean;
}

const MASK64 = (1n << 64n) - 1n;
const PCG_MULT = 6364136223846793005n;
const u64le = (bytes: Uint8Array, at: number) => {
  let v = 0n;
  for (let i = 7; i >= 0; i -= 1) v = (v << 8n) | BigInt(bytes[at + i]);
  return v;
};

/** PCG32 (XSH RR, 64-bit state, 63-bit stream), initialised and stepped exactly as the reference `pcg32_srandom_r`
 * and `pcg32_random_r`, in BigInt so no 64-bit value passes through a double. */
export function pcg32(initState: bigint, initSequence: bigint): () => number {
  let inc = ((initSequence << 1n) | 1n) & MASK64;
  let state = 0n;
  const step = () => { const old = state; state = (old * PCG_MULT + inc) & MASK64; return old; };
  step();
  state = (state + initState) & MASK64;
  step();
  return () => {
    const old = step();
    const xorshifted = Number((((old >> 18n) ^ old) >> 27n) & 0xffffffffn);
    const rot = Number(old >> 59n);
    return ((xorshifted >>> rot) | (xorshifted << (-rot & 31))) >>> 0;
  };
}

/** The stream of one decision of one identity: SHA-256 of the whole versioned tuple (never a 32-bit digest of the
 * identity first, so two identities cannot share a state), its first 8 bytes the PCG32 state, the next 8 its sequence. */
export function rng(seed: string, part = ""): Rng {
  const digest = sha256(new TextEncoder().encode(JSON.stringify([GENERATOR_VERSION, seed, part])));
  const uint32 = pcg32(u64le(digest, 0), u64le(digest, 8));
  const next = () => uint32() / 4294967296;
  const below = (bound: number) => {
    if (bound <= 1) return 0;
    const limit = 4294967296 - (4294967296 % bound);
    let x = uint32();
    while (x >= limit) x = uint32();
    return x % bound;
  };
  return {
    next,
    uint32,
    below,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + below(max - min + 1),
    pick: (options) => options[below(options.length)],
    chance: (p) => next() < p,
  };
}

export interface Drawn {
  /** The avatar's inner markup (an <svg> or a canvas-free DOM fragment). */
  html: string;
  /** Shown under the cell: what this seed rolled. */
  traits: string;
  /** The seed's main colour, which the stage tile behind it is tinted with. */
  tone: string;
}

export interface AvatarStyle {
  id: string;
  name: string;
  /** One line: the style's personality. */
  blurb: string;
  draw(seed: string, size: Size): Drawn;
  /** Fixed rows shown before the lab's own seeds (e.g. the harness mascots). */
  extraRows?: { label: string; seeds: string[] }[];
  /** Scoped under `.av[data-style=<id>]`. */
  css: string;
}

/** Numbers in markup: two decimals, no trailing noise. */
export const n = (value: number) => Math.round(value * 100) / 100;

/** A closed, wobbly loop through `points` (Catmull-Rom → cubic Bézier). */
export function smoothLoop(points: [number, number][]): string {
  const p = points;
  const len = p.length;
  let d = `M${n(p[0][0])} ${n(p[0][1])}`;
  for (let i = 0; i < len; i += 1) {
    const p0 = p[(i - 1 + len) % len], p1 = p[i], p2 = p[(i + 1) % len], p3 = p[(i + 2) % len];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return d + "Z";
}

/** A blob: `count` points around (cx, cy) with radii rx, ry, each pushed in or out by up to `wobble`. */
export function blob(r: Rng, cx: number, cy: number, rx: number, ry: number, count: number, wobble: number, squashBottom = 0): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const k = 1 + r.range(-wobble, wobble);
    let y = cy + Math.sin(a) * ry * k;
    if (squashBottom && Math.sin(a) > 0) y = cy + Math.sin(a) * ry * k * (1 - squashBottom);
    pts.push([cx + Math.cos(a) * rx * k, y]);
  }
  return smoothLoop(pts);
}

/** HSL → hex, for palettes rolled from a seed. */
export function hsl(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (m: number) => (m + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (m: number) => l - a * Math.max(-1, Math.min(k(m) - 3, Math.min(9 - k(m), 1)));
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/** A unique-per-instance id prefix, so filters and gradients of two avatars on one page never collide. */
let counter = 0;
export const uid = (prefix: string) => `${prefix}${(counter += 1).toString(36)}`;
