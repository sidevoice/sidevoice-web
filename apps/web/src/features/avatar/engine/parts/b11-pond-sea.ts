import {
  INK, LAYER, SOFT_INK, add, batch, centreline, clamp, darkMark, dir, ellipse, flatten, halfAt, isDarkCoat, isPaleCoat, len, mul,
  n, onAnchor, onRim, perp, pt, rad, rim, smoothLoop, sub, tube, unit, type Ctx, type Drawing, type Paint, type Piece, type Pt, type Rig,
} from "../bichos/kit";

/* B11 Pond and Sea (docs/catalogue.md §1.2 F6 and F8, §2.1, §2.6–§2.10, §5.2): gills, eye stalks, a chameleon's casque,
 * a shark's fin, a whale's spout, two shells, stegosaurus plates, a dorsal fin, five tails (lizard, dino, spiral,
 * fishtail, fluke), fins, claws and tentacle arms, tentacle and ribbon legs, and three body prints (whale grooves, a
 * heart, scales); six new members of the pond family (charca) and the new sea family (marinos) with eight more.
 *
 * Rigid parts are drawn on the reference body (crown 42, half width 32, shoulders 74, rump 82/94) and join their
 * anchor by a socket on it. Parts that must hug the body are fitted: the shells and plates read the real outline
 * (`flatten`, `spanAt`), tentacles and ribbons hang from the real base into the room left above the ground.
 *
 * - Eye stalks emit `stalkL/R`, like the frog's domes, so the eyes sit on their tips (and accept the same eyes). They
 *   are tagged `stalks` (B09's suggestion) besides `tall`. Both stalks are one fitted part on the shared `sprout`
 *   group (they droop asleep, sway while talking, perk while waiting); the eyes ride it (the stalks emit one group), and
 *   eyewear that `rides: "eyes"` does too. Each bulb is an eyeball: white in `.eyes`, so whatever eye sits in it reads
 *   wide open, blinks with a body-coloured lid and sleeps as a lid.
 * - Back pieces sit behind the body (LAYER.back) and merge into the outline. Their detail (scutes, fin rays, the
 *   spiral) is drawn as merged lines on top of them, so it shows on the shell but stays under the body.
 * - Moods only reuse shared keyframes: arms gesture with `arm`, claws snip with `claw`, tails and the dorsal fin wag
 *   with `tail`, tentacles step with `leg-a/b`, the gills sway, droop and perk with the paired `sprout-l/-r`.
 *   This file's own groups: the spout (`b11-spout`: bobs, spurts while working, shrinks asleep) and the
 *   jellyfish ribbons (`b11-ribbon`: they drift, faster while working). Fins, claws, gills and the floating legs
 *   also blow a few bubbles while working (`b11-bubbles`, rising and popping on the shared puff keyframes): a prop, so
 *   it hides when small. */

type P = Pt;

/* ---------- shapes (the shared geometry is the kit's: centreline, tube, rim, onRim, halfAt) ---------- */

/** A water drop: round at `c` (radius r), its tail pointing at `tip`. */
function drop(c: P, r: number, tip: P): string {
  const d = sub(tip, c), dist = len(d), u = unit(d), a = Math.acos(clamp(r / dist, -1, 1));
  const rot = (v: P, t: number): P => [v[0] * Math.cos(t) - v[1] * Math.sin(t), v[0] * Math.sin(t) + v[1] * Math.cos(t)];
  const t1 = add(c, mul(rot(u, a), r)), t2 = add(c, mul(rot(u, -a), r));
  return `M${pt(tip)}L${pt(t1)}A${n(r)} ${n(r)} 0 1 1 ${pt(t2)}Z`;
}

/** A heart, its point at (x, y), `k` = 1 is 16 wide and 14.2 tall. */
const heartShape = (x: number, y: number, k: number) => {
  const p = (dx: number, dy: number) => `${n(x + dx * k)} ${n(y + dy * k)}`;
  return `M${p(0, 0)}C${p(-1.5, -1.5)} ${p(-8, -4)} ${p(-8, -9)}C${p(-8, -13)} ${p(-2.5, -14.2)} ${p(0, -10.6)}C${p(2.5, -14.2)} ${p(8, -13)} ${p(8, -9)}C${p(8, -4)} ${p(1.5, -1.5)} ${p(0, 0)}Z`;
};

/* ---------- reading the body ---------- */

/** Is the point inside the polygon (even-odd)? */
function inside(poly: P[], [x, y]: P): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/* ---------- bubbles (a working prop for the parts that live under water) ---------- */

/* The first of these a bicho has blows them: the fitted floating legs (one stream, beside the head on the left), the fins
 * (a stream off each fin, in `over`, drawn in the fin's own coordinates, low enough to clear the working cogs on the
 * right), and one stream (`overBox`, in the 120 box) over the left claw or beside the left gills. */
const BUBBLERS = ["legs:tentacles|ribbons", "arms:fins", "arms:claws", "top:gills"];
/** One bubble: a pale ring with a glint, in its own group so the two rise and pop together. */
const bubble = (x: number, y: number, r: number) =>
  `<g class="b11-bub"><circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}"/><circle class="b11-glint" cx="${n(x - r * 0.35)}" cy="${n(y - r * 0.35)}" r="${n(r * 0.3)}"/></g>`;
function bubbles(ctx: Ctx, me: string, at?: P): string {
  if (BUBBLERS.find((r) => ctx.has(r)) !== me) return "";
  const [x, y] = at ?? [Math.max(12, 60 - ctx.rig.faceHalf - 11), ctx.rig.eyeY];
  return `<g class="prop-work b11-bubbles">${bubble(x + 3, y + 2, 2.4)}${bubble(x - 1, y - 8, 3.2)}${bubble(x + 4, y - 17, 2)}</g>`;
}

/* ---------- tops ---------- */

/** Gills: three frilly fronds a side, fanned out from where an ear would be. Each frond is a beaded tube (it swells and
 * pinches three times along its length), so the outline itself turns frilly. Pink, or the belly colour on a pink coat. */
const GILL_ROOT: P = [43.5, 47.5];
const GILLS = [[-24, 16.5, 1.6], [-60, 18.5, 0.6], [-97, 15.5, -1.2]].map(([deg, l, bend]) => {
  const d = dir(deg), side = perp(d);
  const line = centreline([GILL_ROOT, add(add(GILL_ROOT, mul(d, l * 0.55)), mul(side, bend)), add(GILL_ROOT, mul(d, l))], 36);
  return tube(line, (t) => (1.9 + 1.7 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * (0.78 + 0.3 * Math.abs(Math.sin(Math.PI * 3 * t + 0.3))));
});
const pinkCoat = (ctx: Ctx) => { const { hue, sat } = ctx.spec.color; return !ctx.spec.shiny && sat > 25 && (hue >= 290 || hue <= 15); };

/** Eye stalks: two bendy stalks from the crown, splayed out, each ending in a round bulb; the bulbs emit `stalkL/R`, so
 * the eyes sit in them. Drawn for the left side on the reference body (socket on `crownL`, 47.9 44) and fitted onto
 * `crownL` and, mirrored, `crownR`, each tilted by a seeded ±6° (the jitter a rigid pair would get), so both stalks
 * are one part that moves as one (`sprout`, round the middle of their roots) and the eyes ride them. The bulb is an
 * eyeball: a white disc in `.eyes` fills it, so a small eye reads as a wide-open one (a button eye becomes its pupil),
 * a blink shows the coat as a lid, and asleep (`.eyes` hidden) the bulb is the coat with the eye's closed lid. */
const STALK_LINE = centreline([[49.8, 50], [48, 40.5], [44.8, 31.5], [42.2, 25]], 30);
const STALK_SOCKET: P = [47.9, 44];
const STALK_TIP: P = [42, 22.4];
const BULB_C: P = [STALK_TIP[0], STALK_TIP[1] + 1.2];

function eyestalks(ctx: Ctx): Drawing {
  const { crownL, crownR } = ctx.rig.at, r = ctx.rng("jit:top");
  r.next(); r.next();
  const tilt = r.range(-6, 6), pieces: Piece[] = [], white: string[] = [], emits: Drawing["emits"] = {};
  for (const [side, at] of [["L", crownL], ["R", crownR]] as const) {
    const flip = side === "R" ? -1 : 1, k = at.s ?? 1;
    const map = onAnchor({ ...at, a: (at.a ?? 0) + tilt * flip }, side === "R" ? [120 - STALK_SOCKET[0], STALK_SOCKET[1]] : STALK_SOCKET, -20 * flip);
    const mine = (q: P): P => map(side === "R" ? [120 - q[0], q[1]] : q);
    const [bx, by] = mine(BULB_C), [tx, ty] = mine(STALK_TIP);
    pieces.push({ d: tube(STALK_LINE.map(mine), (t) => (3.4 - 0.6 * t) * k), c: "body" }, { d: ellipse(bx, by, 8.6 * k, 8.4 * k), c: "body" });
    white.push(`<ellipse fill="#fff" cx="${n(bx)}" cy="${n(by)}" rx="${n(8.6 * k + 0.4)}" ry="${n(8.4 * k + 0.4)}"/>`);
    emits[`stalk${side}`] = { x: n(tx), y: n(ty), r: 8 };
  }
  return { pieces, emits, face: { eyes: white.join("") }, pivot: [(crownL.x + crownR.x) / 2, (crownL.y + crownR.y) / 2] };
}

/** Casque: a chameleon's helmet ridge, leaning back, with two ridge lines (not at 28 px). */
const CASQUE = "M45.6 47C46.4 38.6 51.4 31.6 59.6 28.6C63.6 27.2 67.6 27.6 70.6 30C73.8 32.6 74.8 38.6 74.4 47Z";
const CASQUE_RIDGE = "M50.6 43.4Q52.4 35.8 60.2 32.6M57 44.4Q58.6 38.8 64.6 36.6";

/** The shark's fin: a straight front edge rising to a point that leans back, a concave back edge. */
const FIN_CROWN = "M50 47C52 37.4 58 28 66.4 21.6Q70.2 19 70.4 23C69 30 69.2 38.6 72.4 47Z";
const FIN_CROWN_LINE = "M55.4 44.4C57 37.6 61 31 66 26.4";

/** The spout: a jet from the crown, breaking into three drops. Water is the sweat drop's blue (a colour the cast has). */
const WATER = "#8fd3ff";
const SPOUT: Piece[] = [
  { d: "M60 42L60 27.5", c: WATER, w: 4.8 },
  { d: drop([60, 15.2], 4.4, [60, 24.4]), c: WATER },
  { d: drop([48.2, 21.4], 3.5, [55.6, 25.6]), c: WATER },
  { d: drop([71.8, 21.4], 3.5, [64.4, 25.6]), c: WATER },
];

/* ---------- back ---------- */

/** The colour of a shell or a plate that must read against any coat: `dark` sinks into the ink on a dark coat. */
const shellPaint = (ctx: Ctx): Paint => (isDarkCoat(ctx.spec) ? "spot" : "dark");

/** Turtle shell: a dome behind the body, rising over the head and out past the flanks, with a pale rim (the marginal
 * scutes, split by short dividers) and, at stage, hex scutes on the part that shows. */
function shellTurtle(ctx: Ctx): Drawing {
  const { rig } = ctx, W = rig.half + 9, top = rig.top - 11, low = rig.armY + 3;
  const dome = (inset: number) => {
    const w = W - inset, t = top + inset, b = low - inset * 0.3;
    return `M${n(60 - w + 1.5)} ${n(b)}C${n(60 - w - 1.5)} ${n(b - (b - t) * 0.62)} ${n(60 - w * 0.6)} ${n(t)} 60 ${n(t)}C${n(60 + w * 0.6)} ${n(t)} ${n(60 + w + 1.5)} ${n(b - (b - t) * 0.62)} ${n(60 + w - 1.5)} ${n(b)}Q${n(60 + w * 0.5)} ${n(b + 12)} 60 ${n(b + 12)}Q${n(60 - w * 0.5)} ${n(b + 12)} ${n(60 - w + 1.5)} ${n(b)}Z`;
  };
  const outer = dome(0), inner = dome(3);
  const pieces: Piece[] = [{ d: outer, c: "belly" }, { d: inner, c: shellPaint(ctx), layer: LAYER.back + 0.05 }];
  // Dividers across the rim, between the outer and the inner dome.
  const ring = flatten(outer)[0], hole = flatten(inner)[0];
  const cx: P = [60, (top + low) / 2 + 6];
  const divs: string[] = [];
  for (const deg of [-78, -50, -24, 0, 24, 50, 78]) {
    const a = rim([ring], cx, deg), b = rim([hole], cx, deg);
    divs.push(`M${pt(add(a, mul(unit(sub(b, a)), 0.6)))}L${pt(b)}`);
  }
  pieces.push({ d: divs.join(""), c: "ink", w: 1.4, flat: true, layer: LAYER.back + 0.1, lod: 1 });
  // Hex scutes on the inner dome: a honeycomb, kept to what lies well inside it.
  if (ctx.size === "stage") {
    const s = 6.2, h = s * Math.sqrt(3), segs: string[] = [], keep = (p: P) => inside(hole, p) && !nearEdge(hole, p, 2.6);
    const ox = 60, oy = top + 12;
    for (let i = -4; i <= 4; i += 1) for (let j = -1; j <= 4; j += 1) {
      const c: P = [ox + i * 1.5 * s, oy + j * h + (i % 2 ? h / 2 : 0)];
      const corner = (k: number): P => [c[0] + s * Math.cos(rad(60 * k)), c[1] + s * Math.sin(rad(60 * k))];
      for (let k = 0; k < 3; k += 1) {
        const a = corner(k), b = corner(k + 1);
        let run: P[] = [];
        for (let q = 0; q <= 6; q += 1) {
          const p = add(a, mul(sub(b, a), q / 6));
          if (keep(p)) run.push(p); else { if (run.length > 1) segs.push(`M${run.map(pt).join("L")}`); run = []; }
        }
        if (run.length > 1) segs.push(`M${run.map(pt).join("L")}`);
      }
    }
    if (segs.length) pieces.push({ d: segs.join(""), c: "body", w: 1.5, flat: true, layer: LAYER.back + 0.1 });
  }
  return { pieces };
}

/** Is p within `d` of the polygon's edge? */
function nearEdge(poly: P[], p: P, d: number): boolean {
  for (let i = 1; i < poly.length; i += 1) {
    const a = poly[i - 1], e = sub(poly[i], a), l2 = e[0] * e[0] + e[1] * e[1] || 1;
    const t = clamp(((p[0] - a[0]) * e[0] + (p[1] - a[1]) * e[1]) / l2, 0, 1);
    if (len(sub(p, add(a, mul(e, t)))) < d) return true;
  }
  return false;
}

/** Snail shell: a big round shell on the upper back, peeking out over the right shoulder, with a spiral. */
function shellSnail(ctx: Ctx): Drawing {
  const { rig } = ctx, r = clamp(rig.half * 0.64, 15, 22);
  const { p, nrm } = onRim(rig, 46, 4);
  const c = add(p, mul(nrm, r * 0.12));
  const shell = ellipse(c[0], c[1], r, r * 0.96);
  // The spiral: from the middle (a little up and out) to just inside the rim, two turns and a bit.
  const mid = add(c, [r * 0.12, -r * 0.1]), turns = 2.15, pts: P[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const t = i / 60, a = rad(200) + t * turns * Math.PI * 2, rr = 1.2 + (r - 4.2) * t;
    pts.push([mid[0] + Math.cos(a) * rr * (1 - 0.08 * t), mid[1] + Math.sin(a) * rr]);
  }
  return {
    pieces: [
      { d: shell, c: "spot" },
      { d: `M${pts.map(pt).join("L")}`, c: isPaleCoat(ctx.spec) ? SOFT_INK : "dark", w: 2.3, flat: true, layer: LAYER.back + 0.1, lod: 1 },
    ],
  };
}

/** Plates: three rounded stegosaurus plates standing out of the upper back, down the right side, each swept back. */
function plates(ctx: Ctx): Drawing {
  const { rig } = ctx, r = ctx.rng("b11-plates"), k = clamp(rig.half / 32, 0.85, 1.1);
  const sizes = [0.86, 1.12, 0.9], from = ctx.has("top") ? 26 : 10, to = 66;
  const pieces: Piece[] = sizes.map((z0, i) => {
    const z = z0 * k * (1 + r.range(-0.06, 0.06)), deg = from + ((to - from) * i) / (sizes.length - 1);
    const { p, t, nrm } = onRim(rig, deg, 4);
    const L = 11.5 * z, hb = 6.2 * z, base = sub(p, mul(nrm, 3.2));
    const bL = sub(base, mul(t, hb)), bR = add(base, mul(t, hb)), tip = add(p, add(mul(nrm, L), mul(t, L * 0.18)));
    return { d: `M${pt(bL)}C${pt(add(bL, add(mul(nrm, L * 0.8), mul(t, -hb * 0.15))))} ${pt(sub(tip, mul(t, hb * 1.05)))} ${pt(tip)}C${pt(add(tip, mul(t, hb * 1.05)))} ${pt(add(bR, add(mul(nrm, L * 0.8), mul(t, hb * 0.15))))} ${pt(bR)}Z`, c: "spot" };
  });
  return { pieces };
}

/** The dorsal fin: a fan rising off the top of the back, leaning back, with three rays. */
const FIN_DORSAL = "M57.6 50C59.6 38.6 66.4 28.8 76.2 24.4Q84.8 20.8 85.4 26C84.2 33.2 82.6 41.4 81 50Z";
const FIN_RAYS = "M66 44.6L70 31.6M71.6 45.6L76.4 29.6M77 46.4L81.6 30.2";

/* ---------- tails (rump, reference body) ---------- */

const LIZARD = tube(centreline([[76.5, 89], [88, 93.4], [99.4, 92.4], [108.4, 86.4], [113.4, 78.6]]), (t) => 5 * (1 - t) + 1.1);

const DINO_LINE = centreline([[75, 86], [88, 92], [100.4, 92.2], [110, 85.6], [115.4, 78]]);
const DINO = tube(DINO_LINE, (t) => 7.2 * (1 - t) + 2.3);
/** Two small plates on the tail's upper edge. */
const DINO_PLATES = [[0.36, 7.6], [0.64, 6.2]].map(([at, h]) => {
  const i = Math.round(at * (DINO_LINE.length - 1)), c = DINO_LINE[i];
  const u = unit(sub(DINO_LINE[i + 1], DINO_LINE[i - 1])), up = mul(perp(u), -1), w = 7.2 * (1 - at) + 2.3;
  const base = add(c, mul(up, w - 1.6)), bL = sub(base, mul(u, h * 0.62)), bR = add(base, mul(u, h * 0.62)), tip = add(base, add(mul(up, h + 1.6), mul(u, h * 0.2)));
  return `M${pt(bL)}Q${pt(add(sub(tip, mul(u, h * 0.5)), mul(up, -0.4)))} ${pt(tip)}Q${pt(add(tip, mul(u, h * 0.55)))} ${pt(bR)}Z`;
});

/** The chameleon's tail, curled into a loose spiral. */
const SPIRAL = tube(centreline([[76.5, 90], [90, 94.4], [102.6, 92], [110.4, 83.4], [110, 73], [103, 67.4], [95.4, 70.4], [94.2, 78], [99.6, 80.6], [103.2, 76.6]], 60), (t) => 4.8 * (1 - t) + 1.5);

/** Fishtail: a short stem out of the flank and a forked fin rising to mid-height, with rays at stage. */
const FISHTAIL = "M77 86.6C84.4 86.4 90.6 83.6 95 79.6C98.6 72.6 104.4 65.2 110.8 61Q115.4 58.6 115.4 63.2C114.4 69.6 110.2 75.2 106.6 79C110.6 82.6 114.4 86.8 116.4 91.6Q117.6 96.4 112.6 95.6C106 93.6 100.2 89.8 95.6 85.2C90.8 90 84.6 93.6 77 94Z";
const FISHTAIL_RAYS = "M97.6 79.6L109.2 66.2M98.4 82.4L110.6 91.2";

/** Fluke: a whale's tail curling up behind the body's right side, the two-lobed fluke over the shoulder. */
const FLUKE_STALK = tube(centreline([[77, 90], [93.6, 92.4], [102.6, 85], [104.4, 73.4], [101.4, 63]]), (t) => 6 - 2 * t);
const FLUKE = "M98 66C92.4 64.2 87.6 60 85.4 53.6Q84.6 49.2 89 50C94 51.2 98.6 54.4 101 57.4C103.4 54.2 108 51.2 113.4 50.4Q117.8 50 116.6 54.2C114.6 60.2 109.6 64.4 104 66Z";

/* ---------- arms (shoulder, reference body) ---------- */

/** An arm that lies partly on the body: merged (its fat outline joins the silhouette) plus an inner copy with a thin
 * edge, so the joint reads as a fin in front of the body, over a belly patch too. */
const onBody = (d: string, c: Paint): Piece[] => [{ d, c }, { d, c, ink: "inner", stroke: 2.2 }];

/** Fins: a small fan hanging down and out from the shoulder, its edge in three soft scallops, with two rays. Spot when the
 * bicho has a fish's tail or dorsal fin (one set of fins), the coat otherwise (a shark's, a whale's). */
const FIN_PIVOT: P = [33.4, 75.6];
const FIN = (() => {
  const edge: P[] = [];
  for (let i = 0; i <= 18; i += 1) {
    const u = i / 18, a = -76 - 72 * u, r = 12.8 + 1.3 * Math.abs(Math.sin(Math.PI * 3 * u)) ** 0.7 - 1.2 * (u - 0.5) ** 2;
    edge.push(add(FIN_PIVOT, mul(dir(a), r)));
  }
  return smoothLoop([[37, 69.5], ...edge, [37, 80.5]]);
})();
const FIN_ARM_RAYS = [-96, -122].map((a) => `M${pt(add(FIN_PIVOT, mul(dir(a), 4.6)))}L${pt(add(FIN_PIVOT, mul(dir(a), 10.2)))}`).join("");
const finPaint = (ctx: Ctx): Paint => (ctx.has("tail:fishtail") || ctx.has("back:fin-dorsal") ? "spot" : "body");

/** Claws: a stubby arm raised beside the face and a big pincer, its jaws open. */
const CLAW_ARM = tube(centreline([[36, 75], [29.6, 71], [24.2, 65.2]], 16), () => 3.8);
function pincer(): string {
  const c: P = [17, 53.6], r = 10.4, mouth = -32, open = 25;
  const at = (deg: number, rr = r): P => add(c, mul(dir(deg), rr));
  const notch = at(mouth, r * 0.12), a = at(mouth - open), b = at(mouth + open);
  return `M${pt(notch)}L${pt(a)}A${n(r)} ${n(r * 1.04)} 0 1 0 ${pt(b)}Z`;
}
const PINCER = pincer();

/** A tentacle arm: out from the shoulder, down, and curled up at the end, with suckers at stage. */
const TENTACLE_LINE = centreline([[37, 73], [27, 76.4], [19.4, 82.6], [16.4, 90.4], [19.6, 96.2], [25.4, 96], [27, 90.8], [23.2, 88.6]], 48);
const TENTACLE = tube(TENTACLE_LINE, (t) => 4.6 * (1 - t) + 1.5);
const SUCKERS = [0.2, 0.33, 0.46, 0.58].map((t) => {
  const i = Math.round(t * (TENTACLE_LINE.length - 1)), c = TENTACLE_LINE[i], u = unit(sub(TENTACLE_LINE[i + 1], TENTACLE_LINE[i - 1]));
  const w = 4.6 * (1 - t) + 1.5, p = add(c, mul(perp(u), -(w - 1.6)));
  return ellipse(p[0], p[1], 1.1, 1.1);
}).join("");

/* ---------- legs (fitted from the body's base) ---------- */

/** Room under the body: from where the legs tuck in to just above the ground. */
const legRoom = (rig: Rig) => { const yb = rig.bottom - 5; return { yb, room: clamp(rig.at.ground.y - yb - 1.5, 9, 17) }; };

/** Tentacles: four, from under the body, each curling out at the tip; they step in turn (leg-a/b) and curl up asleep. */
function tentacles(ctx: Ctx): Drawing {
  const { rig } = ctx, { yb, room } = legRoom(rig), W = halfAt(rig, yb) - 3;
  const pieces: Piece[] = [-0.68, -0.24, 0.24, 0.68].map((f, i) => {
    const x = 60 + W * f, s = Math.sign(f), o = Math.abs(f) > 0.5 ? 1 : 0.45;
    const L = room * (o === 1 ? 0.96 : 1);
    const line = centreline([[x, yb], [x + s * o * 1.2, yb + L * 0.5], [x + s * (0.8 + o * 2.4), yb + L * 0.88], [x + s * (3.4 + o * 3), yb + L], [x + s * (5.6 + o * 3.4), yb + L * 0.8], [x + s * (5 + o * 3), yb + L * 0.6]], 36);
    return { d: tube(line, (t) => 4.2 * (1 - t) + 1.5), c: "body" as Paint, g: i % 2 ? "leg-b" : "leg-a" };
  });
  return { pieces, over: bubbles(ctx, "legs:tentacles|ribbons") };
}

/** Ribbons: three wavy jellyfish ribbons trailing from under a floating body (`#floats`: the bell, the orb), past its
 * shadow, the middle one longest; they drift as one. Under a standing body there are 8 units of room and they read as a
 * tassel. */
function ribbons(ctx: Ctx): Drawing {
  const { rig } = ctx, yb = rig.bottom - 6, room = clamp(rig.at.ground.y - yb + 9, 9, 29), W = halfAt(rig, yb) - 5;
  const r = ctx.rng("b11-ribbons");
  const pieces: Piece[] = [-0.6, 0, 0.6].map((f, i) => {
    const x = 60 + W * f, L = room * (i === 1 ? 1 : 0.84), ph = r.range(0, Math.PI * 2);
    const pts: P[] = [];
    for (let k = 0; k <= 10; k += 1) { const t = k / 10; pts.push([x + Math.sin(ph + t * Math.PI * 3) * 3.4 * (0.35 + 0.9 * t), yb + L * t]); }
    return { d: tube(centreline(pts, 48), (t) => 4.4 - 1.8 * t), c: (i === 1 ? "spot" : "belly") as Paint, g: "b11-ribbon" };
  });
  return { pieces, over: bubbles(ctx, "legs:tentacles|ribbons") };
}

/* ---------- patterns ---------- */

/** Whale grooves: a pale underside with three long grooves across it (the grooves hide at 28 px). */
function grooves(ctx: Ctx): Drawing {
  const { rig } = ctx, cy = rig.bottom - 10.5, rx = Math.min(rig.half * 0.64, halfAt(rig, cy) - 4), ry = 9.2;
  const lines: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const y = cy - 2.6 + i * 3.6, w = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) - 3.6;
    if (w > 3) lines.push(`M${n(60 - w)} ${n(y - 0.6)}Q60 ${n(y + 1.6)} ${n(60 + w)} ${n(y - 0.6)}`);
  }
  return {
    pieces: [
      { d: ellipse(60, cy, rx, ry), c: "belly", ink: "inner" },
      // On the pale patch, not on the coat: `dark` shows on any coat (darkMark would paint them the patch's own colour on a
      // dark coat); a pale coat's dark is only a pale grey, so soft ink there.
      { d: lines.join(""), c: isPaleCoat(ctx.spec) ? SOFT_INK : "dark", w: 1.2, ink: "inner", flat: true, lod: 1 },
    ],
  };
}

/** A spot heart on the chest: under the open mouth when there is room for it (tall, pear, pill), otherwise beside the
 * mouth on the bicho's left (the viewer's right), where a heart goes, clear of the open mouth and the arm. */
function heartChest(ctx: Ctx): Drawing {
  const { rig } = ctx, chin = rig.at.chin.y + 1.2, low = rig.bottom - 6;
  let x = 60, tip = low, k = Math.min(0.75, (low - chin) / 14.2);
  if (k < 0.5) {
    // Between the open mouth (10 either side of it, plus a gap) and the flank (with a margin), at most 9 wide.
    tip = rig.mouthY + 10;
    const from = rig.at.mouth.x + 12.5, edge = 60 + halfAt(rig, tip - 4) - 2.6;
    k = clamp((edge - from) / 16, 0.4, 0.56);
    x = from + 8 * k;
  }
  return { pieces: [{ d: heartShape(x, tip, k), c: "spot", ink: "inner", stroke: 1.8 }, { d: ellipse(x - 3.4 * k, tip - 10.4 * k, 1.5 * k, 1 * k), c: "#ffffff", ink: "inner", flat: true, lod: 1 }] };
}

/** Scales: rows of little scallops on the lower flanks, staggered (stage only). */
function scales(ctx: Ctx): Drawing {
  const { rig } = ctx, rows = [rig.mouthY + 1, rig.mouthY + 6, rig.mouthY + 11].filter((y) => y < rig.bottom - 6);
  const arcs: string[] = [];
  rows.forEach((y, j) => {
    const edge = halfAt(rig, y);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i += 1) {
      const x = 60 + s * (edge - 4.6 - i * 4.6 - (j % 2) * 2.3);
      if (Math.abs(x - 60) < 12) continue;
      arcs.push(`M${n(x - 2.2)} ${n(y)}Q${n(x)} ${n(y + 3)} ${n(x + 2.2)} ${n(y)}`);
    }
  });
  return { pieces: [{ d: arcs.join(""), c: darkMark(ctx.spec, SOFT_INK), w: 1.2, ink: "inner", flat: true, layer: LAYER.skin }] };
}

/* ---------- compatibility ---------- */

/** Eyes that sit on stalks (the frog's rule, catalogue §4.3). */
const STALK_EYES = "eyes:two|beady|big|button|hollow";

/* ---------- the batch ---------- */

export default batch({
  label: "B11 Charca y mar",

  families: [
    // The sea (catalogue §1.2 F8): blues and teals, a complementary spot for fins and tails. It lends the fish's tail to
    // other families' bichos through the cross-family roll (no longer its fins, B14: every bicho has arms, so the arms
    // slot is never open for the cross roll).
    {
      id: "sea", label: "Marinos", weight: 9, color: { hue: [170, 230], sat: [45, 75], light: [50, 70], spot: 180 },
      cross: { tail: { fishtail: 10 } },
    },
  ],

  parts: [
    /* ---------- tops ---------- */
    {
      id: "gills", slot: "top", label: "branquias", at: "earL", socket: [40.8, 42], group: "sprout", jitter: { rot: 5, size: 0.05 },
      draw: (ctx) => ({ pieces: GILLS.map((d): Piece => ({ d, c: pinkCoat(ctx) ? "belly" : "pink" })), overBox: bubbles(ctx, "top:gills", add([ctx.rig.at.earL.x, ctx.rig.at.earL.y], [-22, -8])) }),
    },
    {
      // The core glasses' thin lens ring lands right on the bulb's ink outline and vanishes (B09's eyewear has thick rims).
      id: "eyestalks", slot: "top", label: "ojos en antenas", group: "sprout", tags: ["tall", "stalks", "blocks-band"],
      requires: [STALK_EYES], excludes: ["eyewear:glasses"], draw: eyestalks,
    },
    {
      id: "casque", slot: "top", label: "casco de camaleón", at: "crown", socket: [60, 42], noise: 1, tags: ["hat-hidden", "blocks-band"], jitter: { rot: 4 },
      draw: (ctx) => ({ pieces: [{ d: CASQUE, c: "body" }, { d: CASQUE_RIDGE, c: darkMark(ctx.spec, SOFT_INK), w: 1.8, ink: "inner", flat: true, lod: 1 }] }),
    },
    {
      id: "fin-crown", slot: "top", label: "aleta de tiburón", at: "crown", socket: [60, 42], tags: ["tall", "blocks-band"], jitter: { rot: 5 },
      draw: { pieces: [{ d: FIN_CROWN, c: "body" }, { d: FIN_CROWN_LINE, c: "belly", w: 2, ink: "inner", flat: true, lod: 1 }] },
    },
    {
      id: "spout", slot: "top", label: "chorro", at: "crown", socket: [60, 42], group: "b11-spout", tags: ["tall", "blocks-band"],
      draw: { pieces: SPOUT },
    },

    /* ---------- back ---------- */
    { id: "shell-turtle", slot: "back", label: "caparazón", excludes: ["tail:!lizard|dino"], draw: shellTurtle },
    { id: "shell-snail", slot: "back", label: "concha de caracol", excludes: ["tail:!lizard|dino"], draw: shellSnail },
    { id: "plates", slot: "back", label: "placas", draw: plates },
    {
      id: "fin-dorsal", slot: "back", label: "aleta dorsal", at: "dorsal", socket: [68, 43], group: "tail", jitter: { rot: 5, size: 0.05 },
      draw: { pieces: [{ d: FIN_DORSAL, c: "spot" }, { d: FIN_RAYS, c: "ink", w: 1.3, flat: true, layer: LAYER.back + 0.1, lod: 1 }] },
    },

    /* ---------- tails ---------- */
    { id: "lizard", slot: "tail", label: "de lagartija", at: "rump", socket: [82, 94], group: "tail", jitter: { rot: 6 }, draw: { pieces: [{ d: LIZARD, c: "body" }] } },
    {
      id: "dino", slot: "tail", label: "de dinosaurio", at: "rump", socket: [82, 94], group: "tail", jitter: { rot: 5 },
      draw: { pieces: [...DINO_PLATES.map((d): Piece => ({ d, c: "spot", layer: LAYER.tail - 0.1 })), { d: DINO, c: "body" }] },
    },
    { id: "spiral", slot: "tail", label: "en espiral", at: "rump", socket: [82, 94], group: "tail", jitter: { rot: 4 }, draw: { pieces: [{ d: SPIRAL, c: "body", stroke: 2.2 }] } },
    {
      id: "fishtail", slot: "tail", label: "de pez", at: "rump", socket: [82, 94], group: "tail", jitter: { rot: 6 },
      draw: { pieces: [{ d: FISHTAIL, c: "spot" }, { d: FISHTAIL_RAYS, c: "ink", w: 1.3, flat: true, layer: LAYER.tail + 0.1, lod: 1 }] },
    },
    {
      id: "fluke", slot: "tail", label: "de ballena", at: "rump", socket: [82, 94], group: "tail", jitter: { rot: 4 },
      draw: { pieces: [{ d: FLUKE_STALK, c: "body" }, { d: FLUKE, c: "body" }] },
    },

    /* ---------- arms ---------- */
    {
      id: "fins", slot: "arms", label: "aletitas", at: "shoulderL", socket: [34, 74], group: "arm",
      draw: (ctx) => {
        const c = finPaint(ctx);
        return { pieces: [...onBody(FIN, c), { d: FIN_ARM_RAYS, c: c === "spot" ? "ink" : darkMark(ctx.spec, SOFT_INK), w: 1.3, ink: "inner", flat: true, lod: 1 }], over: bubbles(ctx, "arms:fins", [15.6, 69]) };
      },
    },
    {
      id: "claws", slot: "arms", label: "pinzas", at: "shoulderL", socket: [34, 74], group: "claw", noise: 2,
      // One stream (`overBox`, in the 120 box) rises over the left pincer: the pincer is drawn round 17 53.6, 17 left of the
      // socket and 20.4 over it; the stream starts 3 left of and 13 over that.
      draw: (ctx) => ({ pieces: [{ d: CLAW_ARM, c: "body" }, { d: PINCER, c: "body" }], overBox: bubbles(ctx, "arms:claws", add([ctx.rig.at.shoulderL.x, ctx.rig.at.shoulderL.y], [-20, -33.4])) }),
    },
    {
      id: "tentacle", slot: "arms", label: "tentáculos", at: "shoulderL", socket: [34, 74], group: "arm", noise: 2,
      draw: { pieces: [{ d: TENTACLE, c: "body" }, { d: SUCKERS, c: "belly", ink: "inner", flat: true, lod: 2 }] },
    },

    /* ---------- legs: tentacles under a bell, drop or round body (catalogue §4.3), ribbons only under a floating body ---------- */
    { id: "tentacles", slot: "legs", label: "tentáculos", noise: 1, requires: ["body:dome|drop|round"], excludes: ["tail:!fishtail"], draw: tentacles },
    { id: "ribbons", slot: "legs", label: "cintas de medusa", noise: 1, requires: ["#floats"], excludes: ["tail"], draw: ribbons },

    /* ---------- patterns ---------- */
    { id: "grooves", slot: "pattern", label: "surcos de ballena", excludes: ["pattern:belly|tux|fur-tips|moon-chest|ribcage"], draw: grooves },
    { id: "heart-chest", slot: "pattern", label: "corazón", draw: heartChest },
    { id: "scales", slot: "pattern", label: "escamas", lod: 2, noise: 0, draw: scales },
  ],

  members: [
    /* ---------- pond (charca) ---------- */
    {
      // The axolotl: frilly pink gills and a smile; pink or lilac.
      id: "ajolote", family: "pond", label: "ajolote", bodies: "wide",
      fixed: { top: "gills", mouth: "smile", arms: "nubs", legs: "feet" },
      pools: { eyes: { button: 10, two: 6, sparkle: 3, sleepy: 3 }, cheeks: { p: 0.7, pick: "blush" }, tail: { p: 0.4, pick: "lizard" }, pattern: { p: 0.35, pick: { belly: 10, spots: 4 } } },
      color: [{ weight: 3, hue: [320, 345], sat: [45, 65], light: [64, 74], spot: 180 }, { weight: 1, hue: [262, 282], sat: [40, 55], light: [66, 74], spot: 120 }],
    },
    {
      id: "tortuga", family: "pond", label: "tortuga", bodies: "wide",
      // Little eyes are the turtle's signature (catalogue F6): one of the few members that keep the beady eyes.
      fixed: { back: "shell-turtle", eyes: "beady", legs: "feet", arms: { nubs: 10, flipper: 6 } },
      pools: { mouth: { smile: 10, tiny: 6, tongue: 3 }, pattern: { p: 0.7, pick: "belly" }, cheeks: { p: 0.35, pick: "blush" }, headgear: { p: 0.25, pick: "bucket" } },
      color: { hue: [85, 150], sat: [40, 58], light: [56, 66], spot: 300 },
    },
    {
      id: "dinosaurito", family: "pond", label: "dinosaurito", bodies: "round",
      fixed: { back: "plates", tail: "dino", arms: "nubs", legs: "feet" },
      pools: { mouth: { smile: 10, saw: 8, fangs: 3 }, eyes: { two: 10, button: 6, sparkle: 3, googly: 3 }, pattern: { p: 0.5, pick: "belly" }, cheeks: { p: 0.3, pick: "blush" } },
    },
    {
      id: "triton", family: "pond", label: "tritón", bodies: "tall",
      fixed: { tail: "lizard", pattern: ["spots"], legs: "feet", arms: "nubs" },
      pools: { eyes: { button: 10, two: 10, sleepy: 3 }, mouth: { smile: 10, tiny: 6, wavy: 3 }, cheeks: { p: 0.4, pick: "blush" } },
    },
    {
      id: "camaleon", family: "pond", label: "camaleón", bodies: "tall",
      fixed: { top: "casque", tail: "spiral", eyes: "wonky", arms: "nubs", legs: "feet" },
      pools: { mouth: { tongue: 10, smile: 4, smirk: 3 }, pattern: { p: 0.35, pick: "spots" }, cheeks: { p: 0.3, pick: "blush" } },
    },
    {
      // A snail glides on its bell, eyes up on their stalks, its shell in the spot colour; little arms at its sides (B14).
      id: "caracol", family: "pond", label: "caracol", bodies: "dome",
      fixed: { top: "eyestalks", back: "shell-snail", arms: "nubs" },
      pools: { eyes: { two: 10, button: 6 }, mouth: { smile: 10, tiny: 8, tongue: 4 }, cheeks: { p: 0.6, pick: "blush" } },
      color: { hue: [28, 48], sat: [35, 55], light: [62, 74], spot: { pick: [180, 200, 280, 300] } },
    },

    /* ---------- sea (marinos) ---------- */
    {
      id: "pececito", family: "sea", label: "pececito", bodies: "wide",
      fixed: { arms: "fins", tail: "fishtail", back: "fin-dorsal" },
      pools: { mouth: { pout: 10, smile: 8, tiny: 4 }, eyes: { two: 10, button: 8, googly: 5, sparkle: 4 }, cheeks: { p: 0.4, pick: "blush" }, pattern: { p: 0.3, pick: { scales: 6, belly: 6 } } },
      // Teals and blues, or a goldfish.
      color: [{ weight: 3, hue: [170, 230], sat: [50, 75], light: [52, 66], spot: 180 }, { weight: 2, hue: [18, 36], sat: [80, 90], light: [58, 66], spot: 180 }],
    },
    {
      // No arms needed (B14's arms rule): its tentacles step and wave; tentacle arms now and then.
      id: "pulpito", family: "sea", label: "pulpito", bodies: "dome",
      fixed: { legs: "tentacles" },
      pools: { pattern: { p: 0.6, pick: "spots" }, arms: { p: 0.3, pick: "tentacle" }, eyes: { two: 10, sparkle: 6, button: 6, googly: 6 }, mouth: { pout: 10, smile: 8, tiny: 5 }, cheeks: { p: 0.5, pick: "blush" } },
      color: { hue: [0, 360], sat: [50, 70], light: [58, 70], spot: 180 },
    },
    {
      // No arms (B14's arms rule): its ribbons drift and sway, and they are what moves.
      id: "medusa", family: "sea", label: "medusa", bodies: "dome",
      fixed: { legs: "ribbons" },
      pools: { eyes: { button: 10, two: 8, sparkle: 6, sleepy: 4 }, mouth: { tiny: 10, smile: 8 }, cheeks: { p: 0.7, pick: "blush" } },
      color: { hue: [180, 340], sat: [45, 65], light: [70, 80], spot: 180 },
    },
    {
      id: "cangrejo", family: "sea", label: "cangrejo", bodies: "wide",
      fixed: { arms: "claws", top: "eyestalks", legs: "feet" },
      pools: { eyes: { two: 10, button: 6 }, mouth: { smile: 10, saw: 5, wavy: 5, tiny: 4 }, cheeks: { p: 0.4, pick: "blush" } },
      color: { hue: [5, 20], sat: [65, 80], light: [52, 62], spot: 180 },
    },
    {
      id: "ballenita", family: "sea", label: "ballenita", bodies: "wide",
      fixed: { top: "spout", tail: "fluke", pattern: ["grooves"], arms: "fins" },
      pools: { eyes: { two: 10, button: 8, sleepy: 3 }, mouth: { smile: 10, tiny: 5 }, cheeks: { p: 0.6, pick: "blush" } },
      color: { hue: [195, 225], sat: [45, 65], light: [52, 64], spot: 180 },
    },
    {
      id: "pez-globo", family: "sea", label: "pez globo", bodies: "round",
      fixed: { pattern: ["prickles"], mouth: "pout", arms: "fins" },
      pools: { eyes: { googly: 10, two: 8, button: 6 }, cheeks: { p: 0.5, pick: "blush" }, tail: { p: 0.3, pick: "fishtail" } },
      color: [{ weight: 2, hue: [42, 55], sat: [70, 85], light: [60, 70], spot: 180 }, { weight: 1, hue: [170, 210], sat: [45, 65], light: [58, 68], spot: 180 }],
    },
    {
      id: "tiburoncin", family: "sea", label: "tiburoncín", bodies: "round",
      fixed: { top: "fin-crown", mouth: "saw", arms: "fins" },
      pools: { eyes: { two: 10, button: 5, googly: 3 }, pattern: { p: 0.6, pick: "belly" }, cheeks: { p: 0.3, pick: "blush" } },
      color: [{ hue: [200, 215], sat: [10, 20], light: [58, 68], spot: 180 }, { hue: [205, 225], sat: [40, 55], light: [52, 62], spot: 180 }],
    },
    {
      id: "foquita", family: "sea", label: "foquita", bodies: "pear",
      fixed: { arms: "flipper", marks: "whiskers", nose: "button" },
      pools: { eyes: { button: 10, two: 8, sparkle: 5 }, mouth: { smile: 10, cat: 6, tiny: 4 }, cheeks: { p: 0.5, pick: "blush" }, pattern: { p: 0.4, pick: "belly" } },
      color: [{ weight: 2, hue: [205, 220], sat: [8, 16], light: [60, 72], spot: 180 }, { weight: 1, hue: [35, 45], sat: [25, 35], light: [80, 88], spot: 180 }],
    },
  ],

  extend: [
    // The pond lends the axolotl's gills and the newt's tail to other families' bichos (B14, queue item 49).
    { family: "pond", cross: { top: { gills: 6 }, tail: { lizard: 8 } } },
    // The heart on the chest, now and then on a pony and on the bear (B14: no member rolled it).
    { family: "spirits", member: "poni", pools: { pattern: { p: 0.15, pick: { "heart-chest": 10 } } } },
    { family: "furry", member: "bear", pools: { pattern: { p: 0.1, pick: { "heart-chest": 10 } } } },
  ],

  // The parts on other families' bichos, and a few members with gear that suits them.
  showcase: [
    "bicho:monsters/monster:b11-branquias?top=gills&eyes=two",
    "bicho:furry/cat:b11-antenas?top=eyestalks",
    "bicho:pond/frog:b11-concha?back=shell-snail",
    "bicho:furry/bear:b11-placas?back=plates&tail=dino",
    "bicho:furry/cat:b11-sirena?tail=fishtail",
    "bicho:monsters/flotin:b11-pulpo?legs=tentacles&arms=tentacle",
    "bicho:furry/bunny:b11-medusa?body=dome&legs=ribbons",
    "bicho:bots/robot:b11-pinzas?arms=claws",
    "bicho:monsters/monster:b11-tiburon?top=fin-crown&mouth=saw&eyes=two&pattern=scales",
    "bicho:pond/frog:b11-corazon?pattern=heart-chest",
    "bicho:pond/tortuga:b11-pescador?headgear=bucket",
    "bicho:sea/cangrejo:b11-gafas?eyewear=sunglasses",
  ],

  css: `
    /* the spout bobs while talking and waiting, spurts while working, and settles low asleep */
    &:is([data-mood=speaking], [data-mood=waiting]) .pg-b11-spout { animation: bx-feel 2s ease-in-out infinite }
    &[data-mood=working] .pg-b11-spout { animation: bx-pulse .45s ease-in-out infinite }
    &[data-mood=idle] .pg-b11-spout { transform: scale(.72) }

    /* jellyfish ribbons drift from the bell, faster while working */
    .pg-b11-ribbon { transform-box: fill-box; transform-origin: 50% 0 }
    &:is([data-mood=speaking], [data-mood=waiting]) .pg-b11-ribbon { animation: bx-feel 2s ease-in-out infinite }
    &[data-mood=working] .pg-b11-ribbon { animation: bx-feel .7s ease-in-out infinite }

    /* bubbles, blown while working (they rise and pop like the shared puffs) */
    .b11-bub { opacity: 0; transform-box: fill-box; transform-origin: 50% 50% }
    .b11-bub circle { fill: rgb(143 211 255 / .32); stroke: #3f9fd8; stroke-width: 1.3 }
    .b11-bub .b11-glint { fill: #fff; stroke: none }
    &[data-mood=working] .b11-bub { animation: bx-puff 1.5s ease-out infinite }
    &[data-mood=working] .b11-bub:nth-child(2) { animation-delay: .5s }
    &[data-mood=working] .b11-bub:nth-child(3) { animation-delay: 1s }
  `,
});
