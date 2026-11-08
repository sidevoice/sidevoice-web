import { INK, LAYER, SOFT_INK, batch, darkMark, isPaleCoat, n, smoothLoop, spanAt, type Anchor, type Ctx, type Drawing, type Eye, type Piece } from "../bichos/kit";

/* B08 Birds (docs/catalogue.md §1.2 F5, §2.1, §2.3, §2.6–§2.10, §5.2): four beaks, a curl, a crest and a comb, wings
 * and flippers, bird and duck feet, a fan of tail feathers, a penguin's tux, and six new plumíferos (chick, penguin,
 * duck, parrot, hen and the rare toucan). The owl and the mochuelo stay as they are.
 *
 * A bird is mostly slot swaps on the shared face box (catalogue F5): the beak is the mouth, the wings are the arms.
 * - Beaks sit on `mouth` and use the core beak's fixed colours. Every open shape keeps the rest shape's top edge, so the
 *   per-word fold reads as the beak snapping shut; each emits `chin`. They are tagged `beak` and exclude noses, whiskers
 *   and the mustache (catalogue §4.3; the toothy mouths share their slot).
 * - Wings and flippers are rigid arms on `shoulderL` in the shared `arm` group: a flap per spoken word (the gesture),
 *   cranking while working, the right wing waving while waiting. The wing's tip is a hand (fw3): birds hold the mic.
 *   Flippers have none. Where they lie on the body they carry an inner copy with a thin edge (like the core hats).
 * - Tops ride the shared `sprout` group (crest, curl: sway, droop, perk); the comb is still. Feet step with `leg-a/b`,
 *   the tail fan wags with `tail`. No new keyframes or groups: this file has no CSS of its own.
 * - The tux is paint on the skin (under arms, cheeks and marks), clipped to the body (`clipped`, one per bicho), and
 *   shaped round the eyes actually drawn (`ctx.eyes`). Dark details use `darkMark`, the tux gets an edge on pale coats. */

type P = [number, number];
const pt = (p: P) => `${n(p[0])} ${n(p[1])}`;

/* ---------- centrelines and tubes (feathers, the toucan's beak) ---------- */

/** Catmull-Rom through the points (open), resampled to `count` points evenly spaced along its length. */
function centreline(pts: P[], count = 48): P[] {
  const dense: P[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 1; s <= 16; s += 1) {
      const t = s / 16, t2 = t * t, t3 = t2 * t;
      const f = (k: 0 | 1) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
      dense.push([f(0), f(1)]);
    }
  }
  const acc = [0];
  for (let i = 1; i < dense.length; i += 1) acc.push(acc[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = acc[acc.length - 1], out: P[] = [];
  for (let k = 0, j = 1; k < count; k += 1) {
    const at = (total * k) / (count - 1);
    while (j < dense.length - 1 && acc[j] < at) j += 1;
    const seg = acc[j] - acc[j - 1] || 1, u = (at - acc[j - 1]) / seg;
    out.push([dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * u, dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * u]);
  }
  return out;
}

/** A tube round a centreline, `width(t)` either side. `section(a, b)` outlines it between fractions a and b of its
 * length: the tip end (b = 1) gets a round cap; the base end (a = 0) is flat, or bulges back by `bulge` (a beak's top). */
function tube(line: P[], width: (t: number) => number, bulge = 0) {
  const m = line.length - 1;
  const side = line.map((c, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(m, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, w = width(i / m);
    return { l: [c[0] + nx * w, c[1] + ny * w] as P, r: [c[0] - nx * w, c[1] - ny * w] as P, t: [dx / l, dy / l] as P, nrm: [nx, ny] as P, w };
  });
  return (a: number, b: number) => {
    const i0 = Math.round(a * m), i1 = Math.round(b * m), left: P[] = [], right: P[] = [];
    for (let i = i0; i <= i1; i += 1) { left.push(side[i].l); right.unshift(side[i].r); }
    const cap: P[] = [];
    if (i1 === m) {
      const { t, nrm, w } = side[m], c = line[m];
      for (let k = 1; k < 8; k += 1) { const th = (Math.PI * k) / 8; cap.push([c[0] + nrm[0] * w * Math.cos(th) + t[0] * w * Math.sin(th), c[1] + nrm[1] * w * Math.cos(th) + t[1] * w * Math.sin(th)]); }
    }
    let d = `M${[...left, ...cap, ...right].map(pt).join("L")}`;
    if (i0 === 0 && bulge) { const { t } = side[0], c = line[0]; d += `Q${pt([c[0] - t[0] * bulge * 2, c[1] - t[1] * bulge * 2])} ${pt(side[0].l)}`; }
    return `${d}Z`;
  };
}

/** A feather: a tube from `base` along `deg` (0 up, 90 right), `len` long, bending `bend` sideways, widest (`w`) a
 * little under halfway, with a round tip. */
function feather(base: P, deg: number, len: number, w: number, bend = 0): string {
  const a = (deg * Math.PI) / 180, dir: P = [Math.sin(a), -Math.cos(a)], nrm: P = [Math.cos(a), Math.sin(a)];
  const at = (t: number, off: number): P => [base[0] + dir[0] * len * t + nrm[0] * off, base[1] + dir[1] * len * t + nrm[1] * off];
  const line = centreline([at(0, 0), at(0.5, bend * 0.7), at(1, bend)], 32);
  return tube(line, (t) => w * Math.sin(Math.PI * (0.14 + 0.78 * t)))(0, 1);
}

/* ---------- beaks (on `mouth`) ----------
 * The cast's beak colours (the core beak): #f2b13c, its shadow #c98420, and the mouth's #3a0f22 inside. Every open beak
 * keeps the rest shape's top edge, so the per-word fold (`.m-open` scales up from its top edge) reads as the beak
 * snapping shut. Each emits `chin`, its open shape's lowest point with the ink edge. At 28 px they grow a little. */

const BEAK = "#f2b13c", BEAK_DEEP = "#c98420", MOUTH = "#3a0f22", TONGUE = "#ff6f91";
/** The hen's comb and wattles: the crown's gem red, a fixed colour already in the cast. The spot role can't reach a red
 * (the palette keeps it within 300° of the coat, at light 68: a pink at best). */
const COMB_RED = "#e5483a";
const edge = (w: number) => `stroke="${INK}" stroke-width="${n(w)}" stroke-linejoin="round"`;
const shape = (d: string, fill: string, w: number) => `<path fill="${fill}" ${edge(w)} d="${d}"/>`;
const plain = (d: string, fill: string) => `<path fill="${fill}" d="${d}"/>`;
const line = (d: string, w: number, color = INK) => `<path fill="none" stroke="${color}" stroke-width="${n(w)}" stroke-linecap="round" d="${d}"/>`;

interface Beak { x: number; y: number; k: number; rail: boolean; stage: boolean; ew: number; T: (dx: number, dy: number) => string }
/** The mouth anchor, the size flags, the ink edge (heavier at rail) and `T`, which places a point given relative to the
 * mouth, scaled by `k` (larger at 28 px). */
function beakAt(ctx: Ctx, railK: number): Beak {
  const { x, y } = ctx.rig.at.mouth, rail = ctx.size === "rail", k = rail ? railK : 1;
  return { x, y, k, rail, stage: ctx.size === "stage", ew: rail ? 2.8 : 2.4, T: (dx, dy) => `${n(x + dx * k)} ${n(y + dy * k)}` };
}
const chinAt = (b: Beak, dy: number) => ({ chin: { x: b.x, y: n(b.y + dy * b.k + b.ew / 2) } });

/** Beak-small: a little rounded triangle (chick, penguin, hen); it opens to show a dark peep between two mandibles. */
function beakSmall(ctx: Ctx): Drawing {
  const b = beakAt(ctx, 1.35), { T } = b;
  const upper = (top: number, tip: number) => `M${T(-5, top)}Q${T(0, top - 1.4)} ${T(5, top)}Q${T(4.2, top + (tip - top) * 0.36)} ${T(0.9, tip - 0.8)}Q${T(0, tip + 0.2)} ${T(-0.9, tip - 0.8)}Q${T(-4.2, top + (tip - top) * 0.36)} ${T(-5, top)}Z`;
  const lower = `M${T(-4, 2)}Q${T(0, 1.4)} ${T(4, 2)}Q${T(2.6, 6.6)} ${T(0.6, 8.6)}Q${T(0, 9.2)} ${T(-0.6, 8.6)}Q${T(-2.6, 6.6)} ${T(-4, 2)}Z`;
  return {
    emits: chinAt(b, 9.2),
    face: {
      mouthRest: shape(upper(-4, 3), BEAK, b.ew) + (b.stage ? line(`M${T(-3.4, -1.8)}Q${T(0, -0.4)} ${T(3.4, -1.8)}`, 1.2) : ""),
      mouthOpen: shape(lower, BEAK_DEEP, b.ew) + plain(`M${T(-4.4, -3)}L${T(4.4, -3)}L${T(0, 6)}Z`, MOUTH) + shape(upper(-4, 1.2), BEAK, b.ew),
    },
  };
}

/** Bill: a duck's flat, rounded bill with two nostrils; open, the lower half drops into a bowl with a tongue. */
function bill(ctx: Ctx): Drawing {
  const b = beakAt(ctx, 1.12), { T } = b;
  const upper = `M${T(-9.6, -1.2)}C${T(-11.4, -6.4)} ${T(-5.4, -7.4)} ${T(0, -7.4)}C${T(5.4, -7.4)} ${T(11.4, -6.4)} ${T(9.6, -1.2)}Q${T(0, 3.4)} ${T(-9.6, -1.2)}Z`;
  const nostrils = b.rail ? "" : plain(`M${T(-3.6, -4.6)}a${n(1 * b.k)} ${n(0.62 * b.k)} 0 1 0 0.01 0ZM${T(3.6, -4.6)}a${n(1 * b.k)} ${n(0.62 * b.k)} 0 1 0 0.01 0Z`, BEAK_DEEP);
  return {
    emits: chinAt(b, 10.2),
    face: {
      mouthRest: shape(`M${T(-8.2, 0.2)}Q${T(0, 6)} ${T(8.2, 0.2)}Q${T(0, 3.2)} ${T(-8.2, 0.2)}Z`, BEAK_DEEP, b.ew) + shape(upper, BEAK, b.ew) + nostrils,
      mouthOpen: shape(`M${T(-9, -0.8)}Q${T(-9.6, 10)} ${T(0, 10.2)}Q${T(9.6, 10)} ${T(9, -0.8)}Z`, BEAK_DEEP, b.ew)
        + plain(`M${T(-7.2, -0.8)}Q${T(-7.2, 6.8)} ${T(0, 7)}Q${T(7.2, 6.8)} ${T(7.2, -0.8)}Z`, MOUTH)
        + `<ellipse fill="${TONGUE}" cx="${n(b.x + 0.4 * b.k)}" cy="${n(b.y + 4.9 * b.k)}" rx="${n(3.6 * b.k)}" ry="${n(1.7 * b.k)}"/>`
        + shape(upper, BEAK, b.ew) + nostrils,
    },
  };
}

/** Beak-hook: a parrot's big hooked upper beak, near-black (the catalogue's dark upper: a fixed soft ink, since the dark
 * role would melt into a loud coat), over a small lower beak in the beak colour. Open, the hook lifts, the lower jaw
 * drops and the tongue shows between them. */
function beakHook(ctx: Ctx): Drawing {
  const b = beakAt(ctx, 1.2), { T } = b;
  /** The hook; `f` < 1 lifts it (open): everything under its top edge comes up by that factor. */
  const hook = (f: number) => {
    const H = (dx: number, dy: number) => T(dx, dy > -4.6 ? -4.6 + (dy + 4.6) * f : dy);
    return `M${H(-7.6, -4.6)}C${H(-7.8, -9.6)} ${H(7.8, -9.6)} ${H(7.6, -4.6)}C${H(7.4, 0.8)} ${H(4.4, 5)} ${H(1.2, 8.8)}C${H(0.4, 9.8)} ${H(-1.1, 9.4)} ${H(-0.7, 8)}C${H(-0.5, 6.8)} ${H(-1.6, 5.4)} ${H(-3.4, 4.2)}C${H(-6.2, 2.2)} ${H(-7.5, -0.8)} ${H(-7.6, -4.6)}Z`;
  };
  const gloss = b.rail ? "" : line(`M${T(-4.6, -5.4)}Q${T(-5.4, -2.6)} ${T(-3.8, 0.2)}`, 1.6, "rgb(255 255 255 / .55)");
  return {
    emits: chinAt(b, 16.4),
    face: {
      mouthRest: shape(`M${T(-5.2, 1.4)}Q${T(-4.6, 6.6)} ${T(0, 7)}Q${T(4.6, 6.6)} ${T(5.2, 1.4)}Z`, BEAK, b.ew) + shape(hook(1), SOFT_INK, b.ew) + gloss,
      mouthOpen: plain(`M${T(-6.6, -1)}Q${T(-7.2, 13)} ${T(0, 13.2)}Q${T(7.2, 13)} ${T(6.6, -1)}Z`, MOUTH)
        + `<ellipse fill="${TONGUE}" cx="${n(b.x)}" cy="${n(b.y + 10 * b.k)}" rx="${n(3.6 * b.k)}" ry="${n(2.3 * b.k)}"/>`
        + shape(`M${T(-6.4, 7)}Q${T(-6, 16.4)} ${T(0, 16.4)}Q${T(6, 16.4)} ${T(6.4, 7)}Q${T(0, 12.6)} ${T(-6.4, 7)}Z`, BEAK, b.ew)
        + shape(hook(0.72), SOFT_INK, b.ew) + gloss,
    },
  };
}

/** Beak-big (rare): the toucan's banana beak, drooping from between the eyes over the chest and swinging to one side: a
 * gold base, a spot body and a dark tip. Open, it gapes: the upper beak swings up towards us (shorter), the lower one
 * drops, and a big dark mouth and tongue show between. Its top keeps clear of the eyes actually drawn. */
function beakBig(ctx: Ctx): Drawing {
  const b = beakAt(ctx, 1), { x, y } = b;
  const near = ctx.eyes.filter((e) => Math.abs(e.x - x) < e.r + 12);
  const top = Math.max(y - 6, ...near.map((e) => e.y + e.r + 4.2));
  /** A beak from (x0, y0), `len` long, its tip swung `swing` to the right, `w0` wide at the base. */
  const beakOf = (x0: number, y0: number, len: number, swing: number, w0: number) =>
    tube(centreline([[x0, y0], [x0 + swing * 0.08, y0 + len * 0.35], [x0 + swing * 0.45, y0 + len * 0.72], [x0 + swing, y0 + len]], 40), (t) => w0 * Math.pow(1 - t, 0.8) + 2.2, 3.4);
  /** Gold, then a spot band, then the dark tip; thin ink seams between the bands (not at 28 px). */
  const banded = (s: ReturnType<typeof beakOf>, a: number, z: number) =>
    plain(s(0, a), "var(--bx-gold)") + plain(s(a, z), "var(--bx-spot)") + plain(s(z, 1), SOFT_INK)
    + (b.rail ? "" : line(s(a, a).replace(/Z$/, "") + s(z, z).replace(/Z$/, ""), 1.3)) + `<path fill="none" ${edge(b.ew)} d="${s(0, 1)}"/>`;
  return {
    emits: { chin: { x: x + 4, y: n(top + 29.4) } },
    face: {
      mouthRest: banded(beakOf(x, top, 24, 8, 11.2), 0.44, 0.8),
      mouthOpen: shape(`M${pt([x - 10, top + 4])}Q${pt([x - 10.6, top + 21])} ${pt([x + 1.5, top + 21.5])}Q${pt([x + 12.6, top + 21])} ${pt([x + 10.4, top + 4])}Z`, MOUTH, b.ew)
        + `<ellipse fill="${TONGUE}" cx="${n(x + 1.5)}" cy="${n(top + 16.6)}" rx="5.2" ry="2.8"/>`
        + shape(`M${pt([x - 9.4, top + 15])}Q${pt([x - 8.4, top + 27])} ${pt([x + 3.6, top + 28.2])}Q${pt([x + 12, top + 26.6])} ${pt([x + 11, top + 15])}Q${pt([x + 1, top + 22.4])} ${pt([x - 9.4, top + 15])}Z`, "var(--bx-spot)", b.ew)
        + banded(beakOf(x, top, 13, 3, 11.2), 0.6, 0.86),
    },
  };
}

const BEAK_RULES = { slot: "mouth", tags: ["beak"], excludes: ["nose", "marks:whiskers", "eyewear:mustache"] };

/* ---------- tops ---------- */

/** All three tops rise 17–25 over the crown: `tall` (hats hide them), and on the bodies that seat hats down the slope
 * (drop, tri, pill) the headphones' band cuts through even the curl and the comb: `blocks-band`. */
const TOP_TAGS = ["tall", "blocks-band"];

/** Feather-curl: one curled feather standing up from the crown (the chick's). */
const CURL_LINE = centreline([[60, 44], [59, 37], [59.4, 31], [62.8, 26.6], [68.4, 26.2], [71.4, 29.6], [70, 33.4], [66.8, 33.4]], 40);
const CURL = tube(CURL_LINE, (t) => 3.6 * (1 - 0.42 * t));
/** At 28 px a thicker curl, so it stays a curl and not a hairline bump. */
const CURL_RAIL = tube(CURL_LINE, (t) => 4.6 * (1 - 0.3 * t));

/** Crest: three spot feathers fanned on the crown, the middle one in front (a thin edge parts it from the others). */
const CREST_BACK = [feather([56.8, 45], -28, 20, 4.8, -1.4), feather([63.4, 45], 34, 21, 4.8, 1.6)];
const CREST_FRONT = feather([60, 45], 6, 27, 5.4, 1.2);

/** The comb's outline on the reference body, socket on the reference crown (60, 42). */
const COMB: P[] = [[47.6, 48], [46.4, 41], [48, 35.6], [52.4, 33.6], [55.6, 35.4], [56, 29.4], [59.8, 25.4], [64.6, 26.2], [66.4, 30.6], [69.8, 29.6], [73.4, 32], [74.2, 38.2], [72.8, 48]];
/** A point drawn on the reference body, moved onto this body's anchor (turned and scaled the way the renderer places a
 * rigid part). */
function placer(anchor: Anchor, ref: Anchor) {
  const rot = (((anchor.a ?? 0) - (ref.a ?? 0)) * Math.PI) / 180, s = anchor.s ?? 1, c = Math.cos(rot), si = Math.sin(rot);
  return (p: P): P => { const dx = (p[0] - ref.x) * s, dy = (p[1] - ref.y) * s; return [anchor.x + dx * c - dy * si, anchor.y + dx * si + dy * c]; };
}

/** Comb: a hen's three-bump comb on the crown, and under a beak a pair of wattles (on the nose layer: after the eyes,
 * before the beak, which hangs over them). Fitted, so both live in one part. */
function comb(ctx: Ctx): Drawing {
  const { rig } = ctx, to = placer(rig.at.crown, { x: 60, y: 42, a: 0 });
  const pieces: Piece[] = [{ d: smoothLoop(COMB.map(to)), c: COMB_RED }];
  const beak = ctx.has("mouth:beak|beak-small");
  if (beak) {
    const { x, y } = rig.at.mouth, top = y + (ctx.has("mouth:beak") ? 3.2 : 2.2), rail = ctx.size === "rail";
    if (!rail) {
      const drop = (s: number, len: number) => `M${pt([x + s * 0.6, top])}Q${pt([x + s * 4.2, top + len * 0.45])} ${pt([x + s * 2.6, top + len])}Q${pt([x + s * 0.4, top + len + 0.8])} ${pt([x + s * 0.2, top + len * 0.5])}Z`;
      pieces.push({ d: drop(-1, 7.2) + drop(1, 6.2), c: COMB_RED, ink: "inner", stroke: 1.6, layer: LAYER.nose });
    }
  }
  return { pieces };
}

/* ---------- pattern: the tux ---------- */

/** Tux: the penguin's white front. It rises from under the body to round the eyes it finds (one lobe per eye, so the
 * eyes and the beak sit on white, like a penguin's face), and leaves a band of the coat down each flank, where the
 * flippers go. Paint on the skin (under arms, cheeks and marks), clipped to the body. On a pale coat it gets a thin
 * ink edge, or it would vanish. */
function tux(ctx: Ctx): Drawing {
  const { rig, spec } = ctx;
  const span = (y: number): [number, number] => spanAt(rig, y) ?? [60 - rig.half * 0.7, 60 + rig.half * 0.7];
  const inset = (l: number, r: number) => Math.min(9, Math.max(4.5, (r - l) * 0.12));
  const ys = rig.mouthY - 2, yb = rig.bottom + 8;
  const left: P[] = [], right: P[] = [];
  for (let i = 0; i <= 5; i += 1) {
    const y = yb - ((yb - ys) * i) / 5, [l, r] = span(Math.min(y, rig.bottom - 4)), k = inset(l, r);
    left.push([l + k, y]); right.unshift([r - k, y]);
  }
  const stalks = !!(rig.at.stalkL && rig.at.stalkR);
  const eyes = stalks ? [] : [...ctx.eyes].sort((a, b) => a.x - b.x);
  const lobe = (e: Eye, from: number, to: number): P[] => {
    const R = e.r + 3.4, out: P[] = [];
    for (let d = from; d <= to + 0.1; d += (to - from) / 5) out.push([e.x + R * Math.cos((d * Math.PI) / 180), e.y + R * Math.sin((d * Math.PI) / 180)]);
    return out;
  };
  let top: P[];
  if (eyes.length === 1) top = lobe(eyes[0], 180, 360);
  else if (eyes.length === 2) top = [...lobe(eyes[0], 180, 318), [60, Math.min(eyes[0].y, eyes[1].y) - Math.min(eyes[0].r, eyes[1].r) * 0.2], ...lobe(eyes[1], 222, 360)];
  else {
    const y = eyes.length ? Math.max(...eyes.map((e) => e.y + e.r)) + 3 : rig.mouthY - 8;
    top = [[50, y + 1.5], [60, y], [70, y + 1.5]];
  }
  // The flank eases into the face: one point halfway between its top and the first lobe point, on each side.
  const ease = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 1.5];
  const d = smoothLoop([...left, ease(left[left.length - 1], top[0]), ...top, ease(right[0], top[top.length - 1]), ...right]);
  return { pieces: [{ d, c: "#ffffff", ink: "inner", layer: LAYER.skin, clip: true, ...(isPaleCoat(spec) ? { stroke: 2.2 } : {}) }] };
}

/* ---------- arms, legs, tail (reference body) ---------- */

/** The wing sweeps out from the shoulder to a tip at the far end; its trailing edge steps back to the body in three
 * shallow scallops (feather ends), each rising towards the tip, so it reads as a wing and not as a hand. */
const WING = "M35.4 67.6C29.6 66.2 20.4 68.2 13.6 74.6C10.6 77.4 9.4 80.2 10.6 82Q12.4 84.8 15.8 83.6Q17.4 87.6 21.8 86.4Q24.4 90.2 28.8 88Q32.6 86.2 35.4 83.2C39 80.4 39.2 70.6 35.4 67.6Z";
const WING_LINES = "M15.8 83.6L20.4 79.2M21.8 86.4L25.8 81.4";
const FLIPPER = "M35.6 68.8C27.6 68.4 20.6 74 16.6 82.2C14.2 87.4 14.8 92.6 18.4 92.2C22.4 91.8 28.6 86.6 35.6 81.4C39.2 78.6 39.2 71.6 35.6 68.8Z";
/** An arm that lies partly on the body: merged (its fat outline joins the silhouette) plus an inner copy with a thin
 * edge, so the joint reads as a wing in front of the body, over a belly patch too, instead of a shading seam. */
const onBody = (d: string, c: Piece["c"]): Piece[] => [{ d, c }, { d, c, ink: "inner", stroke: 2.2 }];

/** A three-toed bird foot at (x, y) (the foot anchor), toes splayed outward on side s: a short leg and three round-capped toes. */
const birdToes = (x: number, y: number, s: number) =>
  `M${pt([x, y - 3])}L${pt([x, y + 5])}M${pt([x, y + 5])}L${pt([x + s * 6.4, y + 9.4])}M${pt([x, y + 5])}L${pt([x + s * 1, y + 10.6])}M${pt([x, y + 5])}L${pt([x - s * 4.6, y + 9.6])}`;

/** A duck's paddle at (x, y), fanning outward on side s, its front edge in three rounded toes. */
function paddle(x: number, y: number, s: number): string {
  const X = (dx: number) => x - s * dx;
  return `M${pt([X(-2.4), y - 3])}L${pt([X(-2.6), y + 4])}C${pt([X(-6), y + 5])} ${pt([X(-11.5), y + 7.5])} ${pt([X(-12), y + 10])}Q${pt([X(-12), y + 12.4])} ${pt([X(-9.4), y + 12])}Q${pt([X(-7.6), y + 13.8])} ${pt([X(-5), y + 12.6])}Q${pt([X(-2.6), y + 14])} ${pt([X(-0.2), y + 12.2])}Q${pt([X(2.2), y + 13])} ${pt([X(3.2), y + 10.8])}C${pt([X(4), y + 8.5])} ${pt([X(3), y + 6])} ${pt([X(2.6), y + 4])}L${pt([X(2.4), y - 3])}Z`;
}

/** The fan of three tail feathers at the rump: two in the coat, the middle one in spot, in front. */
const TAIL = { high: feather([80, 90], 12, 32, 5, 2.2), low: feather([81, 92], 58, 28, 4.8, 2), mid: feather([80.5, 91], 34, 34, 5.6, 2.4) };

export default batch({

  parts: [
    /* ---------- beaks ---------- */
    { ...BEAK_RULES, id: "beak-small", label: "piquito", draw: beakSmall },
    { ...BEAK_RULES, id: "bill", label: "pico de pato", draw: bill },
    { ...BEAK_RULES, id: "beak-hook", label: "pico de loro", draw: beakHook },
    { ...BEAK_RULES, id: "beak-big", label: "pico de tucán", rarity: "rare", draw: beakBig },

    /* ---------- tops ---------- */
    {
      id: "feather-curl", slot: "top", label: "rizo de plumón", at: "crown", socket: [60, 42], group: "sprout", noise: 1, tags: TOP_TAGS, jitter: { rot: 6 },
      draw: (ctx) => ({ pieces: [{ d: (ctx.size === "rail" ? CURL_RAIL : CURL)(0, 1), c: "body" }] }),
    },
    {
      id: "crest", slot: "top", label: "cresta de plumas", at: "crown", socket: [60, 42], group: "sprout", tags: TOP_TAGS, jitter: { rot: 5, size: 0.05 },
      draw: { pieces: [...CREST_BACK.map((d): Piece => ({ d, c: "spot" })), { d: CREST_FRONT, c: "spot", layer: LAYER.top + 0.5, stroke: 2.2 }] },
    },
    { id: "comb", slot: "top", label: "cresta de gallina", tags: TOP_TAGS, draw: comb },

    /* ---------- arms ---------- */
    {
      // The wing tip works as a hand (tag `hand`): a bird holds the microphone, a flower or a balloon in its feathers,
      // the grip tucked under them. The hand sits a little in from the tip, so a mug still fits the box on a wide body.
      id: "wing", slot: "arms", label: "alas", at: "shoulderL", socket: [34, 74], group: "arm", tags: ["hand"],
      draw: (ctx) => ({ pieces: [...onBody(WING, "body"), { d: WING_LINES, c: darkMark(ctx.spec), w: 1.6, ink: "inner", flat: true, lod: 1 }], emits: { handL: { x: 17, y: 80.5 } } }),
    },
    { id: "flipper", slot: "arms", label: "aletas", at: "shoulderL", socket: [34, 74], group: "arm", draw: { pieces: onBody(FLIPPER, "body") } },

    /* ---------- legs ---------- */
    {
      id: "bird", slot: "legs", label: "patas de pájaro",
      draw: ({ rig }) => ({
        pieces: [
          { d: birdToes(rig.at.footL.x, rig.at.footL.y, -1), c: BEAK, w: 3.4, g: "leg-a" },
          { d: birdToes(rig.at.footR.x, rig.at.footR.y, 1), c: BEAK, w: 3.4, g: "leg-b" },
        ],
      }),
    },
    {
      id: "webbed", slot: "legs", label: "patas de pato",
      draw: ({ rig }) => ({
        pieces: [
          { d: paddle(rig.at.footL.x, rig.at.footL.y, -1), c: BEAK, g: "leg-a" },
          { d: paddle(rig.at.footR.x, rig.at.footR.y, 1), c: BEAK, g: "leg-b" },
        ],
      }),
    },

    /* ---------- tail ---------- */
    {
      id: "feathers", slot: "tail", label: "plumas", at: "rump", socket: [82, 94], group: "tail", jitter: { rot: 6 },
      draw: { pieces: [{ d: TAIL.high, c: "body" }, { d: TAIL.low, c: "body", layer: LAYER.tail + 0.2, stroke: 2.2 }, { d: TAIL.mid, c: "spot", layer: LAYER.tail + 0.4, stroke: 2.2 }] },
    },

    /* ---------- pattern ---------- */
    { id: "tux", slot: "pattern", label: "frac", tags: ["clipped"], excludes: ["#clipped", "pattern:belly|fur-tips|moon-chest|ribcage"], draw: tux },
  ],
});
