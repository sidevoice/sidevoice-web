import {
  LAYER, SOFT_INK, add, batch, bottomAt, centreline, clamp, darkMark, dir, ellipse, halfAt, isDarkCoat, isPaleCoat, lerp, mul, n,
  onAnchor, onRim, path, perp, pt, rad, smoothLoop, spanAt, sub, tangent, topAt, tube, unit,
  type Anchor, type Cmd, type Ctx, type Drawing, type Paint, type Piece, type Pt, type Rig,
} from "../bichos/kit";

/* B12 Bugs and Spirits (docs/catalogue.md §1.2 F7 and F9, §2.1, §2.7–§2.10, §5.2): three kinds of antennae, a
 * beetle's horn, a flame, cloud puffs, the rare halo and star, a pony's mane (and the rare unicorn's); bee, butterfly,
 * bat and rare angel wings, a ladybug's shell and a beetle's wing cases; a stinger, a firefly's glow and a dragon's
 * tail; caterpillar legs, insect stick legs, a ghost's hem and its wisp; bee bands and caterpillar rings. Two new
 * families, the bugs (bichitos, seven members) and the spirits (espíritus, eight, the star sprite rare).
 *
 * Rigid parts are drawn on the reference body (crown 42, half width 32, backL 32.8/56, rump 82/94) and join their
 * anchor by a socket on it. Parts that must hug the body are fitted and read the real outline: the flame and the cloud
 * puffs sit on the head's real top (`topAt`), the mane and the two shells follow the outline (rays cast from the body's
 * middle), the legs hang from the real base, the bands and rings are clipped to the body.
 *
 * - Back pieces sit behind the body (LAYER.back) and merge into the outline; their detail (veins, eye-spots, bones,
 *   the ladybug's spots, the gloss) is drawn as merged pieces just above them, so the body still covers it.
 * - The mane lies on the head: merged for the silhouette plus an inner copy with a thin edge (as the scarf and hats do).
 * - Moods reuse the shared groups where they fit: antennae `ant`, bee/bat/angel wings `wing`, tails `tail`, the glow's
 *   bulb `bulb` (nested in the tail's group with `sub`), the star `sprout` with a `flick` sub-group on the star, the
 *   halo `float`, stick and caterpillar legs `leg-a/b`. This file's own groups only recombine shared keyframes: the
 *   flame (`b12-flame`: twinkle, pulse, pop; it burns low asleep), the butterfly's slower wing beat (`b12-bfly`) and
 *   the ghost's hem and wisp (`b12-hem-a/b`, `b12-wisp`: they sway, faster while working). The ladybug's shell opens
 *   with the shared `open-l/-r` (it buzzes open while working, opens and shuts while waiting).
 * - Body extensions in the body's colour (the flame, the cloud puffs, the hem, the wisp) shade with the body's own
 *   gradient (`span: "body"`), so they read as one piece with it, without a seam. The hem and the wisp make a standing
 *   body float: off the dome (which floats already) they shrink and fade its shadow the way the dome's is. */

type P = Pt;

/* ---------- shapes (the shared geometry is the kit's: centreline, tube, path, rim, onRim, bottomAt, halfAt, onAnchor) ---------- */

/** Points round an ellipse turned `deg` clockwise. */
function ellipsePts(c: P, rx: number, ry: number, deg = 0, count = 28): P[] {
  const cs = Math.cos(rad(deg)), sn = Math.sin(rad(deg)), out: P[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]);
  }
  return out;
}

/** A five-point star with rounded points (catalogue: rounded, five points, so it never reads as Gemini's four). */
function roundedStar(c: P, ro: number, ri: number, round: number, turn = 0): string {
  const v: P[] = [];
  for (let i = 0; i < 10; i += 1) v.push(add(c, mul(dir(turn + i * 36), i % 2 ? ri : ro)));
  let d = "";
  v.forEach((p, i) => {
    const prev = v[(i + 9) % 10], next = v[(i + 1) % 10], k = i % 2 ? round * 0.5 : round;
    const a = add(p, mul(unit(sub(prev, p)), k)), b = add(p, mul(unit(sub(next, p)), k));
    d += `${i ? "L" : "M"}${pt(a)}Q${pt(p)} ${pt(b)}`;
  });
  return d + "Z";
}

const WHITE = "#ffffff";

/* ---------- tops ---------- */

/** Bobble antennae: a thin stalk from each side of the crown, curving out, with a shiny ball on the end. */
const BOBBLE_STALK = "M49.6 46.4Q46.8 33.4 40.8 24.6";
const BOBBLE_BALL = ellipse(39.4, 21.2, 5.4, 5.4);
const BOBBLE_GLINT = ellipse(37.6, 19.4, 1.7, 1.25);

/** Feather antennae: a moth's plumes. A short stalk, then a frond whose edges are cut into barbs that sweep to the tip,
 * so the outline itself reads feathery; a dark rib down the middle at stage. */
const FEATHER_LINE = centreline([[49.6, 46.4], [47.4, 37.4], [43.8, 28.4], [38.2, 18.8], [35.4, 15.2]], 48);
const FEATHER = (() => {
  const from = 0.2, m = FEATHER_LINE.length - 1, left: P[] = [], right: P[] = [];
  const barbs = 5;
  for (let i = Math.round(from * m); i <= m; i += 1) {
    const t = Math.max(0, (i / m - from) / (1 - from)), c = FEATHER_LINE[i], u = tangent(FEATHER_LINE, i), v = perp(u);
    const w = 1.4 + 5.2 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.75);
    // A sawtooth along the frond: each barb rises to its full width and drops back, its point swept toward the tip.
    const phase = (t * barbs) % 1, tooth = 0.62 + 0.38 * (phase < 0.72 ? phase / 0.72 : 1 - (phase - 0.72) / 0.28);
    left.push(add(c, mul(v, w * tooth))); right.push(sub(c, mul(v, w * tooth)));
  }
  return `M${[...left, ...right.reverse()].map(pt).join("L")}Z`;
})();
const FEATHER_STALK = `M${FEATHER_LINE.slice(0, Math.round(0.24 * (FEATHER_LINE.length - 1)) + 1).map(pt).join("L")}`;
const FEATHER_RIB = `M${FEATHER_LINE.slice(Math.round(0.24 * (FEATHER_LINE.length - 1)), Math.round(0.9 * (FEATHER_LINE.length - 1))).map(pt).join("L")}`;

/** Bent antennae: an ant's elbowed feelers, up from the crown, then out, each ending in a little club. */
const BENT_SCAPE = "M49.6 46.4L46.8 30.2";
const BENT_TIP = "M46.8 30.2Q40.4 25.6 34.4 25.2";
const BENT_CLUB = ellipse(32.6, 25.2, 3.7, 3.3);

/** The beetle's horn: one big horn rising from the crown and hooking over to one side, a forked tip, a gloss line. */
const HORN_BEETLE = path([
  ["M", [49.6, 47]], ["C", [49.8, 37], [52.2, 27.4], [56.6, 20.6]], ["C", [59.6, 15.6], [63.6, 11.8], [68.4, 10]],
  ["Q", [70.6, 6.6], [73.4, 7.4]], ["Q", [74.2, 9.6], [72.4, 11.6]], ["Q", [75.6, 12.6], [74.8, 15.2]],
  ["Q", [71.4, 15.4], [68.8, 16.4]], ["C", [66, 18.6], [64.6, 22.6], [64.8, 27.4]], ["C", [65, 34], [67.4, 40.6], [70.6, 47]], ["Z"],
]);
const HORN_BEETLE_GLOSS = "M54.2 39.6Q54.6 30.6 58.4 24.4";

/** The flame: tongues of fire rising from behind the head (the drop's tip continues into it), a gold core inside. Drawn
 * round the head's top centre (0, 0), y up negative, and fitted to the head's real top and width. */
const FLAME_OUT: Cmd[] = [
  ["M", [-16.5, 9]], ["C", [-21, -2], [-16.6, -10.4], [-12.4, -15.4]], ["C", [-11.4, -18.6], [-13, -23.4], [-16.4, -26.8]],
  ["C", [-9.8, -25.6], [-6.4, -22], [-5.2, -18]], ["C", [-5.4, -26.6], [-2, -34.6], [3.4, -41]], ["C", [4.4, -34], [5.4, -28.6], [8.6, -24.2]],
  ["C", [10.6, -27.2], [13.4, -29.8], [16, -31]], ["C", [14.6, -26], [16.6, -20.4], [16.4, -14.4]], ["C", [20.4, -6], [19.6, 2.4], [16.5, 9]], ["Z"],
];
const FLAME_CORE: Cmd[] = [
  ["M", [-9.4, 9]], ["C", [-12.4, 1], [-8.6, -7], [-4.4, -11.6]], ["C", [-3, -15.6], [-1.6, -20], [1.4, -25]],
  ["C", [3.2, -19.2], [6.2, -15.6], [7.4, -10.6]], ["C", [10.2, -5], [10.2, 3], [8.4, 9]], ["Z"],
];
const FLAME_HOT: Cmd[] = [["M", [-3.6, 9]], ["C", [-5, 3], [-2.6, -2], [0.4, -6.4]], ["C", [2.6, -2.4], [4.6, 2], [3.6, 9]], ["Z"]];

function flame(ctx: Ctx): Drawing {
  const { rig } = ctx, top = topAt(rig, 60), w = halfAt(rig, top + 8);
  const k = clamp(w / 18.5, 0.72, 1.15), y0 = top + 3 * k;
  const map = ([x, y]: P): P => [60 + x * k, y0 + y * k];
  return {
    pieces: [
      { d: path(FLAME_OUT, map), c: "body", span: "body" },
      { d: path(FLAME_CORE, map), c: "gold", layer: LAYER.top + 0.1 },
      { d: path(FLAME_HOT, map), c: "#fff1b8", layer: LAYER.top + 0.2, flat: true },
    ],
    pivot: [60, y0 + 6 * k],
  };
}

/** Cloud puffs: round bumps along the head's real top (three, plus a small one low on each side), merged into the
 * outline so the head turns into a cloud; a soft highlight on each at stage. */
function cloudPuffs(ctx: Ctx): Drawing {
  const { rig } = ctx, k = clamp(rig.faceHalf / 31, 0.72, 1.12);
  const puffs: [number, number, number][] = [[0, 11, 1.6], [-15, 9, 3.6], [15, 9, 3.6], [-26, 6.6, 6.4], [26, 6.6, 6.4]];
  const pieces: Piece[] = [], glints: string[] = [];
  for (const [dx, r0, sink] of puffs) {
    const x = 60 + dx * k, r = r0 * k;
    const span = spanAt(rig, topAt(rig, x) + sink * k + 2);
    if (!span || x - r * 0.4 < span[0] || x + r * 0.4 > span[1]) continue;
    const y = topAt(rig, x) + sink * k + r * 0.35;
    pieces.push({ d: ellipse(x, y, r, r * 0.94), c: "body", span: "body" });
    glints.push(`M${n(x - r * 0.62)} ${n(y - r * 0.12)}Q${n(x - r * 0.52)} ${n(y - r * 0.64)} ${n(x - r * 0.04)} ${n(y - r * 0.7)}`);
  }
  pieces.push({ d: glints.join(""), c: "belly", w: 1.8, ink: "inner", flat: true, lod: 2 });
  return { pieces };
}

/** The halo: a gold ring floating over the head, outside the silhouette (its own thin ink rim, not merged). */
const HALO = ellipse(60, 27.4, 12.6, 3.9);

/** The star: a rounded five-point gold star on a stalk; it sways on the stalk and twinkles on its own. */
const STAR_C: P = [60, 19.4];
const STAR = roundedStar(STAR_C, 11.6, 5.6, 2.6);
const STAR_GLINT = ellipse(56.6, 16.4, 1.9, 1.4);

/** The mane: hair flowing from just right of the crown over the head's left side down to the temple, in the spot
 * colour. One shape built on the real outline: a smooth inner edge lying on the head, and an outer edge in four locks,
 * each rounded upstream and pointed downstream, so the hair reads as combed to one side. Drawn merged (the silhouette)
 * and again on the head (inner, with a thin edge), so it lies over the head instead of behind it; two strands at stage. */
function maneLocks(ctx: Ctx): Piece[] {
  const { rig } = ctx, k = clamp(rig.faceHalf / 31, 0.78, 1.1);
  const from = 24, to = -104, locks = 4, count = 72;
  const inner: P[] = [], outer: P[] = [], strands: P[][] = [[], []];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count, { p, nrm } = onRim(rig, from + (to - from) * t);
    // Downstream is round the head towards the temple: the tangent pointing to the lower left.
    const down = mul(perp(nrm), -1);
    const ends = Math.min(1, t / 0.08, (1 - t) / 0.05);
    const phase = (t * locks) % 1, lock = Math.sin(Math.PI * Math.pow(phase, 1.5)) * (t > 0.98 ? 0 : 1);
    const out = k * (2 + 9.4 * lock) * Math.min(1, t / 0.12 + 0.35), sweep = k * 4.6 * lock * phase;
    const inset = k * (8.6 - 3.6 * t) * ends;
    inner.push(sub(p, mul(nrm, inset)));
    outer.push(add(add(p, mul(nrm, out)), mul(down, sweep)));
    if (t > 0.1 && t < 0.92) { strands[0].push(sub(p, mul(nrm, inset * 0.35 - 1))); if (t > 0.3) strands[1].push(sub(p, mul(nrm, inset * 0.7))); }
  }
  const d = `M${[...outer, ...inner.reverse()].map(pt).join("L")}Z`;
  const lines = strands.filter((s) => s.length > 2).map((s) => `M${s.map(pt).join("L")}`).join("");
  return [{ d, c: "spot" }, { d, c: "spot", ink: "inner", stroke: 2.2 }, { d: lines, c: "belly", w: 1.3, ink: "inner", flat: true, lod: 2 }];
}

/** The unicorn's horn, drawn on the reference crown (60, 42): gold, with a spiral of horn-coloured stripes. */
const UNI_HORN: Cmd[] = [["M", [53.4, 46]], ["Q", [55, 33.4], [59.4, 21.6]], ["Q", [60.6, 19], [61.8, 21.6]], ["Q", [65.4, 33.4], [66.6, 46]], ["Z"]];
const UNI_STRIPES: Cmd[][] = [
  [["M", [55.4, 39.2]], ["Q", [60.4, 38.6], [65.2, 35.6]]],
  [["M", [56.8, 32.2]], ["Q", [60.4, 31.6], [63.6, 29.2]]],
  [["M", [58.2, 26.4]], ["Q", [60.4, 25.8], [62.2, 24.4]]],
];

/** A pony's ear, drawn on the reference `earL` (40.8, 42): upright, almond-shaped, pink inside. */
const PONY_EAR: Cmd[] = [["M", [35.2, 48.6]], ["C", [32.6, 39.4], [33.4, 31], [37.4, 24.6]], ["C", [43.6, 29.2], [47.8, 35.4], [48.6, 43.2]], ["Z"]];
const PONY_EAR_IN: Cmd[] = [["M", [38.4, 44.2]], ["C", [37, 38.8], [37.4, 33.8], [38.8, 30.6]], ["C", [42.2, 33.8], [44.4, 37.6], [45, 41.8]], ["Z"]];
const mirrored = (cmds: Cmd[]): Cmd[] => cmds.map(([op, ...ps]) => [op, ...(ps as P[]).map(([x, y]): P => [120 - x, y])] as Cmd);

function mane(ctx: Ctx, horn: boolean): Drawing {
  const { rig, spec } = ctx;
  const inner: Paint = !spec.shiny && spec.color.sat > 25 && (spec.color.hue >= 315 || spec.color.hue <= 15) ? "belly" : "pink";
  // Ears first (behind the hair): the left one on earL, the right one mirrored onto earR.
  const ears: Piece[] = [];
  for (const [cmds, at, ref, a] of [[PONY_EAR, rig.at.earL, [40.8, 42], -40], [mirrored(PONY_EAR), rig.at.earR, [79.2, 42], 40]] as [Cmd[], Anchor, P, number][]) {
    const map = onAnchor(at, ref, a), inside = cmds === PONY_EAR ? PONY_EAR_IN : mirrored(PONY_EAR_IN);
    ears.push({ d: path(cmds, map), c: "body", layer: LAYER.top - 0.2 }, { d: path(inside, map), c: inner, ink: "inner", layer: LAYER.top - 0.2 });
  }
  const pieces = [...ears, ...maneLocks(ctx)];
  if (horn) {
    const map = onAnchor(ctx.rig.at.crown, [60, 42]);
    pieces.unshift({ d: path(UNI_HORN, map), c: "gold" });
    pieces.push({ d: UNI_STRIPES.map((s) => path(s, map)).join(""), c: "horn", w: 1.6, ink: "inner", flat: true, lod: 1 });
  }
  return { pieces };
}

/* ---------- back (behind the body, merged; detail as merged pieces just above, so the body still covers it) ---------- */

const ON_BACK = LAYER.back + 0.1;

/** A closed smooth shape through the points. */
const loop = (pts: P[]) => smoothLoop(pts);

/** Bee wings: on each side a big rounded wing up and out from the back and a small one under it, the belly colour, one
 * vein down the big one. */
const BEE_WING = loop(ellipsePts([26.4, 46.6], 15.6, 9.4, 42));
const BEE_WING_LOW = loop(ellipsePts([25.6, 61.2], 10, 6.2, 14));
const BEE_VEIN = "M33.8 53.2Q27.4 47.8 20.6 40.6";

/** Butterfly wings: a big forewing up and out and a rounder hindwing under it, in the spot colour, with belly eye-spots
 * (a thin ink ring each). They beat slower than a bee's. */
const BFLY_FORE = loop([[40, 58], [35.6, 45.4], [25.4, 31.2], [14.6, 23.6], [7.6, 27.4], [6.6, 39.6], [11.6, 51.4], [24, 59.6]]);
const BFLY_HIND = loop([[40, 65], [30.4, 64], [19.6, 67.4], [12.8, 76], [14.4, 86.4], [23.6, 89], [33.2, 82.4], [39.6, 73]]);
const BFLY_SPOTS = [ellipse(17.2, 36.4, 4.6, 4.4), ellipse(12.4, 47.4, 2.4, 2.3), ellipse(21.4, 77.6, 3.6, 3.4)];

/** Bat wings (the little dragon's): a membrane from the back out to a clawed tip, its lower edge in three scallops between
 * the finger bones; the bones show at stage. */
const BAT_TIPS: P[] = [[7.4, 31.6], [9.6, 46], [17.4, 57.6], [29.4, 64.8]];
const BAT_WING = (() => {
  let d = `M40.4 50Q25.6 34.4 ${pt(BAT_TIPS[0])}`;
  const root: P = [38, 58];
  for (let i = 1; i < BAT_TIPS.length; i += 1) {
    const a = BAT_TIPS[i - 1], b = BAT_TIPS[i], c = add(lerp(a, b, 0.5), mul(unit(sub(root, lerp(a, b, 0.5))), 5.2));
    d += `Q${pt(c)} ${pt(b)}`;
  }
  return d + `Q35.4 66.4 40.4 64Z`;
})();
const BAT_BONES = BAT_TIPS.slice(0, 3).map((t) => `M${pt(lerp([38.6, 56.4], t, 0.18))}L${pt(lerp([38.6, 56.4], t, 0.84))}`).join("");

/** Angel wings (rare): feathered, the belly colour; the upper edge sweeps up and out, the lower edge is four round
 * feather tips; two rows of feathers at stage. */
const ANGEL_TIPS: P[] = [[8.4, 36.4], [9.4, 47.6], [14.2, 57.4], [22.6, 64], [33.6, 66.6]];
const ANGEL_WING = (() => {
  let d = `M40.4 50.6Q26.2 25.4 ${pt(ANGEL_TIPS[0])}`;
  const root: P = [40, 52];
  for (let i = 1; i < ANGEL_TIPS.length; i += 1) {
    const a = ANGEL_TIPS[i - 1], b = ANGEL_TIPS[i], c = add(lerp(a, b, 0.5), mul(unit(sub(lerp(a, b, 0.5), root)), 4.6));
    d += `Q${pt(c)} ${pt(b)}`;
  }
  return d + `Q38.4 66 40.4 62Z`;
})();
const ANGEL_ROWS = "M33.6 47.6Q22.6 41.6 15.6 45.4M34.6 56.6Q26 53.8 20.4 58.2";

/** A shell half on each flank, fitted to the real outline: out past the edge by `off(t)` (t from the top seam to the
 * bottom), meeting the other half in a notch over the head. Returns each side's shell, its hinge and a point at
 * `(t, depth)` inside the part that shows (for spots and gloss). */
function shellHalves(rig: Rig, from: number, to: number, off: (t: number) => number) {
  const k = clamp(rig.half / 31, 0.8, 1.2);
  return [-1, 1].map((s) => {
    const rimAt = (t: number) => onRim(rig, s * (from + (to - from) * t));
    const outer: P[] = [];
    for (let i = 0; i <= 40; i += 1) { const t = i / 40, { p, nrm } = rimAt(t); outer.push(add(p, mul(nrm, off(t) * k))); }
    const d = `M${[...outer, [60 + s * 3, rig.bottom - 8] as P, [60 + s * 3, rig.top + 8] as P].map(pt).join("L")}Z`;
    const at = (t: number, depth: number): P => { const { p, nrm } = rimAt(t); return add(p, mul(nrm, off(t) * k * depth)); };
    return { s, d, hinge: at(0.12, 0.2), at, w: (t: number) => off(t) * k };
  });
}

/** Ladybug shell: the two halves splayed at the flanks, in the spot colour, with dark spots; they buzz open while
 * working and slowly open and close while waiting. */
function shellLadybug(ctx: Ctx): Drawing {
  const halves = shellHalves(ctx.rig, 7, 172, (t) => 3.6 + 8.2 * Math.sin(Math.PI * Math.min(1, t * 0.86 + 0.04)));
  const dot = isPaleCoat(ctx.spec) ? SOFT_INK : "dark";
  const pieces: Piece[] = [];
  for (const h of halves) {
    const g = `open-${h.s < 0 ? "l" : "r"}`;
    pieces.push({ d: h.d, c: "spot", g, pivot: h.hinge });
    for (const [t, dd] of [[0.3, 0.52], [0.56, 0.5], [0.8, 0.5]]) {
      const c = h.at(t, dd), r = clamp(h.w(t) * 0.42, 2.2, 4.2);
      pieces.push({ d: ellipse(c[0], c[1], r, r), c: dot, layer: ON_BACK, g, pivot: h.hinge });
    }
  }
  return { pieces };
}

/** Elytra: a beetle's glossy wing cases, shut, behind the body from the shoulders down, flaring out towards the base
 * where the two meet in a notch; the spot colour, each with a white gloss line. */
function elytra(ctx: Ctx): Drawing {
  const halves = shellHalves(ctx.rig, 38, 176, (t) => 2.6 + 9 * Math.pow(t, 1.2));
  const c: Paint = "spot";
  const pieces: Piece[] = [];
  for (const h of halves) {
    pieces.push({ d: h.d, c });
    const gl: P[] = [];
    for (let i = 0; i <= 8; i += 1) gl.push(h.at(0.3 + 0.34 * (i / 8), 0.55));
    pieces.push({ d: `M${gl.map(pt).join("L")}`, c: WHITE, w: 1.8, flat: true, layer: ON_BACK, lod: 1 });
  }
  return { pieces };
}

/* ---------- tails (rump, reference body) ---------- */

/** The stinger: a little dark cone at the rump, pointing out and down (too small for 28 px). */
const STINGER = tube(centreline([[72.4, 90.2], [83.6, 94.6], [94.4, 98.6]], 20), (t) => 4.6 * (1 - t) + 0.9);

/** The firefly's glow: a body-coloured segment and a gold bulb at the end, lit from inside; the tail wags it and the
 * bulb blinks (the shared `bulb`) while working and waiting. */
const GLOW_C: P = [95, 83.4];
const GLOW_SEG = loop(ellipsePts([83.4, 89.2], 8.6, 7.2, -18));
const GLOW_BULB = loop(ellipsePts(GLOW_C, 10, 8.8, -26));
const GLOW_CORE = loop(ellipsePts([96.6, 82], 5.6, 4.3, -26));

/** The dragon's tail: a tapering tail curving up behind the body, ending in a rounded spade in the spot colour. */
const DRAGON_LINE = centreline([[75.6, 90.4], [88.4, 94.6], [99.4, 91], [105, 81.6], [105.6, 72.4]], 40);
const DRAGON = tube(DRAGON_LINE, (t) => 4.8 * (1 - t) + 1.8);
const DRAGON_TIP = (() => {
  const end = DRAGON_LINE[DRAGON_LINE.length - 1], u = tangent(DRAGON_LINE, DRAGON_LINE.length - 1), v = perp(u);
  const at = (a: number, b: number) => add(end, add(mul(u, a), mul(v, b)));
  return `M${pt(at(1.6, 0))}Q${pt(at(-1.8, 4.6))} ${pt(at(0.4, 7.4))}Q${pt(at(6.8, 5.6))} ${pt(at(12, 0))}Q${pt(at(6.8, -5.6))} ${pt(at(0.4, -7.4))}Q${pt(at(-1.8, -4.6))} ${pt(at(1.6, 0))}Z`;
})();

/* ---------- legs (fitted from the body's base) ---------- */

/** Many legs: six little nubs in a row along the base (a caterpillar's), stepping in turn. */
function manyLegs(ctx: Ctx): Drawing {
  const { rig } = ctx, k = clamp(rig.half / 33, 0.82, 1.1), w = Math.min(halfAt(rig, rig.bottom - 9) - 6 * k, rig.half * 0.78);
  const pieces: Piece[] = [];
  for (let i = 0; i < 6; i += 1) {
    const x = 60 + ((i - 2.5) * 2 * w) / 5, y = bottomAt(rig, x) + 2.4 * k;
    pieces.push({ d: ellipse(x, y, 4 * k, 4.8 * k), c: legPaint(ctx), g: i % 2 ? "leg-b" : "leg-a" });
  }
  return { pieces };
}

/** Legs that must show on any coat: the dark role, or the coat itself where the dark role would sink into the ink. */
const legPaint = (ctx: Ctx): Paint => (ctx.spec.color.light < 50 && !ctx.spec.shiny ? "body" : "dark");

/** Stick legs: an insect's thin legs, out of the low flanks, bent at the knee and down to round feet on the ground, so
 * they show as lines whatever the base is like. */
function stickLegs(ctx: Ctx): Drawing {
  const { rig } = ctx, g = rig.at.ground.y, c = legPaint(ctx), y = Math.min(rig.bottom - 7, g - 15), h = halfAt(rig, y);
  const one = (s: number, grp: string): Piece[] => {
    const hip: P = [60 + s * (h - 3), y], knee: P = [60 + s * (h + 3.6), y + 4.2], ankle: P = [60 + s * (h + 4.4), g - 4.6];
    return [
      { d: `M${pt(hip)}Q${pt(add(knee, [s * 1.2, -1.4]))} ${pt(knee)}L${pt(ankle)}`, c, w: 2.8, flat: true, g: grp },
      { d: ellipse(ankle[0] + s * 2, g - 3, 5.4, 3.3), c, g: grp },
    ];
  };
  return { pieces: [...one(-1, "leg-a"), ...one(1, "leg-b")] };
}

/** Legs that make a standing body float: its shadow shrinks and fades like the floating dome's (18 of its half width 34,
 * 3.6 high, 0.75); a body that floats already (`#floats`: the dome, the orb) keeps its own. */
const floating = (ctx: Ctx): Drawing => (ctx.has("#floats") ? {} : { shadow: { rx: n(ctx.rig.half * 0.53), ry: 3.6, opacity: 0.75 } });

/** The ghost's hem: round scallops hanging from the real base, merged into the outline; each sways a little on its
 * own pivot, alternate ones the other way, so the hem ripples while talking, working and waiting. */
function hem(ctx: Ctx): Drawing {
  const { rig } = ctx, w = halfAt(rig, rig.bottom - 6) - 1.6, count = w > 24 ? 4 : 3, step = (2 * w) / count;
  const ry = clamp((rig.at.ground.y - rig.bottom) * 0.55, 5, 8.5);
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = 60 - w + step * (i + 0.5), top = bottomAt(rig, x) - 4.5;
    pieces.push({ d: ellipse(x, top + 2, step / 2 + 0.9, ry + 2), c: "body", span: "body", g: i % 2 ? "b12-hem-b" : "b12-hem-a", pivot: [x, top] });
  }
  return { pieces, ...floating(ctx) };
}

/** The ghost's wisp: instead of a hem, the base runs out into a tail that curls up to one side (a genie's, a cartoon
 * ghost's), merged into the outline; it sways from under the body. */
function wisp(ctx: Ctx): Drawing {
  // It starts flush with the body's sides a little over the base, so the body itself seems to taper into the tail.
  // (On a wide flat base, the bell's, it comes out of the middle: a tube much wider than its curl would fold over itself.)
  const { rig } = ctx, yb = rig.bottom - 8, w = Math.min(halfAt(rig, yb) - 0.8, rig.half * 0.64), g = rig.at.ground.y, b = rig.bottom;
  const drop = clamp(g - b - 2, 7, 14), k = clamp(rig.half / 33, 0.8, 1.1);
  const line = centreline([[60, yb], [60.4, b + drop * 0.32], [62.6, b + drop * 0.78], [60 + 12 * k, b + drop], [60 + 20 * k, b + drop * 0.66], [60 + 23 * k, b + drop * 0.04]], 48);
  const d = tube(line, (t) => w * Math.pow(1 - Math.min(1, t * 1.15), 1.8) + 1.7 * k);
  return { pieces: [{ d, c: "body", span: "body", g: "b12-wisp", pivot: [60, yb] }], ...floating(ctx) };
}

/* ---------- patterns ---------- */

/** Bee bands: dark bands across the body, bowed a little for roundness and clipped to it, kept off the face: one over
 * the brow line (where the head has room above the eyes) and one or two under the shut mouth (the open mouth may cover
 * the top of the first; it is drawn over it). */
function bands(ctx: Ctx): Drawing {
  const { rig } = ctx, th = clamp(rig.half * 0.24, 6, 8.2), gap = th * 0.6;
  const eyeTop = ctx.eyes.length ? Math.min(...ctx.eyes.map((e) => e.y - e.r)) : rig.eyeY - 9;
  const bow = (x: number, y: number): P => [x, y + 2.4 * Math.cos(((x - 60) / 64) * (Math.PI / 2))];
  const strip = (a: number, b: number) => {
    const xs = Array.from({ length: 17 }, (_, k) => -4 + k * 8);
    return `M${[...xs.map((x): P => [x, a]), ...xs.reverse().map((x): P => [x, b])].map((p) => pt(bow(...p))).join("L")}Z`;
  };
  const parts: string[] = [];
  // Over the eyes: from just under the head's top to clear of the eyes (a raised brow may sit on it, as on any coat).
  const head = topAt(rig, 60) + 2.4, room = eyeTop - 5 - head;
  // A low head gets a dark cap; a tall one (the drop's tip, the triangle's apex) a band across the forehead.
  if (room >= th + 5) { const a = head + (room - th) / 2; parts.push(strip(a, a + th)); }
  else if (room >= 3) parts.push(strip(head - 2.4 - 6, head + Math.min(room, th)));
  // Under the shut mouth, one or two, with coat left under the last (a band on the base would read as outline).
  const from = rig.at.mouth.y + 5.6, to = rig.bottom - 4.5;
  if (to - from >= 4) {
    const count = clamp(Math.floor((to - from + gap) / (th + gap)), 1, 2), t = Math.min(th, to - from);
    const y0 = from + (to - from - (count * t + (count - 1) * gap)) / 2;
    for (let i = 0; i < count; i += 1) { const a = y0 + i * (t + gap); parts.push(strip(a, a + t)); }
  }
  // Bee-black on any coat (the dark role is only an olive on a mustard bee), the light belly colour on a dark coat.
  return { pieces: [{ d: parts.join(""), c: isDarkCoat(ctx.spec) ? "belly" : SOFT_INK, ink: "inner", flat: true, clip: true, layer: LAYER.skin }] };
}

/** Segments: a caterpillar's rings, as two light crescents down each lower flank, following the real outline. */
function segments(ctx: Ctx): Drawing {
  const { rig } = ctx, k = clamp(rig.half / 33, 0.8, 1.15), to = rig.bottom + 2, w0 = 4.4 * k;
  const eyeLow = ctx.eyes.length ? Math.max(...ctx.eyes.map((e) => e.y + e.r)) : rig.eyeY + 9;
  // Keep clear of the face: a crescent starts beside the eyes only where it clears them, else under them; one that
  // would reach the mouth's corners is left out.
  const clearAt = (y: number, inset: number, face: number) => halfAt(rig, y) - inset * k - w0 > face;
  const out: string[] = [];
  for (const inset of [4, 10.6]) {
    if (!clearAt(rig.mouthY + 2, inset, 13.5)) continue;
    const from = clearAt(rig.eyeY + 4, inset, rig.spread + 10.5) ? rig.eyeY + 1 : eyeLow + 3;
    if (to - from < 12) continue;
    for (const s of [-1, 1]) {
      const a: P[] = [], b: P[] = [];
      for (let i = 0; i <= 16; i += 1) {
        const y = from + ((to - from) * i) / 16, h = halfAt(rig, y), w = w0 * (0.35 + 0.65 * Math.sin(Math.PI * (i / 16)));
        a.push([60 + s * (h - inset * k), y]); b.push([60 + s * (h - inset * k - w), y]);
      }
      out.push(`M${[...a, ...b.reverse()].map(pt).join("L")}Z`);
    }
  }
  return { pieces: [{ d: out.join(""), c: "belly", ink: "inner", flat: true, clip: true, layer: LAYER.skin }] };
}

/* ---------- compatibility ---------- */

/** The ghost's hem and wisp go on the bodies whose base can float or taper (catalogue §4.3): the floating ones (dome, orb)
 * and the round-based standing ones (drop, round), which the hem then floats (`floating`). A body list, not `#floats`:
 * drop and round stand. They hang where a tail would join, so they also exclude every tail. */
const ON_FLOAT = ["body:dome|drop|round|orb"];

/* ---------- the batch ---------- */

const ANT ={ slot: "top", at: "crownL", socket: [47.9, 44] as P, group: "ant", tags: ["tall", "blocks-band"], jitter: { rot: 6, size: 0.06 } };

export default batch({
  label: "B12 Bichitos y espíritus",

  parts: [
    /* ---------- tops ---------- */
    {
      ...ANT, id: "antennae-bobble", label: "antenas de bolita",
      draw: { pieces: [{ d: BOBBLE_STALK, c: "dark", w: 3.2, flat: true }, { d: BOBBLE_BALL, c: "spot" }, { d: BOBBLE_GLINT, c: WHITE, ink: "inner", flat: true, lod: 1 }] },
    },
    {
      ...ANT, id: "antennae-feather", label: "antenas de pluma",
      draw: (ctx) => ({
        pieces: [
          { d: FEATHER_STALK, c: "dark", w: 2.8, flat: true },
          { d: FEATHER, c: "belly" },
          { d: FEATHER_RIB, c: isPaleCoat(ctx.spec) ? SOFT_INK : "dark", w: 1.3, ink: "inner", flat: true, lod: 1 },
        ],
      }),
    },
    {
      ...ANT, id: "antennae-bent", label: "antenas de hormiga", noise: 1,
      draw: { pieces: [{ d: BENT_SCAPE, c: "dark", w: 3.2, flat: true }, { d: BENT_TIP, c: "dark", w: 3, flat: true }, { d: BENT_CLUB, c: "dark" }] },
    },
    {
      id: "horn-beetle", slot: "top", label: "cuerno de escarabajo", at: "crown", socket: [60, 42], tags: ["tall", "blocks-band"], jitter: { rot: 4, size: 0.05 },
      draw: (ctx) => ({ pieces: [{ d: HORN_BEETLE, c: darkMark(ctx.spec, "dark", "body") }, { d: HORN_BEETLE_GLOSS, c: WHITE, w: 1.9, ink: "inner", flat: true, lod: 1 }] }),
    },
    { id: "flame", slot: "top", label: "llama", group: "b12-flame", tags: ["tall", "blocks-band", "blocks-clips"], draw: flame },
    { id: "cloud-puffs", slot: "top", label: "nubes", noise: 1, tags: ["hat-hidden", "blocks-band"], draw: cloudPuffs },
    {
      id: "halo", slot: "top", label: "aureola", at: "crown", socket: [60, 42], group: "float", rarity: "rare", tags: ["tall"],
      draw: {
        pieces: [
          { d: HALO, c: "ink", w: 7.6, ink: "inner", flat: true, layer: LAYER.float },
          { d: HALO, c: "gold", w: 3.9, ink: "inner", flat: true, layer: LAYER.float },
          { d: "M50.6 25.6Q54 24.2 58 23.8", c: WHITE, w: 1.2, ink: "inner", flat: true, layer: LAYER.float, lod: 1 },
        ],
      },
    },
    {
      id: "star", slot: "top", label: "estrella", at: "crown", socket: [60, 42], group: "sprout", rarity: "rare", tags: ["tall", "blocks-band", "blocks-clips"], jitter: { rot: 5 },
      draw: {
        pieces: [
          { d: "M60 44L60 29", c: "dark", w: 3.2, flat: true },
          { d: STAR, c: "gold", sub: "flick", pivot: STAR_C },
          { d: STAR_GLINT, c: WHITE, ink: "inner", flat: true, sub: "flick", pivot: STAR_C, lod: 1 },
        ],
      },
    },
    { id: "mane", slot: "top", label: "crin", tags: ["blocks-band", "blocks-temples"], draw: (ctx) => mane(ctx, false) },
    { id: "mane-uni", slot: "top", label: "crin de unicornio", rarity: "rare", tags: ["tall", "blocks-band", "blocks-temples"], draw: (ctx) => mane(ctx, true) },

    /* ---------- back ---------- */
    {
      id: "wings-bee", slot: "back", label: "alas de abeja", at: "backL", socket: [32.8, 56], group: "wing", jitter: { rot: 5, size: 0.05 },
      draw: { pieces: [{ d: BEE_WING_LOW, c: "belly" }, { d: BEE_WING, c: "belly" }, { d: BEE_VEIN, c: "body", w: 1.4, flat: true, layer: ON_BACK, lod: 1 }] },
    },
    {
      id: "wings-butterfly", slot: "back", label: "alas de mariposa", at: "backL", socket: [32.8, 56], group: "b12-bfly", noise: 3, jitter: { rot: 4, size: 0.05 },
      draw: { pieces: [{ d: BFLY_HIND, c: "spot" }, { d: BFLY_FORE, c: "spot" }, ...BFLY_SPOTS.map((d): Piece => ({ d, c: "belly", stroke: 1.5, layer: ON_BACK }))] },
    },
    {
      id: "wings-bat", slot: "back", label: "alas de dragón", at: "backL", socket: [32.8, 56], group: "wing", jitter: { rot: 5, size: 0.05 },
      draw: (ctx) => {
        const c: Paint = isDarkCoat(ctx.spec) ? "spot" : "dark";
        return { pieces: [{ d: BAT_WING, c }, { d: BAT_BONES, c: c === "spot" ? "dark" : "body", w: 1.6, flat: true, layer: ON_BACK, lod: 1 }] };
      },
    },
    {
      id: "wings-angel", slot: "back", label: "alas de ángel", at: "backL", socket: [32.8, 56], group: "wing", rarity: "rare", noise: 3, jitter: { rot: 4 },
      draw: (ctx) => ({ pieces: [{ d: ANGEL_WING, c: "belly" }, { d: ANGEL_ROWS, c: isPaleCoat(ctx.spec) ? "dark" : "body", w: 1.4, flat: true, layer: ON_BACK, lod: 2 }] }),
    },
    { id: "shell-ladybug", slot: "back", label: "caparazón de mariquita", draw: shellLadybug },
    { id: "elytra", slot: "back", label: "élitros", draw: elytra },

    /* ---------- tails ---------- */
    { id: "stinger", slot: "tail", label: "aguijón", at: "rump", socket: [82, 94], noise: 1, lod: 1, draw: { pieces: [{ d: STINGER, c: "dark" }] } },
    {
      id: "glow", slot: "tail", label: "farolillo", at: "rump", socket: [82, 94], group: "tail", jitter: { rot: 5 },
      draw: {
        pieces: [
          { d: GLOW_SEG, c: "body" },
          { d: GLOW_BULB, c: "gold", sub: "bulb", pivot: GLOW_C },
          { d: GLOW_CORE, c: "#fff3b0", flat: true, layer: LAYER.tail + 0.1, sub: "bulb", pivot: GLOW_C },
        ],
      },
    },
    {
      id: "dragon", slot: "tail", label: "de dragón", at: "rump", socket: [82, 94], group: "tail", jitter: { rot: 6 },
      draw: { pieces: [{ d: DRAGON, c: "body" }, { d: DRAGON_TIP, c: "spot" }] },
    },

    /* ---------- legs ---------- */
    { id: "many", slot: "legs", label: "patitas de oruga", noise: 1, draw: manyLegs },
    { id: "stick", slot: "legs", label: "patas de alambre", draw: stickLegs },
    { id: "hem", slot: "legs", label: "bajo de fantasma", noise: 1, requires: ON_FLOAT, excludes: ["tail"], draw: hem },
    { id: "wisp", slot: "legs", label: "cola de fantasma", noise: 1, requires: ON_FLOAT, excludes: ["tail"], draw: wisp },

    /* ---------- patterns ---------- */
    { id: "bands", slot: "pattern", label: "rayas de abeja", tags: ["clipped"], excludes: ["#clipped", "pattern:belly|fur-tips|moon-chest|ribcage|grooves|segments"], draw: bands },
    { id: "segments", slot: "pattern", label: "anillos de oruga", excludes: ["pattern:ribs|scales"], draw: segments },
  ],

  families: [
    // Bugs (catalogue §1.2 F7): antennae and back wings. They lend the bobble antennae and the bee's wings to other
    // families' bichos through the cross-family roll (a cat with bee wings).
    {
      id: "bugs", label: "Bichitos", weight: 9, color: { hue: [0, 360], sat: [50, 75], light: [48, 64], spot: 180 },
      pools: { cheeks: { p: 0.35, pick: { blush: 10, freckles: 4 } } },
      cross: { top: { "antennae-bobble": 10, "antennae-feather": 4 }, back: { "wings-bee": 10, "wings-butterfly": 4 } },
    },
    // Spirits (catalogue §1.2 F9): near-white or pastel, floating, the rare halo, star and angel wings. The rare roll finds
    // those in the family's pools (p 0: never rolled otherwise; the rare roll weighs them by their own `weight`, 1). They
    // lend the flame, the cloud puffs, bat wings and the dragon's tail.
    {
      id: "spirits", label: "Espíritus", weight: 8,
      color: [{ weight: 2, hue: [0, 360], sat: [0, 8], light: [88, 92], spot: 210 }, { weight: 3, hue: [0, 360], sat: [35, 58], light: [72, 82], spot: 210 }],
      pools: { top: { p: 0, pick: ["halo", "star"] }, back: { p: 0, pick: ["wings-angel"] }, cheeks: { p: 0.45, pick: "blush" } },
      cross: { top: { flame: 4, "cloud-puffs": 3 }, back: { "wings-bat": 6 }, tail: { dragon: 6 } },
    },
  ],

  members: [
    /* ---------- bugs (bichitos) ---------- */
    {
      // A charcoal head, a coral-red shell with dark spots, bobble antennae.
      id: "mariquita", family: "bugs", label: "mariquita", bodies: "round",
      fixed: { back: "shell-ladybug", top: "antennae-bobble", legs: "feet", arms: "nubs" },
      pools: { eyes: { two: 10, sparkle: 6, "wide-set": 3 }, mouth: { smile: 10, tiny: 6, tongue: 3 }, cheeks: { p: 0.5, pick: "blush" } },
      color: { hue: [250, 270], sat: [14, 26], light: [36, 42], spot: [93, 106] },
    },
    {
      id: "abejita", family: "bugs", label: "abejita", bodies: "round",
      fixed: { pattern: ["bands"], back: "wings-bee", tail: "stinger", arms: "nubs", legs: "feet" },
      pools: {
        // Antennae on most bees (B14: a bee without them reads as a striped ball); the bobble ones, elbowed now and then.
        eyes: { two: 10, button: 6, sparkle: 4, googly: 3 }, mouth: { smile: 10, buck: 4, tongue: 4, tiny: 3 },
        top: { p: 0.85, pick: { "antennae-bobble": 10, "antennae-bent": 3 } }, held: { p: 0.15, pick: "flower" },
      },
      color: { hue: [40, 48], sat: [78, 90], light: [56, 62], spot: 180 },
    },
    {
      id: "oruga", family: "bugs", label: "oruga", bodies: "wide",
      fixed: { pattern: ["segments"], legs: "many", top: "antennae-bobble", arms: "nubs" },
      pools: { eyes: { two: 10, button: 8, googly: 4, sleepy: 3 }, mouth: { smile: 10, tiny: 6, buck: 3 }, cheeks: { p: 0.5, pick: "blush" } },
      color: { hue: [78, 125], sat: [50, 68], light: [52, 62], spot: { pick: [200, 230, 290] } },
    },
    {
      id: "polilla", family: "bugs", label: "polilla", bodies: "tall",
      fixed: { back: "wings-butterfly", top: "antennae-feather", legs: "feet", arms: "nubs" },
      pools: { eyes: { sparkle: 10, two: 8, lashes: 5, sleepy: 3 }, mouth: { smile: 10, tiny: 8 }, cheeks: { p: 0.5, pick: "blush" } },
      color: { hue: [0, 360], sat: [35, 55], light: [62, 74], spot: { pick: [120, 150, 180, 210] } },
    },
    {
      // A dusky body so the gold glow shows.
      id: "luciernaga", family: "bugs", label: "luciérnaga", bodies: "round",
      fixed: { tail: "glow", back: "wings-bee", legs: "feet", arms: "nubs" },
      pools: { eyes: { two: 10, sparkle: 6, sleepy: 4 }, mouth: { smile: 10, tiny: 6 }, cheeks: { p: 0.4, pick: "blush" } },
      color: { hue: [210, 260], sat: [30, 45], light: [40, 48], spot: 180 },
    },
    {
      // A deep jewel-toned body under a horn and glossy wing cases.
      id: "escarabajo", family: "bugs", label: "escarabajo", bodies: { round: 3, box: 1 },
      fixed: { top: "horn-beetle", back: "elytra", arms: "nubs", legs: "feet" },
      pools: { eyes: { two: 10, wonky: 3, googly: 3 }, mouth: { smile: 10, fangs: 4, grin: 4, buck: 2 } },
      color: { hue: [150, 290], sat: [35, 55], light: [40, 48], spot: 180 },
    },
    {
      // Red-brown or charcoal, elbowed feelers, wiry legs; sometimes carrying a backpack.
      id: "hormiguita", family: "bugs", label: "hormiguita", bodies: "pear",
      fixed: { top: "antennae-bent", legs: "stick", arms: "nubs" },
      pools: { eyes: { two: 10, button: 6 }, mouth: { smile: 10, buck: 5, tiny: 5, grin: 3 }, back: { p: 0.2, pick: "backpack" } },
      color: [{ weight: 2, hue: [4, 20], sat: [50, 66], light: [44, 52], spot: 180 }, { weight: 1, hue: [250, 280], sat: [10, 20], light: [40, 46], spot: 160 }],
    },

    /* ---------- spirits (espíritus) ---------- */
    {
      // The scalloped hem is the classic ghost; about one in three trails a wisp instead (B14; the wisp stays: it is also
      // hojarasca's).
      id: "fantasmita", family: "spirits", label: "fantasmita", bodies: "dome",
      fixed: { legs: { hem: 10, wisp: 5 }, arms: "nubs" },
      pools: { eyes: { two: 10, hollow: 7, cyclops: 4, sparkle: 3 }, mouth: { smile: 10, tiny: 6, tongue: 5, wavy: 3 }, cheeks: { p: 0.6, pick: "blush" }, neckwear: { p: 0.12, pick: "bow" } },
      color: [{ weight: 3, hue: [0, 360], sat: [0, 8], light: [89, 93], spot: 210 }, { weight: 1, hue: [180, 300], sat: [30, 45], light: [80, 86], spot: 210 }],
    },
    {
      // A cloud: puffs for a head, no feet; sometimes holding a leaf umbrella.
      id: "nubecita", family: "spirits", label: "nubecita", bodies: "wide",
      fixed: { top: "cloud-puffs", arms: "nubs" },
      pools: { eyes: { two: 10, sleepy: 6, button: 6, sparkle: 3 }, mouth: { smile: 10, tiny: 8 }, cheeks: { p: 0.75, pick: "blush" }, held: { p: 0.25, pick: "umbrella-leaf" } },
      color: [{ weight: 2, hue: [195, 225], sat: [40, 60], light: [80, 86], spot: 210 }, { weight: 2, hue: [0, 360], sat: [0, 6], light: [91, 94], spot: 210 }, { weight: 1, hue: [300, 345], sat: [40, 55], light: [82, 88], spot: 210 }],
    },
    {
      id: "dragoncito", family: "spirits", label: "dragoncito", bodies: "round",
      fixed: { back: "wings-bat", tail: "dragon", top: "horns-nub", arms: "nubs", legs: "feet" },
      pools: { nose: { p: 0.7, pick: "nostrils" }, eyes: { two: 10, sparkle: 4, googly: 3 }, mouth: { smile: 10, "fang-single": 8, fangs: 5, tongue: 3 }, pattern: { p: 0.6, pick: "belly" } },
      color: [{ weight: 2, hue: [95, 165], sat: [45, 62], light: [52, 60], spot: 180 }, { weight: 1, hue: [265, 300], sat: [40, 55], light: [54, 62], spot: 180 }, { weight: 1, hue: [0, 12], sat: [65, 80], light: [52, 58], spot: 180 }],
    },
    {
      // A pastel pony with a mane in the spot colour. The unicorn is a fixed option (B14 keeps it so: it is the pony's own
      // variant, never a swap the rare roll could make elsewhere), about one pony in eight, and it reads "raro" (the horned
      // mane is a rare part).
      id: "poni", family: "spirits", label: "poni", bodies: "tall",
      fixed: { top: { mane: 10, "mane-uni": 1.4 }, legs: "feet", arms: "nubs" },
      pools: {
        eyes: { lashes: 10, sparkle: 8, two: 6 }, mouth: { smile: 10, tiny: 6 }, cheeks: { p: 0.7, pick: "blush" },
        nose: { p: 0.3, pick: "nostrils" }, headgear: { p: 0.15, pick: { "flower-clip": 10, hairbow: 10 } },
      },
      color: { hue: [0, 360], sat: [38, 58], light: [74, 84], spot: { pick: [120, 150, 180, 210, 240] } },
    },
    {
      // White fur, a blue-grey face, a cowlick; a scarf or earmuffs sometimes.
      id: "yeti", family: "spirits", label: "yeti", bodies: "pear",
      fixed: { top: "tuft", marks: "face-patch", arms: "nubs", legs: "feet" },
      pools: { eyes: { two: 10, button: 5, sleepy: 3 }, mouth: { fangs: 10, smile: 8, buck: 5, grin: 4 }, pattern: { p: 0.4, pick: "fur-tips" }, neckwear: { p: 0.2, pick: "scarf" }, earwear: { p: 0.12, pick: "earmuffs" } },
      color: { hue: [195, 220], sat: [8, 16], light: [86, 92], spot: 210 },
    },
    {
      // A forest spirit: near-white with a sage tint, hollow eyes and a tiny mouth.
      id: "kodama", family: "spirits", label: "kodama", bodies: "tall",
      fixed: { eyes: "hollow", mouth: "tiny", arms: "nubs" },
      pools: { legs: { p: 0.7, pick: "feet" }, cheeks: { p: 0.25, pick: "blush" }, headgear: { p: 0.15, pick: "leaf-hat" } },
      color: { hue: [80, 120], sat: [8, 16], light: [86, 92], spot: 210 },
    },
    {
      // The rare star sprite: gold, a star on its head, sparkly eyes.
      id: "estrellita", family: "spirits", label: "estrellita", weight: 3, bodies: "round",
      fixed: { top: "star", arms: "nubs", legs: "feet" },
      pools: { eyes: { sparkle: 10, two: 5 }, mouth: { smile: 10, tiny: 5 }, cheeks: { p: 0.8, pick: "blush" }, held: { p: 0.15, pick: "wand" } },
      color: { hue: [42, 52], sat: [80, 92], light: [64, 72], spot: 210 },
    },
  ],

  // Rares for two families that had none of their own (B14): a sea bicho may wear the gold star (a starfish of sorts), a
  // bird the halo. p 0: only the rare roll picks them, for a bicho whose top is free.
  extend: [
    { family: "sea", pools: { top: { p: 0, pick: { star: 1 } } } },
    { family: "birds", pools: { top: { p: 0, pick: { halo: 1 } } } },
  ],

  // The parts on other families' bichos, and a few members with gear that suits them.
  showcase: [
    "bicho:furry/cat:b12-abeja?back=wings-bee",
    "bicho:pond/frog:b12-mariposa?back=wings-butterfly",
    "bicho:monsters/monster:b12-dragon?back=wings-bat&tail=dragon&eyes=two",
    "bicho:spirits/fantasmita:b12-angel?back=wings-angel&top=halo",
    "bicho:bots/robot:b12-escarabajo?back=elytra&top=horn-beetle",
    "bicho:furry/bear:b12-mariquita?back=shell-ladybug",
    "bicho:monsters/monster:b12-rayas?pattern=bands&tail=stinger&eyes=two",
    "bicho:furry/fox:b12-luz?tail=glow",
    "bicho:sprouts/brotecito:b12-patas?legs=stick",
    "bicho:monsters/flotin:b12-sabana?legs=hem",
    "bicho:snacks/mochi:b12-nube?top=cloud-puffs",
    "bicho:monsters/monster:b12-fuego?top=flame&body=round&eyes=two",
    "bicho:spirits/poni:b12-unicornio?top=mane-uni",
    "bicho:spirits/nubecita:b12-paraguas?arms=nubs&held=umbrella-leaf",
    "bicho:bugs/abejita:b12-flor?held=flower",
    "bicho:spirits/kodama:b12-aureola?top=halo",
  ],

  css: `
    /* asleep = idle without a pastime (the mascots', the frozen figures') or the nap: the quiet pose and the pastimes stay awake */
    /* the flame flickers from its base: a quick twinkle while talking, a pulse while working, a pop while waiting, and
       it burns low asleep */
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b12-flame { transform: scale(.86,.74) }
    &[data-mood=speaking] .pg-b12-flame { animation: bx-twinkle 1.1s ease-in-out infinite }
    &[data-mood=working] .pg-b12-flame { animation: bx-pulse .45s ease-in-out infinite }
    &[data-mood=waiting] .pg-b12-flame { animation: bx-pop 1.3s cubic-bezier(.3,1.8,.5,1) infinite }

    /* butterfly wings: the shared wing's moves, beating slower */
    &[data-mood=speaking] :is(.pg-b12-bfly-l, .pg-b12-bfly-r) { animation: bx-sway 1.1s ease-in-out infinite }
    &[data-mood=working] .pg-b12-bfly-l { animation: bx-claw .5s steps(2) infinite }
    &[data-mood=working] .pg-b12-bfly-r { animation: bx-claw-r .5s steps(2) infinite .25s }
    &[data-mood=waiting] .pg-b12-bfly-l { animation: bx-crank 1.2s ease-in-out infinite }
    &[data-mood=waiting] .pg-b12-bfly-r { animation: bx-crank-r 1.2s ease-in-out infinite }

    /* the ghost's hem ripples: each scallop sways on its own pivot, alternate ones the other way */
    &:is([data-mood=speaking], [data-mood=waiting]) .pg-b12-hem-a { animation: bx-feel 2s ease-in-out infinite }
    &:is([data-mood=speaking], [data-mood=waiting]) .pg-b12-hem-b { animation: bx-feel 2s ease-in-out infinite reverse }
    &[data-mood=working] .pg-b12-hem-a { animation: bx-feel .7s ease-in-out infinite }
    &[data-mood=working] .pg-b12-hem-b { animation: bx-feel .7s ease-in-out infinite reverse }

    /* the wisp sways from under the body, faster while working, and curls in asleep */
    &:is([data-mood=speaking], [data-mood=waiting]) .pg-b12-wisp { animation: bx-feel 2s ease-in-out infinite }
    &[data-mood=working] .pg-b12-wisp { animation: bx-feel .7s ease-in-out infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b12-wisp { transform: rotate(-5deg) scale(.94) }
  `,
});
