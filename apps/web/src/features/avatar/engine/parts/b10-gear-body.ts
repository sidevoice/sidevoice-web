import { LAYER, batch, ellipse, n, spanAt, type Ctx, type Drawing, type Paint, type Piece, type Rig } from "../bichos/kit";

/* B10 Gear II: what a bicho wears round its neck, holds in a hand and carries on its back, plus boots
 * (docs/catalogue.md §2.7, §2.9, §2.11). Every neck item shares the neckwear slot with the core scarf and bow, so a
 * bicho wears one at a time; held items and back pieces have their own notes below.
 *
 * Neckwear fits itself to the body from `neck` and the body's real outline (`spanAt`), the way the core scarf does: a
 * band wraps a little past the body's sides, so its fat outline shows where it turns round the back, and whatever hangs
 * from it (bell, knot, medal) lies on the chest. Two passes keep it in its place: the band's ends are painted on the
 * skin layer (under the arms), and the part over the chest is painted again above the patterns (a belly patch, a tux),
 * stopping short of where the arms join. */

type P = [number, number];

/** A thin ink edge on worn pieces that lie on the body (the core bow tie uses the same). */
const EDGE = 2.4;

/* ---------- reading the body ---------- */

/** Half the body's real width at height y (wobble included), or a fallback from the frame. */
function halfSpan(rig: Rig, y: number): number {
  const s = spanAt(rig, y);
  return s ? Math.min(60 - s[0], s[1] - 60) : rig.half * 0.7;
}

/** How far from the middle an inner piece may reach at height y without being painted over an arm: arms join at the
 * shoulders and reach about 6 units in from their joint (noodle and wing arms the most), from 6 over it to 11 under. */
function armReach(ctx: Ctx, y: number): number {
  if (!ctx.has("arms")) return 99;
  const sh = ctx.rig.at.shoulderL;
  return y > sh.y - 7 && y < sh.y + 11 ? 60 - sh.x - 6.5 : 99;
}

/* ---------- neck bands ---------- */

/** A band round the neck: a gentle smile from side to side, `dip` deeper in the middle, its ends just past the body's
 * real edge. Returns the path `d`, `at(t)` (a point on it), `sub(t0, t1, dy)` (a stretch of it, shifted down by dy) and
 * `tAt(x)` (the t over x). */
function neckBand(rig: Rig, y: number, dip: number, out = 1) {
  const w = halfSpan(rig, y + 1) + out;
  const p0: P = [60 - w, y], c: P = [60, y + dip * 2], p2: P = [60 + w, y];
  const at = (t: number): P => [0, 1].map((k) => (1 - t) * (1 - t) * p0[k] + 2 * t * (1 - t) * c[k] + t * t * p2[k]) as P;
  const d = `M${n(p0[0])} ${n(y)}Q60 ${n(c[1])} ${n(p2[0])} ${n(y)}`;
  /** The piece of the band between t0 and t1, shifted down by dy. */
  const sub = (t0: number, t1: number, dy = 0) => {
    const [s, e] = [at(t0), at(t1)];
    const a = (1 - t0) * (1 - t1), b = (1 - t0) * t1 + t0 * (1 - t1), dd = t0 * t1;
    const q = [0, 1].map((k) => a * p0[k] + b * c[k] + dd * p2[k]);
    return `M${n(s[0])} ${n(s[1] + dy)}Q${n(q[0])} ${n(q[1] + dy)} ${n(e[0])} ${n(e[1] + dy)}`;
  };
  return { d, w, y, dip, at, sub, tAt: (x: number) => Math.min(1, Math.max(0, (x - p0[0]) / (2 * w))) };
}

/** A collar band of thickness `t` in `c`, with a thin ink edge: the whole band on the skin layer (under the arms, its
 * fat outline where it wraps past the sides), and its middle again above the patterns, clear of the arms. */
function collar(ctx: Ctx, band: ReturnType<typeof neckBand>, t: number, c: Paint): Piece[] {
  const reach = armReach(ctx, band.y + band.dip) - t / 2;
  const pieces: Piece[] = [
    { d: band.d, c: "ink", w: t + EDGE, ink: "inner", flat: true, layer: LAYER.skin },
    { d: band.d, c, w: t, flat: true, layer: LAYER.skin },
  ];
  if (reach > 2) {
    const t0 = band.tAt(60 - reach), t1 = band.tAt(60 + reach), off = t / 2 + EDGE / 4;
    pieces.push(
      { d: band.sub(t0, t1), c, w: t, flat: true, ink: "inner" },
      { d: band.sub(t0, t1, -off) + band.sub(t0, t1, off), c: "ink", w: EDGE / 2, flat: true, ink: "inner" },
    );
  }
  return pieces;
}

/** A piece that lies on the body and may hang past it: merged (its fat outline where it pokes out) and again inside,
 * with a thin edge (above the patterns, and visible where it lies on the body). */
const worn = (d: string, c: Paint, extra: Partial<Piece> = {}): Piece[] => [{ ...extra, d, c }, { ...extra, d, c, ink: "inner", stroke: EDGE }];

/** A highlight: a short white stroke, lit from the top left like the body's gloss. */
const glint = (d: string, w = 1.4, extra: Partial<Piece> = {}): Piece => ({ d, c: "#ffffff", w, ink: "inner", flat: true, lod: 1, ...extra });

/* ---------- neckwear ---------- */

/** A strap of thickness t from a to b (a ribbon, a backpack strap), with a thin ink edge: whole on the skin layer, and
 * again above the patterns where it is clear of the arms. */
function strap(ctx: Ctx, a: P, b: P, t: number, c: Paint): Piece[] {
  const d = `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`;
  const pieces: Piece[] = [{ d, c: "ink", w: t + EDGE, ink: "inner", flat: true, layer: LAYER.skin }, { d, c, w: t, flat: true, layer: LAYER.skin }];
  // The stretch of it the arms leave free: points whose |x - 60| stays inside the reach at their height.
  const pt = (f: number): P => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  const free = (f: number) => { const [x, y] = pt(f); return Math.abs(x - 60) + t / 2 <= armReach(ctx, y); };
  let f0 = 0, f1 = 1;
  while (f0 < 1 && !free(f0)) f0 += 0.02;
  while (f1 > f0 && !free(f1)) f1 -= 0.02;
  if (f1 - f0 > 0.05) {
    const [x0, y0] = pt(f0), [x1, y1] = pt(f1), len = Math.hypot(x1 - x0, y1 - y0) || 1, off = t / 2 + EDGE / 4;
    const nx = (-(y1 - y0) / len) * off, ny = ((x1 - x0) / len) * off;
    const seg = (k: number) => `M${n(x0 + nx * k)} ${n(y0 + ny * k)}L${n(x1 + nx * k)} ${n(y1 + ny * k)}`;
    pieces.push({ d: seg(0), c, w: t, flat: true, ink: "inner" }, { d: seg(1) + seg(-1), c: "ink", w: EDGE / 2, flat: true, ink: "inner" });
  }
  return pieces;
}

/** The bell collar: a spot band and a round gold bell on a ring, swinging from it. */
function bellCollar(ctx: Ctx): Drawing {
  const { rig } = ctx;
  const band = neckBand(rig, rig.at.neck.y - 2, 4);
  const t = 4.6, r = 5.1, by0 = band.at(0.5)[1], ring = by0 + t / 2 + 0.4, cy = ring + r + 0.9;
  const bell = ellipse(60, cy, r, r);
  const loop = ellipse(60, ring + 0.5, 1.8, 1.6);
  const g = "b10-bell";
  return {
    pieces: [
      ...collar(ctx, band, t, "spot"),
      { d: loop, c: "gold", g }, { d: bell, c: "gold", g },
      { d: loop, c: "gold", ink: "inner", stroke: 1.8, g }, { d: bell, c: "gold", ink: "inner", stroke: EDGE, g },
      // The groove round its middle, and the slit at the bottom.
      { d: `M${n(60 - r + 0.5)} ${n(cy - 0.6)}Q60 ${n(cy + 1.4)} ${n(60 + r - 0.5)} ${n(cy - 0.6)}`, c: "ink", w: 1.4, ink: "inner", flat: true, g, lod: 1 },
      { d: `M60 ${n(cy + 2.2)}L60 ${n(cy + r - 0.3)}`, c: "ink", w: 1.4, ink: "inner", flat: true, g, lod: 1 },
      { d: ellipse(60, cy + 2.4, 1.2, 1.1), c: "ink", ink: "inner", flat: true, g, lod: 1 },
      glint(`M${n(57.2)} ${n(cy - 2)}Q${n(57.8)} ${n(cy - 3.6)} ${n(59.6)} ${n(cy - 3.9)}`, 1.4, { g }),
    ],
  };
}

/** The bandana: a big triangle of spot cloth with belly dots, tied round the neck. */
function bandana(ctx: Ctx): Drawing {
  const { rig } = ctx;
  const band = neckBand(rig, rig.at.neck.y - 2.5, 2.5);
  const y = band.y - 0.5;
  const w = Math.max(9, Math.min(halfSpan(rig, y) - 1, armReach(ctx, y) - 1.5, 20 * rig.u));
  const tip = Math.min(y + 15, rig.bottom + 5), lean = 1.5, h = tip - y;
  const tri = `M${n(60 - w)} ${n(y)}Q60 ${n(y + 4.5)} ${n(60 + w)} ${n(y)}Q${n(60 + w * 0.6)} ${n(tip - h * 0.3)} ${n(60 + lean + 2)} ${n(tip - 0.8)}Q${n(60 + lean)} ${n(tip + 0.9)} ${n(60 + lean - 2)} ${n(tip - 0.8)}Q${n(60 - w * 0.6)} ${n(tip - h * 0.3)} ${n(60 - w)} ${n(y)}Z`;
  const dots: P[] = ([[-0.5, 0.3], [0.48, 0.32], [0.02, 0.56], [-0.06, 0.82]] as P[]).slice(0, h > 12 ? 4 : 3).map(([fx, fy]) => [60 + fx * w * (1 - fy) + lean * fy, y + 2 + fy * (h - 4)]);
  return {
    pieces: [
      ...collar(ctx, band, 3.6, "spot"),
      ...worn(tri, "spot"),
      { d: dots.map(([x, yy]) => ellipse(x, yy, 1.55, 1.55)).join(""), c: "belly", ink: "inner", flat: true, lod: 1 },
    ],
  };
}

/** The necktie: a knot and a long blade with belly stripes; the blade flaps while waiting. */
function necktie(ctx: Ctx): Drawing {
  const { rig } = ctx;
  const y = rig.at.neck.y - 1.5;
  const k0 = y - 2.6, k1 = y + 2.6, len = Math.max(10, Math.min(16, rig.bottom + 4 - k1)), tip = k1 + len, sh = tip - 4.4;
  const knot = `M${n(56)} ${n(k0)}Q60 ${n(k0 - 0.8)} ${n(64)} ${n(k0)}L${n(62.8)} ${n(k1)}Q60 ${n(k1 + 0.6)} ${n(57.2)} ${n(k1)}Z`;
  const half = (yy: number) => 2.7 + (Math.min(yy, sh) - k1) * (2 / Math.max(1, sh - k1));
  const blade = `M${n(57.3)} ${n(k1 - 0.8)}L${n(62.7)} ${n(k1 - 0.8)}L${n(60 + half(sh))} ${n(sh)}L60 ${n(tip)}L${n(60 - half(sh))} ${n(sh)}Z`;
  const stripes = [0.22, 0.58].map((f) => { const yy = k1 + 1.6 + f * (len - 6), hw = half(yy) - 0.9; return `M${n(60 - hw)} ${n(yy + 1.4)}L${n(60 + hw)} ${n(yy - 1.4)}`; }).join("");
  const g = "b10-tie";
  return {
    pieces: [
      ...worn(blade, "spot", { g }),
      { d: stripes, c: "belly", w: 1.9, ink: "inner", flat: true, g, lod: 1 },
      ...worn(knot, "spot"),
      glint(`M${n(57.6)} ${n(k0 + 1.3)}L${n(58.4)} ${n(k1 - 1.1)}`, 1.1),
    ],
  };
}

/** A cartoon flower: five round petals round a centre (`grow` swells each petal, for its edge). */
function petals(x: number, y: number, r: number, turn = 0, grow = 0): string {
  let out = "";
  for (let i = 0; i < 5; i += 1) {
    const a = turn + (i / 5) * Math.PI * 2;
    out += ellipse(x + Math.cos(a) * r * 0.52, y + Math.sin(a) * r * 0.52, r * 0.5 + grow, r * 0.5 + grow);
  }
  return out;
}

/** The lei: a garland of flowers (pink, gold, belly) hanging round the neck. */
function lei(ctx: Ctx): Drawing {
  const { rig } = ctx;
  const band = neckBand(rig, rig.at.neck.y - 2.5, 4.4, 0.5);
  const r = 4.3, count = Math.max(5, Math.round((band.w * 2.1) / 6.8) | 1);
  const paints: Paint[] = ["pink", "gold", "belly"];
  const back: Piece[] = [], front: Piece[] = [], centres: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const [x, y] = band.at(i / (count - 1));
    const ps = petals(x, y, r, i * 0.9), c = paints[(i + 1) % 3];
    // Every flower merged (under the arms, its fat outline where it hangs past the sides); the ones clear of the arms
    // again on top, with a thin edge round the petals (their union, a little swollen, in ink underneath).
    back.push({ d: ps, c, layer: LAYER.skin });
    if (Math.abs(x - 60) + r < armReach(ctx, y)) {
      front.push({ d: petals(x, y, r, i * 0.9, 0.7), c: "ink", ink: "inner", flat: true }, { d: ps, c, ink: "inner" });
      centres.push(ellipse(x, y, 1.45, 1.45));
    }
  }
  return { pieces: [...back, ...front, { d: centres.join(""), c: "spot", ink: "inner", flat: true, lod: 1 }] };
}

/** The bib: a cream bib piped in spot, its top wrapping round the neck, a heart on it, its ties round the back. */
function bib(ctx: Ctx): Drawing {
  const { rig } = ctx;
  const band = neckBand(rig, rig.at.neck.y - 3, 2.2);
  const y = band.y;
  const W = Math.max(9, Math.min(halfSpan(rig, y) - 1, armReach(ctx, y + 2) - 1.5, 17)), by = Math.min(y + 15.5, rig.bottom + 4.5);
  const shape = (w: number, top: number, bot: number) =>
    `M${n(60 - w)} ${n(top)}Q60 ${n(top + 4.4)} ${n(60 + w)} ${n(top)}C${n(60 + w + 0.6)} ${n(top + (bot - top) * 0.55)} ${n(60 + w * 0.62)} ${n(bot)} 60 ${n(bot)}C${n(60 - w * 0.62)} ${n(bot)} ${n(60 - w - 0.6)} ${n(top + (bot - top) * 0.55)} ${n(60 - w)} ${n(top)}Z`;
  const outer = shape(W, y, by), inner = shape(W - 2.6, y + 2.4, by - 2.6);
  const hy = (y + 4 + by) / 2 + 0.3, hs = 2.5;
  const heart = `M60 ${n(hy + hs * 1.1)}C${n(60 - hs * 2.2)} ${n(hy - hs * 0.3)} ${n(60 - hs * 0.9)} ${n(hy - hs * 1.5)} 60 ${n(hy - hs * 0.5)}C${n(60 + hs * 0.9)} ${n(hy - hs * 1.5)} ${n(60 + hs * 2.2)} ${n(hy - hs * 0.3)} 60 ${n(hy + hs * 1.1)}Z`;
  return {
    pieces: [
      ...collar(ctx, band, 2.6, "spot"),
      ...worn(outer, "spot"),
      { d: inner, c: "horn", ink: "inner" },
      { d: heart, c: "spot", ink: "inner", flat: true, lod: 1 },
    ],
  };
}

/** A star of five points, radius R, the inner corners at k·R. */
function star(x: number, y: number, R: number, k = 0.45, turn = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + turn + (i * Math.PI) / 5, rr = i % 2 ? R * k : R; pts.push(`${n(x + Math.cos(a) * rr)} ${n(y + Math.sin(a) * rr)}`); }
  return `M${pts.join("L")}Z`;
}

/** The medal: a gold disc with a star, on a ribbon round the neck. */
function medal(ctx: Ctx): Drawing {
  const { rig } = ctx;
  const y = rig.at.neck.y - 3, w = halfSpan(rig, y) + 1.5, meet = y + 7;
  const r = 5.4, cy = meet + r - 0.2;
  const disc = ellipse(60, cy, r, r);
  return {
    pieces: [
      ...strap(ctx, [60 - w, y], [61.2, meet], 3.8, "spot"),
      ...strap(ctx, [60 + w, y], [58.8, meet], 3.8, "spot"),
      ...worn(disc, "gold"),
      { d: star(60, cy + 0.3, 3.2), c: "#fff3a8", ink: "inner", flat: true, lod: 1 },
      glint(`M${n(56.4)} ${n(cy - 1.4)}Q${n(57)} ${n(cy - 3.6)} ${n(59.2)} ${n(cy - 4.2)}`, 1.3),
    ],
  };
}

/* ---------- held items ---------- */

/* Right-hand items ride the arm as pieces: drawn upright in their own frame (the hand at 0,0, up is -y), turned a little
 * and set on the right hand of the reference body (the nub's hand is at [99, 82]); half a layer under the arm, so the
 * hand closes over the grip. They gesture, crank and wave with the arm; the microphone tips towards the mouth on each
 * beat. The parts of them clear of the hand get an inner copy with a thin edge, so they keep an edge over the body.
 * What moves on its own besides (the microphone's sound arcs, the wand's sparkles, the mug's steam) is a `sub` group
 * nested inside the arm's, so it rides the arm too. */

const HAND_R: P = [99, 82], HAND_L: P = [21, 82];
const MIC = "#4f475d", MIC_HI = "#8b81a0", SILVER = "#c9d0da", GOLD_DEEP = "#b8892a", LEAF = "#5fb548", LEAF_DEEP = "#3e8a39", PINK = "#ff6f91", COFFEE = "#6b3d24";

/** Maps the item's own frame into the drawing: scaled by k, turned by `deg` (negative leans the top towards the face
 * for the right hand) and set on the hand. `r(x)` scales a length. */
function frame(deg: number, k: number, at: P = HAND_R) {
  const c = Math.cos((deg * Math.PI) / 180) * k, s = Math.sin((deg * Math.PI) / 180) * k;
  const pt = (x: number, y: number): P => [at[0] + x * c - y * s, at[1] + x * s + y * c];
  const q = (x: number, y: number) => { const [a, b] = pt(x, y); return `${n(a)} ${n(b)}`; };
  return { pt, q, r: (v: number) => v * k, circle: (x: number, y: number, rad: number) => ellipse(...pt(x, y), rad * k, rad * k) };
}

const HELD = { slot: "held", pair: false, requires: ["#hand"], lod: 2 as const, layer: LAYER.arms - 0.5 };
const RIGHT = { ...HELD, at: "handR", socket: HAND_R };

/** The microphone: a dark handle with a spot grip, a silver collar and a gold grille ball. While it talks (stage only),
 * two sound arcs beside the ball pop on every word. */
function microphone(): Drawing {
  const { q, r, circle, pt } = frame(3, 1.22);
  const handle = `M${q(-2.1, 2.4)}Q${q(0, 3.8)} ${q(2.1, 2.4)}L${q(2.8, -9.6)}L${q(-2.8, -9.6)}Z`;
  const grip = `M${q(-2.5, -4.2)}L${q(2.5, -4.2)}L${q(2.7, -7.2)}L${q(-2.7, -7.2)}Z`;
  const collar = `M${q(-3.4, -9)}L${q(3.4, -9)}Q${q(4, -10.5)} ${q(3.4, -12)}L${q(-3.4, -12)}Q${q(-4, -10.5)} ${q(-3.4, -9)}Z`;
  const R = 6, cy = -17.4;
  // The grille: chords across the ball, drawn on stage only.
  const chord = (d: number, vertical: boolean) => { const h = Math.sqrt(R * R - d * d) - 0.9; return vertical ? `M${q(d, cy - h)}L${q(d, cy + h)}` : `M${q(-h, cy + d)}L${q(h, cy + d)}`; };
  const grille = [-2.9, 0, 2.9].map((d) => chord(d, true)).join("") + [-2.6, 1.6].map((d) => chord(d, false)).join("");
  return {
    pieces: [
      { d: handle, c: MIC },
      { d: collar, c: SILVER },
      { d: `M${q(-1.3, 0.6)}L${q(-1.7, -8.4)}`, c: MIC_HI, w: r(1), ink: "inner", flat: true, lod: 1 },
      { d: grip, c: "spot", ink: "inner", stroke: 1.3, flat: true, lod: 1 },
      { d: collar, c: SILVER, ink: "inner", stroke: 1.6 },
      ...worn(circle(0, cy, R), "gold"),
      { d: grille, c: GOLD_DEEP, w: 1.1, ink: "inner", flat: true, lod: 2 },
      glint(`M${q(-3.8, cy - 1.2)}Q${q(-3.4, cy - 4.2)} ${q(-0.8, cy - 5)}`, 1.7),
      // The sound arcs beside the ball: an ink line under a pale one, popping on every word (stage only).
      ...[r(R) + 3, r(R) + 7].flatMap((rad): Piece[] => {
        const [x, y] = pt(0, cy), a0 = -1.15, a1 = 0.15;
        const d = `M${n(x + Math.cos(a0) * rad)} ${n(y + Math.sin(a0) * rad)}A${n(rad)} ${n(rad)} 0 0 1 ${n(x + Math.cos(a1) * rad)} ${n(y + Math.sin(a1) * rad)}`;
        return [{ d, c: "ink", w: 4.2, ink: "inner", flat: true, sub: "b10-waves", lod: 2 }, { d, c: "#fff6c8", w: 1.7, ink: "inner", flat: true, sub: "b10-waves", lod: 2 }];
      }),
    ],
  };
}

/** The tulip: a curved stem with one leaf and a cup of three petals (pink, gold or the spot, per bicho). */
function tulip(ctx: Ctx): Drawing {
  const { q, r } = frame(7, 1.35);
  const spotHue = (ctx.spec.color.hue + ctx.spec.color.spot) % 360;
  const options: Paint[] = spotHue > 70 && spotHue < 170 ? [PINK, "gold"] : [PINK, "gold", "spot"];
  const c = options[Math.floor(ctx.rng("b10:tulip").next() * options.length)];
  const stem = `M${q(0, 3)}Q${q(-1.8, -7)} ${q(0.6, -17.5)}`;
  const leaf = `M${q(-0.2, -3.5)}Q${q(5.4, -4.6)} ${q(7.6, -12.4)}Q${q(1.8, -11.4)} ${q(-0.6, -5.6)}Z`;
  const cup = `M${q(-4.4, -23.6)}Q${q(-5, -16.6)} ${q(0.6, -16.4)}Q${q(6.2, -16.6)} ${q(5.6, -23.6)}L${q(4.6, -28.2)}Q${q(3.4, -25.4)} ${q(2.4, -24.6)}L${q(0.6, -28.8)}L${q(-1.2, -24.6)}Q${q(-2.2, -25.4)} ${q(-3.4, -28.2)}Z`;
  return {
    pieces: [
      { d: stem, c: LEAF, w: r(2.2), flat: true },
      ...worn(leaf, LEAF),
      ...worn(cup, c),
      { d: `M${q(-1.2, -24.4)}Q${q(-1.4, -19.6)} ${q(0.4, -17.4)}M${q(2.4, -24.4)}Q${q(2.6, -19.6)} ${q(0.8, -17.4)}`, c: "ink", w: 1.1, ink: "inner", flat: true, lod: 2 },
      { d: `M${q(0.6, -5.2)}Q${q(3.8, -6.6)} ${q(6.2, -11)}`, c: LEAF_DEEP, w: 1.1, ink: "inner", flat: true, lod: 2 },
      glint(`M${q(-3.2, -22.4)}Q${q(-3.4, -19.6)} ${q(-1.8, -18.2)}`, 1.5),
    ],
  };
}

/** The lollipop: a round spot candy with a white swirl on a cream stick. */
function lollipop(): Drawing {
  const { q, r, circle } = frame(9, 1.3);
  const cy = -19.8, R = 7.2;
  const swirl = Array.from({ length: 34 }, (_, i) => { const a = i * 0.36, rad = 0.5 + a * 0.52; return `${i ? "L" : "M"}${q(Math.cos(a) * rad, cy + Math.sin(a) * rad)}`; }).join("");
  return {
    pieces: [
      { d: `M${q(0, 3.5)}L${q(0, -13)}`, c: "horn", w: r(2.2), flat: true },
      ...worn(circle(0, cy, R), "spot"),
      { d: swirl, c: "#ffffff", w: r(1.7), ink: "inner", flat: true, lod: 1 },
      glint(`M${q(-5, cy - 1.6)}Q${q(-4.2, cy - 4.8)} ${q(-1.6, cy - 5.8)}`, 1.6),
    ],
  };
}

/** A pink heart, held up by its point. */
function heart(): Drawing {
  const { q } = frame(-9, 1.3);
  const d = `M${q(0, 0.4)}C${q(-9.4, -5.8)} ${q(-9, -16.4)} ${q(-3.8, -16)}Q${q(-1.2, -15.7)} ${q(0, -12.6)}Q${q(1.2, -15.7)} ${q(3.8, -16)}C${q(9, -16.4)} ${q(9.4, -5.8)} ${q(0, 0.4)}Z`;
  return { pieces: [...worn(d, PINK), glint(`M${q(-6, -11.4)}Q${q(-6, -14.2)} ${q(-3.8, -14.4)}`, 1.8)] };
}

/** The star wand (rare): a dark stick with a gold star; sparkles twinkle round it (the shared `flick` group, pivoted on
 * the star, inside the arm's). */
function wand(): Drawing {
  const { q, pt, r } = frame(10, 1.3);
  const [sx, sy] = pt(0, -21.6);
  const sparkles: [number, number, number][] = [[sx + 11, sy - 6, 3.2], [sx - 10, sy - 8.6, 2.4], [sx + 8, sy + 9, 2.1]];
  return {
    pieces: [
      { d: `M${q(0, 3.5)}L${q(0, -15)}`, c: MIC, w: r(2.3), flat: true },
      { d: `M${q(0, -11.8)}L${q(0, -14.6)}`, c: "gold", w: r(2.3), flat: true, ink: "inner", lod: 1 },
      ...worn(star(sx, sy, r(7.6), 0.5, (10 * Math.PI) / 180), "gold"),
      glint(`M${q(-2.6, -23.6)}L${q(-1, -25.8)}`, 1.6),
      ...sparkles.map(([x, y, rad]): Piece => ({ d: twinkle(x, y, rad), c: "#fff6c8", ink: "inner", stroke: 1.2, flat: true, sub: "flick", pivot: [sx, sy] })),
    ],
  };
}

/** A four-pointed twinkle. */
const twinkle = (x: number, y: number, r: number) => `M${n(x)} ${n(y - r)}Q${n(x + r * 0.18)} ${n(y - r * 0.18)} ${n(x + r)} ${n(y)}Q${n(x + r * 0.18)} ${n(y + r * 0.18)} ${n(x)} ${n(y + r)}Q${n(x - r * 0.18)} ${n(y + r * 0.18)} ${n(x - r)} ${n(y)}Q${n(x - r * 0.18)} ${n(y - r * 0.18)} ${n(x)} ${n(y - r)}Z`;

/* Left-hand items that float (the balloon, the leaf umbrella) are drawn in place from the hand anchor and ride it
 * (`rides: "handL"`): they move with the arm, `upright` keeps them level (a counter-turn about the hand), and they sway
 * in the shared `float` group about the hand. They join the outline pass like every held item, with an inner copy and
 * a thin edge where they lie over the body or another part. */

/** The float group, pivoted on the hand. */
const floating = (hand: { x: number; y: number }) => ({ sub: "float", pivot: [hand.x, hand.y] as P });

/** The balloon: a spot balloon on a string from the left hand, floating up beside the head. */
function balloon(ctx: Ctx): Drawing {
  const { rig } = ctx, hand = rig.at.handL;
  if (!hand) return {};
  const rx = 11.2, ry = 12.4;
  // Up and a little out, inside the box and clear of the head's side.
  const cy = Math.max(ry + 4, hand.y - 44), side = halfSpan(rig, Math.min(rig.bottom - 4, Math.max(rig.top + 4, cy)));
  const cx = Math.max(rx + 3.5, Math.min(hand.x - 4, 60 - side - rx - 2)), knot = cy + ry + 0.4;
  const body = `M${n(cx)} ${n(knot)}C${n(cx - rx * 0.9)} ${n(knot - 2.5)} ${n(cx - rx * 1.05)} ${n(cy - ry * 0.25)} ${n(cx - rx)} ${n(cy - ry * 0.3)}C${n(cx - rx)} ${n(cy - ry * 1.1)} ${n(cx + rx)} ${n(cy - ry * 1.1)} ${n(cx + rx)} ${n(cy - ry * 0.3)}C${n(cx + rx * 1.05)} ${n(cy - ry * 0.25)} ${n(cx + rx * 0.9)} ${n(knot - 2.5)} ${n(cx)} ${n(knot)}Z`;
  const tie = `M${n(cx)} ${n(knot - 0.6)}L${n(cx + 2.2)} ${n(knot + 2.6)}L${n(cx - 2.2)} ${n(knot + 2.6)}Z`;
  const string = `M${n(cx)} ${n(knot + 2.4)}Q${n(cx - 4)} ${n(knot + (hand.y - knot) * 0.35)} ${n((cx + hand.x) / 2)} ${n((knot + hand.y) / 2)}T${n(hand.x)} ${n(hand.y - 1)}`;
  const f = floating(hand);
  return {
    pieces: [
      // The string: a cream line with a thin ink edge, from the knot to the hand (over the arm).
      { d: string, c: "ink", w: 3.2, ink: "inner", flat: true, ...f }, { d: string, c: "horn", w: 1.1, ink: "inner", flat: true, ...f },
      { d: body, c: "spot", ...f }, { d: tie, c: "spot", ...f },
      { d: body, c: "spot", ink: "inner", stroke: EDGE, ...f }, { d: tie, c: "spot", ink: "inner", stroke: EDGE, ...f },
      glint(`M${n(cx - rx * 0.62)} ${n(cy - ry * 0.1)}Q${n(cx - rx * 0.66)} ${n(cy - ry * 0.68)} ${n(cx - rx * 0.14)} ${n(cy - ry * 0.82)}`, 2.4, f),
    ],
  };
}

/** The leaf umbrella (the panda's): a taro leaf, its stalk meeting the middle of the blade, held up beside the head
 * from the left hand and tilted over it: a dome with drooping scalloped edges and ribs fanning out like an umbrella's. */
function umbrellaLeaf(ctx: Ctx): Drawing {
  const { rig } = ctx, hand = rig.at.handL;
  if (!hand) return {};
  // The dome's centre sits on the stalk, beside the head; tilted, its right half overhangs the head and clears the ears.
  const W = 21, H = 10, tilt = 24, sx = Math.max(hand.x + 3, W * 0.92 + 3), sy = Math.max(23, rig.top - 19);
  const c = Math.cos((tilt * Math.PI) / 180), s = Math.sin((tilt * Math.PI) / 180);
  const at = (x: number, y: number) => `${n(sx + x * c - y * s)} ${n(sy + x * s + y * c)}`;
  // The top: a dome from edge to edge; the underside: three shallow scallops, each ending in a little drip point.
  const blade = `M${at(-W, 2.6)}C${at(-W + 1, -H * 0.9)} ${at(-W * 0.35, -H * 1.2)} ${at(0, -H * 1.18)}C${at(W * 0.35, -H * 1.2)} ${at(W - 1, -H * 0.9)} ${at(W, 2.6)}`
    + `Q${at(W * 0.8, -0.2)} ${at(W * 0.34, 1.4)}Q${at(W * 0.16, -0.9)} ${at(0, 0.6)}Q${at(-W * 0.16, -0.9)} ${at(-W * 0.34, 1.4)}Q${at(-W * 0.8, -0.2)} ${at(-W, 2.6)}Z`;
  const ribs = [-0.72, -0.36, 0.36, 0.72].map((f) => `M${at(0, -0.6)}Q${at(W * f * 0.55, -H * 0.95)} ${at(W * f * 1.05, (Math.abs(f) > 0.5 ? 0.6 : -0.4))}`).join("") + `M${at(0, -0.6)}L${at(0, -H * 1.02)}`;
  const top = sy - 0.6;
  const stalk = `M${n(hand.x)} ${n(hand.y)}Q${n(Math.min(hand.x, sx) - 2.5)} ${n((hand.y + top) / 2)} ${n(sx)} ${n(top)}`;
  const f = floating(hand);
  return {
    pieces: [
      // Merged (the fat outline round the stalk and the blade), then again inside with a thin edge, where they lie over
      // the head or the arm; the blade over the stalk's end.
      { d: stalk, c: LEAF_DEEP, w: 2.4, ...f }, { d: blade, c: LEAF, ...f },
      { d: stalk, c: "ink", w: 2.4 + EDGE, ink: "inner", flat: true, ...f }, { d: stalk, c: LEAF_DEEP, w: 2.4, ink: "inner", flat: true, ...f },
      { d: blade, c: LEAF, ink: "inner", stroke: EDGE, ...f },
      { d: ribs, c: LEAF_DEEP, w: 1.3, ink: "inner", flat: true, ...f },
      glint(`M${at(-W * 0.78, -H * 0.42)}Q${at(-W * 0.62, -H * 0.98)} ${at(-W * 0.2, -H * 1.08)}`, 1.9, f),
    ],
  };
}

/** The mug, in the left hand: spot with a belly band, coffee inside; steam puffs out of it while working. It rides the
 * arm, so it rises to the lips on the left arm's beats and while working. */
function mug(): Drawing {
  const { q, pt, r } = frame(0, 1.25, HAND_L);
  const top = -15.6, bot = -0.4, w = 5.6;
  const body = `M${q(-w, top)}L${q(w, top)}L${q(w - 0.4, bot - 2)}Q${q(w - 0.6, bot)} ${q(w - 3, bot)}L${q(-w + 3, bot)}Q${q(-w + 0.6, bot)} ${q(-w + 0.4, bot - 2)}Z`;
  const handle = `M${q(-w + 0.4, top + 3.2)}C${q(-w - 5.2, top + 2.4)} ${q(-w - 5, bot - 3)} ${q(-w + 0.4, bot - 3.6)}`;
  const rim = ellipse(...pt(0, top), r(w), r(1.8));
  const band = `M${q(-w + 0.2, top + 5.6)}L${q(w - 0.2, top + 5.6)}L${q(w - 0.3, top + 8.8)}L${q(-w + 0.3, top + 8.8)}Z`;
  const [sx, sy] = pt(0, top - 2.6);
  return {
    pieces: [
      { d: handle, c: "spot", w: r(2.2), flat: true },
      ...worn(body, "spot"),
      { d: band, c: "belly", ink: "inner", flat: true, lod: 1 },
      { d: rim, c: COFFEE, ink: "inner", stroke: 1.6, flat: true },
      glint(`M${q(-w + 2, top + 3)}L${q(-w + 2, bot - 4)}`, 1.4),
      // Steam, while working (stage only): two wisps that puff up out of it.
      ...[`M${n(sx - 2.6)} ${n(sy)}q-2.4 -3.4 0 -6.8t0 -6.8`, `M${n(sx + 2.4)} ${n(sy - 1)}q2.4 -3.4 0 -6.8t0 -6.8`].map((d): Piece => ({ d, c: "#ffffff", w: 2, ink: "inner", flat: true, sub: "b10-steam", lod: 2 })),
    ],
  };
}

/* ---------- back pieces ---------- */

/* Back pieces are drawn behind the body (the back layer), merged into the outline, so only what peeks out past the
 * silhouette shows. They fit the body from its frame and real outline. */

/** The widest half span of the body between two heights. */
function widest(rig: Rig, y0: number, y1: number): number {
  let w = 0;
  for (let y = y0; y <= y1; y += 2) w = Math.max(w, halfSpan(rig, y));
  return w || rig.half;
}

/** The cape: a spot cape tied round the neck, its collar points standing up behind the shoulders and its hem billowing
 * out to one side behind the body (away from a tail, else to the right). It flutters from its collar while the bicho
 * talks, waits or works. The cord round the neck shows when no neckwear covers it. */
function cape(ctx: Ctx): Drawing {
  const { rig } = ctx;
  const s = ctx.has("tail") ? -1 : 1, X = (dx: number) => n(60 + s * dx);
  const yt = rig.armY - 9, sp = halfSpan(rig, yt), wide = widest(rig, yt, rig.bottom - 3);
  const hem = Math.min(rig.bottom + 4, rig.at.ground.y - 2), far = Math.min(wide + 19, 57), fy = yt + 22;
  const d = `M${X(sp - 2)} ${n(yt + 1)}L${X(sp + 4.4)} ${n(yt - 8.5)}C${X(sp + 9)} ${n(yt - 2)} ${X(far - 3)} ${n(yt + 11)} ${X(far)} ${n(fy)}`
    + `Q${X(far - 5)} ${n(fy + 1)} ${X(far - 7)} ${n((fy + hem) / 2 + 2)}Q${X(wide + 2)} ${n(hem - 2)} ${X(wide - 3)} ${n(hem + 0.5)}`
    + `Q${X(wide * 0.45)} ${n(hem - 2.5)} ${X(wide * 0.1)} ${n(hem + 1.2)}Q${X(-wide * 0.4)} ${n(hem - 2)} ${X(-wide - 3)} ${n(hem - 2.5)}`
    + `Q${X(-wide - 4)} ${n(yt + 12)} ${X(-sp - 1)} ${n(yt + 2)}L${X(-sp - 4.4)} ${n(yt - 8.5)}L${X(-sp + 2)} ${n(yt + 1)}Z`;
  // The lining shows where the billowing side turns over.
  const fold = `M${X(sp + 3)} ${n(yt - 3.8)}C${X(sp + 8)} ${n(yt + 0.5)} ${X(far - 4)} ${n(yt + 11.5)} ${X(far - 1.2)} ${n(fy - 1)}Q${X(far - 7)} ${n(yt + 13)} ${X(sp + 2)} ${n(yt + 1.5)}Z`;
  const g = "b10-cape";
  const pieces: Piece[] = [{ d, c: "spot", g }, { d: fold, c: "dark", g, lod: 1 }];
  if (!ctx.has("neckwear")) pieces.push(...collar(ctx, neckBand(rig, rig.at.neck.y - 3, 2.2), 2.4, "spot"));
  return { pieces };
}

/** The backpack: a spot pack behind the body, its rounded sides and pockets peeking out round the arms, its straps
 * coming over the shoulders in front. */
function backpack(ctx: Ctx): Drawing {
  const { rig } = ctx;
  // A rounded trapezoid: a little wider than the body at its top, more at its bottom, so it peeks out evenly on a
  // narrow head and a heavy bottom alike.
  const y0 = Math.min(rig.armY - 9, rig.eyeY + 4), y1 = rig.bottom - 4, r = 9;
  const wide = widest(rig, y0, y1) + 4.6, wt = Math.min(wide, halfSpan(rig, y0) + 3.6);
  const pack = `M${n(60 - wt + r)} ${n(y0)}L${n(60 + wt - r)} ${n(y0)}Q${n(60 + wt)} ${n(y0)} ${n(60 + wt + 0.6)} ${n(y0 + r)}L${n(60 + wide)} ${n(y1 - r)}Q${n(60 + wide)} ${n(y1)} ${n(60 + wide - r)} ${n(y1)}L${n(60 - wide + r)} ${n(y1)}Q${n(60 - wide)} ${n(y1)} ${n(60 - wide)} ${n(y1 - r)}L${n(60 - wt - 0.6)} ${n(y0 + r)}Q${n(60 - wt)} ${n(y0)} ${n(60 - wt + r)} ${n(y0)}Z`;
  const pocket = (s: number) => { const x0 = 60 + s * (wide - 2), x1 = 60 + s * (wide + 3.4), t = y1 - 15, b = y1 - 3; return `M${n(x0)} ${n(t)}L${n(x1 - s * 2)} ${n(t)}Q${n(x1)} ${n(t)} ${n(x1)} ${n(t + 2)}L${n(x1)} ${n(b - 2.5)}Q${n(x1)} ${n(b)} ${n(x1 - s * 2.5)} ${n(b)}L${n(x0)} ${n(b)}Z`; };
  // Short straps over the shoulders: from the flank down over the arm's root, where the arm pivots (so it hardly moves
  // under them), each with a little gold buckle.
  const sh = rig.at.shoulderL, ys = sh.y - 10.5, top = halfSpan(rig, ys);
  const straps = [-1, 1].flatMap((k): Piece[] => {
    const a: P = [60 + k * (top - 1.2), ys], b: P = [60 + k * (60 - sh.x - 0.5), sh.y + 3.2];
    const d = `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`;
    const m: P = [a[0] + (b[0] - a[0]) * 0.45, a[1] + (b[1] - a[1]) * 0.45];
    return [
      { d, c: "ink", w: 3.6 + EDGE, ink: "inner", flat: true }, { d, c: "dark", w: 3.6, ink: "inner", flat: true },
      { d: `M${n(m[0] - 2)} ${n(m[1] - 1.3)}L${n(m[0] + 2)} ${n(m[1] - 1.3)}L${n(m[0] + 2)} ${n(m[1] + 1.3)}L${n(m[0] - 2)} ${n(m[1] + 1.3)}Z`, c: "gold", ink: "inner", stroke: 1, flat: true, lod: 2 },
    ];
  });
  return { pieces: [{ d: pack, c: "spot" }, { d: pocket(-1) + pocket(1), c: "dark" }, ...straps] };
}

/** The jetpack (rare): twin silver canisters peeking out at the sides behind the body, flames under them while working
 * and waiting. */
function jetpack(ctx: Ctx): Drawing {
  const { rig } = ctx;
  const y0 = rig.eyeY - 9, y1 = rig.armY + 6, w = 5.6;
  const pieces: Piece[] = [];
  for (const s of [-1, 1]) {
    // Half out past the body's edge (its widest stretch beside the cans), so the cans and the flames under them show.
    const x = 60 + s * (widest(rig, y0, y1) + 1.2);
    const can = `M${n(x - w)} ${n(y0 + w)}Q${n(x - w)} ${n(y0)} ${n(x)} ${n(y0)}Q${n(x + w)} ${n(y0)} ${n(x + w)} ${n(y0 + w)}L${n(x + w)} ${n(y1 - 2)}Q${n(x + w)} ${n(y1)} ${n(x + w - 2)} ${n(y1)}L${n(x - w + 2)} ${n(y1)}Q${n(x - w)} ${n(y1)} ${n(x - w)} ${n(y1 - 2)}Z`;
    const band = `M${n(x - w)} ${n(y0 + 8)}L${n(x + w)} ${n(y0 + 8)}L${n(x + w)} ${n(y0 + 11.5)}L${n(x - w)} ${n(y0 + 11.5)}Z`;
    const nozzle = `M${n(x - 3.4)} ${n(y1 - 1)}L${n(x + 3.4)} ${n(y1 - 1)}L${n(x + 4.6)} ${n(y1 + 4.4)}L${n(x - 4.6)} ${n(y1 + 4.4)}Z`;
    // The flames lean outwards a little, clear of the body.
    const lean = s * 2.4;
    const flame = `M${n(x - 3.6)} ${n(y1 + 4.6)}Q${n(x - 4.4 + lean * 0.5)} ${n(y1 + 10)} ${n(x + lean)} ${n(y1 + 16)}Q${n(x + 4.4 + lean * 0.5)} ${n(y1 + 10)} ${n(x + 3.6)} ${n(y1 + 4.6)}Z`;
    const core = `M${n(x - 1.8)} ${n(y1 + 4.8)}Q${n(x - 2.2 + lean * 0.3)} ${n(y1 + 8.6)} ${n(x + lean * 0.6)} ${n(y1 + 11.6)}Q${n(x + 2.2 + lean * 0.3)} ${n(y1 + 8.6)} ${n(x + 1.8)} ${n(y1 + 4.8)}Z`;
    pieces.push(
      { d: flame, c: "gold", g: "b10-flame", lod: 2 }, { d: core, c: "#fff3a8", g: "b10-flame", flat: true, lod: 2 },
      { d: nozzle, c: MIC }, { d: can, c: SILVER }, { d: band, c: "spot" },
    );
  }
  return { pieces };
}

/* ---------- boots ---------- */

/** One boot, drawn on a foot anchor (x, y), its toe turned a little outwards (s = -1 left, 1 right): a spot shaft, a
 * round toe, a dark sole. Like feet, its top tucks in behind the body, so only the boot below it shows. */
function boot(x: number, y: number, s: number) {
  const X = (dx: number) => n(x + s * dx);
  const shaft = `M${X(-4.8)} ${n(y - 4)}L${X(4.8)} ${n(y - 4)}L${X(5)} ${n(y + 3.6)}Q${X(9.6)} ${n(y + 3.8)} ${X(9.8)} ${n(y + 7.6)}L${X(9.6)} ${n(y + 9.6)}L${X(-6)} ${n(y + 9.6)}Q${X(-6.4)} ${n(y + 5.6)} ${X(-5.2)} ${n(y + 3)}Z`;
  const sole = `M${X(-6.6)} ${n(y + 8.8)}L${X(10.4)} ${n(y + 8.8)}Q${X(11.2)} ${n(y + 12)} ${X(9)} ${n(y + 12)}L${X(-5.2)} ${n(y + 12)}Q${X(-7.4)} ${n(y + 12)} ${X(-6.6)} ${n(y + 8.8)}Z`;
  return { shaft, sole };
}

/* ---------- the batch ---------- */

export default batch({

  parts: [
    /* ---------- neckwear ---------- */
    { id: "bell-collar", slot: "neckwear", label: "collar de cascabel", weight: 8, draw: bellCollar },
    { id: "bandana", slot: "neckwear", label: "pañuelo", weight: 8, draw: bandana },
    { id: "necktie", slot: "neckwear", label: "corbata", weight: 6, draw: necktie },
    { id: "lei", slot: "neckwear", label: "collar de flores", weight: 5, draw: lei },
    // Uncommon, at 3 (B14): with the snacks' own pool it was as common as the scarf.
    { id: "bib", slot: "neckwear", label: "babero", rarity: "uncommon", weight: 3, draw: bib },
    { id: "medal", slot: "neckwear", label: "medalla", weight: 5, draw: medal },

    /* ---------- held ---------- */
    // The voice app's signature prop: the one held item that also shows at sidebar size (40 px).
    { ...RIGHT, id: "microphone", label: "micrófono", weight: 20, lod: 1, draw: microphone },
    { ...RIGHT, id: "flower", label: "tulipán", weight: 7, draw: tulip },
    { ...RIGHT, id: "lollipop", label: "piruleta", weight: 6, draw: lollipop },
    { ...RIGHT, id: "heart", label: "corazón", weight: 7, draw: heart },
    // Rare: it only comes from the rare roll, where a weight well under 1 keeps it from taking most of that roll (it fits
    // any bicho with a hand). B14: 0.08, so it stays rare (it was 0.4% of bichos).
    { ...RIGHT, id: "wand", label: "varita", rarity: "rare", weight: 0.08, draw: wand },
    { ...HELD, at: "handL", socket: HAND_L, id: "mug", label: "taza", weight: 6, draw: mug },
    // Floating, upright in the left hand (drawn in place from the hand anchor and riding it).
    { ...HELD, rides: "handL", upright: true, id: "balloon", label: "globo", weight: 7, draw: balloon },
    // Held up over the head, where a hat sits: it takes the place of any hat, and tall tops would poke through it.
    { ...HELD, rides: "handL", upright: true, id: "umbrella-leaf", label: "hoja paraguas", rarity: "uncommon", excludes: ["#tall", "headgear"], draw: umbrellaLeaf },

    /* ---------- back (tagged `gear`: the back slot's gear, which the gear step and the rare roll may hand out) ---------- */
    { id: "cape", slot: "back", label: "capa", weight: 8, tags: ["gear"], draw: cape },
    { id: "backpack", slot: "back", label: "mochila", weight: 8, noise: 1, tags: ["gear"], draw: backpack },
    // Rare, and it fits any bicho with a free back: like the wand, a rare weight well under 1 keeps it from taking most
    // rolls (B14: 0.15; it was 1% of bichos).
    { id: "jetpack", slot: "back", label: "mochila cohete", rarity: "rare", weight: 0.15, tags: ["gear"], draw: jetpack },

    /* ---------- legs ---------- */
    {
      id: "boots", slot: "legs", label: "botas",
      draw: ({ rig }) => {
        const L = boot(rig.at.footL.x, rig.at.footL.y, -1), R = boot(rig.at.footR.x, rig.at.footR.y, 1);
        // Merged, under the body (an inner piece would be painted over it, and would squash about its own box while asleep).
        const one = (b: ReturnType<typeof boot>, g: string): Piece[] => [{ d: b.shaft, c: "spot", g }, { d: b.sole, c: "dark", g }];
        return { pieces: [...one(L, "leg-a"), ...one(R, "leg-b")] };
      },
    },
  ],

  css: `
    /* the bell swings from its ring with the tail's timing; the tie's blade flaps from its knot while waiting */
    .pg-b10-bell { transform-box: fill-box; transform-origin: 50% 0; animation: bx-sway 2.4s ease-in-out infinite }
    &[data-mood=idle] .pg-b10-bell { animation-duration: 6s }
    &[data-mood=working] .pg-b10-bell { animation-duration: 1.2s }
    &[data-mood=waiting] .pg-b10-bell { animation-duration: .8s }
    .pg-b10-tie { transform-box: fill-box; transform-origin: 50% 0 }
    &[data-mood=waiting] .pg-b10-tie { animation: bx-feel 1.3s ease-in-out infinite }

    /* the cape sways from its collar; the jetpack's flames burn while working and waiting, flickering from the nozzle */
    .pg-b10-cape { transform-box: fill-box; transform-origin: 50% 0 }
    &[data-mood=speaking] .pg-b10-cape { animation: bx-feel 2s ease-in-out infinite }
    &[data-mood=waiting] .pg-b10-cape { animation: bx-feel 1.3s ease-in-out infinite }
    &[data-mood=working] .pg-b10-cape { animation: bx-feel .6s ease-in-out infinite }
    .pg-b10-flame { display: none; transform-box: fill-box; transform-origin: 50% 0 }
    &:is([data-mood=working], [data-mood=waiting]) .pg-b10-flame { display: inline; animation: bx-pulse .3s ease-in-out infinite }

    /* the microphone's sound arcs: only while talking (stage only, by lod), popping on every word, gone on a pause */
    .pg-b10-waves { display: none; transform-box: fill-box; transform-origin: 0 100% }
    &[data-mood=speaking] .pg-b10-waves { display: inline }
    &[data-mood=speaking][data-beat=a] .pg-b10-waves { animation: bx-pop .34s ease-out }
    &[data-mood=speaking][data-beat=b] .pg-b10-waves { animation: bx-pop .34s ease-out }
    &[data-mood=speaking][data-pause] .pg-b10-waves { display: none }

    /* the mug's steam, only while working (stage only, by lod) */
    .pg-b10-steam { display: none }
    &[data-mood=working] .pg-b10-steam { display: inline }
    .pg-b10-steam path { opacity: 0; transform-box: fill-box; transform-origin: 50% 100% }
    &[data-mood=working] .pg-b10-steam path { animation: bx-puff 1.2s ease-out infinite }
    &[data-mood=working] .pg-b10-steam path + path { animation-delay: .5s }
  `,
});
