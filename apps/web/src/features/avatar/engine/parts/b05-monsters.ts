import {
  LAYER, add, batch, clamp, ellipse, len, mul, n, onRim, perp, pt, spanAt, sub, topAt, unit,
  type Ctx, type Drawing, type Piece, type Pt, type Rig, type Spec,
} from "../bichos/kit";

/* B05 Monsters+ (docs/catalogue.md §1.2 F1, §2.1, §5.2): bones, horns, tufts and the other monster parts, and seven
 * new members of the Monsters family (monstruos).
 *
 * Rigid tops are drawn on the reference body (crown at 40, so its outline tops out at y 38, half width 32) and join
 * their anchor by a socket on it, like the existing horns and ears. Parts that must hug the real outline are fitted
 * instead: the bone through the skull and the ram horns read the head's edge (`spanAt`), the slime drips follow the
 * head's top (`topAt`) and the back spines sit along the outline (`onRim`), so they land on any body.
 *
 * Nothing here adds a keyframe or a group: tops ride the shared `ear` and `sprout` groups, the tail `tail`, the arms
 * `arm`, and the rest only the shared squash. */

type P = Pt;

/* ---------- drawing helpers ---------- */

/** A cartoon dog-bone from knob centre `a` to knob centre `b`: a shaft `h` half wide, two round lobes of radius `k`
 * at each end. Circular arcs only, so it turns freely; arc flags are separate numbers, so mirrorPath can flip it. */
function bone(a: P, b: P, h: number, k: number): string {
  const ax = unit(sub(b, a)), nx = perp(ax), L = len(sub(b, a)), c = k * 0.68;
  const s1 = Math.sqrt(k * k - (c - h) * (c - h)), s2 = Math.sqrt(k * k - c * c);
  const at = (u: number, v: number) => pt(add(a, add(mul(ax, u), mul(nx, v))));
  const arc = `A${n(k)} ${n(k)} 0 1 1 `;
  return `M${at(L - s1, -h)}${arc}${at(L + s2, 0)}${arc}${at(L - s1, h)}L${at(s1, h)}${arc}${at(-s2, 0)}${arc}${at(s1, -h)}Z`;
}

/** Points along a quadratic, both ends included. */
function quad(p0: P, c: P, p2: P, steps = 14): P[] {
  const out: P[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]]);
  }
  return out;
}

/** A closed tube along a polyline, `w0` wide at the start tapering to `w1`, with round caps at both ends (the kit's `tube` has a flat base). */
function capsule(pts: P[], w0: number, w1: number): string {
  const left: P[] = [], right: P[] = [];
  pts.forEach((p, i) => {
    const nrm = perp(unit(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)])));
    const w = (w0 + ((w1 - w0) * i) / (pts.length - 1)) / 2;
    left.push(add(p, mul(nrm, w)));
    right.push(sub(p, mul(nrm, w)));
  });
  return `M${pt(left[0])}${left.slice(1).map((p) => `L${pt(p)}`).join("")}A${n(w1 / 2)} ${n(w1 / 2)} 0 0 0 ${pt(right[right.length - 1])}`
    + `${right.slice(0, -1).reverse().map((p) => `L${pt(p)}`).join("")}A${n(w0 / 2)} ${n(w0 / 2)} 0 0 0 ${pt(left[0])}Z`;
}

/** A flame-like strand of fur from its root `b` to its tip `t`, `w` half wide at the root, the tip bent `curl` sideways. */
function strand(b: P, t: P, w: number, curl: number): string {
  const d = sub(t, b), L = len(d), u = unit(d), nn = perp(u);
  const at = (k: number, off: number) => pt(add(b, add(mul(u, L * k), mul(nn, off))));
  const tip = pt(add(t, mul(nn, curl)));
  return `M${at(0, -w)}C${at(0.45, -w * 0.95 + curl * 0.25)} ${at(0.82, curl * 0.75 - w * 0.25)} ${tip}C${at(0.72, curl * 0.55 + w * 0.55)} ${at(0.38, w * 1.02)} ${at(0, w)}Z`;
}

/** A round-topped lobe from `root`, `long` long and `w` half wide, leaning `deg` from upright (clockwise). */
function lobe(root: P, deg: number, long: number, w: number): string {
  const t = (deg * Math.PI) / 180, up: P = [Math.sin(t), -Math.cos(t)], side: P = [Math.cos(t), Math.sin(t)];
  const at = (u: number, v: number) => pt(add(root, add(mul(up, u), mul(side, v))));
  return `M${at(0, -w)}L${at(long - w, -w)}A${n(w)} ${n(w)} 0 0 1 ${at(long - w, w)}L${at(0, w)}Z`;
}

/** A heart whose point sits at `tip` and faces `dir`, `k` = 1 is 16 wide (as B02's clover leaflets). */
function heart(tip: P, dir: P, k: number): string {
  const rot = Math.atan2(-dir[0], dir[1]), c = Math.cos(rot), s = Math.sin(rot);
  const p = (x: number, y: number) => pt([tip[0] + (x * c - y * s) * k, tip[1] + (x * s + y * c) * k]);
  // Local: point at the origin, lobes up (-y), so the point faces +y before turning.
  return `M${p(0, 0)}C${p(-1.5, -1.5)} ${p(-8, -4)} ${p(-8, -9)}C${p(-8, -13)} ${p(-2.5, -14.2)} ${p(0, -10.6)}C${p(2.5, -14.2)} ${p(8, -13)} ${p(8, -9)}C${p(8, -4)} ${p(1.5, -1.5)} ${p(0, 0)}Z`;
}

/** The body's gloss stroke kept below height `stop` (something sits on the head above it), 5 in from the left edge. */
function shineBelow(rig: Rig, stop: number): string {
  const y0 = rig.eyeY + 2, y2 = Math.min(stop + 4, y0 - 6), y1 = (y0 + y2) / 2;
  const edge = (y: number, inset: number) => (spanAt(rig, y)?.[0] ?? 60 - rig.faceHalf) + inset;
  return `M${n(edge(y0, 5.5))} ${n(y0)}Q${n(edge(y1, 3))} ${n(y1)} ${n(edge(y2, 6))} ${n(y2)}`;
}

/* ---------- bones ---------- */

const BONE_H = 2.5, BONE_K = 4.2;

/** A bone stuck right through the skull: fitted to the head's real edge, a knob poking out of each side, the shaft
 * hidden behind the head (it is a top, drawn under the body). A little tilted, either way, per bicho. */
function boneThrough(ctx: Ctx): Drawing {
  const { rig } = ctx, r = ctx.rng("b05-bone"), s = rig.at.crownL.s ?? 1;
  const top = topAt(rig, 60), y = top + clamp(0.42 * (rig.eyeY - top), 7, 13) * s;
  const tilt = (r.chance(0.5) ? -1 : 1) * r.range(2.5, 4.5) * s;
  const yl = y - tilt / 2, yr = y + tilt / 2;
  const xl = spanAt(rig, yl)?.[0] ?? 60 - rig.faceHalf * 0.8, xr = spanAt(rig, yr)?.[1] ?? 60 + rig.faceHalf * 0.8;
  const out = 9.5 * s;
  return { pieces: [{ d: bone([xl - out, yl], [xr + out, yr], BONE_H * s, BONE_K * s), c: "horn" }] };
}

// The hair clip: a small bone across the head's edge, top right. Half of it lies on the head, so it is drawn twice:
// merged (the fat outline where it pokes out) and inner with a thin ink edge (where it lies on the head).
const CLIP = bone([67.2, 44.6], [79.6, 37], 1.8, 2.9);

/* ---------- horns ---------- */

/** Ram horns, fitted: a thick root out of the head's upper side sweeping into a round curl beside the head, a spiral
 * groove in it and a ridge across the root. Each side is fitted to its own edge (a wobbly head isn't symmetric). */
function ramHorns(ctx: Ctx): Drawing {
  const { rig } = ctx, s = Math.min(1, rig.at.earL.s ?? 1, rig.faceHalf / 30);
  const top = topAt(rig, 60), yb = top + clamp(0.4 * (rig.eyeY - top), 7, 12);
  const span = spanAt(rig, yb) ?? [60 - rig.faceHalf, 60 + rig.faceHalf];
  const side = (dir: 1 | -1): Piece[] => {
    // Drawn for the left side (dir 1); the right side flips x and the arc's sweep. The root climbs out of the head,
    // the curl hangs beside it: a horn-coloured snail of a horn.
    const E: P = [dir > 0 ? span[0] : span[1], yb], at = (x: number, y: number): P => add(E, mul([x * dir, y], s));
    const rad = 8.8 * s, C = at(-9.4, -1), sweep = dir > 0 ? 1 : 0;
    const horn = `M${pt(at(8, 6))}Q${pt(at(2.4, 2.6))} ${pt(at(-0.9, 1.4))}A${n(rad)} ${n(rad)} 0 1 ${sweep} ${pt(at(-4.6, -8.4))}Q${pt(at(2.4, -10.4))} ${pt(at(7, -4.6))}Z`;
    // One spiral groove, winding in from the root's side of the curl, and one ridge across the root.
    let groove = "";
    for (let i = 0; i <= 26; i += 1) {
      // Screen angle, growing clockwise like the curl's own outer arc, the radius shrinking towards the centre.
      const t = i / 26, a = -0.4 + t * Math.PI * 3.2, rr = (rad - 2.6 * s) * (1 - 0.8 * t);
      groove += `${i ? "L" : "M"}${pt([C[0] + Math.cos(a) * rr * dir, C[1] + Math.sin(a) * rr])}`;
    }
    groove += `M${pt(at(1.4, -7.8))}Q${pt(at(3.6, -3))} ${pt(at(2.6, 2))}`;
    return [{ d: horn, c: "horn" }, { d: groove, c: "ink", w: 1.5, ink: "inner", flat: true, lod: 1 }];
  };
  return { pieces: [...side(1), ...side(-1)] };
}

/* ---------- the slime cap ---------- */


/** Slime on the head: a dollop of goo hugging the real outline and bulging a little over it, its lower edge running
 * into up to three drips with fat ends. The drips go where the eyes leave the most room (the head's edges included, so
 * a drip may hang beside an eye, half over the outline); where there is no room a drip stays a short round bump. The
 * goo is in the accent colour: in a lighter body tone it read as a swimming cap, not as slime. */
function drip(ctx: Ctx): Drawing {
  const { rig } = ctx, s = rig.at.crown.s ?? 1, r = ctx.rng("b05-drip");
  // The top runs before the eyes: `ctx.eyes` holds them as planned (the eyes part run ahead). Drips stop above them.
  const eyes = ctx.eyes.length ? ctx.eyes : [{ ...rig.at.eyeL, r: 8.5 }, { ...rig.at.eyeR, r: 8.5 }], top = topAt(rig, 60);
  // The brim stays above the eyes (a third eye sits high), but the goo never gets thinner than 4.
  const by = Math.max(top + 4 * s, Math.min(top + clamp(0.36 * (rig.eyeY - top), 6, 13) * s, ...eyes.map((e) => e.y - e.r - 2.5)));
  const [xl, xr] = spanAt(rig, by) ?? [60 - rig.faceHalf * 0.7, 60 + rig.faceHalf * 0.7];
  const N = 22, ups: P[] = [];
  for (let i = 0; i <= N; i += 1) { const x = xl + (xr - xl) * ((1 - Math.cos((Math.PI * i) / N)) / 2); ups.push([x, Math.min(by, topAt(rig, x))]); }
  const nrm = ups.map((_, i): P => { const t = unit(sub(ups[Math.min(N, i + 1)], ups[Math.max(0, i - 1)])); return [t[1], -t[0]]; });
  // Thicker on top: 1.8 out at the brim, 4.2 at the crown.
  const off = ups.map((p, i) => add(p, mul(nrm[i], (1.8 + 2.4 * Math.sin((Math.PI * i) / N)) * s)));

  // Where the drips go: every spot along the brim scores the longest drip the eyes allow there; the best three that
  // keep apart win. Each then takes its own length, at most what it scored.
  const hw = 3.4 * s, most = 13 * s;
  const room = (x: number) => eyes.reduce((b, e) => (Math.abs(x - e.x) < e.r + hw + 1.2 ? Math.min(b, e.y - e.r - 2) : b), by + most) - by;
  const spots: { x: number; len: number }[] = [];
  for (let x = xl + 2.5; x <= xr - 2.5; x += 0.5) spots.push({ x: x + r.range(-0.2, 0.2), len: room(x) });
  spots.sort((p, q) => q.len - p.len);
  const drops: { x: number; len: number }[] = [];
  for (const sp of spots) if (drops.length < 3 && drops.every((d) => Math.abs(d.x - sp.x) > 2 * hw + 6)) drops.push(sp);
  drops.forEach((d) => { d.len = d.len * r.range(0.72, 1); });
  drops.sort((p, q) => q.x - p.x);

  let lower = `L${n(xr - 0.6)} ${n(by + 0.3)}`;
  for (const { x, len } of drops) {
    const nw = hw * 0.8, cy = by + len - hw, neck = by + 2.8;
    lower += cy - 0.6 * hw > neck + 0.5
      // A drip: a neck, then a fat round end.
      ? `L${n(x + nw + 4.4)} ${n(by + 0.7)}Q${n(x + nw + 2.4)} ${n(by + 0.5)} ${n(x + nw)} ${n(neck)}L${n(x + nw)} ${n(cy - 0.6 * hw)}A${n(hw)} ${n(hw)} 0 1 1 ${n(x - nw)} ${n(cy - 0.6 * hw)}L${n(x - nw)} ${n(neck)}Q${n(x - nw - 2.4)} ${n(by + 0.5)} ${n(x - nw - 4.4)} ${n(by + 0.7)}`
      // No room: a round bump.
      : `L${n(x + hw + 4)} ${n(by + 0.6)}Q${n(x + hw + 2)} ${n(by + 0.4)} ${n(x + hw)} ${n(by + 1.6)}A${n(hw)} ${n(hw)} 0 0 1 ${n(x - hw)} ${n(by + 1.6)}Q${n(x - hw - 2)} ${n(by + 0.4)} ${n(x - hw - 4)} ${n(by + 0.6)}`;
  }
  lower += `L${pt(off[0])}`;
  const goo = `M${pt(off[0])}${off.slice(1).map((q) => `L${pt(q)}`).join("")}`;
  // A highlight on the goo's upper left, and the body's own gloss below the left drips.
  const hi = off.slice(3, 9).map((q, i) => `${i ? "L" : "M"}${pt(sub(q, mul(nrm[i + 3], 2.8 * s)))}`).join("");
  const leftLow = Math.max(by + 2, ...drops.filter((d) => d.x < 52).map((d) => by + d.len));
  return {
    pieces: [
      { d: `${goo}${lower}Z`, c: "spot", layer: LAYER.body + 1 },
      { d: `M${pt(off[N])}${lower}`, c: "ink", w: 2.2, ink: "inner", flat: true },
    ],
    face: { shine: hi + shineBelow(rig, leftLow) },
  };
}

/* ---------- back spines ---------- */

/** Five soft spikes along the upper back: from just off the crown (further when a top sits there) down the right
 * side, towards the tail, each pointing out of the real outline and swept back. Behind the body, merged. */
function spines(ctx: Ctx): Drawing {
  const { rig } = ctx, r = ctx.rng("b05-spines"), k = clamp(rig.half / 32, 0.85, 1.1);
  const sizes = [0.78, 1, 1.06, 0.94, 0.72], from = ctx.has("top") ? 30 : 16, to = 88;
  const pieces: Piece[] = sizes.map((z0, i) => {
    const z = z0 * k * (1 + r.range(-0.07, 0.07)), deg = from + ((to - from) * i) / (sizes.length - 1);
    const { p, t, nrm } = onRim(rig, deg, 4);
    const L = 9.5 * z, hb = 5.6 * z, base = sub(p, mul(nrm, 3));
    const bL = sub(base, mul(t, hb)), bR = add(base, mul(t, hb)), tip = add(p, add(mul(nrm, L), mul(t, L * 0.38)));
    const c1 = add(p, add(mul(nrm, L * 0.6), mul(t, -hb * 0.25))), c2 = add(p, add(mul(nrm, L * 0.2), mul(t, hb * 0.85)));
    return { d: `M${pt(bL)}Q${pt(c1)} ${pt(tip)}Q${pt(c2)} ${pt(bR)}Z`, c: "spot" };
  });
  return { pieces };
}

/* ---------- patterns ---------- */

/** A furry coat: tufts of fur sticking out of the outline down both flanks, from the cheeks to the hips (merged and
 * under the body, so the silhouette itself turns shaggy and reads at 28 px), plus a belly patch with a jagged furry top
 * where there is room for one under the resting mouth (scaled to that room, so it never pokes into the mouth). */
function furTips(ctx: Ctx): Drawing {
  const { rig } = ctx, r = ctx.rng("b05-fur"), k = clamp(rig.half / 32, 0.85, 1.1);
  const pieces: Piece[] = [];
  for (const side of [1, -1]) for (const at of [72, 87, 107, 122, 137]) {
    const deg = side * (at + r.range(-2, 2)), { p, t, nrm } = onRim(rig, deg);
    const len = (4.4 + r.range(-0.6, 0.6)) * k, hb = 3 * k, base = sub(p, mul(nrm, 2.2));
    // The tip juts out and droops a little, as fur does.
    const tip = add(p, add(mul(nrm, len), [0, 1.2]));
    pieces.push({ d: `M${pt(sub(base, mul(t, hb)))}Q${pt(add(p, add(mul(nrm, len * 0.55), mul(t, -hb * 0.5))))} ${pt(tip)}Q${pt(add(p, add(mul(nrm, len * 0.3), mul(t, hb * 0.6))))} ${pt(add(base, mul(t, hb)))}Z`, c: "body", layer: LAYER.body - 1, ink: "merge" });
  }
  // The patch: between the resting mouth (with a gap) and the base.
  const ceil = rig.mouthY + 6.5, floor = rig.bottom - 3.5, tuft = 4;
  if (floor - ceil >= 11) {
    const ry = Math.min(8.5, (floor - ceil - tuft) / 2), cy = floor - ry, rx = rig.half * 0.5;
    const at = (deg: number, f: number): P => { const tt = (deg * Math.PI) / 180; return [60 + Math.cos(tt) * rx * f, cy + Math.sin(tt) * ry * f]; };
    let d = `M${pt(at(180, 1))}`;
    const tips = 6;
    for (let i = 0; i < tips; i += 1) {
      const deg = 198 + (144 * i) / (tips - 1), mid = Math.abs(i - (tips - 1) / 2) < 1, tt = (deg * Math.PI) / 180, b0 = at(deg, 1);
      const long = (mid ? tuft : tuft * 0.7) + r.range(-0.4, 0.4), lean = (deg < 270 ? -1 : 1) * (mid ? 0.6 : 1.4);
      d += `L${pt(at(deg - 72 / (tips - 1), 0.92))}L${pt([b0[0] + Math.cos(tt) * long + lean, b0[1] + Math.sin(tt) * long])}`;
    }
    d += `L${pt(at(354, 0.95))}L${pt(at(360, 1))}Q${n(60 + rx)} ${n(cy + ry)} 60 ${n(cy + ry)}Q${n(60 - rx)} ${n(cy + ry)} ${n(60 - rx)} ${n(cy)}Z`;
    pieces.push({ d, c: "belly", ink: "inner", stroke: 1.8 });
  }
  return { pieces };
}

/** A ribcage print, a skeleton costume's: a sternum and pairs of ribs, bone-coloured over a thicker ink line, fitted
 * to the room between the resting mouth and the base: three pairs where there is room (pear, pill), two smaller ones
 * on the short bodies, so it stays a print and not a beard. */
function ribcage(ctx: Ctx): Drawing {
  const { rig } = ctx, y0 = rig.mouthY + 6, y1 = rig.bottom - 3.5, room = y1 - y0;
  const short = room < 11, h = clamp(room, 7.5, 16), top = (y0 + y1) / 2 - h / 2, k = h / 16;
  const reach = Math.min(rig.half * 0.4, short ? 10 : 13.5);
  const rows = short ? [[0.12, 1], [0.62, 0.84]] : [[0.1, 1], [0.42, 1.04], [0.74, 0.82]];
  let d = `M60 ${n(top - 0.5)}L60 ${n(top + h * 0.72)}`;
  for (const [f, wk] of rows) {
    const y = top + h * f, w = reach * wk;
    d += `M58.6 ${n(y)}Q${n(60 - w * 0.78)} ${n(y - 3.2 * k)} ${n(60 - w)} ${n(y + 3.2 * k)}M61.4 ${n(y)}Q${n(60 + w * 0.78)} ${n(y - 3.2 * k)} ${n(60 + w)} ${n(y + 3.2 * k)}`;
  }
  return { pieces: [{ d, c: "ink", w: 4.2, ink: "inner", flat: true }, { d, c: "horn", w: 2.1, ink: "inner", flat: true }] };
}

/* ---------- arms, tail ---------- */

/** Lanky noodle arms: a thin tube out of the shoulder, hanging low beside the body, ending in a dark round mitt with a
 * thumb. The drop fits the body (the mitt stays clear of the floor). Emits the hand for held items. */
function noodle(ctx: Ctx): Drawing {
  const { rig } = ctx, sh = rig.at.shoulderL, k = sh.s ?? 1;
  const drop = clamp((rig.bottom + 1 - sh.y) / k, 12, 21);
  const hand: P = [20.5, 74 + drop];
  const arm = capsule(quad([37, 72.6], [17.4, 70.6], [hand[0] + 0.4, hand[1] - 3]), 5.8, 4.8);
  return {
    pieces: [
      { d: arm, c: "body" },
      { d: ellipse(hand[0] + 3.5, hand[1] - 2.4, 2, 2), c: "dark" },
      { d: ellipse(hand[0], hand[1], 4.3, 4.6), c: "dark" },
    ],
    emits: { handL: { x: hand[0], y: hand[1] } },
  };
}

const DEVIL_TAIL = "M80 92Q101 97 102 78Q102.4 66 106 59.6";
/** The heart tip: its point faces on along the tail, its lobes sit on the tail's end. */
const DEVIL_TIP = heart(add([106, 59.6], mul(unit([3.6, -6.4]), 12.6)), unit([3.6, -6.4]), 0.95);

/* ---------- the parts ---------- */

const JIT_HORN = { rot: 5, size: 0.06 };

/** Is the coat pink or red, where the fixed pink (inner ears) would melt into it? */
const pinkCoat = (spec: Spec) => { const h = ((spec.color.hue % 360) + 360) % 360; return !spec.shiny && spec.color.sat > 25 && (h >= 315 || h <= 15); };
const EAR_LONG = "M42 48.5C36.4 37 33.4 24 35.4 9.6C40.6 15 47.6 23 51.6 31C54 35.6 55.6 39.4 56 43.4Z";
const EAR_LONG_IN = "M44.6 42.6C40.8 34 39 25.6 39.6 17.4C43.4 21.8 47.6 27.6 50.2 33C51.8 36.2 52.8 39 53 41.4Z";

export default batch({

  parts: [
    /* ---------- bones (top) ---------- */
    { id: "bone-through", slot: "top", label: "hueso atravesado", tags: ["blocks-band"], draw: boneThrough },
    {
      // Hats hide it (tag "hat-hidden"): a clip over a beanie would sit on the hat, not in the hair.
      id: "bone-clip", slot: "top", label: "pinza de hueso", at: "crownR", socket: [72.1, 44], pair: false, noise: 1, tags: ["hat-hidden", "blocks-band"],
      jitter: { rot: 6 },
      draw: { pieces: [{ d: CLIP, c: "horn" }, { d: CLIP, c: "horn", ink: "inner", stroke: 2.2 }] },
    },
    {
      id: "bone-horns", slot: "top", label: "cuernos de hueso", at: "crownL", socket: [47.9, 44], tags: ["blocks-band"], jitter: JIT_HORN,
      draw: { pieces: [{ d: bone([51.2, 50], [42.6, 27], 2.4, 3.7), c: "horn" }] },
    },

    /* ---------- horns ---------- */
    {
      id: "horns-nub", slot: "top", label: "cuernitos", at: "crownL", socket: [47.9, 44], noise: 1, jitter: { rot: 6, size: 0.08 },
      draw: { pieces: [{ d: "M41.2 46.8C40.4 39.8 41.4 34.6 44 31.6C45.4 30 47.6 30.2 48.8 31.8C51.4 35 52.8 38.8 53.2 44.6Z", c: "horn" }] },
    },
    {
      id: "horn-uni", slot: "top", label: "cuerno de unicornio", at: "crown", socket: [60, 42], tags: ["tall", "blocks-band"], jitter: { rot: 4 },
      draw: {
        pieces: [
          { d: "M52.8 45.5Q54.6 33.6 59.6 22.6Q61.4 19.6 63 22.8Q66.6 33.6 67.4 45.5Z", c: "horn" },
          { d: "M55.6 38.4Q60.6 37.4 65.4 34.8M57.4 31.2Q60.8 30.4 63.8 28.4M58.8 25.6Q60.8 25 62.2 24", c: "dark", w: 1.5, ink: "inner", flat: true, lod: 1 },
        ],
      },
    },
    // The curls sit on the temples: `blocks-temples` keeps earmuffs and headphone cups off them.
    { id: "horns-ram", slot: "top", label: "cuernos de carnero", tags: ["blocks-band", "blocks-temples"], draw: ramHorns },
    {
      id: "antlers", slot: "top", label: "cornamenta", at: "crownL", socket: [47.9, 44], tags: ["tall", "blocks-band"], jitter: { rot: 4, size: 0.05 },
      draw: {
        pieces: [
          { d: "M50.5 45Q42.6 32 40.4 16", c: "horn", w: 5.6, flat: true },
          { d: "M44.4 31.6Q37.6 30.8 33.6 23.6", c: "horn", w: 4.6, flat: true },
          { d: "M41.4 22.6Q45.2 18.6 47.6 13.4", c: "horn", w: 4.2, flat: true },
        ],
      },
    },

    /* ---------- fur, crests, ears ---------- */
    {
      id: "tuft", slot: "top", label: "mechón", at: "crown", socket: [60, 42], group: "sprout", noise: 1, tags: ["tall", "blocks-band"], jitter: { rot: 8, size: 0.06 },
      draw: {
        pieces: [
          { d: strand([55, 45.5], [45.2, 29.2], 4.4, 3.8), c: "body" },
          { d: strand([65, 45.5], [74.6, 30.8], 4.2, -3.8), c: "body" },
          { d: strand([60, 45.5], [62, 20.6], 5.4, -6.6), c: "body" },
        ],
      },
    },
    {
      id: "mohawk", slot: "top", label: "cresta", at: "crown", socket: [60, 42], tags: ["tall", "blocks-band"], jitter: { rot: 5 },
      draw: {
        // Four lobes fanned from one root inside the head, the outer pair behind the inner one; their tips part, so the
        // outline notches between them.
        pieces: [[-27, 24.5], [27, 24.5], [-9, 30.5], [9, 30.5]].map(([deg, l]): Piece => ({ d: lobe([60, 52], deg, l, 3.9), c: "dark" })),
      },
    },
    {
      id: "ears-long", slot: "top", label: "orejas largas", at: "crownL", socket: [47.9, 44], group: "ear", tags: ["tall", "blocks-band", "ears"], jitter: { rot: 5, size: 0.05 },
      // Pink inside, or the lighter body tone on a pink coat.
      draw: ({ spec }) => ({ pieces: [{ d: EAR_LONG, c: "body" }, { d: EAR_LONG_IN, c: pinkCoat(spec) ? "belly" : "pink", ink: "inner" }] }),
    },
    { id: "drip", slot: "top", label: "babas", noise: 1, tags: ["hat-hidden", "blocks-band"], draw: drip },

    /* ---------- back, tail, arms ---------- */
    { id: "spines", slot: "back", label: "púas", draw: spines },
    {
      id: "devil", slot: "tail", label: "de diablillo", at: "rump", socket: [82, 94], group: "tail", jitter: { rot: 6 },
      draw: { pieces: [{ d: DEVIL_TAIL, c: "body", w: 3.6, flat: true }, { d: DEVIL_TIP, c: "spot" }] },
    },
    { id: "noodle", slot: "arms", label: "de fideo", at: "shoulderL", socket: [34, 74], group: "arm", noise: 2, tags: ["hand"], draw: noodle },

    /* ---------- patterns ---------- */
    { id: "fur-tips", slot: "pattern", label: "pelaje", excludes: ["pattern:belly"], draw: furTips },
    { id: "ribcage", slot: "pattern", label: "costillas", lod: 1, excludes: ["pattern:belly|fur-tips"], draw: ribcage },
  ],
});
