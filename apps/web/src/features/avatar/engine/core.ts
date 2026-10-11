/* What every style shares: the seed (the conversation's identity, hashed exactly like sidevoice-web's avatar-spec),
 * a seeded random stream per seed, and the contract a style fulfils. A style draws once per seed and size; how it
 * moves is CSS keyed on the root's `data-mood`, `data-size` and `data-beat`, like the web's avatar. */

export type Mood = "idle" | "speaking" | "listening" | "working" | "waiting";
export type Size = "stage" | "sidebar" | "rail";

/** FNV-1a + Murmur3 finish: the same hash as sidevoice-web's avatar-spec.ts. */
export function hash(text: string) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

export interface Rng {
  /** 0 ≤ n < 1 */
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(options: readonly T[]): T;
  chance(p: number): boolean;
}

/** mulberry32 over the seed's hash, salted per part so adding a part never shifts another. */
export function rng(seed: string, part = ""): Rng {
  let state = hash(seed + "\u0000" + part);
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (options) => options[Math.floor(next() * options.length)],
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
