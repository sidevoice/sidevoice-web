import type { Rng } from "../core";
import type { Spec } from "./kit";

/* The colour of a creature (web#280, v5 of the experiment): a base from a weighted family, a harmonic scheme in OKLCH
 * for two more colours (secondary, accent), and a share-out of them over the parts. The renderer paints the base through
 * `Spec.color` and everything else through `Spec.tints` (per-slot body/belly/dark, and the global belly/dark/spot/pink/
 * gold/horn). Every colour is gamut-mapped by lowering chroma, never by clipping channels, and every exposed fill keeps
 * a contrast of at least MIN_CONTRAST against the outline ink. */

const INK_HSL: [number, number, number] = [257, 34, 12]; // #1b1428
export const MIN_CONTRAST = 3.5;

type Range = [number, number];
interface Sub { h: Range; s: Range; l: Range }
interface Accent { off: Range; w: number }
interface Family { id: string; sub: Sub[]; chroma: Range; accent: Accent[] }

const COMP: Range = [170, 190], ANA: Range = [28, 48], TONE: Range = [0, 8];

/** The base-colour families (HSL ranges, as the species had them), with the OKLCH chroma their accents may take. */
export const PALETTE_FAMILIES = [
  { id: "calidos", chroma: [0.09, 0.14], sub: [{ h: [40, 46], s: [78, 90], l: [56, 64] }, { h: [24, 30], s: [82, 92], l: [56, 62] }, { h: [6, 14], s: [75, 88], l: [62, 70] }, { h: [26, 34], s: [50, 62], l: [52, 60] }], accent: [{ off: COMP, w: 2 }, { off: ANA, w: 2 }, { off: TONE, w: 1 }] },
  { id: "tierra", chroma: [0.045, 0.095], sub: [{ h: [14, 24], s: [38, 50], l: [52, 60] }, { h: [36, 44], s: [35, 48], l: [62, 72] }, { h: [70, 85], s: [30, 42], l: [48, 58] }, { h: [100, 120], s: [28, 38], l: [46, 54] }], accent: [{ off: ANA, w: 3 }, { off: COMP, w: 1 }] },
  { id: "pasteles", chroma: [0.045, 0.1], sub: [{ h: [0, 360], s: [55, 78], l: [76, 84] }], accent: [{ off: [40, 70], w: 2 }, { off: TONE, w: 1 }] },
  { id: "joya", chroma: [0.09, 0.14], sub: [{ h: [150, 158], s: [55, 68], l: [46, 54] }, { h: [212, 222], s: [62, 75], l: [52, 60] }, { h: [275, 285], s: [45, 58], l: [56, 64] }, { h: [345, 352], s: [62, 72], l: [52, 58] }], accent: [{ off: COMP, w: 3 }, { off: ANA, w: 1 }] },
  { id: "neutros", chroma: [0.045, 0.095], sub: [{ h: [40, 50], s: [40, 60], l: [82, 88] }, { h: [30, 38], s: [25, 40], l: [70, 78] }], accent: [{ off: TONE, w: 1 }, { off: COMP, w: 1 }, { off: [20, 40], w: 1 }] },
  { id: "claros", chroma: [0.045, 0.095], sub: [{ h: [205, 225], s: [6, 12], l: [86, 92] }, { h: [30, 40], s: [5, 10], l: [88, 93] }], accent: [{ off: [150, 210], w: 1 }, { off: [30, 60], w: 1 }] },
  { id: "frescos", chroma: [0.09, 0.14], sub: [{ h: [92, 130], s: [38, 52], l: [54, 64] }, { h: [195, 212], s: [55, 68], l: [62, 72] }, { h: [170, 182], s: [40, 52], l: [48, 56] }], accent: [{ off: COMP, w: 2 }, { off: ANA, w: 1 }] },
] as const satisfies readonly Family[];

export type FamilyId = (typeof PALETTE_FAMILIES)[number]["id"];
/** A palette preference: family → weight. */
export type FamilyWeights = Partial<Record<FamilyId, number>>;

/** A body colour of its own (an element's), instead of a family's: hue as a range or a list of picks. */
export interface HslRange { hue: Range | { pick: readonly number[] }; sat: Range; light: Range; weight?: number }

/** How the creature's accent colours are laid out (weights; they sum to 100). */
export const SCHEMES = [
  { id: "analogous", w: 34 }, { id: "complementary", w: 24 }, { id: "split", w: 14 }, { id: "triadic", w: 6 }, { id: "tonal", w: 22 },
] as const;
export type SchemeId = (typeof SCHEMES)[number]["id"];

/** Which of the parts that can take the accent are there. */
export interface Present { arms: boolean; legs: boolean; tail: boolean; back: boolean; top: boolean }

export interface Palette {
  color: Spec["color"];
  tints: Record<string, string>;
  family: string;
  scheme: SchemeId;
}

/* ---------- colour maths ---------- */

type Lch = { L: number; C: number; h: number };
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const rad = (deg: number) => (deg * Math.PI) / 180;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l), f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}

function rgbToLch([r, g, b]: number[]): Lch {
  const [R, G, B] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

/** OKLCH → gamma sRGB, lowering chroma until the colour is inside the gamut. */
function lchToRgb({ L, C, h }: Lch): [number, number, number] {
  for (let k = 0; k < 40; k += 1) {
    const a = C * Math.cos(rad(h)), b = C * Math.sin(rad(h));
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    if (rgb.every((v) => v >= -0.002 && v <= 1.002)) return rgb.map((v) => toGamma(clamp(v, 0, 1))) as [number, number, number];
    C *= 0.95;
  }
  return [0.5, 0.5, 0.5];
}

const hexOf = (c: Lch) => "#" + lchToRgb(c).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
const luminance = ([r, g, b]: number[]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
const INK_LUMINANCE = luminance(hslToRgb(...INK_HSL));
const contrastOf = (rgb: number[]) => (luminance(rgb) + 0.05) / (INK_LUMINANCE + 0.05);
/** WCAG contrast of an HSL colour against the outline ink. */
export const inkContrast = (h: number, s: number, l: number) => contrastOf(hslToRgb(h, s, l));
/** Contrast against the ink of a colour as it will be painted (after gamut mapping). */
export const inkContrastLch = (c: Lch) => contrastOf(lchToRgb(c));
/** The colour as painted, lightened in steps until it keeps the ink contrast (a little over the minimum, so rounding to 8 bits cannot take it under). */
const legible = (c: Lch): Lch => { let x = rgbToLch(lchToRgb(c)); for (let i = 0; i < 40 && inkContrastLch(x) < MIN_CONTRAST + 0.05; i += 1) x = rgbToLch(lchToRgb({ ...x, L: x.L + 0.02 })); return x; };
/** The hex a colour is painted as: every tint goes through here, so every role keeps the ink contrast (checked on the rounded value). */
const hex = (c: Lch) => hexOf(legible(c));
const deltaE = (a: Lch, b: Lch) => {
  const p = (c: Lch) => [c.L, c.C * Math.cos(rad(c.h)), c.C * Math.sin(rad(c.h))];
  const [x, y] = [p(a), p(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** The secondary role: the base lightened (a slightly darker patch on a very light base), its chroma softened. */
const belly = (c: Lch, r: Rng): Lch => (c.L > 0.86 ? { L: c.L - 0.06, C: c.C * 0.8, h: c.h } : { L: Math.min(0.94, c.L + 0.08 + r.next() * 0.04), C: c.C * (0.55 + r.next() * 0.2), h: c.h });
/** Small dark details are kept light enough to read against the body. */
const dark = (c: Lch): Lch => ({ L: Math.max(0.55, c.L - 0.08), C: c.C * 0.9, h: c.h });
const between = (r: Rng, [a, b]: Range) => a + r.next() * (b - a);
const weighted = <T>(r: Rng, items: readonly T[], weight: (t: T) => number): T => {
  let x = r.next() * items.reduce((t, i) => t + weight(i), 0);
  for (const item of items) if ((x -= weight(item)) < 0) return item;
  return items[items.length - 1];
};

/* ---------- the base colour ---------- */

interface Base { family: string; hue: number; sat: number; light: number; chroma: Range }
const ELEMENT_CHROMA: Range = [0.09, 0.14];

function baseColor(r: Rng, families: FamilyWeights | undefined, elements: readonly HslRange[] | undefined): Base {
  const pool = PALETTE_FAMILIES.filter((f) => (families?.[f.id] ?? 0) > 0);
  for (let tries = 0; ; tries += 1) {
    let family = "element", chroma = ELEMENT_CHROMA, hue: number, sat: number, light: number;
    if (elements) {
      const element = weighted(r, elements, (x) => x.weight ?? 1);
      hue = "pick" in element.hue ? element.hue.pick[r.below(element.hue.pick.length)] : between(r, element.hue);
      sat = between(r, element.sat); light = between(r, element.light);
    } else {
      const f = weighted(r, pool, (x) => families![x.id]!);
      const sub = f.sub[r.below(f.sub.length)];
      family = f.id; chroma = f.chroma;
      hue = between(r, sub.h) % 360; sat = between(r, sub.s); light = between(r, sub.l);
    }
    // the body against the outline ink at 40 px; a family that cannot pass ends on its last draw
    if (inkContrast(hue, sat, light) >= MIN_CONTRAST || tries > 64) return { family, hue, sat, light, chroma };
  }
}

/** One creature's palette. `families` weights the base-colour families (or `element` gives colours of its own, by weight);
 * `present` says which parts can take the secondary and the accent. */
export function rollPalette(colour: Rng, roles: Rng, o: { families?: FamilyWeights; element?: readonly HslRange[]; present: Present }): Palette {
  const b = baseColor(colour, o.families, o.element);
  const scheme = weighted(colour, SCHEMES, (x) => x.w).id;
  const base = rgbToLch(hslToRgb(b.hue, b.sat, b.light)), toward = base.L > 0.72 ? -1 : 1;
  const tonal = scheme === "tonal", sign = roles.next() < 0.5 ? -1 : 1;
  const u = (a: number, z: number) => a + colour.next() * (z - a);
  // keeps an accent clear of the body in lightness or colour
  const apart = (c: Lch): Lch => { let x = c; for (let i = 0; i < 8 && Math.abs(x.L - base.L) < 0.1 && deltaE(x, base) < 0.16; i += 1) x = { ...x, L: clamp(x.L + toward * 0.04, 0.5, 0.92) }; return x; };
  let h1: number, h2: number, c2 = 1;
  if (scheme === "analogous") { h1 = base.h + sign * u(25, 35); h2 = h1 + sign * u(0, 15); }
  else if (scheme === "complementary") { h1 = base.h + u(175, 185); h2 = h1; }
  else if (scheme === "split") { h1 = base.h + u(150, 160); h2 = base.h + u(200, 210); }
  else if (scheme === "triadic") { h1 = base.h + 120; h2 = base.h + 240; c2 = 0.75; }
  else { h1 = base.h + u(-8, 8); h2 = base.h + u(-8, 8); }
  const vivid = clamp(base.C * 1.05, 0.1, 0.17);
  const C1 = tonal ? base.C * u(0.7, 0.9) : vivid * u(0.9, 1.05);
  const C2 = tonal ? base.C * u(0.7, 0.9) : Math.min(0.17, vivid * u(0.9, 1.1) * c2);
  const L1 = tonal ? clamp(base.L + toward * u(0.1, 0.14), 0.5, 0.94) : u(0.64, 0.8);
  const L2 = tonal ? clamp(base.L - toward * u(0.1, 0.14), 0.5, 0.94) : scheme === "complementary" ? clamp(L1 + (L1 > 0.7 ? -0.08 : 0.08), 0.6, 0.82) : u(0.62, 0.8);
  const secondary = legible(apart({ L: L1, C: C1, h: (h1 + 360) % 360 }));
  const accent = legible(apart({ L: L2, C: scheme === "complementary" ? C1 * 0.85 : C2, h: (h2 + 360) % 360 }));
  const neutral: Lch = base.L > 0.78 ? { L: 0.62, C: 0.012, h: base.h } : { L: 0.93, C: 0.025, h: base.h };

  // Who takes which colour: arms and legs always the same; tail, back and top each their own throw; the accent can
  // stand in for the secondary on those three.
  const tints: Record<string, string> = {};
  const set = (slot: string, c: Lch) => { tints[slot + "-body"] = hex(c); tints[slot + "-belly"] = hex(belly(c, roles)); tints[slot + "-dark"] = hex(dark(c)); };
  const pick = (allowAccent: boolean) => (allowAccent && roles.next() < 0.25 ? accent : secondary);
  const { present } = o;
  const limbs = roles.next() < 0.45, tail = present.tail && roles.next() < 0.6, back = present.back && roles.next() < 0.6, top = present.top && roles.next() < 0.5;
  if (limbs) { if (present.arms) set("arms", secondary); if (present.legs) set("legs", secondary); }
  if (tail) set("tail", pick(true));
  if (back) set("back", pick(true));
  else if (present.back) set("back", legible({ L: clamp(base.L + (base.L > 0.6 ? -0.12 : 0.12), 0.5, 0.94), C: base.C * 0.9, h: base.h })); // never the body's own colour: it reads as a separate piece
  if (top) set("top", pick(true));
  tints.spot = hex(roles.next() < 0.65 ? accent : neutral);
  // the shared materials: a lighter belly, small dark details lifted, a soft blush, brass and cream horn
  tints.belly = hex(belly(base, roles)); tints.dark = hex(dark(base));
  const warm = base.h > 300 || base.h < 60;
  tints.pink = hex({ L: 0.76 + roles.next() * 0.09, C: 0.04 + roles.next() * 0.04, h: warm ? base.h : 25 });
  tints.gold = roles.next() < 0.65 ? hex({ L: 0.8, C: 0.11, h: 85 }) : hex({ L: 0.87, C: 0.02, h: base.h });
  tints.horn = hex({ L: 0.94, C: 0.025, h: base.h });
  return { color: { hue: b.hue, sat: b.sat, light: b.light, spot: 0 }, tints, family: b.family, scheme };
}
