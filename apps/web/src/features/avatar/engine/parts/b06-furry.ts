import { LAYER, SOFT_INK, batch, darkMark, ellipse, flatten, isDarkCoat, n, smoothLoop, spanAt, topAt, type Ctx, type Drawing, type Paint, type Piece, type Rig, type Spec } from "../bichos/kit";

/* B06 Furry critters (docs/catalogue.md §1.2 F2, §2.1, §2.6–§2.10, §5.2): the peluditos' ears, tails, quills, paws,
 * mitts, a calico patch and a moon crescent, and the new members of the Furry family.
 *
 * Rigid parts (upright ears, tails, arms) are drawn on the reference body (crown at 40, half width 32, arms at 72, base
 * at 96) and join their anchor by a socket on it, like the existing cat, fox and bear ears and the cat and fox tails.
 * Hanging ears (floppy, lop) are fitted instead: they read the head's real edge (`spanAt`, `topAt`) and hang straight
 * down from it whatever the body, over the side of the head, with a thin ink edge where they lie on it. The quills, the
 * patch and the crescent read the outline too.
 *
 * Detail inside a part that sits behind the body (the pink of an ear, a tail's rings) is a merged piece half a layer
 * above the part: its ink falls under every fill, and the body covers it where the part goes behind the head, so the
 * detail never paints over the face the way an inner piece would.
 *
 * Dark paint stays visible (the kit's `darkMark`, as B04's marks): the dark role on most coats, near-black on pale coats
 * (where the dark role is only a pale grey) and the belly colour on dark coats. Ears, rings and paws that are part of the
 * animal's own build keep the dark role on dark coats (`darkPart`): a black bear's ears are not cream.
 *
 * Animation: upright ears ride the shared `ear` group, tails `tail`, arms `arm`, paw feet `leg-a`/`leg-b`. Hanging ears
 * ride the shared `hang` group, pivoted at their root (the shared ear group's droop and twitch turn the wrong way for an
 * ear that hangs: they would swing it over the eyes).
 *
 * The core cat, bunny and bear get their catalogue pools from here (`extend`): the cat a patch and a bell collar, the
 * bunny lop ears and a pom-pom, the bear a muzzle. */

type P = [number, number];
const pt = (p: P) => `${n(p[0])} ${n(p[1])}`;
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The dark paint of a part of the animal itself (dark ears, rings): `darkMark`, but the dark role on a dark coat. */
const darkPart = (spec: Spec): Paint => darkMark(spec, SOFT_INK, "dark");

/** Tag for parts that make a dark-limbed animal (the panda's ears, the raccoon's): with it, paws are painted dark. */
const DARK_LIMBS = "b06-dark-limbs";
/** Paws are the coat's colour, or dark (`darkMark`) on a dark-limbed animal. */
const limbPaint = (ctx: Ctx): Paint => (ctx.has(`#${DARK_LIMBS}`) ? darkMark(ctx.spec) : "body");

/** A rotated ellipse as a path (two half arcs; flags as separate numbers, so mirrorPath can flip it). */
function tilted(cx: number, cy: number, rx: number, ry: number, deg: number): string {
  const a = (deg * Math.PI) / 180, dx = rx * Math.cos(a), dy = rx * Math.sin(a);
  return `M${pt([cx + dx, cy + dy])}A${n(rx)} ${n(ry)} ${n(deg)} 1 1 ${pt([cx - dx, cy - dy])}A${n(rx)} ${n(ry)} ${n(deg)} 1 1 ${pt([cx + dx, cy + dy])}Z`;
}

/* ---------- tubes: bushy tails along a centreline ---------- */

/** Catmull-Rom through the points (open), resampled to `count` points evenly spaced along its length. */
function centreline(pts: P[], count = 64): P[] {
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
    const seg = acc[j] - acc[j - 1] || 1;
    out.push(lerp(dense[j - 1], dense[j], (at - acc[j - 1]) / seg));
  }
  return out;
}

/** A tube round a centreline: `section(a, b)` is its outline between fractions a and b of the length, with a round cap
 * when b reaches the tip (the base end is flat: it hides inside the body). */
function tube(line: P[], width: (t: number) => number) {
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
    return `M${[...left, ...cap, ...right].map(pt).join("L")}Z`;
  };
}

/** Fur along a tube's edge: the width ripples `bumps` times along the length. */
const furry = (w: (t: number) => number, bumps: number, depth: number) => (t: number) => w(t) * (1 + depth * Math.sin(t * bumps * Math.PI * 2));

/* Raccoon: a thick bushy tail curving up, three dark rings and a dark tip. */
const RINGED = tube(centreline([[77, 89], [95, 92.5], [107.5, 83], [111, 69], [106.5, 55.5]]), furry((t) => 4.2 + 4.4 * Math.sin(Math.PI * (0.1 + 0.75 * t)), 4.5, 0.05));
/* Squirrel: a big plume rising from the rump in an S, its top curling back over the head (behind it). */
const SQUIRREL_LINE = centreline([[77, 91], [95, 93], [106.5, 82.5], [108.5, 65], [102.5, 49], [99.5, 35], [102.5, 23], [97, 13.5], [88, 13.5], [85.5, 20.5]], 80);
const SQUIRREL = tube(SQUIRREL_LINE, furry((t) => 3.8 + 8.2 * Math.sin(Math.PI * Math.min(1, 0.08 + 0.84 * t)), 7, 0.06));
const SQUIRREL_FLUFF = tube(SQUIRREL_LINE, (t) => 2 + 3.2 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.3) / 0.72))));

/** A bumpy pom-pom of radius r round (cx, cy). */
function pompom(cx: number, cy: number, r: number, bumps = 9): string {
  const pts: P[] = [];
  for (let i = 0; i < bumps * 2; i += 1) { const a = (i / (bumps * 2)) * Math.PI * 2 - Math.PI / 2, k = i % 2 ? 0.86 : 1; pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]); }
  return smoothLoop(pts);
}

/* ---------- hanging ears (fitted to the head's real edge) ---------- */

/** The head's edge on one side at height y (`s` -1 left, 1 right), or the face half width if the outline misses it. */
const edgeX = (rig: Rig, y: number, s: number) => { const sp = spanAt(rig, y); return sp ? (s < 0 ? sp[0] : sp[1]) : 60 + s * rig.faceHalf; };

/** How far in a hanging ear may come on side s: 1 short of the eyes (`ctx.eyes` holds them as planned, though tops run
 * first; the eye anchors with the usual radius if there are none), and never further out than the head's edge at the eye
 * line, so the ear keeps some width beside eyes pushed out to the edge. */
function eyeReach(ctx: Ctx, s: number, edge: number): number {
  const { rig } = ctx, eyes = ctx.eyes.length ? ctx.eyes : [{ ...rig.at.eyeL, r: 8.5 }, { ...rig.at.eyeR, r: 8.5 }];
  const reach = s < 0 ? Math.min(...eyes.map((e) => e.x - e.r)) - 1 : Math.max(...eyes.map((e) => e.x + e.r)) + 1;
  return s < 0 ? Math.max(reach, edge + 0.5) : Math.min(reach, edge - 0.5);
}

/** Seeded nudges for a pair of hanging ears (both sides alike): `len` longer or shorter, `flare` further out. */
interface Hang { len: number; flare: number }

/** A dog's floppy ear on side s: rooted on the upper side of the head, draped over its edge, hanging to the cheek. */
function floppyEar(ctx: Ctx, s: number, { len, flare }: Hang): { ear: string } {
  const { rig } = ctx, u = Math.min(1.1, Math.max(0.78, rig.half / 32)), yR = rig.top + (rig.eyeY - rig.top) * 0.2, ey = rig.eyeY;
  const eR = edgeX(rig, yR, s), eE = edgeX(rig, ey, s);
  // The inner edge comes down just inside the head's edge, never onto the eyes.
  const reach = eyeReach(ctx, s, eE), lim = (x: number) => (s < 0 ? Math.min(x, reach) : Math.max(x, reach));
  const X = (e: number, d: number) => e + s * d * u;
  const pts: P[] = [
    [lim(X(eR, -7)), yR - 2.5], [X(eR, 1.5), yR - 5.5], [X(eE, 7 + flare * 0.6), (yR + ey) / 2 + 1], [X(eE, 9.5 + flare), ey + 8 + len * 0.6],
    [X(eE, 5 + flare * 0.6), ey + 14.5 + len], [lim(X(eE, -1.5)), ey + 10 + len * 0.6], [lim(X(eE, -3)), ey], [lim(X(eR, -6)), yR + 5.5],
  ];
  return { ear: smoothLoop(pts) };
}

/** A lop rabbit's ear on side s: a broad rounded fold on the crown, then the ear hangs outside the cheek, past the mouth.
 * Its pink inside shows along the hanging half. */
function lopEar(ctx: Ctx, s: number, { len, flare }: Hang): { ear: string; inner: string } {
  const { rig } = ctx, u = Math.min(1.1, Math.max(0.78, rig.half / 32)), xr = 60 + s * rig.faceHalf * 0.42, yR = topAt(rig, xr), ey = rig.eyeY, my = rig.mouthY;
  const eE = edgeX(rig, ey, s), eR = edgeX(rig, yR + 4, s);
  const reach = eyeReach(ctx, s, eE), lim = (x: number) => (s < 0 ? Math.min(x, reach) : Math.max(x, reach));
  const X = (e: number, d: number) => e + s * d * u;
  const A: P = [xr - s * 3, yR + 2.5], B: P = [xr + s * 3 * u, yR - 3.5], C: P = [X(eR, 3), yR + 1.5], D: P = [X(eE, 8.5), ey - 4];
  const E: P = [X(eE, 10.5 + flare), my + 3 + len * 0.6], F: P = [X(eE, 5.5 + flare * 0.6), my + 11.5 + len], G: P = [lim(X(eE, 0)), my + 3 + len * 0.6], H: P = [lim(X(eE, -1.5)), ey], I: P = [lim(X(eR, -4)), yR + 7.5];
  const inner = [lerp(D, H, 0.38), lerp(E, G, 0.26), lerp(F, lerp(E, G, 0.5), 0.42), lerp(E, G, 0.74), lerp(D, H, 0.72)];
  return { ear: smoothLoop([A, B, C, D, E, F, G, H, I]), inner: smoothLoop(inner) };
}

/** Where a hanging ear turns: its root, the top inner corner (82% across and 8% down its box on the left, mirrored on
 * the right). The pink inside of a lop ear turns about the same point, so it stays inside the ear. */
function root(ear: string, s: number): P {
  const pts = flatten(ear).flat(), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return [x0 + (x1 - x0) * (s < 0 ? 0.82 : 0.18), y0 + (y1 - y0) * 0.08];
}

/** Both hanging ears as pieces: merged just over the body (their silhouette joins the outline where they hang past the
 * head) with a thin ink edge where they lie on it, in the shared `hang` group, pivoted at their root. */
function hanging(ctx: Ctx, kind: "floppy" | "lop"): Drawing {
  const { spec } = ctx, pieces: Piece[] = [], r = ctx.rng("b06-hang");
  const paint: Paint = kind === "lop" ? "body" : darkMark(spec), hang: Hang = { len: r.range(-2.5, 2.5), flare: r.range(-1.5, 1.5) };
  for (const s of [-1, 1]) {
    const g = `hang-${s < 0 ? "l" : "r"}`;
    if (kind === "floppy") { const ear = floppyEar(ctx, s, hang).ear; pieces.push({ d: ear, c: paint, layer: LAYER.body + 1, stroke: 2.4, g, pivot: root(ear, s) }); }
    else {
      const { ear, inner } = lopEar(ctx, s, hang), pivot = root(ear, s);
      pieces.push({ d: ear, c: paint, layer: LAYER.body + 1, stroke: 2.4, g, pivot }, { d: inner, c: "pink", layer: LAYER.body + 1.1, g, pivot, lod: 1 });
    }
  }
  return { pieces };
}

/* ---------- quills (fitted along the outline) ---------- */

/** A hedgehog's fringe: dark spikes all round the top and the sides of the outline, pointing outwards, behind the body. */
function quills(ctx: Ctx): Drawing {
  const { rig } = ctx, r = ctx.rng("b06-quills"), u = Math.min(1.15, Math.max(0.8, rig.half / 32));
  const loop = flatten(rig.outline).sort((a, b) => b.length - a.length)[0] ?? [];
  if (loop.length < 3) return {};
  const acc = [0];
  for (let i = 1; i < loop.length; i += 1) acc.push(acc[i - 1] + Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]));
  const total = acc[acc.length - 1], step = 6.4 * u, count = Math.round(total / step);
  const cy = (rig.top + rig.bottom) / 2 + 4;
  const at = (dist: number): { p: P; t: P } => {
    let j = 1;
    while (j < loop.length - 1 && acc[j] < dist) j += 1;
    const a = loop[j - 1], b = loop[j], k = (dist - acc[j - 1]) / (acc[j] - acc[j - 1] || 1), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { p: lerp(a, b, k), t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
  };
  let d = "";
  for (let i = 0; i < count; i += 1) {
    const { p, t } = at((total * i) / count);
    let nx = -t[1], ny = t[0];
    if (nx * (p[0] - 60) + ny * (p[1] - cy) < 0) { nx = -nx; ny = -ny; }
    const ang = (Math.atan2(nx, -ny) * 180) / Math.PI;
    if (Math.abs(ang) > 116) continue;
    // Longest over the top, fading out down the sides; every other spike a little shorter.
    const fade = Math.cos(((Math.abs(ang) / 116) * Math.PI) / 2) ** 0.6;
    const len = (i % 2 ? 8.2 : 10.4) * u * (0.45 + 0.55 * fade) + r.range(-0.8, 0.8);
    const turn = (r.range(-9, 9) * Math.PI) / 180, dx = nx * Math.cos(turn) - ny * Math.sin(turn), dy = nx * Math.sin(turn) + ny * Math.cos(turn);
    const b = step * 0.62, base: P = [p[0] - nx * 2.6, p[1] - ny * 2.6];
    d += `M${pt([base[0] - t[0] * b, base[1] - t[1] * b])}L${pt([p[0] + dx * len, p[1] + dy * len])}L${pt([base[0] + t[0] * b, base[1] + t[1] * b])}Z`;
  }
  return { pieces: [{ d, c: "dark" }] };
}

/* ---------- patterns ---------- */

/** A calico/dog patch: one big irregular spot on a flank, below the face. It stays inside the outline, on the lit part of
 * the coat: a spot that touched the rim would melt into the rim's shading (or, near-black, into the ink outline). It is
 * near-black on every coat but a dark one (the belly colour there): the dark role is only a muddier coat colour, and a
 * calico's or a beagle's patch is black. Paint on the skin, under the belly patch, the arms and everything else.
 *
 * It keeps off the mouth (B14, queue item 27): it used to reach under a mouth corner, and the near-black spot merged with
 * the open mouth into one dark smear. Across the mouth's height (its lip line to its open chin) it now stays
 * `PATCH_MOUTH_CLEAR` out from the middle: the open mouth's half width (10), its ink and a gap. It is a little narrower and
 * taller than before, so it still fits beside the mouth on a round body. */
const PATCH_MOUTH_CLEAR = 13.5;
function patch(ctx: Ctx): Drawing {
  const { rig, spec } = ctx, r = ctx.rng("b06-patch"), s = r.chance(0.5) ? -1 : 1;
  // A belly patch is drawn over the skin: with one, the spot moves out and up beside it.
  const belly = ctx.has("pattern:belly"), cy = Math.min(rig.mouthY + (belly ? 1 : 5), rig.bottom - 12) + r.range(-1.5, 1.5);
  const reach = Math.abs(edgeX(rig, cy, s) - 60), clear = PATCH_MOUTH_CLEAR;
  // Its width fits between the mouth's keep-out and the edge's (3 in from the rim); a small spot reads as a smudge, so
  // never under 7.5. Its centre sits far enough out that the inner side clears the mouth.
  const rx = Math.max(7.5, Math.min(rig.half * r.range(0.34, 0.4), (reach - 3 - clear) / 2));
  const off = Math.max(reach * (belly ? r.range(0.64, 0.7) : r.range(0.56, 0.62)), clear + rx * 1.05), cx = 60 + s * off;
  // The top stays clear of the eyes (at least 8 under the eye line) and the bottom a little over the base.
  const ry = Math.max(6, Math.min(rx * 1.35, cy - (rig.eyeY + 8) - 1.2, rig.bottom - 3.5 - cy)), ph = r.range(0, Math.PI * 2);
  const top = rig.mouthY - 4, chin = (rig.at.chin?.y ?? rig.mouthY + 14.5) + 1;
  const pts: P[] = [];
  for (let i = 0; i < 36; i += 1) {
    const a = (i / 36) * Math.PI * 2, k = 1 + 0.1 * Math.sin(ph + a * 3) + 0.06 * Math.sin(ph * 2 + a * 5);
    const y = cy + Math.sin(a) * ry * k, e = edgeX(rig, y, s) - s * 3;
    let x = cx + Math.cos(a) * rx * k;
    if (y > top && y < chin) x = s < 0 ? Math.min(x, 60 - clear) : Math.max(x, 60 + clear);
    const p: P = [s < 0 ? Math.max(x, e) : Math.min(x, e), y], last = pts[pts.length - 1];
    // Points held off the edge bunch up: drop the ones too close (they would kink the smoothing).
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1.4) pts.push(p);
  }
  return { pieces: [{ d: smoothLoop(pts), c: isDarkCoat(spec) ? "belly" : SOFT_INK, flat: true, ink: "inner", layer: LAYER.skin }] };
}

/** A moon bear's crescent: a cream V across the chest (a U under the mouth reads as a second smile), its arms rising
 * from a soft point low on the chest to the shoulders, where the arms cover their tips. Dark on a pale coat. */
function moonChest(ctx: Ctx): Drawing {
  const { rig, spec } = ctx, yB = Math.min(rig.bottom - 3.5, rig.mouthY + 15.5), yA = rig.mouthY - 1, th = 3.8;
  const sp = spanAt(rig, yA + 2) ?? [60 - rig.half * 0.8, 60 + rig.half * 0.8], W = Math.min(25, (sp[1] - sp[0]) / 2 - 3.5);
  const d = `M${pt([60 - W, yA])}Q${pt([60 - W * 0.42, yB - 2])} ${pt([60 - 2.4, yB])}Q${pt([60, yB + 0.9])} ${pt([60 + 2.4, yB])}Q${pt([60 + W * 0.42, yB - 2])} ${pt([60 + W, yA])}`
    + `Q${pt([60 + W + 0.2, yA - 1.8])} ${pt([60 + W - 1.8, yA - 1.2])}Q${pt([60 + W * 0.36, yB - th - 1.5])} ${pt([60, yB - th])}Q${pt([60 - W * 0.36, yB - th - 1.5])} ${pt([60 - W + 1.8, yA - 1.2])}`
    + `Q${pt([60 - W - 0.2, yA - 1.8])} ${pt([60 - W, yA])}Z`;
  return { pieces: [{ d, c: !spec.shiny && spec.color.light >= 78 ? "dark" : "horn", flat: true, ink: "inner", layer: LAYER.skin }] };
}

/* ---------- static drawings (reference body) ---------- */

const EAR_JIT = { rot: 5, size: 0.05 };
const TAIL_JIT = { rot: 6 };

const MOUSE_TAIL = "M80 92C94 96.5 104.5 92.5 104.5 83C104.5 75 97 72.5 94.5 77.5C93 81 96.5 83.5 99 81.5";
const PIG_TAIL = "M80 90C87.5 92 94.5 90.5 94.5 85C94.5 80.5 89 80 88.5 84C88 88.5 95 90 99 86.5C101.5 84.2 101.5 80.5 99.5 78.5";
const PAW_ARM = smoothLoop([[35, 70.4], [28, 71], [21.8, 73.6], [17, 78.2], [15, 84], [17.6, 89.6], [23.6, 91], [28.4, 87.4], [30.6, 82.4], [35, 80.6]]);

export default batch({
  label: "B06 Peluditos",

  parts: [
    /* ---------- ears (top) ---------- */
    {
      // Big round mouse ears with pink insides: the strongest 28 px cue after the bunny's.
      id: "ears-mouse", slot: "top", label: "orejas de ratón", at: "earL", socket: [40.8, 42], group: "ear", jitter: EAR_JIT,
      draw: { pieces: [{ d: ellipse(33.5, 30.5, 14, 14), c: "body" }, { d: ellipse(34.2, 31.6, 8.8, 8.8), c: "pink", layer: LAYER.top + 0.5 }] },
    },
    {
      // Floppy dog ears hanging from the upper sides of the head, in the dark paint. They cover the temples, where
      // headphone cups and earmuffs would sit (`blocks-temples`), and a band would cut through the lop's fold (`blocks-band`).
      id: "ears-floppy", slot: "top", label: "orejas caídas", tags: ["blocks-band", "blocks-temples"], draw: (ctx) => hanging(ctx, "floppy"),
    },
    {
      // Small pig ears, the tip folded forward over the pink.
      id: "ears-pig", slot: "top", label: "orejas de cerdito", at: "earL", socket: [40.8, 42], group: "ear", noise: 1, jitter: EAR_JIT,
      draw: {
        pieces: [
          { d: "M32.5 48Q27.6 40 29.4 33.6L38.8 30.2Q45.6 33.4 52 39.5Z", c: "body" },
          { d: "M35.2 44.6Q32.4 39 33.2 35L39.2 33Q43.6 35.6 46.6 40Z", c: "pink", layer: LAYER.top + 0.5 },
          { d: "M28.6 34.6Q33.2 29.4 39.8 29.6Q40.2 35.4 37.2 40.6Q32.8 39 28.6 34.6Z", c: "body", layer: LAYER.top + 0.6, stroke: 2.2 },
        ],
      },
    },
    {
      // Raccoon ears: short rounded points, splayed out, dark with a pale middle.
      id: "ears-pointy", slot: "top", label: "orejas de mapache", at: "earL", socket: [40.8, 42], jitter: { rot: 4 }, tags: [DARK_LIMBS],
      draw: (ctx) => ({
        pieces: [
          { d: "M31 51Q25 36 25.6 27.4Q26 23 30 24.4Q43 29 53 40Z", c: darkPart(ctx.spec) },
          { d: "M34.6 45Q31.4 36.6 31.4 31.4Q38.8 34.2 45.6 40.8Z", c: "belly", layer: LAYER.top + 0.5 },
        ],
      }),
    },
    {
      // The lop rabbit's ears (uncommon): a soft fold on the crown, then long ears hanging outside the cheeks.
      id: "ears-lop", slot: "top", label: "orejas de belier", rarity: "uncommon", tags: ["blocks-band", "blocks-temples"], draw: (ctx) => hanging(ctx, "lop"),
    },
    {
      // The bear's ears painted black, for the panda (on its white coat the dark role would only be a pale grey).
      id: "ears-panda", slot: "top", label: "orejas de panda", at: "earL", socket: [40.8, 42], tags: [DARK_LIMBS],
      draw: (ctx) => ({ pieces: [{ d: "M38 22Q26 22 26 34Q26 46 38 46Q50 46 50 34Q50 22 38 22Z", c: darkPart(ctx.spec) }] }),
    },

    /* ---------- tails (rump) ---------- */
    {
      id: "mouse", slot: "tail", label: "de ratón", at: "rump", socket: [82, 94], group: "tail", noise: 1, jitter: TAIL_JIT,
      draw: { pieces: [{ d: MOUSE_TAIL, c: "pink", w: 3.4 }] },
    },
    {
      // A bunny's pom-pom (panda, lop rabbit). It wags a little, like every tail.
      id: "puff", slot: "tail", label: "pompón", at: "rump", socket: [82, 94], group: "tail", noise: 1,
      draw: { pieces: [{ d: pompom(92.5, 88, 7.8), c: "belly" }] },
    },
    {
      id: "curl", slot: "tail", label: "rizo de cerdito", at: "rump", socket: [82, 94], group: "tail", noise: 1, jitter: TAIL_JIT,
      draw: { pieces: [{ d: PIG_TAIL, c: "body", w: 3.4 }] },
    },
    {
      id: "ringed", slot: "tail", label: "de mapache", at: "rump", socket: [82, 94], group: "tail", jitter: TAIL_JIT,
      draw: (ctx) => {
        const ring = darkPart(ctx.spec);
        return { pieces: [{ d: RINGED(0, 1), c: "body" }, ...[[0.36, 0.49], [0.62, 0.74], [0.86, 1]].map(([a, b]): Piece => ({ d: RINGED(a, b), c: ring, layer: LAYER.tail + 0.5 }))] };
      },
    },
    {
      // The rare plume: an S taller than the body, curling back over the head behind it.
      id: "squirrel", slot: "tail", label: "de ardilla", at: "rump", socket: [82, 94], group: "tail", rarity: "rare", jitter: { rot: 4 },
      draw: { pieces: [{ d: SQUIRREL(0, 1), c: "body" }, { d: SQUIRREL_FLUFF(0.3, 1), c: "belly", layer: LAYER.tail + 0.5 }] },
    },

    /* ---------- back ---------- */
    { id: "quills", slot: "back", label: "púas de erizo", draw: quills },

    /* ---------- arms ---------- */
    {
      // Round paws, pink toe beans at stage: the coat's colour, or dark on a panda or a raccoon.
      id: "paws", slot: "arms", label: "patitas", at: "shoulderL", socket: [34, 74], group: "arm", tags: ["hand"],
      draw: (ctx) => ({
        pieces: [
          { d: PAW_ARM, c: limbPaint(ctx) },
          { d: ellipse(21.6, 85.6, 2.9, 2.3), c: "pink", ink: "inner", flat: true, lod: 2 },
          { d: `${ellipse(17.2, 82.2, 1.3, 1.4)}${ellipse(18.4, 78.6, 1.3, 1.4)}${ellipse(21.6, 76.8, 1.3, 1.4)}`, c: "pink", ink: "inner", flat: true, lod: 2 },
        ],
        emits: { handL: { x: 21, y: 83 } },
      }),
    },
    {
      // Cartoon gloves: the arm in the coat's colour, a cream mitten with a cuff and a thumb.
      id: "mitts", slot: "arms", label: "guantes", at: "shoulderL", socket: [34, 74], group: "arm", tags: ["hand"],
      draw: {
        pieces: [
          { d: "M35 70.4Q26 70.8 22.4 76.2L27.4 80.8Q30.6 80.4 35 80.6Z", c: "body" },
          { d: tilted(24.2, 78.6, 4.8, 2.8, 42), c: "horn", layer: LAYER.arms + 0.2 },
          { d: tilted(25.6, 84.2, 2.6, 3.3, -20), c: "horn", layer: LAYER.arms + 0.1 },
          { d: ellipse(19.4, 84.6, 6.2, 6.4), c: "horn", layer: LAYER.arms + 0.1 },
        ],
        emits: { handL: { x: 20, y: 84 } },
      },
    },

    /* ---------- legs ---------- */
    {
      // Round feet with three toes, painted like the arm paws; they step while working and tuck in while asleep.
      id: "paws", slot: "legs", label: "patas",
      draw: (ctx) => {
        const { rig } = ctx, c = limbPaint(ctx);
        const paw = (x: number, y: number) =>
          `M${pt([x - 7.4, y - 1])}L${pt([x - 8.2, y + 6])}Q${pt([x - 8.4, y + 10.6])} ${pt([x - 4.8, y + 10.6])}Q${pt([x - 2.7, y + 10.6])} ${pt([x - 2.3, y + 9])}`
          + `Q${pt([x, y + 11.4])} ${pt([x + 2.3, y + 9])}Q${pt([x + 2.7, y + 10.6])} ${pt([x + 4.8, y + 10.6])}Q${pt([x + 8.4, y + 10.6])} ${pt([x + 8.2, y + 6])}L${pt([x + 7.4, y - 1])}Z`;
        return { pieces: [{ d: paw(rig.at.footL.x, rig.at.footL.y), c, g: "leg-a" }, { d: paw(rig.at.footR.x, rig.at.footR.y), c, g: "leg-b" }] };
      },
    },

    /* ---------- patterns ---------- */
    { id: "patch", slot: "pattern", label: "parche", draw: patch },
    { id: "moon-chest", slot: "pattern", label: "luna en el pecho", excludes: ["pattern:belly|fur-tips"], draw: moonChest },
  ],

  members: [
    {
      id: "raton", family: "furry", label: "ratón", bodies: { blob: 1, round: 1 },
      fixed: { top: "ears-mouse", mouth: "buck", legs: "feet", arms: { nubs: 10, paws: 6 } },
      // The tail is a pool, not fixed, so the rare roll can swap it for the squirrel's plume.
      pools: {
        tail: { mouse: 10, squirrel: 0 }, eyes: { button: 10, two: 6, sparkle: 4 }, nose: { button: 10, nose: 5, heart: 4 },
        cheeks: { p: 0.45, pick: { pouches: 10, blush: 6 } }, pattern: { p: 0.4, pick: "belly" },
      },
      color: [
        { weight: 3, hue: [205, 230], sat: [6, 12], light: [58, 70], spot: 160 },
        { weight: 2, hue: [24, 34], sat: [20, 32], light: [52, 62], spot: 160 },
        { weight: 1, hue: 40, sat: 8, light: [90, 93], spot: 160 },
      ],
    },
    {
      id: "perrito", family: "furry", label: "perrito", bodies: { round: 3, blob: 1 },
      fixed: { top: "ears-floppy", nose: "snout-dog", arms: { paws: 10, nubs: 8 } },
      pools: {
        mouth: { tongue: 10, smile: 8, cat: 3 }, eyes: { two: 10, button: 6, sparkle: 4, sleepy: 3 },
        pattern: { p: 0.45, pick: "patch" }, tail: { p: 0.55, pick: "cat" },
        legs: { paws: 10, feet: 6 },
        neckwear: { p: 0.3, pick: { "bell-collar": 10, bandana: 6 } },
      },
      color: [
        { weight: 3, hue: [26, 38], sat: [40, 58], light: [52, 64], spot: 160 },
        { weight: 2, hue: [30, 42], sat: [26, 40], light: [76, 84], spot: 160 },
        { weight: 1, hue: 35, sat: 8, light: [90, 93], spot: 160 },
      ],
    },
    {
      id: "panda", family: "furry", label: "panda", bodies: { round: 2, pear: 1 },
      fixed: { top: "ears-panda", marks: "eyepatch", arms: "paws", legs: "paws" },
      // No button or hollow eyes: black dots vanish on the black patches. Small eyes in big patches are the panda's look:
      // one of the few members that keep the beady eyes (B14).
      pools: {
        eyes: { beady: 10, two: 6, sparkle: 4 }, mouth: { cat: 10, smile: 6, tiny: 6 }, nose: { button: 10, nose: 4 },
        tail: { p: 0.5, pick: "puff" }, cheeks: { p: 0.3, pick: "blush" }, held: { p: 0.15, pick: { "umbrella-leaf": 10 } },
      },
      color: { hue: [30, 50], sat: [4, 8], light: [93, 95], spot: 160 },
    },
    {
      id: "mapache", family: "furry", label: "mapache", bodies: { round: 3, blob: 1 },
      fixed: { top: "ears-pointy", marks: "mask", tail: "ringed", arms: { mitts: 10, paws: 8 } },
      pools: {
        mouth: { smirk: 10, cat: 8, smile: 4 }, eyes: { two: 10, sparkle: 4, sleepy: 4 }, nose: { button: 10, nose: 3 },
        legs: { paws: 10, feet: 6 }, pattern: { p: 0.5, pick: "belly" },
      },
      // A pale grey coat, so the mask, the ears, the tail's rings and the paws all get the near-black paint.
      color: { hue: [212, 236], sat: [6, 12], light: [74, 80], spot: 160 },
    },
    {
      id: "cerdito", family: "furry", label: "cerdito", bodies: { wide: 3, round: 1 },
      fixed: { top: "ears-pig", nose: "snout-pig", tail: "curl", arms: "nubs" },
      pools: {
        eyes: { button: 10, two: 8, sleepy: 3 }, mouth: { smile: 10, tiny: 6, cat: 4, tongue: 4 },
        cheeks: { p: 0.6, pick: "blush" }, legs: "feet",
      },
      color: { hue: [344, 358], sat: [48, 62], light: [70, 77], spot: 160 },
    },
    {
      id: "erizo", family: "furry", label: "erizo", bodies: { pear: 3, round: 1 },
      // The hedgehog's little eyes (catalogue F2): it keeps the beady eyes beside the button ones (B14).
      fixed: { back: "quills", nose: "button", arms: "paws" },
      pools: {
        eyes: { button: 10, beady: 7 }, mouth: { smile: 10, tiny: 8, cat: 4 }, marks: { p: 0.5, pick: "face-patch" },
        cheeks: { p: 0.4, pick: "blush" }, legs: { feet: 10, paws: 6 },
      },
      color: { hue: [26, 36], sat: [30, 44], light: [60, 72], spot: 160 },
    },
    {
      // The moon bear: a black bear with a cream crescent on its chest and a pale muzzle. The core bear rolls the muzzle
      // too (see `extend`), but never a black coat, and the crescent only reads right on one (on the core bear's white
      // coat it would be a grey V, in place of its belly), so the moon bear keeps a member of its own.
      id: "oso-luna", family: "furry", label: "oso luna", weight: 6, bodies: { round: 3, pear: 1 },
      fixed: { top: "bear", eyes: "beady", mouth: "cat", nose: "muzzle", pattern: ["moon-chest"], legs: "feet", arms: { nubs: 10, paws: 6 } },
      color: { hue: [240, 270], sat: [8, 16], light: [24, 32], spot: 160 },
    },
  ],

  // The catalogue's pools for the core members (§1.2 F2), which live in core-species.ts. The lop rabbit is now a bunny
  // with lop ears (a fixed option: they are its signature, never dropped) and maybe a pom-pom; it used to be a member of
  // its own here, with nothing else to tell it apart.
  // B14: the cat and the bunny now have arms (paws as an option), and the furry family's rare is the squirrel's plume (p 0:
  // only the rare roll picks it, for a furry bicho whose tail is not its signature).
  extend: [
    { family: "furry", member: "cat", fixed: { arms: { paws: 12 } }, pools: { pattern: { p: 0.55, pick: { patch: 6 } }, neckwear: { p: 0.15, pick: "bell-collar" } } },
    { family: "furry", member: "bunny", fixed: { top: { "ears-lop": 3 }, arms: { paws: 6 } }, pools: { tail: { p: 0.4, pick: "puff" } } },
    { family: "furry", member: "bear", fixed: { nose: { muzzle: 4 } } },
    { family: "furry", pools: { tail: { p: 0, pick: { squirrel: 1 } } } },
  ],

  showcase: [
    "bicho:furry/cat:b06-calico?pattern=patch",
    "bicho:furry/bunny:b06-lop?top=ears-lop&tail=puff",
    "bicho:furry/bear:b06-luna?nose=muzzle&pattern=moon-chest",
    "bicho:furry/raton:b06-ardilla?tail=squirrel",
    "bicho:furry/fox:b06-guantes?arms=mitts",
    "bicho:furry/bear:b06-patitas?arms=paws&legs=paws",
    "bicho:monsters/monster:b06-erizo?back=quills",
  ],
});
