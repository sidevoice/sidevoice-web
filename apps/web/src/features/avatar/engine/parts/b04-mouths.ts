import { INK, LAYER, SOFT_INK, batch, darkMark, ellipse, isPaleCoat, n, smoothLoop, spanAt, topAt, type Ctx, type Drawing, type Eye, type Piece } from "../bichos/kit";

/* B04 Faces II (docs/catalogue.md §2.3, §2.5, §5.2): ten new mouths, four new cheeks and seven new face marks.
 *
 * Mouths sit on the `mouth` anchor and keep the cast's speaking behaviour: every one gives `mouthRest` (`.m-rest`) and
 * `mouthOpen` (`.m-open`); the lab shows the open shape on each word (`data-beat`) and folds it up from its top edge
 * back into the rest shape on `data-pause`. So each open shape keeps its top edge on the lip line (y - 2, like the
 * cast's D), which is also what keeps it clear of every nose (they end 2.4 under `muzzle`, 2.6 over the mouth line).
 * They use the cast's fixed mouth colours: interior #3a0f22, tongue #ff6f91, white teeth, horn tusks. At 28 px (rail)
 * the lines get a touch heavier and the small inner detail (tooth seams, stitches, dimples) is left out.
 *
 * Cheeks sit on `cheekL/R`; marks hug the eyes actually drawn (`ctx.eyes`: the eyes slot runs first) or sit on
 * `forehead`, and read the body's real outline (`spanAt`, `topAt`) so they never spill over the silhouette.
 *
 * Everything painted on the skin goes on one layer, LAYER.skin: just over the body fill, as merged pieces. A merged piece
 * lying on the body shows no outline (its ink is under the body's fill), so this reads as paint, and it lands under
 * everything else: arms, hats, B02's caps, the nose, blush and belly patches. Inner pieces would be drawn over all of
 * those. The pouches are the exception: they bulge past the face in front of the arms' roots, so they are drawn like
 * the scarf, a merged copy over the arms (its outline joins the silhouette) plus an inner copy with a thin edge.
 *
 * Dark marks keep contrast with the coat (the kit's `darkMark`): soft ink on pale coats, the belly colour on dark ones.
 * Forehead marks step down clear of a cap's or a hat's brim (`ctx.brim`), and are left out when the eyes leave no room
 * under it. */

type P = [number, number];

const MOUTH = "#3a0f22", TONGUE = "#ff6f91", TOOTH = "#fff", HORN = "var(--bx-horn)";
/** Every mark that circles or covers the eyes: they need the eyes on the face, not on eye stalks (tag `stalks`: the
 * frog's domes, B11's eye stalks), and an LED screen would paint over them. (visor and led-heart come with later batches.) */
const FACE_ONLY = ["eyes:led|visor|led-heart", "#stalks"];

const pt = (x: number, y: number) => `${n(x)} ${n(y)}`;
const line = (w: number) => `fill="none" stroke="${INK}" stroke-width="${n(w)}" stroke-linecap="round" stroke-linejoin="round"`;
const edge = (w: number) => `stroke="${INK}" stroke-width="${n(w)}" stroke-linejoin="round"`;
const path = (d: string, attrs: string) => `<path ${attrs} d="${d}"/>`;
const oval = (cx: number, cy: number, rx: number, ry: number, attrs: string) => `<ellipse ${attrs} cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"/>`;
const poly = (pts: P[]) => `M${pts.map(([x, y]) => pt(x, y)).join("L")}`;

/* ---------- mouth helpers ---------- */

interface Mouth { x: number; y: number; rail: boolean; stage: boolean; lw: number; side: 1 | -1 }
/** The mouth anchor, the size flags, the lip line width (heavier at 28 px) and a seeded side for lopsided mouths. */
function mouthOf(ctx: Ctx, salt = "b04-side"): Mouth {
  const { x, y } = ctx.rig.at.mouth, rail = ctx.size === "rail";
  return { x, y, rail, stage: ctx.size === "stage", lw: rail ? 3.6 : 3, side: ctx.rng(salt).chance(0.5) ? 1 : -1 };
}

/** A symmetric parabola through (x ± w, y0) that dips `depth` at x: its height at X (a quadratic arc's closed form). */
const arcY = (x: number, w: number, y0: number, depth: number) => (X: number) => y0 + depth * (1 - ((X - x) / w) ** 2);
/** That parabola as a quadratic path from left to right. */
const arcD = (x: number, w: number, y0: number, depth: number, move = true) => `${move ? `M${pt(x - w, y0)}` : ""}Q${pt(x, y0 + 2 * depth)} ${pt(x + w, y0)}`;

/** The cast's open D (as `toonMouth`): flat top at y - 2, half width w, a round bottom h under the top. */
const dShape = (x: number, y: number, w: number, h: number) =>
  `M${pt(x - w, y - 2)}H${n(x + w)}Q${pt(x + w, y - 2 + h)} ${pt(x, y - 2 + h)}Q${pt(x - w, y - 2 + h)} ${pt(x - w, y - 2)}Z`;
/** The height of that D's bottom edge at X. */
const dBottom = (x: number, y: number, w: number, h: number) => (X: number) => {
  const t = Math.sqrt(Math.max(0, 1 - Math.min(1, Math.abs(X - x) / w)));
  return y - 2 + h * (1 - (1 - t) ** 2);
};

interface Tongue { cx: number; cy: number; rx: number; ry: number }
/** An open mouth: the dark interior, a tongue, what goes inside (teeth), then the ink edge over all of it. */
const opened = (d: string, inside: string, lw: number, tongue?: Tongue) =>
  path(d, `fill="${MOUTH}"`) + (tongue ? oval(tongue.cx, tongue.cy, tongue.rx, tongue.ry, `fill="${TONGUE}"`) : "") + inside + path(d, line(lw));
/** The usual tongue of a D: low, a little right of centre. */
const dTongue = (x: number, y: number, w: number, h: number): Tongue => ({ cx: x + 1, cy: y - 2 + h * 0.72, rx: Math.min(5, w * 0.48), ry: h * 0.24 });

/** A band between two edge functions over [x0, x1], sampled (teeth rows that follow a curved lip). */
function band(f: (X: number) => number, g: (X: number) => number, x0: number, x1: number, steps = 10): string {
  const a: P[] = [], b: P[] = [];
  for (let i = 0; i <= steps; i += 1) { const X = x0 + ((x1 - x0) * i) / steps; a.push([X, f(X)]); b.unshift([X, g(X)]); }
  return `${poly([...a, ...b])}Z`;
}

/** A row of `count` pointed teeth hanging from (or, with dir -1, standing on) the edge f over [x0, x1]: the base runs
 * along f pushed `tuck` behind the lip, valleys `gap` off it, tips `len` off it. */
function zigzag(f: (X: number) => number, x0: number, x1: number, count: number, len: number, dir: 1 | -1, tuck = 1.2, gap = 0.6): string {
  const base: P[] = [], teeth: P[] = [], step = (x1 - x0) / count;
  for (let i = 0; i <= 8; i += 1) { const X = x0 + ((x1 - x0) * i) / 8; base.push([X, f(X) - dir * tuck]); }
  for (let i = count; i >= 0; i -= 1) {
    const X = x0 + i * step;
    teeth.push([X, f(X) + dir * gap]);
    if (i > 0) { const c = X - step / 2; teeth.push([c, f(c) + dir * len]); }
  }
  return `${poly([...base, ...teeth])}Z`;
}

/* ---------- the mouths ---------- */

/** Buck: a small smile over two big front teeth (mouse, rabbit). Open, the teeth hang from the top of a smaller D. */
function buck(ctx: Ctx): Drawing {
  const { x, y, rail, lw } = mouthOf(ctx);
  const tw = rail ? 4.6 : 3.9, th = rail ? 7 : 6.4, r = 1.7;
  const block = (top: number) => `M${pt(x - tw, top)}V${n(top + th - r)}Q${pt(x - tw, top + th)} ${pt(x - tw + r, top + th)}H${n(x + tw - r)}Q${pt(x + tw, top + th)} ${pt(x + tw, top + th - r)}V${n(top)}Z`;
  const teeth = (top: number) => path(block(top), `fill="${TOOTH}" ${edge(rail ? 2 : 1.6)}`) + (rail ? "" : path(`M${pt(x, top + 1)}V${n(top + th - 0.5)}`, line(1.3)));
  return {
    face: {
      mouthRest: teeth(y + 1.2) + path(arcD(x, 7.5, y - 0.4, 2.6), line(lw)),
      mouthOpen: opened(dShape(x, y, 8.5, 13.5), teeth(y - 2.6), lw, { cx: x + 0.6, cy: y + 8.4, rx: 4, ry: 2.6 }),
    },
  };
}

/** Tusks: two horn tusks pushing up from the lower jaw (ogre). At rest they stand in front of a wide lip, tips leaning
 * out; open, they ride the dropped jaw, over the lower lip. */
function tusks(ctx: Ctx): Drawing {
  const { x, y, rail, lw } = mouthOf(ctx);
  const k = rail ? 1.2 : 1, ink = edge(rail ? 2.2 : 1.8);
  // As tall as the face allows: the tips stop 1.6 under the eyes (squat faces, wide and tri, have 13 from eyes to mouth).
  const foot = y + 3.4, tipX = 8.6, room = Math.min(...eyesOf(ctx).map((e) => { const dx = Math.abs(Math.abs(e.x - x) - tipX); return dx < e.r + 1.3 ? foot - (e.y + Math.sqrt((e.r + 1.3) ** 2 - dx * dx)) - 1.6 : 99; }));
  const tall = Math.max(6.4, Math.min(10, room));
  /** A tusk standing on (fx, fy), h tall, its tip leaning to `s` (-1 left, 1 right). */
  const tusk = (fx: number, fy: number, h: number, s: number) => {
    const b = 2.7 * k, X = (dx: number) => n(fx + s * dx);
    return path(`M${X(b)} ${n(fy)}Q${X(b + 0.9)} ${n(fy - h * 0.55)} ${X(1.6)} ${n(fy - h)}Q${X(-b * 0.3)} ${n(fy - h * 0.42)} ${X(-b)} ${n(fy)}Z`, `fill="${HORN}" ${ink}`);
  };
  const w = 11, h = 14, low = dBottom(x, y, w, h);
  return {
    face: {
      mouthRest: path(arcD(x, w, y - 0.4, 2.4), line(lw)) + tusk(x - 7, foot, tall, -1) + tusk(x + 7, foot, tall, 1),
      mouthOpen: opened(dShape(x, y, w, h), "", lw, { cx: x, cy: y + 7.8, rx: 3.6, ry: 2.8 }) + tusk(x - 6.6, low(x - 6.6) + 1.8, 9 * k, -1) + tusk(x + 6.6, low(x + 6.6) + 1.8, 9 * k, 1),
    },
  };
}

/** Fang-single: the cast's smile with one fang, on a seeded side (so two such bichos may differ). */
function fangSingle(ctx: Ctx): Drawing {
  const { x, y, rail, lw, side } = mouthOf(ctx, "b04-fang");
  const k = rail ? 1.25 : 1;
  const fang = (fx: number, top: number, len: number, half: number) =>
    `M${pt(fx - half, top)}Q${pt(fx - half * 0.45, top + len * 0.62)} ${pt(fx - side * 0.5, top + len)}Q${pt(fx + half * 0.5, top + len * 0.55)} ${pt(fx + half, top)}Z`;
  const w = 10, h = 15;
  return {
    face: {
      mouthRest: path(fang(x + side * 4.6, y + 1.6, 6.4 * k, 2.4 * k), `fill="${TOOTH}" ${edge(rail ? 1.7 : 1.3)}`) + path(arcD(x, w, y, 3.5), line(lw)),
      mouthOpen: opened(dShape(x, y, w, h), path(fang(x + side * 5.4, y - 2.6, 7 * k, 2.6 * k), `fill="${TOOTH}"`), lw, dTongue(x, y, w, h)),
    },
  };
}

/** Grin: a wide crescent of teeth, already half open at rest (pumpkin, cheeky monsters). Speaking opens it wider and
 * taller: upper and lower teeth rows round a dark mouth and a tongue. */
function grin(ctx: Ctx): Drawing {
  const { x, y, rail, stage, lw } = mouthOf(ctx);
  const W = 13, top = arcY(x, W, y - 2, 1.8), bot = arcY(x, W, y - 2, 11), mid = arcY(x, W, y - 2, 6.4);
  const restShape = `M${pt(x - W, y - 2)}Q${pt(x, y + 1.6)} ${pt(x + W, y - 2)}Q${pt(x, y + 20)} ${pt(x - W, y - 2)}Z`;
  const seams = (xs: number[], f: (X: number) => number, g: (X: number) => number) =>
    xs.map((X) => `M${pt(X, f(X) + 0.4)}L${pt(X, g(X) - 0.4)}`).join("");
  const thin = stage ? 1.3 : 1.6;
  const restInside = rail
    ? path(arcD(x, W - 1.5, y - 1, 5.6), line(1.9))
    : path(arcD(x, W, y - 2, 6.4), line(thin))
      + path(seams(stage ? [x - 9, x - 4.5, x, x + 4.5, x + 9] : [x - 5, x + 5], top, mid) + seams(stage ? [x - 6.75, x - 2.25, x + 2.25, x + 6.75] : [x], mid, bot), line(thin));
  // Open: wider and much deeper.
  const OW = 14.5, otop = arcY(x, OW, y - 2, 1.5), obot = arcY(x, OW, y - 2, 15);
  const openShape = `M${pt(x - OW, y - 2)}Q${pt(x, y + 1)} ${pt(x + OW, y - 2)}Q${pt(x, y + 28)} ${pt(x - OW, y - 2)}Z`;
  const upper = band((X) => otop(X) - 1, (X) => otop(X) + (rail ? 3.6 : 3.4), x - OW + 2.6, x + OW - 2.6);
  const lower = band((X) => obot(X) - (rail ? 3.4 : 3.1), (X) => obot(X) + 1, x - OW + 4.6, x + OW - 4.6);
  const openSeams = rail ? "" : path(seams([x - 9, x - 4.5, x, x + 4.5, x + 9], (X) => otop(X), (X) => otop(X) + 3.4) + seams([x - 5, x, x + 5], (X) => obot(X) - 3.1, (X) => obot(X)), line(thin));
  return {
    face: {
      mouthRest: path(restShape, `fill="${TOOTH}"`) + restInside + path(restShape, line(lw)),
      mouthOpen: opened(openShape, path(upper + lower, `fill="${TOOTH}"`) + openSeams, lw, { cx: x + 1, cy: y + 7.6, rx: 5, ry: 2.4 }),
    },
  };
}

/** Smirk: a lopsided half smile with a dimple at the raised corner, on a seeded side. Open, the mouth stays lopsided:
 * deeper under the raised corner. */
function smirk(ctx: Ctx): Drawing {
  const { x, y, rail, lw, side } = mouthOf(ctx, "b04-smirk");
  const X = (dx: number) => n(x + side * dx);
  const dimple = rail ? "" : path(`M${X(9.3)} ${n(y - 4.9)}Q${X(10.7)} ${n(y - 3.3)} ${X(9.9)} ${n(y - 1.5)}`, line(2));
  const open = `M${X(-7.6)} ${n(y - 0.6)}Q${X(0)} ${n(y + 0.2)} ${X(8)} ${n(y - 2.4)}Q${X(8.8)} ${n(y + 9.4)} ${X(1.6)} ${n(y + 9.8)}Q${X(-7)} ${n(y + 9.4)} ${X(-7.6)} ${n(y - 0.6)}Z`;
  return {
    face: {
      mouthRest: path(`M${X(-8)} ${n(y + 0.6)}Q${X(1)} ${n(y + 3.8)} ${X(7.6)} ${n(y - 2.2)}`, line(lw)) + dimple,
      mouthOpen: opened(open, "", lw, { cx: x + side * 2, cy: y + 7, rx: 3.8, ry: 2.4 }),
    },
  };
}

/** Tiny: a short little curve; speaking, a small round "o". */
function tiny(ctx: Ctx): Drawing {
  const { x, y, rail } = mouthOf(ctx);
  const w = rail ? 5 : 4.2, o = rail ? { rx: 4.4, ry: 4.8 } : { rx: 3.5, ry: 4.3 };
  return {
    face: {
      mouthRest: path(arcD(x, w, y + 0.4, 1.7), line(rail ? 3.8 : 3)),
      mouthOpen: oval(x, y - 1.6 + o.ry, o.rx, o.ry, `fill="${MOUTH}" ${edge(rail ? 3 : 2.6)}`) + (rail ? "" : oval(x, y + 5.2, 1.9, 1.3, `fill="${TONGUE}"`)),
    },
  };
}

/** Stitch: a sewn-shut line (bone-head). Speaking, the lips pull apart between the stitches, so the opening scallops
 * into a zigzag pinched at each stitch. */
function stitch(ctx: Ctx): Drawing {
  const { x, y, rail, lw } = mouthOf(ctx);
  const xs = [x - 5, x, x + 5];
  const seams = (y0: number, y1: number) => xs.map((X) => `M${pt(X - 0.9, y0)}L${pt(X + 0.9, y1)}`).join("");
  const stitches = (y0: number, y1: number, w: number) => path(seams(y0, y1), line(w));
  /** Open, the stitches strain across the gap: cream threads with an ink edge. */
  const threads = (y0: number, y1: number) => path(seams(y0, y1), line(3.4)) + path(seams(y0, y1), `fill="none" stroke="${HORN}" stroke-width="1.5" stroke-linecap="round"`);
  const open = `M${pt(x - 10, y)}Q${pt(x - 7.5, y - 3.4)} ${pt(x - 5, y + 0.4)}Q${pt(x - 2.5, y - 3.4)} ${pt(x, y + 0.4)}Q${pt(x + 2.5, y - 3.4)} ${pt(x + 5, y + 0.4)}Q${pt(x + 7.5, y - 3.4)} ${pt(x + 10, y)}`
    + `Q${pt(x + 7.5, y + 9.4)} ${pt(x + 5, y + 5)}Q${pt(x + 2.5, y + 9.8)} ${pt(x, y + 5.2)}Q${pt(x - 2.5, y + 9.8)} ${pt(x - 5, y + 5)}Q${pt(x - 7.5, y + 9.4)} ${pt(x - 10, y)}Z`;
  return {
    face: {
      mouthRest: path(arcD(x, 10, y + 0.6, 0.9), line(lw)) + stitches(y - 2.6, y + 4.4, rail ? 2.6 : 2),
      mouthOpen: opened(open, "", lw) + (rail ? "" : threads(y - 2.2, y + 7.2)),
    },
  };
}

/** Saw: a smile with a zigzag row of teeth under the lip (shark, pumpkin). Open, both jaws show their teeth. */
function saw(ctx: Ctx): Drawing {
  const { x, y, rail, lw } = mouthOf(ctx);
  const W = 12, lip = arcY(x, W, y - 1, 3.5), ink = edge(rail ? 1.8 : 1.4);
  const rest = path(zigzag(lip, x - 10, x + 10, rail ? 4 : 5, rail ? 4.4 : 3.8, 1), `fill="${TOOTH}" ${ink}`) + path(arcD(x, W, y - 1, 3.5), line(lw));
  const w = 12, h = 14, low = dBottom(x, y, w, h);
  const upper = zigzag(() => y - 2, x - w + 0.6, x + w - 0.6, rail ? 4 : 5, rail ? 4.4 : 4, 1, 1.2, 1.1);
  const lower = zigzag(low, x - 8.6, x + 8.6, rail ? 3 : 4, rail ? 4 : 3.6, -1, 1.4, 0.8);
  return {
    face: {
      mouthRest: rest,
      mouthOpen: opened(dShape(x, y, w, h), path(upper + lower, `fill="${TOOTH}"`), lw, { cx: x + 0.6, cy: y + 6.4, rx: 3.4, ry: 1.8 }),
    },
  };
}

/** Wavy: a nervous wobbly line. Open, a wobbly mouth with a wavy row of gritted teeth along the top. */
function wavy(ctx: Ctx): Drawing {
  const { x, y, rail, lw } = mouthOf(ctx);
  const rest = rail
    ? `M${pt(x - 9, y + 0.8)}Q${pt(x - 6, y - 3)} ${pt(x - 3, y + 0.8)}T${pt(x + 3, y + 0.8)}T${pt(x + 9, y + 0.8)}`
    : `M${pt(x - 10, y + 0.8)}Q${pt(x - 7.5, y - 2.4)} ${pt(x - 5, y + 0.8)}T${pt(x, y + 0.8)}T${pt(x + 5, y + 0.8)}T${pt(x + 10, y + 0.8)}`;
  // The open shape: a wavy top and bottom (sampled), rounded at the sides.
  const w = 9, top = (X: number) => y - 0.3 - 1.2 * Math.cos(((X - x + w) * 2 * Math.PI) / 9), bottom = (X: number) => y + 7.4 + 1.1 * Math.cos(((X - x + w) * 2 * Math.PI) / 9 + 1.2);
  const pts: P[] = [];
  for (let i = 0; i <= 12; i += 1) { const X = x - w + (2 * w * i) / 12; pts.push([X, top(X)]); }
  pts.push([x + w + 1.7, y + 3.6]);
  for (let i = 12; i >= 0; i -= 1) { const X = x - w + (2 * w * i) / 12; pts.push([X, bottom(X)]); }
  pts.push([x - w - 1.7, y + 3.6]);
  const shape = smoothLoop(pts);
  const teeth = rail ? "" : path(band((X) => top(X) - 1, (X) => top(X) + 2.6, x - w + 1.2, x + w - 1.2, 16), `fill="${TOOTH}"`);
  return {
    face: {
      mouthRest: path(rest, line(rail ? 3.8 : lw)),
      mouthOpen: opened(shape, teeth, lw, { cx: x + 1, cy: y + 6.4, rx: 3.6, ry: 1.6 }),
    },
  };
}

/** Pout: fish lips, a pink ring round a little dark hole; speaking, the ring grows. */
function pout(ctx: Ctx): Drawing {
  const { x, y, rail, stage } = mouthOf(ctx);
  const ring = (cy: number, rx: number, ry: number, hx: number, hy: number) =>
    oval(x, cy, rx, ry, `fill="${TONGUE}" ${edge(rail ? 2.8 : 2.4)}`) + oval(x, cy + 0.3, hx, hy, `fill="${MOUTH}"`)
    + (stage ? path(`M${pt(x - rx * 0.62, cy - ry * 0.32)}Q${pt(x - rx * 0.45, cy - ry * 0.7)} ${pt(x - rx * 0.1, cy - ry * 0.74)}`, `fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".8"`) : "");
  return {
    face: {
      mouthRest: rail ? ring(y + 1.4, 5.4, 4.4, 2.2, 1.6) : ring(y + 1.2, 4.8, 3.9, 1.9, 1.3),
      mouthOpen: rail ? ring(y + 4.4, 7, 6.4, 3.8, 3.8) : ring(y + 4, 6.4, 6, 3.4, 3.5),
    },
  };
}

/* ---------- cheeks ---------- */

/** Freckles: three dots per cheek, nudged per bicho (and per side, so they never look stamped). */
function freckles(ctx: Ctx): Drawing {
  const { rig } = ctx, r = ctx.rng("b04-freckles"), k = ctx.size === "stage" ? 1 : 1.3;
  const DOTS: [number, number, number][] = [[-2.9, -0.4, 1.1], [0.3, -2, 0.95], [2.5, 0.8, 1.1]];
  const side = (cx: number, cy: number, s: number) =>
    DOTS.map(([dx, dy, rad]) => ellipse(cx + s * (dx + r.range(-0.5, 0.5)), cy + dy + r.range(-0.5, 0.5), rad * k, rad * k)).join("");
  return { pieces: [{ d: side(rig.at.cheekL.x, rig.at.cheekL.y, 1) + side(rig.at.cheekR.x, rig.at.cheekR.y, -1), c: markPaint(ctx, "dark"), flat: true }] };
}

/** A spiral from (cx, cy) outwards, `turns` round, out to radius R, as a polyline. */
function spiral(cx: number, cy: number, R: number, turns: number, dir: 1 | -1): string {
  const pts: P[] = [];
  for (let i = 0; i <= 22; i += 1) {
    const t = i / 22, a = -Math.PI / 2 + dir * t * turns * 2 * Math.PI, rad = R * (0.12 + 0.88 * t);
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return poly(pts);
}

/** Swirls: a pink spiral on each cheek, turning opposite ways. At 28 px a spiral is a speck, so it paints a blush. */
function swirls(ctx: Ctx): Drawing {
  const { rig } = ctx, L = rig.at.cheekL, R = rig.at.cheekR;
  if (ctx.size === "rail") return { pieces: [{ d: ellipse(L.x, L.y, 4, 3) + ellipse(R.x, R.y, 4, 3), c: "pink", flat: true }] };
  const w = ctx.size === "stage" ? 1.8 : 2.2;
  return { pieces: [{ d: spiral(L.x, L.y, 4, 1.65, -1) + spiral(R.x, R.y, 4, 1.65, 1), c: "pink", w, flat: true }] };
}

/** Shy lines: the anime blush, three slanted dashes in the cast's tongue pink over a soft blush. At 28 px the dashes
 * are hairlines, so only the blush stays. */
function shyLines(ctx: Ctx): Drawing {
  const { rig } = ctx, L = rig.at.cheekL, R = rig.at.cheekR, w = ctx.size === "stage" ? 1.5 : 1.9;
  const blush: Piece = { d: ellipse(L.x, L.y, 4.8, 3.1) + ellipse(R.x, R.y, 4.8, 3.1), c: "pink", flat: true };
  if (ctx.size === "rail") return { pieces: [blush] };
  const dashes = (cx: number, cy: number, s: number) => [0, 1, 2].map((i) => `M${pt(cx + s * (-3.6 + 2.9 * i), cy + 2.2)}L${pt(cx + s * (-1.8 + 2.9 * i), cy - 2.2)}`).join("");
  return { pieces: [blush, { d: dashes(L.x, L.y, 1) + dashes(R.x, R.y, -1), c: TONGUE as `#${string}`, w, flat: true }] };
}

/** Pouches: puffed belly-coloured cheeks bulging past the sides of the face (mouse, hamster), on the body's real edge at
 * the cheek line. On most bodies that is where the arms join, so the cheeks are drawn in front of the arms, the arms
 * coming out from behind them (lifting the cheeks clear of the joint put them at the temples, where they read as ear
 * muffs). Like the scarf: a merged copy gives the bulge its fat outline, an inner copy with a thin edge lies over the
 * arm's root and the flank patterns. */
function pouches(ctx: Ctx): Drawing {
  const { rig } = ctx, rx = 7.6, ry = 6.4, y = rig.at.cheekL.y + 1.5;
  const span = spanAt(rig, y) ?? [60 - rig.faceHalf, 60 + rig.faceHalf];
  const pieces: Piece[] = [];
  for (const s of [-1, 1] as const) {
    const d = ellipse((s < 0 ? span[0] : span[1]) - s * rx * 0.32, y, rx, ry);
    pieces.push({ d, c: "belly", layer: LAYER.arms + 1 }, { d, c: "belly", ink: "inner", stroke: 2.2, layer: LAYER.arms + 1 });
  }
  return { pieces };
}

/* ---------- face marks ---------- */

/** The paint of a dark mark (mask, panda patches, tiger stripes), kept in contrast with the coat: the dark role sits only
 * 22 under the body's lightness, a pale grey on a white bear and near black on a dark cat, so the kit's `darkMark` gives
 * a pale coat SOFT_INK (as a panda's patches) and a dark coat the belly colour (light stripes, a spectacled bear's rings). */
const markPaint = ({ spec }: Ctx, pale: Piece["c"] = SOFT_INK): Piece["c"] => darkMark(spec, pale);
/** Closed eyes over a dark patch: the shared lids are ink, lost on the patch (a panda asleep would show two black holes),
 * so the patch adds a light lid over each one, in `.eyes-closed`, on the shared lid's curve (`closedLids`). */
const lightLids = (eyes: Eye[]) =>
  `<path fill="none" stroke="var(--bx-belly)" stroke-width="2.1" stroke-linecap="round" d="${eyes.map((e) => `M${pt(e.x - e.r * 0.8, e.y + 1)}Q${pt(e.x, e.y + e.r * 0.8)} ${pt(e.x + e.r * 0.8, e.y + 1)}`).join("")}"/>`;
/** A dark patch round the eyes as a drawing: the piece, plus light lids when the patch is darker than the coat. */
function patchOut(ctx: Ctx, d: string, eyes: Eye[]): Drawing {
  const c = markPaint(ctx);
  return { pieces: [{ d, c, flat: true }], ...(c === "belly" ? {} : { face: { closed: lightLids(eyes) } }) };
}
/** The eyes as drawn; the eye anchors if a part gave none. */
const eyesOf = (ctx: Ctx): Eye[] => (ctx.eyes.length ? ctx.eyes : [{ ...ctx.rig.at.eyeL, r: 8.5 }, { ...ctx.rig.at.eyeR, r: 8.5 }]);
/** The body's span at height y, pulled in by `inset`. */
function inside(ctx: Ctx, y: number, inset: number): [number, number] {
  const s = spanAt(ctx.rig, y) ?? [60 - ctx.rig.faceHalf, 60 + ctx.rig.faceHalf];
  return [s[0] + inset, s[1] - inset];
}

interface Ell { cx: number; cy: number; rx: number; ry: number }
/** The outline of a union of ellipses, read column by column between lo and hi (each column must be one interval,
 * which holds for overlapping blobs), as one smooth closed path: one shape, no seams, shaded as one. */
function union(shapes: Ell[], lo: number, hi: number, steps = 22): string {
  const a = Math.max(lo, Math.min(...shapes.map((s) => s.cx - s.rx))), b = Math.min(hi, Math.max(...shapes.map((s) => s.cx + s.rx)));
  const top: P[] = [], bottom: P[] = [];
  for (let i = 1; i < steps; i += 1) {
    const X = a + ((b - a) * (1 - Math.cos((Math.PI * i) / steps))) / 2;
    let t = Infinity, u = -Infinity;
    for (const s of shapes) {
      const q = (X - s.cx) / s.rx;
      if (Math.abs(q) >= 1) continue;
      const h = s.ry * Math.sqrt(1 - q * q);
      t = Math.min(t, s.cy - h); u = Math.max(u, s.cy + h);
    }
    if (t < u) { top.push([X, t]); bottom.unshift([X, u]); }
  }
  return smoothLoop([...top, ...bottom]);
}

/** A lobe round an eye, kept inside the face: its half width shrinks to the room left between the eye and the edge. */
function lobe(e: Eye, lo: number, hi: number, grow: number, growY: number, dy = 0): Ell {
  const room = e.x < 60 ? e.x - lo : hi - e.x;
  return { cx: e.x, cy: e.y + dy, rx: Math.max(e.r + 1.5, Math.min(e.r + grow, room)), ry: e.r + growY };
}

/** Mask: a dark band across the eyes, edge to edge (raccoon), dipping at the bridge of the nose. */
function mask(ctx: Ctx): Drawing {
  const eyes = eyesOf(ctx), ys = eyes.map((e) => e.y), yc = (Math.min(...ys) + Math.max(...ys)) / 2;
  const [lo, hi] = inside(ctx, yc + 1.5, 1.4);
  const lobes = eyes.map((e) => lobe(e, lo, hi, 4.6, 3.4, 0.8));
  const bar: Ell = { cx: (lo + hi) / 2, cy: yc + 2.2, rx: (hi - lo) / 2, ry: 4.6 };
  return patchOut(ctx, union([...lobes, bar], lo, hi), eyes);
}

/** A rotated ellipse as a path (two half arcs). */
function tilted(cx: number, cy: number, rx: number, ry: number, deg: number): string {
  const a = (deg * Math.PI) / 180, dx = rx * Math.cos(a), dy = rx * Math.sin(a);
  return `M${pt(cx + dx, cy + dy)}A${n(rx)} ${n(ry)} ${n(deg)} 1 1 ${pt(cx - dx, cy - dy)}A${n(rx)} ${n(ry)} ${n(deg)} 1 1 ${pt(cx + dx, cy + dy)}Z`;
}

/** Eyepatch: a dark oval behind each eye, tall and tipped outwards at the bottom (panda). */
function eyepatch(ctx: Ctx): Drawing {
  const eyes = eyesOf(ctx);
  const d = eyes.map((e) => {
    const s = Math.abs(e.x - 60) < 2 ? 0 : Math.sign(e.x - 60), deg = -s * 24, a = (deg * Math.PI) / 180;
    let rx = e.r + 3.4, ry = e.r + 5;
    const cx = e.x + s * 0.8, cy = e.y + 1.8;
    // Kept inside the face: the tipped oval's half width is sqrt((rx cos)² + (ry sin)²).
    const [lo, hi] = inside(ctx, cy + 2, 1.2), reach = s < 0 ? cx - lo : s > 0 ? hi - cx : Math.min(cx - lo, hi - cx);
    const half = Math.hypot(rx * Math.cos(a), ry * Math.sin(a));
    if (half > reach) { const k = Math.max((e.r + 1.5) / rx, reach / half); rx *= k; ry *= k; }
    return tilted(cx, cy, rx, ry, deg);
  }).join("");
  return patchOut(ctx, d, eyes);
}

/** Face stripes: two dark tiger stripes on each side of the face, rooted in the outline, tapering in towards the eyes. */
function faceStripes(ctx: Ctx): Drawing {
  const { rig } = ctx, eyes = eyesOf(ctx);
  const yc = eyes.reduce((t, e) => t + e.y, 0) / eyes.length;
  let d = "";
  for (const s of [-1, 1] as const) {
    const outer = eyes.reduce((o, e) => (s * e.x > s * o.x ? e : o), eyes[0]);
    for (const [dy, bw, tilt, grow] of [[-4, 1.9, -1.4, 1], [4.4, 1.8, 1.8, 0.85]] as const) {
      const y = yc + dy, edgeAt = (yy: number) => { const sp = spanAt(rig, yy); return sp ? (s < 0 ? sp[0] : sp[1]) : 60 + s * rig.faceHalf; };
      const x0 = edgeAt(y), room = Math.abs(outer.x - s * outer.r - x0) - 1.5, len = Math.max(4.5, Math.min(11, room)) * grow;
      const tip: P = [x0 - s * len, y + tilt];
      d += `M${pt(edgeAt(y - bw), y - bw)}Q${pt(x0 - s * len * 0.5, y - bw * 0.75 + tilt * 0.4)} ${pt(tip[0], tip[1])}Q${pt(x0 - s * len * 0.5, y + bw * 0.85 + tilt * 0.5)} ${pt(edgeAt(y + bw), y + bw)}Z`;
    }
  }
  return { pieces: [{ d, c: markPaint(ctx), flat: true }] };
}

/** Face patch: a patch round the eyes and the mouth (monkey, yeti): a lobe round each eye and a muzzle under them, one
 * shape with a heart's notch between the eyes. The face's own eye anchors always get a lobe too, so a cyclops still
 * wears a heart-shaped patch rather than a stripe down the face. It is the pale belly colour (a monkey's face), except
 * on a pale coat, where the belly would vanish: there it is the dark role, a yeti's blue-grey face in white fur. */
function facePatch(ctx: Ctx): Drawing {
  const c: Piece["c"] = isPaleCoat(ctx.spec) ? "dark" : "belly";
  const { rig } = ctx, eyes = eyesOf(ctx);
  const ys = eyes.map((e) => e.y), [lo, hi] = inside(ctx, Math.max(...ys, rig.eyeY), 2.2);
  const anchors: Eye[] = [{ ...rig.at.eyeL, r: 8.5 }, { ...rig.at.eyeR, r: 8.5 }];
  const lobes = [...eyes, ...anchors].map((e) => lobe(e, lo, hi, 4, 4));
  const [mlo, mhi] = inside(ctx, rig.mouthY + 2, 2.2);
  const ry = Math.min(12, (rig.bottom - 5 - (rig.mouthY + 2.5)));
  const muzzle: Ell = { cx: 60, cy: rig.mouthY + 2.5, rx: Math.min(15, (mhi - mlo) / 2), ry };
  return { pieces: [{ d: union([...lobes, muzzle], Math.min(lo, mlo), Math.max(hi, mhi), 26), c }] };
}

/** Where a forehead mark of radius R goes: the `forehead` anchor, raised clear of the eyes if it must be, and never
 * above the real head top. Under a brim (a cap top, a hat: `ctx.brim`) it steps down clear of it; null when the eyes
 * leave it no room there. */
function foreheadAt(ctx: Ctx, R: number): P | null {
  const { rig } = ctx, x = rig.at.forehead.x;
  let clear = rig.at.forehead.y;
  for (const e of eyesOf(ctx)) {
    const need = e.r + R + 1.6, dx = Math.abs(e.x - x);
    if (dx < need) clear = Math.min(clear, e.y - Math.sqrt(need * need - dx * dx));
  }
  const y = Math.max(clear, topAt(rig, x) + R + 3.4), under = ctx.brim === undefined ? -Infinity : ctx.brim + R + 1.4;
  if (under <= y) return [x, y];
  return under <= clear ? [x, under] : null;
}

/** Forehead gem (rare): a faceted spot-coloured gem in a gold setting, with a glint. */
function foreheadGem(ctx: Ctx): Drawing {
  const R = 4.7, at = foreheadAt(ctx, R);
  if (!at) return {};
  const [x, y] = at;
  const g = `M${pt(x, y - 3.3)}Q${pt(x + 1.4, y - 1.7)} ${pt(x + 2.9, y - 0.2)}Q${pt(x + 1.4, y + 1.8)} ${pt(x, y + 3.4)}Q${pt(x - 1.4, y + 1.8)} ${pt(x - 2.9, y - 0.2)}Q${pt(x - 1.4, y - 1.7)} ${pt(x, y - 3.3)}Z`;
  return {
    pieces: [
      { d: ellipse(x, y, R, R * 0.92), c: "gold", stroke: 1.8 },
      { d: g, c: "spot", stroke: 1.2 },
      { d: ellipse(x - 1, y - 1.3, 0.9, 0.7), c: "#ffffff", flat: true, lod: 1 },
    ],
  };
}

/** A rounded five-point star round (cx, cy), outer radius R, turned `deg`. */
function star(cx: number, cy: number, R: number, deg: number): string {
  const p = (i: number, r: number): P => { const a = ((-90 + deg + i * 36) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  let d = "";
  for (let i = 0; i < 5; i += 1) {
    const o = p(2 * i, R), before = p(2 * i - 1, R * 0.5), after = p(2 * i + 1, R * 0.5), a = lerp(before, o, 0.72), b = lerp(o, after, 0.28);
    d += `${i ? "L" : "M"}${pt(...a)}Q${pt(...o)} ${pt(...b)}L${pt(...after)}`;
  }
  return `${d}Z`;
}

/** A heart, its tip at the bottom, about 2R wide. */
function heart(cx: number, cy: number, R: number): string {
  const k = R / 8, q = (dx: number, dy: number) => pt(cx + dx * k, cy + dy * k);
  return `M${q(0, 6.5)}C${q(-1.5, 5)} ${q(-8, 2.5)} ${q(-8, -2.5)}C${q(-8, -6.5)} ${q(-2.5, -7.7)} ${q(0, -4.1)}C${q(2.5, -7.7)} ${q(8, -6.5)} ${q(8, -2.5)}C${q(8, 2.5)} ${q(1.5, 5)} ${q(0, 6.5)}Z`;
}

/** Forehead star: a small pale star on the forehead, or a heart (seeded), slightly turned. */
function foreheadStar(ctx: Ctx): Drawing {
  const r = ctx.rng("b04-forehead"), R = 4, at = foreheadAt(ctx, R);
  if (!at) return {};
  const [x, y] = at;
  return { pieces: [{ d: r.chance(0.5) ? heart(x, y, R) : star(x, y + 0.3, R + 0.4, r.range(-12, 12)), c: "belly", flat: true }] };
}

/** A stadium (a strip with round ends) round (cx, cy), half length L, half width W, along angle deg. */
function strip(cx: number, cy: number, L: number, W: number, deg: number): string {
  const a = (deg * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, l = L - W;
  const p = (u: number, v: number) => pt(cx + ux * u + nx * v, cy + uy * u + ny * v);
  return `M${p(-l, W)}L${p(l, W)}A${W} ${W} 0 0 0 ${p(l, -W)}L${p(-l, -W)}A${W} ${W} 0 0 0 ${p(-l, W)}Z`;
}

/** Bandaid: two crossed plasters on the right cheek, a pad where they cross. */
function bandaid(ctx: Ctx): Drawing {
  const { rig } = ctx, cx = rig.at.cheekR.x + 2, cy = rig.at.cheekR.y + 0.4, rail = ctx.size === "rail";
  const L = rail ? 6.6 : 6.2, W = rail ? 2.4 : 2.1, ink = rail ? 1.8 : 1.5;
  return {
    pieces: [
      { d: strip(cx, cy, L, W, -34), c: "horn", stroke: ink },
      { d: strip(cx, cy, L, W, 34), c: "horn", stroke: ink },
      { d: ellipse(cx, cy, 1.7, 1.5), c: "#ffffff", flat: true, lod: 1 },
    ],
  };
}

/* ---------- the batch ---------- */

const MOUTH_PART = { slot: "mouth" } as const;
const ON_SKIN = { layer: LAYER.skin } as const;

export default batch({

  parts: [
    /* ---------- mouths ---------- */
    { ...MOUTH_PART, id: "buck", label: "paletas", draw: buck },
    { ...MOUTH_PART, id: "tusks", label: "de ogro", draw: tusks },
    { ...MOUTH_PART, id: "fang-single", label: "un colmillo", draw: fangSingle },
    { ...MOUTH_PART, id: "grin", label: "sonrisota", draw: grin },
    { ...MOUTH_PART, id: "smirk", label: "pícara", draw: smirk },
    { ...MOUTH_PART, id: "tiny", label: "boquita", draw: tiny },
    { ...MOUTH_PART, id: "stitch", label: "cosida", draw: stitch },
    { ...MOUTH_PART, id: "saw", label: "de sierra", draw: saw },
    { ...MOUTH_PART, id: "wavy", label: "nerviosa", draw: wavy },
    { ...MOUTH_PART, id: "pout", label: "morritos", draw: pout },

    /* ---------- cheeks (cheekL/R) ---------- */
    { ...ON_SKIN, id: "freckles", slot: "cheeks", label: "pecas", lod: 1, draw: freckles },
    { ...ON_SKIN, id: "swirls", slot: "cheeks", label: "espirales", rarity: "uncommon", draw: swirls },
    { ...ON_SKIN, id: "shy-lines", slot: "cheeks", label: "sonrojo", draw: shyLines },
    { ...ON_SKIN, id: "pouches", slot: "cheeks", label: "carrillos", draw: pouches },

    /* ---------- face marks ---------- */
    { ...ON_SKIN, id: "mask", slot: "marks", label: "antifaz", excludes: FACE_ONLY, draw: mask },
    { ...ON_SKIN, id: "eyepatch", slot: "marks", label: "manchas de panda", excludes: FACE_ONLY, draw: eyepatch },
    { ...ON_SKIN, id: "face-stripes", slot: "marks", label: "rayas de tigre", excludes: ["eyes:led|visor|led-heart"], draw: faceStripes },
    { ...ON_SKIN, id: "face-patch", slot: "marks", label: "careta", excludes: FACE_ONLY, draw: facePatch },
    // The forehead marks share the forehead with the tabby stripes and the pumpkin's groove, and a cyclops or a third
    // eye fills it.
    { ...ON_SKIN, id: "forehead-gem", slot: "marks", label: "gema", rarity: "rare", excludes: ["eyes:led|visor|led-heart|cyclops|three", "pattern:stripes|ribs"], draw: foreheadGem },
    { ...ON_SKIN, id: "forehead-star", slot: "marks", label: "estrellita", lod: 1, excludes: ["eyes:led|visor|led-heart|cyclops|three", "pattern:stripes|ribs"], draw: foreheadStar },
    { ...ON_SKIN, id: "bandaid", slot: "marks", label: "tirita", excludes: ["eyes:led|visor|led-heart"], draw: bandaid },
  ],
});
