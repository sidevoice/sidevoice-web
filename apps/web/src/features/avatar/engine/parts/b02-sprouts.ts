import { LAYER, batch, ellipse, n, spanAt, topAt, type Ctx, type Drawing, type Piece, type Rig, type Spec } from "../bichos/kit";

/* B02 Sprouts (docs/catalogue.md §1.2 F3, §2.1, §5.2): the sprout ladder and the other plant tops, leaf and cactus
 * arms, a radish root, prickles and pumpkin ribs, and the Sprouts family (brotes) with its eight members.
 *
 * The plant tops are drawn on the reference body (crown at 40) and join `crown` at [60, 42], like the existing sprout.
 * They ride the shared `sprout` group, pivoted on the stem's foot: it sways while speaking, perks up while waiting (the
 * "!" pop) and droops at idle. The two caps are fitted instead: they read the body's real outline, so a mushroom cap or
 * an acorn cup hugs any head (a drop's tip, a pill's dome, a box's lid). */

type P = [number, number];
const G = "sprout";
const SOCKET: P = [60, 42];
const pt = (p: P) => `${n(p[0])} ${n(p[1])}`;

/* ---------- drawing helpers ---------- */

/** An almond leaf from its base to its tip, about 1.3·w across; `curl` bends the tip half sideways. Plus its midrib. */
function leafShape(b: P, t: P, w: number, curl = 0) {
  const dx = t[0] - b[0], dy = t[1] - b[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const at = (k: number, off: number): P => [b[0] + ux * len * k - uy * off, b[1] + uy * len * k + ux * off];
  return {
    d: `M${pt(b)}C${pt(at(0.18, w))} ${pt(at(0.72, w * 0.85 + curl))} ${pt(t)}C${pt(at(0.72, -w * 0.85 + curl))} ${pt(at(0.18, -w))} ${pt(b)}Z`,
    vein: `M${pt(at(0.26, curl * 0.1))}Q${pt(at(0.5, curl * 0.55))} ${pt(at(0.8, curl * 0.85))}`,
  };
}

/** A leaf as pieces: the blade (merged into the outline) and, on big leaves, a thin ink midrib that hides at rail. */
function leaf(b: P, t: P, w: number, curl = 0, c: Piece["c"] = "spot", vein = false): Piece[] {
  const s = leafShape(b, t, w, curl);
  return [{ d: s.d, c }, ...(vein ? [{ d: s.vein, c: "ink" as const, w: 1.3, ink: "inner" as const, lod: 1 as const }] : [])];
}

const stem = (d: string, w = 3.5): Piece => ({ d, c: "dark", w, flat: true });

/** A path scaled by k about (ox, oy): absolute commands move, relative ones only scale (no arcs). */
function grow(d: string, k: number, ox = 60, oy = 42): string {
  let cmd = "", i = 0;
  return d.replace(/[MmLlHhVvCcSsQqTtZz]|-?(?:\d+\.?\d*|\.\d+)/g, (tok) => {
    if (/[A-Za-z]/.test(tok)) { cmd = tok; i = 0; return tok; }
    const v = Number(tok), abs = cmd === cmd.toUpperCase(), up = cmd.toUpperCase();
    const isY = up === "V" || (up !== "H" && i % 2 === 1), o = isY ? oy : ox;
    i += 1;
    return ` ${n(abs ? o + (v - o) * k : v * k)}`;
  });
}

/** A shape given as commands in local coordinates, scaled by k, turned by `deg` (clockwise) and moved to c. */
type Cmd = [string, ...number[]];
function turned(cmds: Cmd[], c: P, deg: number, k = 1): string {
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return cmds.map(([op, ...v]) => {
    const xy: string[] = [];
    for (let i = 0; i < v.length; i += 2) xy.push(pt([c[0] + (v[i] * cos - v[i + 1] * sin) * k, c[1] + (v[i] * sin + v[i + 1] * cos) * k]));
    return op + xy.join(" ");
  }).join("");
}

/** A heart pointing at the origin, lobes up (clover leaflets). 16 wide, 14 tall. */
const HEART: Cmd[] = [["M", 0, 0], ["C", -1.5, -1.5, -8, -4, -8, -9], ["C", -8, -13, -2.5, -14.2, 0, -10.6], ["C", 2.5, -14.2, 8, -13, 8, -9], ["C", 8, -4, 1.5, -1.5, 0, 0], ["Z"]];
/** A rounded petal from the origin, pointing up. 10.5 long. */
const PETAL: Cmd[] = [["M", -2.2, 0], ["C", -5.6, -3.4, -5.6, -9.6, 0, -10.5], ["C", 5.6, -9.6, 5.6, -3.4, 2.2, 0], ["Z"]];

/** A five-petal flower: petals merged into one scalloped silhouette, a gold heart with a thin ink edge on top. */
function flower(c: P, k: number, start: number, petal: Piece["c"], centre: number): Piece[] {
  return [
    ...[0, 1, 2, 3, 4].map((i): Piece => ({ d: turned(PETAL, c, start + i * 72, k), c: petal })),
    { d: ellipse(c[0], c[1], centre, centre), c: "gold", ink: "inner", stroke: 1.8 },
  ];
}

/* ---------- the body's real outline (spanAt and topAt come from the kit) ---------- */

/** The body's gloss stroke, kept below height `stop` (a cap covers the rest): it follows the left edge, 5 in. */
function glossBelow(rig: Rig, stop: number): string {
  const y0 = rig.eyeY + 2, y2 = Math.min(stop + 5, y0 - 6), y1 = (y0 + y2) / 2;
  const edge = (y: number, inset: number) => (spanAt(rig, y)?.[0] ?? 60 - rig.faceHalf) + inset;
  return `M${n(edge(y0, 5.5))} ${n(y0)}Q${n(edge(y1, 3))} ${n(y1)} ${n(edge(y2, 6))} ${n(y2)}`;
}

/* ---------- the caps (fitted to the head) ---------- */

/** Where a cap sits: the head's real top, the brim `sink` below it (deeper on a pointy head, where a cap covers a share
 * of the head rather than a fixed band: `share` of the way down to the eyes), and the head's span there. */
function capFit(ctx: Ctx, sink: number, share: number) {
  const { rig } = ctx, s = rig.at.crown.s ?? 1;
  const top = topAt(rig, rig.at.crown.x), by = top + Math.max(sink * s, share * (rig.eyeY - top));
  const span = spanAt(rig, by) ?? [60 - rig.faceHalf * 0.7, 60 + rig.faceHalf * 0.7];
  return { s, top, by, cx: (span[0] + span[1]) / 2, hw: (span[1] - span[0]) / 2 };
}

/** A half-ellipse dome over [cx - W, cx + W] at the brim, H tall, as an open path the caller closes. `flare` pushes the
 * brim's tips out and down a little (a mushroom's lip). */
function dome(cx: number, by: number, W: number, H: number, flare = 0) {
  const k = 0.552, y0 = by + flare * 0.5;
  return `M${n(cx - W - flare)} ${n(y0)}C${n(cx - W - flare * 0.4)} ${n(by - H * k)} ${n(cx - W * k)} ${n(by - H)} ${n(cx)} ${n(by - H)}`
    + `C${n(cx + W * k)} ${n(by - H)} ${n(cx + W + flare * 0.4)} ${n(by - H * k)} ${n(cx + W + flare)} ${n(y0)}`;
}
/** Half width of that dome at height fraction f (0 brim, 1 apex), as a share of W. */
const domeEdge = (f: number) => Math.sqrt(Math.max(0, 1 - f * f));

function mushroomCap(ctx: Ctx): Drawing {
  const { s, by, cx, hw } = capFit(ctx, 7.5, 0.24);
  const W = Math.min(Math.max(hw + 11 * s, ctx.rig.faceHalf * 0.82, 21 * s), ctx.rig.faceHalf + 6), H = Math.min(W * 0.7 + 2 * s, 28 * s), dip = 5.5 * s, flare = 2.4 * s, x0 = cx - W - flare, x1 = cx + W + flare, y0 = by + flare / 2;
  const r = ctx.rng("b02-cap"), flip = r.chance(0.5) ? -1 : 1, j = () => r.range(-0.04, 0.04) * W;
  const dot = (fx: number, f: number, rad: number): Piece => ({ d: ellipse(cx + flip * fx * W + j(), by - f * H + j(), rad * W, rad * W), c: "belly", ink: "inner", flat: true });
  const dots = [dot(0.06, 0.56, 0.16), dot(-0.6, 0.3, 0.115), dot(0.62, 0.34, 0.1), dot(0.34, 0.82, 0.065)];
  if (r.chance(0.5)) dots.push(dot(-0.2, 0.16, 0.06));
  const brim = `M${n(x0 + 1.5)} ${n(y0)}Q${n(cx)} ${n(by + dip)} ${n(x1 - 1.5)} ${n(y0)}`;
  const gloss = `M${n(cx - 0.8 * W)} ${n(by - 0.38 * H)}Q${n(cx - 0.66 * W)} ${n(by - 0.78 * H)} ${n(cx - 0.26 * W)} ${n(by - 0.9 * H)}`;
  return {
    pieces: [
      { d: `${dome(cx, by, W, H, flare)}Q${n(cx)} ${n(by + dip)} ${n(x0)} ${n(y0)}Z`, c: "spot", layer: LAYER.body + 1 },
      ...dots,
      { d: brim, c: "ink", w: 2.2, ink: "inner", flat: true },
    ],
    face: { shine: `${gloss}${glossBelow(ctx.rig, by + dip / 2)}` },
    // The brim comes down over the forehead: brows that would cross it are left out (the lowest point, ink line included).
    brim: by + flare / 4 + dip / 2 + 1.1,
  };
}

function acornCup(ctx: Ctx): Drawing {
  const { s, top, by, cx, hw } = capFit(ctx, 9, 0.32);
  const W = hw + 3.2 * s, apex = top - 5 * s, H = by - apex;
  const count = Math.max(4, Math.round((2 * W) / (7.5 * s))), step = (2 * W) / count;
  let brim = "";
  for (let i = 0; i < count; i += 1) { const xa = cx + W - i * step; brim += `Q${n(xa - step / 2)} ${n(by + 3 * s)} ${n(xa - step)} ${n(by)}`; }
  // Cup scales: two rows of little arcs, high on the cup (the brows rise to the brim) and inside the dome.
  let scales = "";
  for (const [f, shift] of [[0.42, 0], [0.74, 0.5]] as const) {
    const y = by - f * H, half = W * domeEdge(f) - 4 * s, gap = 6.2 * s;
    for (let x = cx - half + shift * gap; x <= cx + half + 0.01; x += gap) scales += `M${n(x - 2.1 * s)} ${n(y)}Q${n(x)} ${n(y + 2.4 * s)} ${n(x + 2.1 * s)} ${n(y)}`;
  }
  return {
    pieces: [
      { d: `M${n(cx)} ${n(apex + 2)}Q${n(cx + 1.2 * s)} ${n(apex - 3.6 * s)} ${n(cx + 3.8 * s)} ${n(apex - 5.8 * s)}`, c: "dark", w: 4.4 * s, flat: true, layer: LAYER.body + 1 },
      { d: `${dome(cx, by, W, H)}${brim}Z`, c: "dark", layer: LAYER.body + 1 },
      { d: scales, c: "ink", w: 1.3, ink: "inner", flat: true, lod: 1 },
    ],
    face: { shine: glossBelow(ctx.rig, by + 3) },
    brim: by + 1.5 * s,
  };
}

/* ---------- the patterns ---------- */

/** Cactus spines: short dark dashes on a jittered grid over the flanks and the lower body, never on the face. */
function prickles(ctx: Ctx): Drawing {
  const { rig } = ctx, r = ctx.rng("b02-prickles");
  const fx = rig.spread + 13, fy0 = rig.eyeY - 14, fy1 = rig.mouthY + 8;
  let d = "", row = 0;
  for (let y = rig.top + 9; y < rig.bottom - 5; y += 7.5, row += 1) {
    const span = spanAt(rig, y);
    if (!span) continue;
    for (let x = span[0] + 5 + (row % 2) * 4.5; x < span[1] - 5; x += 9) {
      const px = x + r.range(-1.6, 1.6), py = y + r.range(-1.6, 1.6);
      if (Math.abs(px - 60) < fx && py > fy0 && py < fy1) continue;
      if (r.chance(0.25)) continue;
      // Each spine points outwards from the middle of the body, a little rolled.
      const a = Math.atan2(py - (rig.top + rig.bottom) / 2, px - 60) + r.range(-0.5, 0.5);
      d += `M${n(px)} ${n(py)}l${n(Math.cos(a) * 3)} ${n(Math.sin(a) * 3)}`;
    }
  }
  return { pieces: [{ d, c: "dark", w: 1.6, ink: "inner", flat: true }] };
}

/** Pumpkin ribs: one curve down each flank following the outline, and a short groove on the forehead. */
function ribs(ctx: Ctx): Drawing {
  const { rig } = ctx;
  const ys = [rig.top + 7, (rig.top + rig.bottom) / 2 + 2, rig.bottom - 6];
  const side = (sign: number) => {
    const p = ys.map((y): P => { const sp = spanAt(rig, y) ?? [60 - rig.half * 0.7, 60 + rig.half * 0.7]; return [60 + sign * ((sp[1] - sp[0]) / 2) * 0.66, y]; });
    const c: P = [2 * p[1][0] - (p[0][0] + p[2][0]) / 2, 2 * p[1][1] - (p[0][1] + p[2][1]) / 2];
    return `M${pt(p[0])}Q${pt(c)} ${pt(p[2])}`;
  };
  const top = topAt(rig, 60), groove = `M60 ${n(top + 4)}L60 ${n(Math.max(top + 7, rig.eyeY - 15))}`;
  return { pieces: [{ d: side(-1) + side(1) + groove, c: "dark", w: 2.2, ink: "inner", flat: true }] };
}

/* ---------- the parts ---------- */

/** Is the bicho's spot (the leaves' colour) in the pinks and reds, where the fixed pink would vanish? */
const pinkish = (spec: Spec) => { const h = (((spec.color.hue + spec.color.spot) % 360) + 360) % 360; return h >= 295 || h <= 25; };

// Plant tops reach well above the head: hats hide them (tag "tall"), and a headphone band would cut through the leaves
// (tag "blocks-band").
const TOP = { slot: "top", at: "crown", socket: SOCKET, group: G, tags: ["tall", "blocks-band"], jitter: { rot: 6, size: 0.05 } };

const BUD = "M60 10.5C65.4 14 68.6 19.6 67.6 24.2C66.6 28.4 53.4 28.4 52.4 24.2C51.4 19.6 54.6 14 60 10.5Z";
const SEPALS = "M52.4 23C53.4 28.6 56.8 30.4 60 30.4C63.2 30.4 66.6 28.6 67.6 23C65 26 62.6 25.6 60 23.4C57.4 25.6 55 26 52.4 23Z";
/** The tulip head, its three tips on top; drawn small and grown into place (bottom at 32). */
const TULIP = grow("M50 12Q53 15.6 55.2 18.6Q57.2 13 60 9Q62.8 13 64.8 18.6Q67 15.6 70 12C72.6 21 68.6 29.2 60 29.2C51.4 29.2 47.4 21 50 12Z", 1.15, 60, 10.5);
const TULIP_SEAMS = grow("M55.2 18.8Q57.4 24.4 60 28.4M64.8 18.8Q62.6 24.4 60 28.4", 1.15, 60, 10.5);
const CACTUS_ARM = "M37 71L27.2 71C26.2 71 25.6 70.4 25.6 69.4L25.6 61C25.6 57.4 23.2 55.4 20.6 55.4C18 55.4 15.6 57.4 15.6 61L15.6 73.4C15.6 78 18.6 80.4 22.6 80.4L37 80.4Z";
const ROOT = "M49.5 92C54 97.4 66 97.4 70.5 92C69.6 99.4 65 104.2 61.6 108.4C60.4 110 58.4 111.4 56.6 110.6C58.8 109.6 59.8 107.2 59 105C56 101.6 51.4 97.4 49.5 92Z";

export default batch({

  parts: [
    /* ---------- the sprout ladder and its cousins (top, crown). Each stays within ~30 of its foot: the drop's crown
       is at y 32, and the view box ends at 0. ---------- */
    {
      // One big leaf on a curved stem, its tip curling up: a little flag.
      ...TOP, id: "sprout-single", label: "hojita",
      draw: { pieces: [stem("M60 47C59 38 60.4 32 63.6 29"), ...leaf([63.6, 29.4], [38.5, 19], 10.8, 3.2, "spot", true)] },
    },
    {
      // The ladder's second step: the two leaves plus a closed pink bud in a leafy cup.
      ...TOP, id: "sprout-bud", label: "capullito", rarity: "uncommon",
      // The bud is pink, unless the leaves (spot) are pink too: then it turns gold, so it never melts into them.
      draw: ({ spec }) => ({
        pieces: [
          stem("M60 47C59 40 61 33 60 27"),
          ...leaf([59.6, 35.4], [41.6, 29.6], 6.6, 1.8), ...leaf([60.4, 32.2], [78.4, 25.4], 6.6, -1.8),
          { d: BUD, c: pinkish(spec) ? "gold" : "pink" }, { d: SEPALS, c: "spot" },
          { d: "M60 12.2Q63.2 17 62 23.6", c: "ink", w: 1.3, ink: "inner", lod: 1 },
        ],
      }),
    },
    {
      // The top of the ladder (rare): a daisy, cream petals round a gold heart, over the two leaves.
      ...TOP, id: "sprout-flower", label: "margarita", rarity: "rare",
      draw: { pieces: [stem("M60 47C59 40 61 33 60 25"), ...leaf([59.6, 36.6], [41.4, 31.4], 6.6, 1.8), ...leaf([60.4, 33.6], [78.6, 28], 6.6, -1.8), ...flower([60, 21.5], 1.12, 0, "horn", 4.6)] },
    },
    {
      // Just sprouted: two plump seed leaves on a short stem.
      ...TOP, id: "sprout-seedling", label: "plantita",
      draw: { pieces: [stem("M60 47L60 35", 3.4), ...leaf([59.2, 35.6], [43, 28.4], 8.2, 1.4), ...leaf([60.8, 35.6], [77, 28.4], 8.2, -1.4)] },
    },
    {
      ...TOP, id: "sprout-vine", label: "zarcillo",
      draw: {
        pieces: [
          stem("M60 47C60.6 39 57.4 33 59 25.4", 3.2),
          { d: grow("M59 27.4C61 19.4 70.6 17.6 72 23.6C73.2 28.6 66.6 29.6 66.2 25.6C66 23 69 22.6 69.6 24.6", 1.3, 59, 26.4), c: "dark", w: 2.4, flat: true },
          ...leaf([58.4, 33.6], [40.6, 25.6], 7.6, 2.4),
        ],
      },
    },
    {
      // The radish's fan: three long leaves straight out of the head, the middle one in front.
      ...TOP, id: "leafy-tuft", label: "penacho de hojas",
      draw: { pieces: [...leaf([57.6, 43], [37.6, 21], 6.8, 3, "spot", true), ...leaf([62.4, 43], [82.4, 22], 6.8, -3, "spot", true), ...leaf([60, 42], [61.5, 11.5], 7.4, -1.4, "spot", true)] },
    },
    {
      ...TOP, id: "clover", label: "trébol",
      draw: { pieces: [stem("M60 47C59.4 40 61 33 60 27", 3.2), ...[0, -118, 118].map((deg): Piece => ({ d: turned(HEART, [60, 26.5], deg, 0.92), c: "spot" }))] },
    },
    {
      // The rare variant: four leaflets in an X, the stem showing between the lower two.
      ...TOP, id: "clover-four", label: "trébol de cuatro", rarity: "rare",
      draw: { pieces: [stem("M60 47C59.4 40 61 33 60 27", 3.2), ...[45, 135, 225, 315].map((deg): Piece => ({ d: turned(HEART, [60, 25.5], deg, 0.86), c: "spot" }))] },
    },
    {
      ...TOP, id: "tulip", label: "tulipán",
      draw: {
        pieces: [
          stem("M60 47C59.4 41 60.6 36 60 31"), ...leaf([59.4, 42], [44, 30.5], 5.8, 2.6, "dark"),
          { d: TULIP, c: "spot" },
          { d: TULIP_SEAMS, c: "ink", w: 1.3, ink: "inner", lod: 1 },
        ],
      },
    },
    {
      // A small flower sitting right on the head, a little off-centre. It perks and droops with the plant tops (the
      // catalogue had it still): a flower that wakes up while the bicho waits for you is the charm of the family.
      ...TOP, id: "cactus-flower", label: "flor de cactus", noise: 1, jitter: { rot: 10, size: 0.06 },
      draw: { pieces: flower([62, 33.5], 0.82, -10, "spot", 3) },
    },
    {
      // A stubby pumpkin stalk with a curly tendril and a small leaf. It stays stiff (no sway): it is wood.
      slot: "top", at: "crown", socket: SOCKET, tags: ["tall"], jitter: { rot: 6 }, id: "stem-curl", label: "rabito de calabaza",
      draw: {
        pieces: [
          { d: grow("M55.6 47C56 40 56.6 35.4 59.4 30.6C60.4 28.8 64.4 29.2 64.6 31.2C62.6 35.4 63.4 40.4 64.4 47Z", 1.3), c: "dark" },
          { d: grow("M62.4 33.4C67.2 30.6 71.8 33.6 70.4 37.6C69.4 40.2 65.8 39.8 66.2 37.4C66.5 35.9 68.2 36 68.4 37", 1.3), c: "spot", w: 2.2, flat: true },
          ...leaf([57, 36.4], [42.6, 29.4], 5.8, 2),
        ],
      },
    },
    // The caps are hats that grow: fitted to the head, drawn over it (but under the face). Headgear hides them.
    { id: "cap-mushroom", slot: "top", label: "sombrero de seta", tags: ["hat-hidden"], draw: mushroomCap },
    { id: "cap-acorn", slot: "top", label: "caperuza de bellota", tags: ["hat-hidden"], draw: acornCup },

    /* ---------- arms, legs ---------- */
    {
      id: "leaf", slot: "arms", label: "hojas", at: "shoulderL", socket: [34, 74], group: "arm",
      draw: { pieces: leaf([36, 74.6], [12.4, 84.4], 7.2, -2, "body", true) },
    },
    {
      // Arms that go out and bend up, cactus style, with a few spines.
      id: "cactus", slot: "arms", label: "de cactus", at: "shoulderL", socket: [34, 74], group: "arm", noise: 2,
      draw: { pieces: [{ d: CACTUS_ARM, c: "body" }, { d: "M18.6 62.4l-2.6 -1M18.4 69l-2.8 0.2M28 76.4l0.4 2.6M22.6 74.6l-2 2", c: "dark", w: 1.4, ink: "inner", flat: true, lod: 1 }] },
    },
    {
      // A radish root under the body: the bicho stands on its tip, as if just pulled out of the ground.
      id: "root", slot: "legs", label: "raíz", at: "base", socket: [60, 96],
      draw: { pieces: [{ d: ROOT, c: "belly" }, { d: "M56.4 100.6l3.2 0.6M58.6 104.6l2.4 -0.2", c: "dark", w: 1.2, ink: "inner", flat: true, lod: 1 }] },
    },

    /* ---------- patterns ---------- */
    { id: "prickles", slot: "pattern", label: "pinchitos", lod: 1, draw: prickles },
    { id: "ribs", slot: "pattern", label: "gajos", lod: 1, draw: ribs },
  ],
});
