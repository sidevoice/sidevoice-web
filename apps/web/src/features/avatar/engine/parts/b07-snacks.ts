import { LAYER, batch, darkMark, ellipse, isDarkCoat, n, spanAt, topAt, type Ctx, type Drawing, type Eye, type Paint, type Piece, type Rig } from "../bichos/kit";

/* B07 Snacks (docs/catalogue.md §1.2 F4, §2.1, §2.10, §2.11, §5.2): the Golosinas family, where the body is the food,
 * and its toppings: butter, caramel (plain or with a cherry), a cherry, frosting, dumpling pleats, a cracked eggshell
 * and a strawberry calyx; the nori, crust, wrapper, seeds, sprinkles and crack patterns; and a fork to hold.
 *
 * Small rigid tops (butter, cherry, calyx) are drawn on the reference body (crown at 42, head top at ~38) and join
 * `crown` at [60, 42], like the existing tops. Toppings that must hug the head (caramel, frosting, pleats, eggshell) are
 * fitted: they read the body's real outline (`topAt`, `spanAt`) and the planned eyes (`ctx.eyes`), so they sit on a
 * box's lid, a pill's dome or a drop's tip alike. Like B02's caps they lie over the head (layer body + 1), draw an
 * inner copy of themselves with a thin ink edge where they lie on it, declare their `brim` and replace the gloss.
 *
 * Paint on the body (seeds, sprinkles, the crack, nori, crust) goes on LAYER.skin, so arms, hats and caps cover it.
 * Nori and crust are clipped to the outline (tag `clipped`, at most one per bicho); the wrapper is a merged paper cup
 * that flares past the body, so a cupcake reads by its silhouette at 28 px.
 *
 * Food has fixed colours that no role gives: nori green-black, caramel amber, a silver fork. They are literals (they
 * get the same shading); everything else is a role. Animation: the cherry rides the shared `sprout` group (it sways
 * while talking, perks up while waiting, nods off at idle), the fork rides the arm's group through `handR`, and the
 * rest only the shared squash. No new keyframes or groups. */

type P = [number, number];
const pt = (p: P) => `${n(p[0])} ${n(p[1])}`;
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const unit = (a: P): P => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Turns p about c by `deg` (clockwise on screen). */
const turn = (p: P, c: P, deg: number): P => {
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a), d = sub(p, c);
  return [c[0] + d[0] * cos - d[1] * sin, c[1] + d[0] * sin + d[1] * cos];
};
const poly = (pts: P[]) => `M${pts.map(pt).join("L")}`;

/** Fixed food colours (literals get the cast's shading like any role). */
const NORI = "#2d3c33", NORI_FIBRE = "#3f5446", CARAMEL = "#a4561d", SILVER = "#c9d0da", GLINT = "#ffffff";

/* ---------- reading the head ---------- */

/** The span of the outline at height y, or a guess from the face when y misses the body. */
const spanOf = (rig: Rig, y: number): [number, number] => spanAt(rig, y) ?? [60 - rig.faceHalf * 0.7, 60 + rig.faceHalf * 0.7];
/** The eyes as drawn (or planned, for tops); a default pair when the bicho has none yet. */
const eyesOf = (ctx: Ctx): Eye[] => (ctx.eyes.length ? ctx.eyes : [{ ...ctx.rig.at.eyeL, r: 8.5 }, { ...ctx.rig.at.eyeR, r: 8.5 }]);
const eyesTop = (ctx: Ctx) => Math.min(...eyesOf(ctx).map((e) => e.y - e.r));

/** The head's outline above height `by`, left to right: N + 1 points, closer together near the ends, each with its
 * outward normal. */
function arcAbove(rig: Rig, by: number, N = 24) {
  const [xl, xr] = spanOf(rig, by);
  const ups: P[] = [];
  for (let i = 0; i <= N; i += 1) { const x = xl + (xr - xl) * ((1 - Math.cos((Math.PI * i) / N)) / 2); ups.push([x, Math.min(by, topAt(rig, x))]); }
  const nrm = ups.map((_, i): P => { const t = unit(sub(ups[Math.min(N, i + 1)], ups[Math.max(0, i - 1)])); return [t[1], -t[0]]; });
  return { ups, nrm, xl, xr };
}

/** The body's gloss kept below height `stop` (a topping covers the rest): it follows the left edge, a few units in. */
function glossBelow(rig: Rig, stop: number): string {
  const y0 = rig.eyeY + 2, y2 = Math.min(stop + 4.5, y0 - 6), y1 = (y0 + y2) / 2;
  const edge = (y: number, inset: number) => (spanAt(rig, y)?.[0] ?? 60 - rig.faceHalf) + inset;
  return `M${n(edge(y0, 5.5))} ${n(y0)}Q${n(edge(y1, 3))} ${n(y1)} ${n(edge(y2, 6))} ${n(y2)}`;
}

/** A merged piece lying on the head plus an inner copy with a thin ink edge (its outline would hide under the body). */
const onHead = (d: string, c: Paint, layer: number = LAYER.body + 1, stroke = 2.2): Piece[] => [
  { d, c, layer },
  { d, c, layer, ink: "inner", stroke },
];

/** An ellipse turned by `deg`, as four cubic arcs. */
function turnedEllipse(cx: number, cy: number, rx: number, ry: number, deg: number): string {
  const k = 0.5523, c: P = [cx, cy], q = (x: number, y: number) => pt(turn([cx + x, cy + y], c, deg));
  return `M${q(-rx, 0)}C${q(-rx, -ry * k)} ${q(-rx * k, -ry)} ${q(0, -ry)}C${q(rx * k, -ry)} ${q(rx, -ry * k)} ${q(rx, 0)}`
    + `C${q(rx, ry * k)} ${q(rx * k, ry)} ${q(0, ry)}C${q(-rx * k, ry)} ${q(-rx, ry * k)} ${q(-rx, 0)}Z`;
}

/* ---------- the cherry (its own top, and on the caramel) ---------- */

/** A cherry sitting at (cx, base): a ball with a dimple where the stem goes, a curved stem and a glint. */
function cherry(cx: number, base: number, k: number, g?: string): Piece[] {
  const cy = base - 6.6 * k, p = (x: number, y: number) => `${n(cx + x * k)} ${n(cy + y * k)}`;
  const ball = `M${p(0, -5)}C${p(2.6, -7.6)} ${p(7.2, -5.8)} ${p(7.2, -0.2)}C${p(7.2, 4.6)} ${p(3.8, 6.8)} ${p(0, 6.8)}C${p(-3.8, 6.8)} ${p(-7.2, 4.6)} ${p(-7.2, -0.2)}C${p(-7.2, -5.8)} ${p(-2.6, -7.6)} ${p(0, -5)}Z`;
  return [
    { d: `M${p(0.2, -4.6)}Q${p(0.8, -11)} ${p(5.4, -15.4)}`, c: "dark", w: 2.6 * k, flat: true, g },
    { d: ball, c: "spot", g },
    { d: ellipse(cx - 3 * k, cy - 2.2 * k, 1.9 * k, 1.3 * k), c: GLINT, ink: "inner", flat: true, lod: 1, g },
  ];
}

/* ---------- the strawberry calyx ---------- */

/** Five sepals in a flat star round (60, 40.5): two lean back, two lie along the shoulders, one droops on the forehead.
 * [angle from up (clockwise), length, half width]. */
const SEPALS: [number, number, number][] = [[52, 11, 3.6], [104, 14, 4], [180, 8.6, 3.4], [256, 14, 4], [308, 11, 3.6]];
function calyxStar(): string {
  const c: P = [60, 40.5], rin = 3, dir = (deg: number): P => [Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180)];
  const valley = (a: number, b: number) => { const m = ((a + ((b - a + 360) % 360) / 2) % 360); return add(c, mul(dir(m), rin)); };
  let d = "";
  SEPALS.forEach(([deg, len, w], i) => {
    const prev = SEPALS[(i + SEPALS.length - 1) % SEPALS.length][0], next = SEPALS[(i + 1) % SEPALS.length][0];
    const v0 = valley(prev, deg), v1 = valley(deg, next), u = dir(deg), side: P = [-u[1], u[0]], tip = add(c, mul(u, len));
    const at = (k: number, off: number) => add(c, add(mul(u, len * k), mul(side, off)));
    if (!i) d += `M${pt(v0)}`;
    d += `C${pt(at(0.32, -w))} ${pt(at(0.78, -w * 0.62))} ${pt(tip)}C${pt(at(0.78, w * 0.62))} ${pt(at(0.32, w))} ${pt(v1)}`;
  });
  return d + "Z";
}
const CALYX = calyxStar();

/* ---------- butter ---------- */

const BUTTER_PAT = (() => {
  const c: P = [60, 39], q = (x: number, y: number) => pt(turn([x, y], c, -7));
  return `M${q(51.5, 31)}L${q(68.5, 31)}Q${q(70.5, 31)} ${q(70.5, 33)}L${q(70.5, 38)}Q${q(70.5, 40)} ${q(68.5, 40)}L${q(51.5, 40)}Q${q(49.5, 40)} ${q(49.5, 38)}L${q(49.5, 33)}Q${q(49.5, 31)} ${q(51.5, 31)}Z`;
})();
const BUTTER_BEVEL = (() => { const c: P = [60, 39], q = (x: number, y: number) => pt(turn([x, y], c, -7)); return `M${q(52.4, 33)}L${q(66.6, 33)}`; })();
const BUTTER_DRIP = "M63.6 38.6L63.6 43.4A1.9 1.9 0 0 0 67.4 43.4L67.4 38.4Z";
const BUTTER_DRIP_EDGE = "M63.6 39.6L63.6 43.4A1.9 1.9 0 0 0 67.4 43.4L67.4 39.4";

/* ---------- caramel ---------- */

/** Caramel poured over the head: a glossy cap hugging the real outline and bulging a little over it, its edge running
 * into up to three drips with round ends. The drips go where the eyes leave room (between them and beside them) and
 * stop above them; where there is no room a drip is a short bump. With `withCherry`, a cherry sits on top. */
function caramel(ctx: Ctx, withCherry: boolean): Drawing {
  const { rig } = ctx, s = rig.at.crown.s ?? 1, r = ctx.rng("b07-caramel"), eyes = eyesOf(ctx), top = topAt(rig, 60);
  const by = Math.max(top + 4.5 * s, Math.min(top + clamp(0.36 * (rig.eyeY - top), 6, 12) * s, ...eyes.map((e) => e.y - e.r - 3)));
  const N = 24, { ups, nrm, xl, xr } = arcAbove(rig, by, N);
  const off = ups.map((p, i) => add(p, mul(nrm[i], (1.4 + 2.2 * Math.sin((Math.PI * i) / N)) * s)));

  // Every spot along the edge scores the longest drip the eyes allow; the best three that keep apart win.
  const hw = 3.1 * s, most = 12 * s;
  const room = (x: number) => eyes.reduce((b, e) => (Math.abs(x - e.x) < e.r + hw + 1.2 ? Math.min(b, e.y - e.r - 2.5) : b), by + most) - by;
  const spots: { x: number; len: number }[] = [];
  for (let x = xl + 3; x <= xr - 3; x += 0.5) spots.push({ x: x + r.range(-0.2, 0.2), len: room(x) });
  spots.sort((p, q) => q.len - p.len);
  const drops: { x: number; len: number }[] = [];
  for (const sp of spots) if (drops.length < 3 && drops.every((d) => Math.abs(d.x - sp.x) > 2 * hw + 6)) drops.push(sp);
  drops.forEach((d) => { d.len *= r.range(0.62, 1); });
  drops.sort((p, q) => q.x - p.x);

  let lower = `L${n(xr - 0.6)} ${n(by + 0.4)}`;
  for (const { x, len } of drops) {
    const nw = hw * 0.82, cy = by + len - hw;
    lower += cy - 0.4 * hw > by + 3
      // A drip: it narrows off the edge into a neck and ends in a round drop a little wider than the neck.
      ? `L${n(x + hw + 3.6)} ${n(by + 0.5)}Q${n(x + nw)} ${n(by + 0.7)} ${n(x + nw)} ${n(by + 3)}L${n(x + nw)} ${n(cy)}A${n(hw)} ${n(hw)} 0 1 1 ${n(x - nw)} ${n(cy)}L${n(x - nw)} ${n(by + 3)}Q${n(x - nw)} ${n(by + 0.7)} ${n(x - hw - 3.6)} ${n(by + 0.5)}`
      : `L${n(x + hw + 3)} ${n(by + 0.5)}Q${n(x + hw)} ${n(by + 0.4)} ${n(x + hw)} ${n(by + 1.4)}A${n(hw)} ${n(hw)} 0 0 1 ${n(x - hw)} ${n(by + 1.4)}Q${n(x - hw)} ${n(by + 0.4)} ${n(x - hw - 3)} ${n(by + 0.5)}`;
  }
  lower += `L${pt(off[0])}`;
  const cap = `M${pt(off[0])}${off.slice(1).map((q) => `L${pt(q)}`).join("")}${lower}Z`;
  const hi = off.slice(3, 9).map((q, i) => `${i ? "L" : "M"}${pt(sub(q, mul(nrm[i + 3], 2.6 * s)))}`).join("");
  const leftLow = Math.max(by + 2, ...drops.filter((d) => d.x < 52).map((d) => by + d.len));
  const pieces: Piece[] = [
    { d: cap, c: CARAMEL, layer: LAYER.body + 1 },
    { d: `M${pt(off[N])}${lower}`, c: "ink", w: 2.2, ink: "inner", flat: true },
  ];
  // The cherry sits in the caramel at its peak, half a layer under it, so the sauce covers its bottom.
  if (withCherry) {
    const peak = off.reduce((a, q) => (q[1] < a[1] ? q : a), off[0]);
    pieces.push(...cherry(peak[0] + 0.5, peak[1] + 2.2 * s, 0.92 * s, "sprout").map((p) => ({ ...p, layer: p.ink === "inner" ? LAYER.body + 1 : LAYER.body + 0.9 })));
  }
  return { pieces, face: { shine: hi + glossBelow(rig, leftLow) }, brim: by + 1.4 };
}

/* ---------- frosting ---------- */

interface Roll { cx: number; cy: number; rx: number; ry: number; deg: number }
/** The swirl: three fat rolls stacked on the head, each narrower than the one under it, and a curled tip. The base
 * roll overhangs the head like a muffin top and stops above the eyes. Shared by the frosting and the sprinkles (they
 * land on it when it is there). */
function frostingPlan(ctx: Ctx) {
  const { rig } = ctx, s = rig.at.crown.s ?? 1, top = topAt(rig, 60);
  const low = Math.max(top + 9 * s, Math.min(top + 13 * s, eyesTop(ctx) - 3));
  const sp = spanAt(rig, top + 14 * s) ?? [60 - rig.faceHalf * 0.8, 60 + rig.faceHalf * 0.8];
  const W = clamp((sp[1] - sp[0]) / 2 + 3.5 * s, 16 * s, 30 * s);
  const r1: Roll = { cx: 60, cy: low - 8 * s, rx: W, ry: 8 * s, deg: -2 };
  const r2: Roll = { cx: 60.6, cy: r1.cy - 8.2 * s, rx: W * 0.76, ry: 7 * s, deg: 3 };
  const r3: Roll = { cx: 59.6, cy: r2.cy - 7.4 * s, rx: W * 0.5, ry: 6 * s, deg: -3 };
  return { s, rolls: [r1, r2, r3], low };
}

function frosting(ctx: Ctx): Drawing {
  const { rig } = ctx, f = frostingPlan(ctx), { s, rolls } = f, r3 = rolls[2];
  const tipY = r3.cy - r3.ry + 1.6 * s, tx = r3.cx;
  const tip = `M${n(tx - 4.4 * s)} ${n(tipY + 1.6 * s)}C${n(tx - 4.2 * s)} ${n(tipY - 4.4 * s)} ${n(tx + 0.2 * s)} ${n(tipY - 7.4 * s)} ${n(tx + 4.6 * s)} ${n(tipY - 8.6 * s)}`
    + `C${n(tx + 2.6 * s)} ${n(tipY - 5.2 * s)} ${n(tx + 4.8 * s)} ${n(tipY - 1.6 * s)} ${n(tx + 4.4 * s)} ${n(tipY + 1.6 * s)}Z`;
  const shapes = [...rolls.map((q) => turnedEllipse(q.cx, q.cy, q.rx, q.ry, q.deg)), tip];
  const r2 = rolls[1];
  const gloss = `M${n(r2.cx - r2.rx * 0.74)} ${n(r2.cy - r2.ry * 0.1)}Q${n(r2.cx - r2.rx * 0.64)} ${n(r2.cy - r2.ry * 0.82)} ${n(r2.cx - r2.rx * 0.2)} ${n(r2.cy - r2.ry * 0.96)}`;
  return {
    pieces: [
      ...shapes.map((d): Piece => ({ d, c: "spot", layer: LAYER.body + 1 })),
      ...shapes.map((d): Piece => ({ d, c: "spot", layer: LAYER.body + 1, ink: "inner", stroke: 2.2 })),
    ],
    face: { shine: gloss + glossBelow(rig, f.low) },
    brim: f.low + 1.1,
  };
}

/* ---------- dumpling pleats ---------- */

/** A crimped ridge along the top of the head: a row of tucks standing on the real outline, each leaning the same way
 * and pinched where the next one folds over it, tapering into the head at both ends; a seam along its foot and a short
 * curved fold under each pinch. */
function pleats(ctx: Ctx): Drawing {
  const { rig } = ctx, s = rig.at.crown.s ?? 1, top = topAt(rig, 60);
  const [l, r] = spanOf(rig, top + 7 * s), xa = l + 1, xb = r - 1;
  const tucks = Math.max(4, Math.round((xb - xa) / (6.6 * s))), M = tucks * 10;
  const base: P[] = [], nrm: P[] = [];
  for (let i = 0; i <= M; i += 1) { const x = xa + ((xb - xa) * i) / M; base.push([x, topAt(rig, x)]); }
  for (let i = 0; i <= M; i += 1) { const t = unit(sub(base[Math.min(M, i + 1)], base[Math.max(0, i - 1)])); nrm.push([t[1], -t[0]]); }
  // Each tuck rises steeply and falls away slowly (a lean to the right), then pinches into the next.
  const crest = base.map((b, i) => {
    const t = i / M, env = Math.pow(Math.sin(Math.PI * t), 0.45), k = (t * tucks) % 1;
    return add(b, mul(nrm[i], env * (1.2 + 4.6 * Math.sin(Math.PI * Math.pow(k, 0.55))) * s));
  });
  const foot = base.map((b, i) => sub(b, mul(nrm[i], 2.5)));
  const ridge = `${poly(crest)}L${[...foot].reverse().map(pt).join("L")}Z`;
  let folds = "";
  for (let k = 1; k < tucks; k += 1) {
    const i = Math.round((k / tucks) * M), b = base[i], nn = nrm[i], tg: P = [-nn[1], nn[0]];
    const a = sub(b, mul(nn, 0.4)), e = add(sub(b, mul(nn, 4.4 * s)), mul(tg, 1.8 * s));
    folds += `M${pt(a)}Q${pt(add(sub(b, mul(nn, 2.6 * s)), mul(tg, -0.4 * s)))} ${pt(e)}`;
  }
  const seam = poly(base.slice(Math.round(M * 0.05), Math.round(M * 0.95) + 1));
  return {
    pieces: [
      { d: ridge, c: "body" },
      { d: seam, c: "dark", w: 1.8, ink: "inner", flat: true, layer: LAYER.skin },
      { d: folds, c: "dark", w: 1.5, ink: "inner", flat: true, layer: LAYER.skin, lod: 1 },
    ],
  };
}

/* ---------- eggshell ---------- */

/** The egg's top, cracked off and tilted open like a lid: a shell cap with a zigzag edge, hinged at one end and lifted
 * at the other, showing the yolk inside. */
function eggshell(ctx: Ctx): Drawing {
  const { rig } = ctx, s = rig.at.crown.s ?? 1, r = ctx.rng("b07-egg"), top = topAt(rig, 60);
  // Deep enough to read as a lid (6.5 under the head top), and clear of the eyes when the head leaves room.
  const yc = Math.max(top + 6.5 * s, Math.min(top + clamp(0.42 * (rig.eyeY - top), 8, 14.5) * s, eyesTop(ctx) - 7));
  const amp = 2.6 * s, N = 22, { ups, nrm, xl, xr } = arcAbove(rig, yc, N);
  const teeth = Math.max(4, Math.round((xr - xl) / (5 * s)));
  const crack: P[] = [];
  for (let i = 0; i <= teeth; i += 1) {
    const x = xl + ((xr - xl) * i) / teeth, end = i === 0 || i === teeth;
    crack.push([x, end ? yc : yc + (i % 2 ? -amp : amp) + r.range(-0.5, 0.5)]);
  }
  const inside = `${poly(crack)}L${[...ups].reverse().map(pt).join("L")}Z`;
  // The cap: the shell above the crack, a hair bigger than the head, turned open on its hinge and lifted.
  const side = r.chance(0.5) ? 1 : -1, hinge = side > 0 ? crack[0] : crack[teeth], deg = -side * r.range(12, 16), lift = 2 * s;
  const shell = [...crack.map((p, i) => (i === 0 ? add(p, [-1.2, 0]) : i === teeth ? add(p, [1.2, 0]) : p)), ...[...ups].reverse().map((p, i) => add(p, mul(nrm[N - i], 1.3 * s)))];
  const moved = shell.map((p) => add(turn(p, hinge, deg), [0, -lift]));
  const cap = `${poly(moved)}Z`;
  const rim = moved.slice(0, teeth + 1);
  const lowest = Math.max(...rim.map((p) => p[1]));
  // A gloss on the shell's upper left (turned with it), and the body's own gloss below the crack.
  const hiPts = ups.slice(3, 9).map((p, i) => add(turn(sub(p, mul(nrm[i + 3], 1.6 * s)), hinge, deg), [0, -lift]));
  return {
    pieces: [
      { d: inside, c: "gold", ink: "inner", layer: LAYER.skin },
      { d: poly(crack), c: "ink", w: 2, ink: "inner", flat: true, layer: LAYER.skin },
      ...onHead(cap, "body", LAYER.body + 1, 2.4),
    ],
    face: { shine: poly(hiPts) + glossBelow(rig, yc + amp) },
    brim: lowest + 1.2,
  };
}

/* ---------- patterns ---------- */

/** Is (x, y) on the face: the eyes and their brows, the nose, the mouth (open shape included), the cheeks? */
function onFace(ctx: Ctx, x: number, y: number, pad = 0): boolean {
  const { rig } = ctx, m = rig.at.mouth, chin = rig.at.chin;
  for (const e of eyesOf(ctx)) {
    if (Math.hypot(x - e.x, y - e.y) < e.r + 4 + pad) return true;
    if (Math.abs(x - e.x) < e.r + 2 + pad && y > e.y - e.r - 11 - pad && y < e.y) return true;
  }
  if (Math.abs(x - m.x) < 13 + pad && y > m.y - 7 - pad && y < chin.y + 1.5 + pad) return true;
  if (Math.abs(x - 60) < 6 + pad && y > rig.at.muzzle.y - 6 && y < m.y) return true;
  if (ctx.has("cheeks")) for (const c of [rig.at.cheekL, rig.at.cheekR]) if (Math.hypot(x - c.x, y - c.y) < 6.5 + pad) return true;
  return false;
}

/** Points on a jittered grid inside the outline (`inset` from it), off the face and under any brim. */
function scatter(ctx: Ctx, salt: string, step: number, inset: number, skip: number, pad = 0): P[] {
  const { rig } = ctx, r = ctx.rng(salt), out: P[] = [];
  const ceiling = ctx.brim ?? -Infinity;
  for (let y = rig.top + 4, row = 0; y < rig.bottom - 2; y += step * 0.92, row += 1) {
    const sp = spanAt(rig, y);
    if (!sp) continue;
    for (let x = sp[0] + inset + (row % 2) * step * 0.5; x < sp[1] - inset; x += step) {
      const p: P = [x + r.range(-step * 0.2, step * 0.2), y + r.range(-step * 0.2, step * 0.2)];
      const at = spanAt(rig, p[1]);
      if (!at || p[0] < at[0] + inset || p[0] > at[1] - inset || p[1] < topAt(rig, p[0]) + inset || p[1] < ceiling + 2) continue;
      if (onFace(ctx, p[0], p[1], pad) || r.chance(skip)) continue;
      out.push(p);
    }
  }
  return out;
}

/** Onigiri nori: a dark sheet wrapped round the bottom, under the mouth, clipped to the body. */
function nori(ctx: Ctx): Drawing {
  const { rig } = ctx, y0 = Math.max(rig.mouthY + 5.5, rig.bottom - 17), [l, r] = spanOf(rig, y0);
  const hw = Math.min(((r - l) / 2) * 0.66, 24 * rig.u), rc = 2.6, yb = rig.bottom + 8;
  const sheet = `M${n(60 - hw)} ${yb}L${n(60 - hw)} ${n(y0 + rc)}Q${n(60 - hw)} ${n(y0)} ${n(60 - hw + rc)} ${n(y0)}L${n(60 + hw - rc)} ${n(y0)}Q${n(60 + hw)} ${n(y0)} ${n(60 + hw)} ${n(y0 + rc)}L${n(60 + hw)} ${yb}Z`;
  const fibres = `M${n(60 - hw + 4)} ${n(y0 + 4)}L${n(60 - hw + 9)} ${n(y0 + 9)}M${n(60 + hw - 10)} ${n(y0 + 3)}L${n(60 + hw - 4)} ${n(y0 + 9)}`;
  return {
    pieces: [
      { d: sheet, c: NORI, ink: "inner", flat: true, clip: true, layer: LAYER.skin },
      { d: fibres, c: NORI_FIBRE, w: 1.4, ink: "inner", flat: true, clip: true, layer: LAYER.skin, lod: 2 },
    ],
  };
}

/** Toast crust: a dark rim just inside the outline, all the way round (the outline itself, stroked and clipped). */
function crust(ctx: Ctx): Drawing {
  const { rig, spec } = ctx;
  return { pieces: [{ d: rig.outline, c: darkMark(spec, "dark"), w: 10.5, ink: "inner", flat: true, clip: true, layer: LAYER.skin }] };
}

/** A cupcake's paper cup: the lower body wrapped in a pleated liner that flares a little past the sides (merged, so
 * the silhouette turns into a cupcake), with a scalloped rim. */
function wrapper(ctx: Ctx): Drawing {
  const { rig } = ctx, u = rig.u;
  const y0 = clamp(rig.mouthY + 8, rig.bottom - 26, rig.bottom - 14);
  const left: P[] = [], right: P[] = [];
  let last = y0;
  for (let y = y0; y < rig.bottom + 4; y += 1.2) {
    const sp = spanAt(rig, y);
    if (!sp) break;
    const t = (y - y0) / (rig.bottom - y0), f = 2.8 * u * Math.max(0, 1 - t);
    left.push([sp[0] - f, y]); right.push([sp[1] + f, y]);
    last = y;
  }
  const xl = left[0][0], xr = right[0][0], bumps = Math.max(5, Math.round((xr - xl) / 5.2)), chord = (xr - xl) / bumps;
  let rim = "";
  for (let i = 1; i <= bumps; i += 1) rim += `A${n(chord * 0.6)} ${n(chord * 0.6)} 0 0 0 ${n(xr - chord * i)} ${n(y0)}`;
  const cup = `${poly(left)}L${[...right].reverse().map(pt).join("L")}${rim}Z`;
  // Pleats: lines from the rim to near the base, gathering a little towards the bottom like a real liner.
  const count = Math.max(5, Math.round((xr - xl) / 6.5));
  let lines = "";
  for (let i = 1; i < count; i += 1) {
    const xt = xl + ((xr - xl) * i) / count, xb = 60 + (xt - 60) * 0.8;
    let yb = y0 + 3;
    for (let y = y0 + 3; y <= last; y += 0.6) { const sp = spanAt(rig, y); if (!sp || xb < sp[0] + 3 || xb > sp[1] - 3) break; yb = y; }
    if (yb - y0 > 6) lines += `M${n(xt)} ${n(y0 + 2.2)}L${n(xb)} ${n(yb - 1.5)}`;
  }
  return {
    pieces: [
      { d: cup, c: "horn" },
      { d: lines, c: "dark", w: 1.5, ink: "inner", flat: true, lod: 1 },
    ],
  };
}

/** Strawberry seeds: little gold teardrops on a jittered grid over the body, off the face and under the calyx. */
function seeds(ctx: Ctx): Drawing {
  const pts = scatter(ctx, "b07-seeds", 5.9, 3.6, 0.1);
  const d = pts.map(([x, y]) => `M${n(x)} ${n(y - 2.1)}Q${n(x + 1.55)} ${n(y + 0.3)} ${n(x)} ${n(y + 1.6)}Q${n(x - 1.55)} ${n(y + 0.3)} ${n(x)} ${n(y - 2.1)}Z`).join("");
  return { pieces: [{ d, c: "gold", ink: "inner", flat: true, layer: LAYER.skin }] };
}

/** Sprinkles: short dashes in the spot, gold and pink. On frosting when there is some, else over the crown and flanks. */
function sprinkles(ctx: Ctx): Drawing {
  const { rig } = ctx, r = ctx.rng("b07-sprinkles"), paints: Paint[] = ["spot", "gold", "pink"];
  const dash = (p: P, len: number) => { const a = r.range(0, Math.PI); const v: P = [Math.cos(a) * len / 2, Math.sin(a) * len / 2]; return `M${pt(sub(p, v))}L${pt(add(p, v))}`; };
  const groups: string[] = ["", "", ""];
  if (ctx.has("top:frosting")) {
    const f = frostingPlan(ctx), spots: P[] = [];
    // A few on each roll, on its front, clear of its edges (the roll above covers its back).
    f.rolls.forEach((q, j) => {
      const k = [5, 4, 2][j];
      for (let i = 0; i < k; i += 1) { const u = -0.7 + (1.4 * (i + r.range(0.25, 0.75))) / k; spots.push([q.cx + u * q.rx, q.cy + r.range(0.05, 0.45) * q.ry * Math.sqrt(1 - u * u)]); }
    });
    spots.forEach((p, i) => { groups[i % 3] += dash(p, 3.8 * f.s); });
    return { pieces: groups.map((d, i): Piece => ({ d, c: paints[i], w: 2.3, ink: "inner", flat: true, layer: LAYER.body + 1.5 })) };
  }
  scatter(ctx, "b07-sprinkles-at", 6.6, 3.8, 0.18).forEach((p, i) => { groups[i % 3] += dash(p, 4); });
  return { pieces: groups.map((d, i): Piece => ({ d, c: paints[i], w: 2.2, ink: "inner", flat: true, layer: LAYER.skin })) };
}

/** A zigzag crack running in from one flank, with a short branch. It runs in until it would meet the face, at a height
 * clear of the arm's root when there is an arm, where it has the most room. */
function crack(ctx: Ctx): Drawing {
  const { rig, spec } = ctx, r = ctx.rng("b07-crack"), side = r.chance(0.5) ? -1 : 1;
  const arm = ctx.has("arms") ? rig.at.shoulderL.y : -Infinity;
  const reachAt = (y: number) => {
    const sp = spanAt(rig, y);
    if (!sp) return { y, edge: 60, reach: 0 };
    const edge = side < 0 ? sp[0] : sp[1];
    let reach = 0;
    while (reach < 14 && !onFace(ctx, edge - side * (reach + 1), y, 1.5) && Math.abs(edge - side * (reach + 1) - 60) > 2) reach += 1;
    return { y, edge, reach };
  };
  const options: { y: number; edge: number; reach: number }[] = [];
  for (let y = rig.eyeY - 2; y <= rig.bottom - 6; y += 1) if (Math.abs(y - arm) > 8) options.push(reachAt(y));
  const room = options.filter((o) => o.reach >= 7);
  const pick = room.length ? room[Math.floor(r.next() * room.length)] : options.reduce((a, o) => (o.reach > a.reach ? o : a), reachAt(rig.mouthY));
  const { y, edge } = pick, reach = Math.max(5, pick.reach);
  const pts: P[] = [[edge + side * 0.6, y]];
  for (let i = 1; i <= 4; i += 1) pts.push([edge - side * (reach * i) / 4, y + (i % 2 ? -2.3 : 1.6) + i * 0.6]);
  const branch = `M${pt(pts[2])}l${n(-side * 2.6)} ${n(3.4)}`;
  return { pieces: [{ d: poly(pts) + branch, c: isDarkCoat(spec) ? "belly" : "ink", w: 2, ink: "inner", flat: true, layer: LAYER.skin }] };
}

/* ---------- the fork ---------- */

/** An upright fork held in the right hand (the reference body's right nub ends at [99, 82]), leaning out a little. */
const FORK = (() => {
  const c: P = [99, 82], q = (x: number, y: number) => pt(turn([c[0] + x, c[1] + y], c, 12));
  let d = `M${q(-1.5, 6)}L${q(-1.2, -14)}C${q(-1.2, -16)} ${q(-4.6, -16.5)} ${q(-4.6, -19.5)}`;
  for (let k = 0; k < 4; k += 1) {
    const x0 = -4.6 + k * 2.5, x1 = x0 + 1.7;
    d += `L${q(x0, -27.4)}Q${q(x0, -28.3)} ${q((x0 + x1) / 2, -28.3)}Q${q(x1, -28.3)} ${q(x1, -27.4)}`;
    if (k < 3) d += `L${q(x1, -21.5)}L${q(x1 + 0.8, -21.5)}`;
  }
  return `${d}L${q(4.6, -19.5)}C${q(4.6, -16.5)} ${q(1.2, -16)} ${q(1.2, -14)}L${q(1.5, 6)}Q${q(0, 7.6)} ${q(-1.5, 6)}Z`;
})();

/* ---------- the batch ---------- */

// Toppings a hat would sit on: hats hide them. Tall ones (over ~14 above the crown) are `tall`, and those a headphone
// band would cut through are `blocks-band`.
const CROWN = { slot: "top", at: "crown", socket: [60, 42] as P };

export default batch({
  label: "B07 Golosinas",

  parts: [
    /* ---------- tops ---------- */
    {
      // A pat of butter on top, sunk into the head, one corner already melting.
      ...CROWN, id: "butter", label: "mantequilla", noise: 1, tags: ["hat-hidden"], jitter: { rot: 5 },
      draw: {
        pieces: [
          { d: BUTTER_PAT, c: "gold" },
          { d: BUTTER_BEVEL, c: "horn", w: 1.6, ink: "inner", flat: true, lod: 1 },
          { d: BUTTER_DRIP, c: "gold", layer: LAYER.body + 1, lod: 1 },
          { d: BUTTER_DRIP_EDGE, c: "ink", w: 1.8, ink: "inner", flat: true, layer: LAYER.body + 1, lod: 1 },
        ],
      },
    },
    { id: "caramel", slot: "top", label: "caramelo", noise: 1, tags: ["hat-hidden"], draw: (ctx) => caramel(ctx, false) },
    { id: "caramel-cherry", slot: "top", label: "caramelo y guinda", tags: ["tall", "blocks-band"], draw: (ctx) => caramel(ctx, true) },
    {
      // A cherry on top, sunk a little into the head; it sways and nods with the plant tops.
      ...CROWN, id: "cherry", label: "guinda", group: "sprout", tags: ["tall", "blocks-band"], jitter: { rot: 6 },
      draw: { pieces: cherry(60, 41, 1) },
    },
    { id: "frosting", slot: "top", label: "nata montada", tags: ["tall", "blocks-band"], draw: frosting },
    { id: "pleats", slot: "top", label: "repulgue", noise: 1, tags: ["hat-hidden"], draw: pleats },
    { id: "eggshell", slot: "top", label: "cáscara", noise: 1, tags: ["hat-hidden"], draw: eggshell },
    {
      // A strawberry's leafy cap lying flat on the head: drawn over it, with a thin edge where it lies on it.
      ...CROWN, id: "calyx", label: "hojitas de fresa", noise: 1, tags: ["hat-hidden"], jitter: { rot: 4, size: 0.05 },
      draw: { pieces: [{ d: "M60 40.5Q59.4 34 62.4 29.4", c: "spot", w: 3.2, flat: true }, ...onHead(CALYX, "spot")] },
    },

    /* ---------- patterns ---------- */
    { id: "nori", slot: "pattern", label: "alga nori", tags: ["clipped"], excludes: ["#clipped", "pattern:belly"], draw: nori },
    { id: "crust", slot: "pattern", label: "corteza", tags: ["clipped"], excludes: ["#clipped"], draw: crust },
    { id: "wrapper", slot: "pattern", label: "cápsula de papel", excludes: ["#clipped", "pattern:belly"], draw: wrapper },
    { id: "seeds", slot: "pattern", label: "pepitas", lod: 1, draw: seeds },
    { id: "sprinkles", slot: "pattern", label: "virutas", draw: sprinkles },
    { id: "crack", slot: "pattern", label: "grieta", lod: 1, draw: crack },

    /* ---------- held ---------- */
    {
      // Weight 4 (B14): at the default 10, plus the snacks' own pool, it was the most common held item.
      id: "fork", slot: "held", label: "tenedor", at: "handR", socket: [99, 82], pair: false, requires: ["#hand"], lod: 2, weight: 4,
      // Half a layer under the arms, so the hand closes over the handle.
      layer: LAYER.arms - 0.5,
      draw: { pieces: [{ d: FORK, c: SILVER }] },
    },
  ],

  families: [
    {
      id: "snacks", label: "Golosinas", weight: 9,
      color: { hue: [0, 360], sat: [30, 45], light: [78, 88], spot: 150 },
      // Every snack may blush, wear a bib (B10) or hold a fork (B14: both cut, they had become the commonest neckwear and
      // held item of the whole cast).
      pools: { cheeks: { p: 0.45, pick: { blush: 10, "shy-lines": 3 } }, neckwear: { p: 0.05, pick: { bib: 10 } }, held: { p: 0.03, pick: { fork: 10 } } },
      // Lent to other families' bichos only: a cherry or a pat of butter on the head, sprinkles.
      cross: { top: { cherry: 10, butter: 4 }, pattern: { sprinkles: 8 } },
    },
  ],

  // Every snack has arms (B14's arms rule): nubs, or the cartoon gloves of a food mascot (B06's mitts).
  members: [
    {
      // A rice ball with its nori.
      id: "onigiri", family: "snacks", label: "onigiri", bodies: "tri",
      fixed: { pattern: ["nori"], legs: "feet", arms: { nubs: 10, mitts: 4 } },
      pools: { eyes: { button: 10, two: 6, sleepy: 4 }, mouth: { tiny: 10, smile: 8, cat: 6, pout: 3, wavy: 3 }, cheeks: { p: 0.7, pick: { blush: 10, "shy-lines": 4 } } },
      color: { hue: [0, 360], sat: 8, light: 92, spot: 150 },
    },
    {
      id: "tostada", family: "snacks", label: "tostada", bodies: "box",
      fixed: { pattern: ["crust"], top: "butter", arms: { nubs: 10, mitts: 4 }, legs: "feet" },
      pools: { eyes: { two: 10, button: 8, sparkle: 4, googly: 4 }, mouth: { smile: 10, grin: 6, tongue: 5, buck: 4, smirk: 3 } },
      color: { hue: [34, 40], sat: 55, light: 72, spot: 180 },
    },
    {
      // A squishy rice cake: button eyes and rosy cheeks, often no feet at all; now and then a cherry on top (B14: the cherry
      // was only lent to other families, and almost never landed).
      id: "mochi", family: "snacks", label: "mochi", bodies: "blob",
      fixed: { eyes: "button", cheeks: "blush", arms: "nubs" },
      pools: { mouth: { tiny: 10, cat: 8, smile: 6, pout: 4, wavy: 3 }, legs: { p: 0.4, pick: "feet" }, top: { p: 0.2, pick: { cherry: 10 } } },
      color: { hue: [0, 360], sat: 35, light: 86, spot: 150 },
    },
    {
      id: "fresita", family: "snacks", label: "fresita", bodies: "round",
      fixed: { top: "calyx", pattern: ["seeds"], legs: "feet", arms: { nubs: 10, mitts: 4 } },
      pools: { eyes: { two: 10, button: 8, sparkle: 6, lashes: 3 }, mouth: { smile: 10, tiny: 8, cat: 6, buck: 3 }, cheeks: { p: 0.5, pick: "blush" } },
      // Reds either side of 0; the spot lands on the greens, for the leaves.
      color: [{ hue: [350, 359], sat: 70, light: 58, spot: 122 }, { hue: [0, 5], sat: 70, light: 58, spot: 118 }],
    },
    {
      id: "empanadilla", family: "snacks", label: "empanadilla", bodies: "wide",
      fixed: { top: "pleats", legs: "feet", arms: { nubs: 10, mitts: 4 } },
      pools: { eyes: { two: 10, button: 8, sleepy: 6 }, mouth: { smile: 10, cat: 6, tiny: 6, tongue: 4, smirk: 3 }, cheeks: { p: 0.6, pick: { blush: 10, freckles: 4 } } },
      color: { hue: [38, 42], sat: 30, light: 86, spot: 180 },
    },
    {
      // A flan: caramel on top, sometimes crowned with a cherry.
      id: "flan", family: "snacks", label: "flan", bodies: "pill",
      fixed: { legs: "feet", arms: { nubs: 10, mitts: 4 } },
      pools: { top: { caramel: 10, "caramel-cherry": 6 }, eyes: { two: 10, button: 8, sparkle: 6, sleepy: 4 }, mouth: { smile: 10, tiny: 8, cat: 5, wavy: 4, tongue: 4 }, cheeks: { p: 0.5, pick: "blush" } },
      // Custard yellow; the spot is a cherry red.
      color: { hue: [43, 47], sat: 80, light: 70, spot: 300 },
    },
    {
      // A cupcake: a swirl of frosting in any colour over the cake, a paper cup round the bottom.
      id: "magdalena", family: "snacks", label: "magdalena", bodies: "pill",
      fixed: { top: "frosting", pattern: ["wrapper"], legs: "feet", arms: { nubs: 10, mitts: 4 } },
      pools: { pattern: { p: 0.45, pick: "sprinkles" }, eyes: { two: 10, sparkle: 8, button: 6, lashes: 3 }, mouth: { smile: 10, tiny: 6, tongue: 6, grin: 4 }, cheeks: { p: 0.5, pick: "blush" } },
      color: [
        { weight: 2, hue: [22, 30], sat: [40, 52], light: [44, 52], spot: [70, 290] },
        { weight: 2, hue: [36, 44], sat: [55, 68], light: [66, 74], spot: [70, 290] },
        { weight: 1, hue: [348, 356], sat: [45, 55], light: [50, 58], spot: [70, 290] },
      ],
    },
    {
      // An egg whose top has cracked open like a lid.
      id: "huevito", family: "snacks", label: "huevito", bodies: "drop",
      fixed: { top: "eggshell", legs: "feet", arms: "nubs" },
      pools: { pattern: { p: 0.45, pick: "crack" }, eyes: { two: 10, button: 8, sleepy: 5, googly: 4 }, mouth: { smile: 10, tiny: 8, wavy: 5, pout: 4 }, cheeks: { p: 0.5, pick: "blush" } },
      color: [{ hue: [30, 50], sat: [6, 12], light: [92, 94], spot: 180 }, { hue: [34, 42], sat: [40, 55], light: [84, 88], spot: 180 }],
    },
  ],

  showcase: [
    "bicho:snacks/flan:b07-guinda?top=caramel-cherry",
    "bicho:snacks/magdalena:b07-virutas?pattern=sprinkles",
    "bicho:snacks/huevito:b07-grieta?pattern=crack",
    "bicho:snacks/fresita:b07-alta?body=tall",
    "bicho:furry/bear:b07-tenedor?held=fork&headgear=none",
    "bicho:monsters/monster:b07-guinda?top=cherry&eyes=two&headgear=none",
    "bicho:sprouts/brotecito:b07-virutas?top=none&pattern=sprinkles",
    "bicho:monsters/monster:b07-mantequilla?eyes=two&headgear=none&top=butter",
  ],
});
