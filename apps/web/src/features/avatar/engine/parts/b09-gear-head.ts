import {
  HAT, SOFT_INK, batch, ellipse, flatten, isDarkCoat, n, seatHat, smoothLoop, spanAt,
  type Ctx, type Drawing, type Paint, type Piece, type Rig,
} from "../bichos/kit";

/* B09 Gear I: head and face accessories (docs/catalogue.md §2.11, §5.2).
 *
 * Hats (party hat, top hat, beret, chef's hat, hard hat, bucket, the XX bucket in three colours, straw, leaf, propeller
 * cap) are rigid: drawn on the reference body, they join `hat` and seat themselves like the core hats (the kit's
 * `seatHat`): up to 3 units off the head so the raised brows clear the brim, otherwise seated with a declared `brim`
 * (the renderer leaves the brows out). On top of that they never come down over the eyes (`clearEyes`): a three-eyed
 * or big-eyed face lifts the hat. Each hat's brim is measured from its own drawing (its lowest point across the
 * forehead), so a tilted hat declares the brim it really has. Like the core hats' `worn`, they draw an inner copy
 * of the pieces that lie on the head, so they cover a cat's inner ears and tabby stripes.
 *
 * Clips (hair bow, daisy) join `crownR` and sit in the hair, in front of the brows: their fat outline is merged, and
 * their face is drawn again over the face (`over`), shaded the cast's way (`ctx.shade`), so a raised brow
 * tucks behind the bow instead of crossing it.
 *
 * Earmuffs fit themselves: fluffy muffs on the temples (clear of wide-set eyes) and a band that hugs the head's real
 * outline, dropped behind the head when a hat, a cap or a `blocks-band` top would sit on it.
 *
 * Eyewear reads `ctx.eyes`, so it follows every layout: a pair (two, wonky, googly, sparkle…), one eye (cyclops), eyes
 * on stalks (the frog: no temples or strap), and more than two (three, four): those only take the sunglasses, as one
 * visor. LED eyes exclude eyewear themselves. The mustache shares the slot (B08's beaks exclude it).
 *
 * Moods only reuse the shared keyframes: the top hat tips on every word, the propeller spins while working and ticks
 * while waiting, the leaf sways like a sprout, the hard hat's lamp blinks while working, the sunglasses hop on beat a,
 * go up on the forehead at idle (the closed eyes show) and slide down a touch while waiting, the mustache hops with the
 * words and the party stars twinkle. */

type P = [number, number];
const pt = (p: P) => `${n(p[0])} ${n(p[1])}`;
const rad = (deg: number) => (deg * Math.PI) / 180;

/* ---------- geometry ---------- */

/** Maps every point of an absolute path written with M, L, Q, C and Z only. */
function xform(d: string, f: (x: number, y: number) => P): string {
  let out = "", nums: number[] = [];
  const flush = () => {
    for (let i = 0; i + 1 < nums.length; i += 2) { const [x, y] = f(nums[i], nums[i + 1]); out += `${i ? " " : ""}${n(x)} ${n(y)}`; }
    nums = [];
  };
  for (const [t] of d.matchAll(/[MLQCZ]|-?(?:\d+\.?\d*|\.\d+)/g)) {
    if (/[A-Z]/.test(t)) { flush(); out += t; } else nums.push(Number(t));
  }
  flush();
  return out;
}

/** A turn of `deg` (clockwise) about (cx, cy). */
const turn = (deg: number, cx: number, cy: number) => (x: number, y: number): P => {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};

/** The lowest y of these pieces between x0 and x1 (a line's half width included). */
function lowest(pieces: Piece[], x0: number, x1: number): number {
  let low = -Infinity;
  for (const p of pieces) for (const loop of flatten(p.d)) for (const [x, y] of loop) if (x >= x0 && x <= x1) low = Math.max(low, y + (p.w ?? 0) / 2);
  return low;
}

/** The body's edge at height y on one side (-1 left, 1 right), or `fallback` above or below it. */
const edgeAt = (rig: Rig, y: number, side: -1 | 1, fallback: number) => { const s = spanAt(rig, y); return s ? (side < 0 ? s[0] : s[1]) : fallback; };

/** Are the eyes on a top's stalks (the frog)? Then nothing reaches round the head from them. */
const onStalks = ({ rig }: Ctx) => !!(rig.at.stalkL && rig.at.stalkR);

/* ---------- hats ---------- */

/** The forehead, on the reference body: where a brim meets the brows. */
const BROWS: [number, number] = [36, 84];

interface HatArt {
  /** Merged pieces that lie on the head: drawn again as inner pieces, so they cover the inner pieces of tops. */
  body: Piece[];
  /** Merged pieces above the head (a pompom, a stalk, a propeller): not copied. */
  rest?: Piece[];
  /** Inner detail on the hat (stripes, a band, a ridge), over the inner copy. */
  front?: Piece[];
  over?: string;
}

/** A hat's draw: measures the brim on the drawing at T = 0, seats it, then draws it there. */
const hat = (art: (T: number, ctx: Ctx) => HatArt) => (ctx: Ctx): Drawing => {
  const probe = art(0, ctx);
  // The brim's ink may meet an eye's ring, never cover the eye: big, raised or third eyes lift the hat.
  const { T, brim } = seatHat(ctx, lowest(probe.body, ...BROWS), { clearEyes: true });
  const a = art(T, ctx);
  return { pieces: [...a.body, ...(a.rest ?? []), ...a.body.map((p) => ({ ...p, ink: "inner" as const })), ...(a.front ?? [])], over: a.over, brim };
};

/** Every hat is the kit's `HAT`: it joins `hat` and hides what it would sit on (tall tops, `#hat-hidden` parts). Tall
 * hats also block the headphones' band, which would cut through them. */
const TALL = { ...HAT, tags: ["blocks-band"], noise: 3 };

const STACHE_BROWN = "#74492f";
const LEAF = "#7cc242", LEAF_VEIN = "#3e7a2c", HAT_WHITE = "#fbfaf7", LAMP = "#fff3b0";

function partyHat(T: number): HatArt {
  const f = turn(10, 60, T + 9), A: P = [60, T - 25], BL: P = [44, T + 7], BR: P = [76, T + 7];
  const along = (p: P, t: number): P => [A[0] + (p[0] - A[0]) * t, A[1] + (p[1] - A[1]) * t];
  const stripe = (a: number, b: number, w: number) => `M${pt(along(BL, a))}L${pt(along(BR, b))}L${pt(along(BR, b + w))}L${pt(along(BL, a + w))}Z`;
  const base = (t: number): P => [(1 - t) ** 2 * 44 + 2 * t * (1 - t) * 60 + t * t * 76, (1 - t) ** 2 * (T + 7) + 2 * t * (1 - t) * (T + 11) + t * t * (T + 7)];
  const frill = [0, 1, 2, 3, 4, 5].map((i): Piece => { const [x, y] = base(i / 5); return { d: xform(ellipse(x, y - 0.8, 3.1, 3.1), f), c: "belly" }; });
  return {
    body: [{ d: xform(`M${pt(BL)}L${pt(A)}L${pt(BR)}Q60 ${T + 11} ${pt(BL)}Z`, f), c: "spot" }, ...frill],
    rest: [{ d: xform(ellipse(60, T - 26.5, 5, 5), f), c: "belly" }],
    front: [stripe(0.2, 0.34, 0.13), stripe(0.52, 0.66, 0.13)].map((d): Piece => ({ d: xform(d, f), c: "gold", ink: "inner" })),
  };
}

function topHat(T: number): HatArt {
  const f = turn(7, 60, T + 8);
  const crown = `M48.5 ${T + 5}L46.8 ${T - 17}Q46.8 ${T - 19.8} 49.8 ${T - 19.8}L70.2 ${T - 19.8}Q73.2 ${T - 19.8} 73.2 ${T - 17}L71.5 ${T + 5}Z`;
  const brim = `M41 ${T + 5.5}Q40.6 ${T + 2} 44.5 ${T + 2.8}Q60 ${T + 5.2} 75.5 ${T + 2.8}Q79.4 ${T + 2} 79 ${T + 5.5}Q78 ${T + 9.5} 60 ${T + 9.5}Q42 ${T + 9.5} 41 ${T + 5.5}Z`;
  return {
    body: [{ d: xform(crown, f), c: SOFT_INK }, { d: xform(brim, f), c: SOFT_INK }],
    front: [
      { d: xform(`M48.3 ${T - 1.5}L71.7 ${T - 1.5}L71.6 ${T + 4.6}Q60 ${T + 6.6} 48.4 ${T + 4.6}Z`, f), c: "spot", ink: "inner" },
      { d: xform(`M51 ${T - 16}L51.5 ${T - 3.5}`, f), c: "#7a6f8c", w: 2, ink: "inner", flat: true, lod: 1 },
      { d: xform(`M44.5 ${T + 3.6}Q60 ${T + 6.2} 75.5 ${T + 3.6}`, f), c: "#6c6180", w: 1.4, ink: "inner", flat: true, lod: 1 },
    ],
  };
}

function beret(T: number): HatArt {
  return {
    body: [
      { d: `M37 ${T + 7}C33 ${T + 1} 40 ${T - 9} 57 ${T - 10.5}C75 ${T - 12} 91 ${T - 4} 89.5 ${T + 5}C89 ${T + 10.5} 83 ${T + 12.5} 79 ${T + 9.5}Q60 ${T + 6} 37 ${T + 7}Z`, c: "spot" },
    ],
    rest: [{ d: `M57 ${T - 10}Q56 ${T - 14.5} 58.8 ${T - 15.6}`, c: "spot", w: 2.8, flat: true }],
    front: [{ d: `M37.4 ${T + 4.6}Q60 ${T + 3.2} 81 ${T + 7}L79 ${T + 9.5}Q60 ${T + 6} 37 ${T + 7}Z`, c: "dark", ink: "inner" }],
    over: `<path class="b09-crease" d="M70 ${T - 7.5}Q83 ${T - 4} 84.5 ${T + 4.5}M46 ${T - 5}Q52 ${T - 8.5} 60 ${T - 9}"/>`,
  };
}

function chefHat(T: number): HatArt {
  const band = `M45 ${T + 8.5}L45 ${T - 1.5}Q45 ${T - 3.5} 47 ${T - 3.5}L73 ${T - 3.5}Q75 ${T - 3.5} 75 ${T - 1.5}L75 ${T + 8.5}Q60 ${T + 10} 45 ${T + 8.5}Z`;
  return {
    body: [
      { d: `M44 ${T - 1}L44 ${T - 10}L76 ${T - 10}L76 ${T - 1}Z`, c: HAT_WHITE },
      { d: ellipse(47.5, T - 11, 9.5, 9.5), c: HAT_WHITE },
      { d: ellipse(72.5, T - 11, 9.5, 9.5), c: HAT_WHITE },
      { d: ellipse(60, T - 18, 12, 12), c: HAT_WHITE },
      { d: band, c: HAT_WHITE },
    ],
    over: `<path class="b09-pleat" d="M51 ${T - 2}L51 ${T + 7.6}M57 ${T - 2}L57 ${T + 8.5}M63 ${T - 2}L63 ${T + 8.5}M69 ${T - 2}L69 ${T + 7.6}M53 ${T - 5}Q51 ${T - 11} 54 ${T - 16}M67 ${T - 5}Q69 ${T - 11} 66 ${T - 16}"/>`,
  };
}

function hardHat(T: number): HatArt {
  const brim = `M36 ${T + 5.5}Q36 ${T + 2.6} 39.5 ${T + 2.6}L80.5 ${T + 2.6}Q84 ${T + 2.6} 84 ${T + 5.5}Q84 ${T + 8.5} 80 ${T + 8.6}Q60 ${T + 11.2} 40 ${T + 8.6}Q36 ${T + 8.5} 36 ${T + 5.5}Z`;
  return {
    body: [{ d: `M42 ${T + 6}C42 ${T - 8} 49.5 ${T - 15} 60 ${T - 15}C70.5 ${T - 15} 78 ${T - 8} 78 ${T + 6}Z`, c: "gold" }, { d: brim, c: "gold" }],
    front: [
      // Two ribs down the shell, then the brim over them.
      { d: `M51.5 ${T + 3}C51 ${T - 4} 52.5 ${T - 10} 56.5 ${T - 13.2}M68.5 ${T + 3}C69 ${T - 4} 67.5 ${T - 10} 63.5 ${T - 13.2}`, c: "#ffe7a3", w: 2.2, ink: "inner", flat: true, lod: 1 },
      { d: brim, c: "gold", ink: "inner", stroke: 2 },
      // The miner's lamp, low on the front: it blinks while working (the shared `bulb` group).
      { d: ellipse(60, T - 1.6, 4.6, 4.6), c: SOFT_INK, ink: "inner", stroke: 1.6 },
      { d: ellipse(60, T - 1.6, 3, 3), c: LAMP, ink: "inner", flat: true, g: "bulb" },
      { d: ellipse(59, T - 2.6, 1, 0.8), c: "#ffffff", ink: "inner", flat: true, lod: 1 },
    ],
  };
}

function bucket(T: number): HatArt {
  const brim = `M45 ${T + 1}L75 ${T + 1}Q81.5 ${T + 1.6} 88 ${T + 8}Q90 ${T + 11.2} 85.5 ${T + 11.4}Q60 ${T + 13.2} 34.5 ${T + 11.4}Q30 ${T + 11.2} 32 ${T + 8}Q38.5 ${T + 1.6} 45 ${T + 1}Z`;
  return {
    body: [
      { d: `M45 ${T + 3}C45 ${T - 9} 50 ${T - 14} 60 ${T - 14}C70 ${T - 14} 75 ${T - 9} 75 ${T + 3}Z`, c: "spot" },
      { d: brim, c: "spot" },
    ],
    front: [
      { d: `M45.1 ${T - 3.4}L74.9 ${T - 3.4}L75 ${T + 1.6}L45 ${T + 1.6}Z`, c: "dark", ink: "inner" },
      { d: brim, c: "spot", ink: "inner", stroke: 2 },
    ],
    over: `<path class="b09-stitch" d="M35.5 ${T + 8.9}Q60 ${T + 11.6} 84.5 ${T + 8.9}M48 ${T - 7}Q60 ${T - 8.6} 72 ${T - 7}"/>`,
  };
}


/* The XX bucket (the operator's own hat): a black bucket hat splattered with white paint and grey drips, and on its front
 * a face in raised 3D-puff lines of one bright colour — two big X eyes on the crown, a stitched grin across the band (a
 * line with short ticks across it) curving up the sides toward the eyes. The puff lines are drawn the cast's way, ink
 * under the colour, thicker at the small sizes so the eyes and the grin still read in the sidebar; the splatter is
 * a few big specks (gone at the rail) and drips down the crown (the stage only). One part per colour, so each can be
 * asked for by name. It is big enough to cover the top of the head: it blocks the headphones' band, as the tall hats do. */
const XX_BLACK: Paint = "#2c2832", XX_BAND: Paint = "#221e28", XX_SPECK: Paint = "#f4f1ea", XX_DRIP: Paint = "#8d8796";
const XX_PUFF: Record<"purple" | "lime" | "orange", Paint> = { purple: "#9b5de5", lime: "#c6f36b", orange: "#ff6a2b" };

function xxBucket(puff: Paint) {
  return (T: number, ctx: Ctx): HatArt => {
    const small = ctx.size !== "stage";
    // A real bucket hat, bigger than the plain one: a tall rounded crown over the top of the head, and a wide brim that
    // hangs down at both sides past the head. Only its front, between the brows, decides how high it sits.
    const crown = `M31 ${T + 13}C29.5 ${T + 1} 33 ${T - 11.5} 60 ${T - 12.5}C87 ${T - 11.5} 90.5 ${T + 1} 89 ${T + 13}Z`;
    const brim = `M24 ${T + 13}Q60 ${T + 7} 96 ${T + 13}Q103 ${T + 15.5} 104 ${T + 20.5}Q104.5 ${T + 23} 100 ${T + 22.5}Q60 ${T + 16} 20 ${T + 22.5}Q15.5 ${T + 23} 16 ${T + 20.5}Q17 ${T + 15.5} 24 ${T + 13}Z`;
    // The face: two big X eyes on the crown's front, about a third of its width each; the grin along the band, its
    // stitches crossing it onto the brim, its ends rising up the sides toward the eyes. At the small sizes the
    // silhouette and the eyes come first: no stitches, thicker lines.
    const x = (cx: number, cy: number, r: number) => `M${n(cx - r)} ${n(cy - r)}L${n(cx + r)} ${n(cy + r)}M${n(cx + r)} ${n(cy - r)}L${n(cx - r)} ${n(cy + r)}`;
    const r = small ? 6.6 : 6;
    const eyes = x(47.5, T - 1.5, r) + x(72.5, T - 1.5, r);
    const gy = T + 10.5;
    const smile = `M34 ${n(gy)}L86 ${n(gy)}M34 ${n(gy)}Q30.4 ${n(gy - 6)} 34.8 ${T - 3.5}M86 ${n(gy)}Q89.6 ${n(gy - 6)} 85.2 ${T - 3.5}`;
    const stitches = small ? "" : [37.5, 41.5, 45.5, 49.5, 53.5, 57.5, 62.5, 66.5, 70.5, 74.5, 78.5, 82.5].map((tx) => `M${tx} ${n(gy - 2.6)}L${tx} ${n(gy + 2.6)}`).join("")
      + `M30.4 ${n(gy - 3.4)}L34.4 ${n(gy - 3.9)}M31.2 ${T + 1.6}L35 ${T + 1.6}M89.6 ${n(gy - 3.4)}L85.6 ${n(gy - 3.9)}M88.8 ${T + 1.6}L85 ${T + 1.6}`;
    const w = small ? 3.4 : 2.6, k = small ? 6 : 4.6;
    const puffLines = (d: string): Piece[] => [
      { d, c: "ink", w: k, ink: "inner", flat: true },
      { d, c: puff, w, ink: "inner", flat: true },
    ];
    // Paint: a few big white specks (gone at the rail), and grey drips down the crown (the stage alone).
    const specks = [[39, T - 5, 1.5], [60, T - 8.5, 1.2], [83, T + 4.5, 1.4], [27.5, T + 18.5, 1.3], [55, T + 16.8, 1.2], [92, T + 17.6, 1.5]]
      .map(([sx, sy, sr]): Piece => ({ d: ellipse(sx, sy, sr, sr * 0.85), c: XX_SPECK, ink: "inner", flat: true, lod: 1 }));
    const drips: Piece[] = [
      { d: `M60 ${T - 11.6}L60 ${T - 7.4}`, c: XX_DRIP, w: 1.3, ink: "inner", flat: true, lod: 2 },
      { d: `M36.5 ${T + 2}L36.5 ${T + 6.2}`, c: XX_DRIP, w: 1.2, ink: "inner", flat: true, lod: 2 },
      { d: `M81.5 ${T - 6}L81.5 ${T - 2}`, c: XX_DRIP, w: 1.2, ink: "inner", flat: true, lod: 2 },
    ];
    return {
      body: [{ d: crown, c: XX_BLACK }, { d: brim, c: XX_BLACK }],
      front: [
        { d: `M31.2 ${T + 7.6}L88.8 ${T + 7.6}L89 ${T + 13}L31 ${T + 13}Z`, c: XX_BAND, ink: "inner" },
        { d: brim, c: XX_BLACK, ink: "inner", stroke: 2 },
        ...drips, ...specks, ...puffLines(eyes), ...puffLines(smile + stitches),
      ],
    };
  };
}

function straw(T: number): HatArt {
  const crown = `M45 ${T + 5.5}C45 ${T - 7.5} 49 ${T - 12.5} 60 ${T - 12.5}C71 ${T - 12.5} 75 ${T - 7.5} 75 ${T + 5.5}Q60 ${T + 7.5} 45 ${T + 5.5}Z`;
  return {
    body: [{ d: `M27 ${T + 6}Q27 ${T + 0.6} 60 ${T + 0.6}Q93 ${T + 0.6} 93 ${T + 6}Q93 ${T + 11.2} 60 ${T + 11.2}Q27 ${T + 11.2} 27 ${T + 6}Z`, c: "gold" }, { d: crown, c: "gold" }],
    front: [
      { d: crown, c: "gold", ink: "inner", stroke: 2 },
      { d: `M45.1 ${T - 0.8}Q60 ${T + 1} 74.9 ${T - 0.8}L75 ${T + 5.5}Q60 ${T + 7.5} 45 ${T + 5.5}Z`, c: "spot", ink: "inner", stroke: 1.6 },
    ],
    over: `<path class="b09-weave" d="M32 ${T + 6.5}Q34 ${T + 10} 60 ${T + 10}Q86 ${T + 10} 88 ${T + 6.5}M48 ${T - 7}Q60 ${T - 5.4} 72 ${T - 7}M46.5 ${T - 3}Q60 ${T - 1.4} 73.5 ${T - 3}"/>`,
  };
}

function leafHat(T: number): HatArt {
  return {
    body: [{ d: `M30 ${T + 6}C33 ${T - 10} 67 ${T - 17} 86 ${T - 4}C91 ${T + 1} 94 ${T + 8} 96 ${T + 15}C89 ${T + 12} 82 ${T + 10.5} 74 ${T + 8}C62 ${T + 4.5} 44 ${T + 6.5} 30 ${T + 6}Z`, c: LEAF }],
    rest: [{ d: `M31 ${T + 5}Q24.5 ${T + 1} 25.5 ${T - 5.5}Q26.5 ${T - 9.5} 30.5 ${T - 8.5}`, c: LEAF_VEIN, w: 3.2, flat: true }],
    front: [
      { d: `M31 ${T + 4.5}Q62 ${T - 8} 94.5 ${T + 13.5}`, c: LEAF_VEIN, w: 1.6, ink: "inner", flat: true, lod: 1 },
      { d: `M45 ${T}L44 ${T - 6.5}M58 ${T - 2.3}L59 ${T - 10}M71 ${T - 0.5}L74 ${T - 8}M82 ${T + 4}L87 ${T - 1}M52 ${T - 1}L55 ${T + 4.5}M66 ${T - 1.4}L69 ${T + 5}M79 ${T + 2.5}L81 ${T + 8}`, c: LEAF_VEIN, w: 1.1, ink: "inner", flat: true, lod: 1 },
    ],
  };
}

function propellerCap(T: number): HatArt {
  const H = T - 20.5;
  const blade = `M60 ${H}C56 ${H - 5.4} 46.5 ${H - 6} 43.4 ${H - 2.6}C41.6 ${H + 0.6} 49 ${H + 2.6} 60 ${H}Z`;
  // The other blade is the first turned half round the hub, so the pair spins about its middle (fill-box centre).
  const other = xform(blade, (x, y) => [120 - x, 2 * H - y]);
  const visor = `M43.5 ${T + 4.5}Q60 ${T + 2.5} 76.5 ${T + 4.5}Q73 ${T + 10.5} 60 ${T + 11}Q47 ${T + 10.5} 43.5 ${T + 4.5}Z`;
  return {
    body: [{ d: `M41 ${T + 6}C41 ${T - 8} 49 ${T - 14} 60 ${T - 14}C71 ${T - 14} 79 ${T - 8} 79 ${T + 6}Z`, c: "spot" }, { d: visor, c: "dark" }],
    rest: [
      { d: `M60 ${T - 14.5}L60 ${T - 19.5}`, c: "gold", w: 2.4, flat: true },
      { d: blade, c: "spot", g: "b09-prop" },
      { d: other, c: "gold", g: "b09-prop" },
      { d: `M60 ${H}L60 ${H + 0.1}`, c: SOFT_INK, w: 3.6, flat: true },
    ],
    front: [
      { d: `M60 ${T - 14}C54.5 ${T - 14} 50.5 ${T - 7} 50.5 ${T + 5}L60 ${T + 5}Z`, c: "gold", ink: "inner" },
      { d: `M79 ${T + 5}C79 ${T - 8} 71 ${T - 14} 60 ${T - 14}C65.5 ${T - 14} 69.5 ${T - 7} 69.5 ${T + 5}Z`, c: "gold", ink: "inner" },
      { d: visor, c: "dark", ink: "inner", stroke: 1.8 },
      { d: `M60 ${T - 15}L60 ${T - 14.9}`, c: "gold", w: 5, flat: true, ink: "inner" },
    ],
  };
}

/* ---------- clips (in the hair, at crownR) ---------- */

/** A clip's pieces: merged (the fat outline where it leaves the head), then the same shapes over the face, shaded and
 * edged, so brows tuck behind it. `fills` pairs each path with its paint. */
function clip(ctx: Ctx, fills: [string, Paint][], detail = ""): Drawing {
  return {
    pieces: fills.map(([d, c]) => ({ d, c })),
    over: `<g class="b09-clip">${fills.map(([d, c]) => `<path d="${d}" fill="${ctx.shade(c)}"/>`).join("")}${detail}</g>`,
  };
}

/** `crownR` on the reference body, where the clips are drawn (its normal leans 20° out). */
const CLIP_AT = { x: 72.1, y: 44, a: 20 };

/** How far a clip drawn round `centre` must move so no point of `paths` comes within `margin` of an eye. The eyes are
 * taken into the clip's own drawing (undoing `crownR`'s placement on this body); it moves straight away from the eye
 * it touches, at most 7. */
function dodge(ctx: Ctx, centre: P, paths: string[], margin = 1.8): P {
  const a = ctx.rig.at.crownR, s = a.s ?? 1, rot = rad(-((a.a ?? 20) - CLIP_AT.a));
  const eyes = ctx.eyes.map((e) => {
    const dx = (e.x - a.x) / s, dy = (e.y - a.y) / s;
    return { x: CLIP_AT.x + dx * Math.cos(rot) - dy * Math.sin(rot), y: CLIP_AT.y + dx * Math.sin(rot) + dy * Math.cos(rot), r: e.r / s + 1.3 + margin };
  });
  const pts = paths.flatMap((d) => flatten(d).flat());
  let sx = 0, sy = 0;
  for (let k = 0; k < 4; k += 1) for (const e of eyes) {
    let push = 0;
    for (const [x, y] of pts) push = Math.max(push, e.r - Math.hypot(x + sx - e.x, y + sy - e.y));
    if (push <= 0) continue;
    const ux = centre[0] + sx - e.x, uy = centre[1] + sy - e.y, l = Math.hypot(ux, uy) || 1;
    sx += (ux / l) * (push + 0.2); sy += (uy / l) * (push + 0.2);
  }
  const l = Math.hypot(sx, sy);
  return l > 7 ? [(sx / l) * 7, (sy / l) * 7] : [sx, sy];
}

/** A big bow, drawn round its knot at the origin, then scaled, leant out with the head and set on the crown's right. */
function hairbow(ctx: Ctx): Drawing {
  const K: P = [73.5, 36.5], k = 1.38;
  const lean = turn(18, 0, 0);
  const place = (sx: number, sy: number) => (x: number, y: number): P => { const [px, py] = lean(x * k, y * k); return [K[0] + px + sx, K[1] + py + sy]; };
  const loopL = "M0 0C-5 -8 -14 -8.6 -14 -1.8C-14 5 -5.5 6 0 0Z";
  const loops = [loopL, xform(loopL, (x, y) => [-x, y])];
  const tailL = "M-1.6 0.8L-5.6 7L-2.9 6.7L-2 8.8L1.4 1.8Z";
  const tails = [tailL, xform(tailL, (x, y) => [-x, y])];
  const knot = ellipse(0, 0, 3.8, 4.2);
  const parts = [...tails, ...loops, knot];
  const [sx, sy] = dodge(ctx, K, parts.map((d) => xform(d, place(0, 0))));
  const f = place(sx, sy);
  const folds = ctx.size === "stage" ? `<path class="b09-fold" d="${xform("M-3.4 -1.2Q-8.4 -4.4 -11.8 -2.6M-3.4 1Q-7.8 3 -11.4 1.6M3.4 -1.2Q8.4 -4.4 11.8 -2.6M3.4 1Q7.8 3 11.4 1.6", f)}"/>` : "";
  return clip(ctx, parts.map((d): [string, Paint] => [xform(d, f), "spot"]), folds);
}

/** A daisy: eight white petals round a gold heart. */
function flowerClip(ctx: Ctx): Drawing {
  const C0: P = [75, 37.5];
  const petal = (C: P, i: number) => xform(ellipse(C[0], C[1] - 6.1, 3.2, 5.2), turn(i * 45 + 10, C[0], C[1]));
  const [sx, sy] = dodge(ctx, C0, Array.from({ length: 8 }, (_, i) => petal(C0, i)));
  const C: P = [C0[0] + sx, C0[1] + sy];
  const dots = ctx.size === "stage" ? `<g class="b09-seeds"><circle cx="${n(C[0] - 1.3)}" cy="${n(C[1] - 1)}" r=".85"/><circle cx="${n(C[0] + 1.5)}" cy="${n(C[1] - 0.3)}" r=".85"/><circle cx="${n(C[0] - 0.2)}" cy="${n(C[1] + 1.5)}" r=".85"/></g>` : "";
  return clip(ctx, [...Array.from({ length: 8 }, (_, i): [string, Paint] => [petal(C, i), HAT_WHITE]), [ellipse(C[0], C[1], 4.2, 4.2), "gold"]], dots);
}

/* ---------- earwear ---------- */

/** A fluffy pompom round (cx, cy): round scallops (arcs bulging out between valley points), each nudged by `jit` (the
 * same jitter, mirrored with `side`, makes the other muff), so it reads as fur. */
function fluff(cx: number, cy: number, r: number, jit: number[], side: 1 | -1, bumps = 10): string {
  const v: P[] = [];
  for (let i = 0; i < bumps; i += 1) {
    const a = ((i + jit[i % jit.length] * 0.22) / bumps) * Math.PI * 2 - Math.PI / 2, k = 0.84 * (1 + jit[(i + 3) % jit.length] * 0.035);
    v.push([cx + side * Math.cos(a) * r * k, cy + Math.sin(a) * r * k]);
  }
  let d = `M${pt(v[0])}`;
  for (let i = 0; i < bumps; i += 1) {
    const q = v[(i + 1) % bumps], p = v[i], rb = Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.56;
    d += `A${n(rb)} ${n(rb)} 0 0 ${side > 0 ? 1 : 0} ${pt(q)}`;
  }
  return d + "Z";
}

/** The head's outline above height y, offset `off` outward, left to right, as a smooth open path. */
function headArc(rig: Rig, y: number, off: number): string | null {
  const loop = flatten(rig.outline).sort((a, b) => b.length - a.length)[0];
  if (!loop || loop.length < 4) return null;
  const pts = loop[0][0] === loop[loop.length - 1][0] && loop[0][1] === loop[loop.length - 1][1] ? loop.slice(0, -1) : loop;
  const N = pts.length;
  let top = 0;
  for (let i = 1; i < N; i += 1) if (pts[i][1] < pts[top][1]) top = i;
  if (pts[top][1] >= y) return null;
  // The run of points above y around the top, in loop order.
  let a = top, b = top;
  while (pts[(a - 1 + N) % N][1] < y && (a - 1 + N) % N !== top) a = (a - 1 + N) % N;
  while (pts[(b + 1) % N][1] < y && (b + 1) % N !== a) b = (b + 1) % N;
  const run: P[] = [];
  for (let i = a; ; i = (i + 1) % N) { run.push(pts[i]); if (i === b) break; }
  const cy = rig.eyeY + 8;
  const out = run.map((p, i): P => {
    const q0 = run[Math.max(0, i - 1)], q1 = run[Math.min(run.length - 1, i + 1)];
    let nx = q1[1] - q0[1], ny = -(q1[0] - q0[0]);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    if (nx * (p[0] - 60) + ny * (p[1] - cy) < 0) { nx = -nx; ny = -ny; }
    return [p[0] + nx * off, p[1] + ny * off];
  });
  if (out[0][0] > out[out.length - 1][0]) out.reverse();
  // Every ~3 units, then a quadratic through the midpoints.
  const even: P[] = [out[0]];
  for (const p of out) if (Math.hypot(p[0] - even[even.length - 1][0], p[1] - even[even.length - 1][1]) >= 3) even.push(p);
  even.push(out[out.length - 1]);
  let d = `M${pt(even[0])}`;
  for (let i = 1; i < even.length - 1; i += 1) d += `Q${pt(even[i])} ${pt([(even[i][0] + even[i + 1][0]) / 2, (even[i][1] + even[i + 1][1]) / 2])}`;
  return d + `L${pt(even[even.length - 1])}`;
}

function earmuffs(ctx: Ctx): Drawing {
  const { rig, eyes } = ctx, r = Math.max(8, Math.min(10.5, rig.faceHalf * 0.33)), cy = rig.at.templeL.y + 1;
  const muff = (side: -1 | 1) => {
    let x = edgeAt(rig, cy, side, side < 0 ? rig.at.templeL.x : rig.at.templeR.x) - side * 1.5;
    // Clear of the eyes beside it (wide-set eyes reach the temples).
    for (const e of eyes) if (Math.abs(e.y - cy) < e.r + r && Math.sign(e.x - 60) === side) x = side < 0 ? Math.min(x, e.x - e.r - r - 2) : Math.max(x, e.x + e.r + r + 2);
    return x;
  };
  const xl = muff(-1), xr = muff(1);
  // The band hugs the head; under a hat or a cap, behind a top it would cut through, or between eye stalks, it goes
  // behind the head.
  const band = ctx.brim === undefined && !ctx.has("#blocks-band") && !onStalks(ctx) ? headArc(rig, cy - r * 0.4, 3.2) : null;
  const rnd = ctx.rng("b09-muff"), jit = Array.from({ length: 7 }, () => rnd.range(-1, 1));
  const L = fluff(xl, cy, r, jit, 1), R = fluff(xr, cy, r, jit, -1);
  // A soft lighter tuft in the upper middle of each muff (over the fur, still).
  const tuft = (x: number, side: number) => `<ellipse cx="${n(x - side * r * 0.22)}" cy="${n(cy - r * 0.28)}" rx="${n(r * 0.42)}" ry="${n(r * 0.3)}"/>`;
  return {
    pieces: [
      ...(band ? [{ d: band, c: "spot" as const, w: 3.6, flat: true }] : []),
      { d: L, c: "belly" }, { d: R, c: "belly" },
      { d: L, c: "belly", ink: "inner" }, { d: R, c: "belly", ink: "inner" },
    ],
    over: ctx.size === "rail" ? "" : `<g class="b09-fluff">${tuft(xl, 1)}${tuft(xr, -1)}</g>`,
  };
}

/* ---------- eyewear ---------- */


/** Thin temples from the frame's outer edges at height y to the head's edge (shorter under earwear). */
function temples(ctx: Ctx, xl: number, xr: number, y: number, cls = "b09-temple"): string {
  if (onStalks(ctx) || ctx.size === "rail") return "";
  const { rig } = ctx, cut = ctx.has("earwear") ? 10 : 0.5;
  const el = edgeAt(rig, y, -1, rig.at.templeL.x) + cut, er = edgeAt(rig, y, 1, rig.at.templeR.x) - cut;
  return `<path class="${cls}" d="${xl - el > 1.5 ? `M${n(xl)} ${n(y)}L${n(el)} ${n(y - 1.5)}` : ""}${er - xr > 1.5 ? `M${n(xr)} ${n(y)}L${n(er)} ${n(y - 1.5)}` : ""}"/>`;
}

/** A shades lens: a rounded trapezoid, the bottom a little narrower; with `dip`, a nose notch in the middle (a visor). */
function lens(x0: number, x1: number, y0: number, y1: number, dip = 0): string {
  const w = x1 - x0, h = y1 - y0, i = Math.min(1.6, w * 0.08), m = (x0 + x1) / 2, c = Math.min(2.4, h * 0.2);
  const bottom = dip
    ? `Q${n(x1 - i * 1.5)} ${n(y1)} ${n(x1 - w * 0.22)} ${n(y1)}Q${n(m + dip * 1.4)} ${n(y1)} ${n(m)} ${n(y1 - dip)}Q${n(m - dip * 1.4)} ${n(y1)} ${n(x0 + w * 0.22)} ${n(y1)}Q${n(x0 + i * 1.5)} ${n(y1)}`
    : `Q${n(x1 - i * 1.5)} ${n(y1)} ${n(m)} ${n(y1)}Q${n(x0 + i * 1.5)} ${n(y1)}`;
  return `M${n(x0)} ${n(y0 + c)}Q${n(x0)} ${n(y0)} ${n(x0 + c)} ${n(y0)}L${n(x1 - c)} ${n(y0)}Q${n(x1)} ${n(y0)} ${n(x1)} ${n(y0 + c)}L${n(x1 - i)} ${n(y1 - h * 0.38)}${bottom} ${n(x0 + i)} ${n(y1 - h * 0.38)}Z`;
}

/** Sunglasses: dark lenses tinted with the spot colour, a spot frame edged in ink. One lens per eye for a pair, one
 * wide lens for a cyclops, and one visor over three or four eyes. The lenses let the white of the eyes glow through a
 * little, so the blink still shows; the pupils sink in the dark. */
function sunglasses(ctx: Ctx): Drawing {
  const { eyes } = ctx;
  if (!eyes.length) return {};
  const rail = ctx.size === "rail";
  const sorted = [...eyes].sort((a, b) => a.x - b.x);
  const boxes: [number, number, number, number, number][] = [];
  if (eyes.length > 2) {
    const x0 = Math.min(...eyes.map((e) => e.x - e.r)) - 3, x1 = Math.max(...eyes.map((e) => e.x + e.r)) + 3;
    boxes.push([x0, x1, Math.min(...eyes.map((e) => e.y - e.r)) - 2, Math.max(...eyes.map((e) => e.y + e.r)) + 2, 3.2]);
  } else if (eyes.length === 1) {
    const e = eyes[0];
    boxes.push([e.x - e.r - 7, e.x + e.r + 7, e.y - e.r - 2, e.y + e.r + 2, 0]);
  } else {
    const [a, b] = sorted, half = (b.x - a.x) / 2;
    for (const e of sorted) {
      const hw = Math.max(e.r + 1.2, Math.min(e.r + 3.2, half - 1.4));
      boxes.push([e.x - hw, e.x + hw, e.y - e.r - 1.8, e.y + e.r + 1.8, 0]);
    }
  }
  const tint = ctx.shade("color-mix(in oklab, var(--bx-spot), #140e20 74%)");
  const lenses = boxes.map(([x0, x1, y0, y1, dip]) => lens(x0, x1, y0, y1, dip)).join("");
  const glare = rail ? "" : boxes.map(([x0, x1, y0, y1]) => {
    const w = x1 - x0, h = y1 - y0;
    return `M${n(x0 + w * 0.22)} ${n(y0 + h * 0.52)}L${n(x0 + w * 0.42)} ${n(y0 + h * 0.2)}M${n(x0 + w * 0.36)} ${n(y0 + h * 0.62)}L${n(x0 + w * 0.47)} ${n(y0 + h * 0.44)}`;
  }).join("");
  const top = Math.min(...boxes.map((b) => b[2]));
  const bridge = boxes.length === 2 ? `M${n(boxes[0][1] - 1)} ${n(boxes[0][2] + 2.4)}Q60 ${n(top - 0.6)} ${n(boxes[1][0] + 1)} ${n(boxes[1][2] + 2.4)}` : "";
  const first = boxes[0], last = boxes[boxes.length - 1];
  // Idle: up on the forehead (or on a hat), just clear of the closed lids (they hang 1 under the eye's middle). Eyes on
  // stalks have no forehead: there they stay put.
  const up = onStalks(ctx) ? 0 : -Math.max(...eyes.map((e) => e.r)) - 3.2;
  return {
    over: `<g class="b09-shades" style="--b09-up:${n(up)}px">${temples(ctx, first[0], last[1], first[2] + 2.6)}`
      + `<path class="b09-lens" fill="${tint}" d="${lenses}"/>${glare ? `<path class="b09-glare" d="${glare}"/>` : ""}`
      + `<path class="b09-frame" d="${lenses}${bridge}"/><path class="b09-frame-c" d="${lenses}${bridge}"/></g>`,
  };
}

/** A gold monocle on the right-hand eye (the only eye of a cyclops), its bead chain hanging to the body's edge. */
function monocle(ctx: Ctx): Drawing {
  const { eyes, rig } = ctx;
  if (!eyes.length) return {};
  const e = eyes.reduce((a, b) => (b.x > a.x ? b : a)), R = e.r + 3;
  const a0 = rad(eyes.length === 1 ? 25 : 55), p0: P = [e.x + Math.cos(a0) * R, e.y + Math.sin(a0) * R];
  const ye = Math.min(rig.mouthY + 6, rig.bottom - 10), xe = edgeAt(rig, ye, 1, rig.at.templeR.x) - 1.2;
  const c: P = [Math.max(p0[0] + 2, 76), ye + 7];
  const chain = onStalks(ctx) ? "" : `M${pt(p0)}Q${pt(c)} ${n(xe)} ${n(ye)}`;
  const stage = ctx.size === "stage";
  return {
    over: `<g class="b09-monocle">${chain ? `<path class="b09-chain-k" d="${chain}"/><path class="b09-chain" d="${chain}"/>` : ""}`
      + `<circle class="b09-glass" cx="${e.x}" cy="${e.y}" r="${n(R)}"/>`
      + `<circle class="b09-rim-k" cx="${e.x}" cy="${e.y}" r="${n(R)}"/><circle class="b09-rim" cx="${e.x}" cy="${e.y}" r="${n(R)}"/>`
      + (stage ? `<path class="b09-shine" d="M${n(e.x - R * 0.62)} ${n(e.y - R * 0.05)}Q${n(e.x - R * 0.55)} ${n(e.y - R * 0.55)} ${n(e.x - R * 0.08)} ${n(e.y - R * 0.64)}"/>` : "")
      + `</g>`,
  };
}

/** Goggles: big brass rims round tinted glass, on a spot strap that wraps round the head. One big lens for a cyclops. */
function goggles(ctx: Ctx): Drawing {
  const { eyes, rig } = ctx;
  if (!eyes.length) return {};
  const sorted = [...eyes].sort((a, b) => a.x - b.x), stage = ctx.size === "stage";
  const half = sorted.length > 1 ? (sorted[1].x - sorted[0].x) / 2 : Infinity;
  const rings = sorted.map((e) => {
    const g = e.r + 2.2, w = Math.max(2.6, Math.min(3.8, half + 1.2 - g));
    return { x: e.x, y: e.y, g, w };
  });
  const a = rings[0], z = rings[rings.length - 1], sy = (a.y + z.y) / 2;
  const strap = (x0: number, x1: number, y: number) => `M${n(x0)} ${n(y - 3.2)}L${n(x1)} ${n(y - 3.2)}L${n(x1)} ${n(y + 3.2)}L${n(x0)} ${n(y + 3.2)}Z`;
  // The strap wraps round the head, just past its edge; under earwear it goes in under the cups.
  const cut = ctx.has("earwear") ? -9 : 0.6;
  const el = edgeAt(rig, sy, -1, rig.at.templeL.x) - cut, er = edgeAt(rig, sy, 1, rig.at.templeR.x) + cut;
  const straps = onStalks(ctx) ? "" : [a.x - a.g - a.w / 2 - el > 1 ? strap(el, a.x - a.g, sy) : "", er - (z.x + z.g + z.w / 2) > 1 ? strap(z.x + z.g, er, sy) : ""].join("");
  const bridge = rings.length > 1 && z.x - z.g - z.w / 2 - (a.x + a.g + a.w / 2) > 0.5 ? `<path class="b09-bridge-k" d="M${n(a.x + a.g)} ${n(a.y - 1)}Q60 ${n(Math.min(a.y, z.y) - 3)} ${n(z.x - z.g)} ${n(z.y - 1)}"/><path class="b09-bridge" d="M${n(a.x + a.g)} ${n(a.y - 1)}Q60 ${n(Math.min(a.y, z.y) - 3)} ${n(z.x - z.g)} ${n(z.y - 1)}"/>` : "";
  const ring = rings.map((r) => `<circle class="b09-goggle-glass" cx="${r.x}" cy="${r.y}" r="${n(r.g)}"/>`
    + `<circle class="b09-rim-k" style="stroke-width:${n(r.w + 2.6)}" cx="${r.x}" cy="${r.y}" r="${n(r.g + r.w / 2)}"/><circle class="b09-rim" style="stroke-width:${n(r.w)}" cx="${r.x}" cy="${r.y}" r="${n(r.g + r.w / 2)}"/>`
    + (stage ? `<path class="b09-shine" d="M${n(r.x - r.g * 0.62)} ${n(r.y + r.g * 0.05)}Q${n(r.x - r.g * 0.6)} ${n(r.y - r.g * 0.55)} ${n(r.x - r.g * 0.1)} ${n(r.y - r.g * 0.66)}"/>`
      + [45, 135, 225, 315].map((d) => `<circle class="b09-rivet" cx="${n(r.x + Math.cos(rad(d)) * (r.g + r.w / 2))}" cy="${n(r.y + Math.sin(rad(d)) * (r.g + r.w / 2))}" r=".75"/>`).join("") : "")).join("");
  return { over: `<g class="b09-goggles">${straps ? `<path class="b09-strap" d="${straps}"/>` : ""}${bridge}${ring}</g>` };
}

/** A chubby five-point star round (cx, cy), point up, turned `deg`. */
function star(cx: number, cy: number, R: number, deg: number, k = 0.56): string {
  const pts: P[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = rad(-90 + deg + i * 36), r = i % 2 ? R * k : R;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return smoothLoop(pts);
}

/** Party star glasses (rare): a star plate round each eye with a round window, sparkles on the plate. */
function starGlasses(ctx: Ctx): Drawing {
  const { eyes } = ctx;
  if (!eyes.length) return {};
  const sorted = [...eyes].sort((a, b) => a.x - b.x), stage = ctx.size === "stage";
  const plate = ctx.shade("spot");
  // The window shows nearly all the eye; the star's valleys stay 2.8 outside it, so a pair overlaps at the bridge
  // (the right star over the left, like one moulded piece) and a cyclops wears one big star.
  const stars = sorted.map((e, i) => {
    const side = sorted.length === 1 ? 0 : i ? 1 : -1, hole = e.r * 0.9, R = Math.min((hole + 2.8) / 0.6, 22);
    const cx = e.x + side * 0.8, cy = e.y - 0.6;
    const d = star(cx, cy, R, side * 9, 0.6) + ellipse(e.x, e.y, hole, hole);
    const glit = stage ? `<path class="b09-glitter" d="M${n(cx - R * 0.42)} ${n(cy - R * 0.5)}l.1 0M${n(cx + R * 0.5)} ${n(cy + R * 0.12)}l.1 0M${n(cx - R * 0.2)} ${n(cy + R * 0.62)}l.1 0"/>` : "";
    return `<g class="b09-star"><path fill-rule="evenodd" fill="${plate}" class="b09-plate" d="${d}"/>${glit}</g>`;
  }).join("");
  const a = sorted[0], z = sorted[sorted.length - 1];
  return { over: `<g class="b09-stars">${temples(ctx, a.x - a.r * 1.6, z.x + z.r * 1.6, Math.min(a.y, z.y) - 2)}${stars}</g>` };
}

/** Points along a cubic (not the start). */
function cubic(p0: P, c1: P, c2: P, p1: P, steps = 12): P[] {
  const out: P[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps, u = 1 - t;
    out.push([0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * p1[k]) as P);
  }
  return out;
}

/** A tapered tube along a spine: half width `w(t)` (t from 0 to 1 along its length), a round tip at the end and a flat
 * start (hidden where the two halves of a mustache cross). */
function tube(spine: P[], w: (t: number) => number): string {
  const acc = [0];
  for (let i = 1; i < spine.length; i += 1) acc.push(acc[i - 1] + Math.hypot(spine[i][0] - spine[i - 1][0], spine[i][1] - spine[i - 1][1]));
  const L = acc[acc.length - 1], left: P[] = [], right: P[] = [];
  spine.forEach((p, i) => {
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(spine.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l, r = w(acc[i] / L);
    left.push([p[0] + nx * r, p[1] + ny * r]);
    right.push([p[0] - nx * r, p[1] - ny * r]);
  });
  // The round tip: half a turn from the left offset, through the spine's heading, to the right offset.
  const end = spine[spine.length - 1], prev = spine[spine.length - 2], r = w(1), dir = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
  const cap: P[] = [1, 2, 3, 4, 5].map((k) => { const a = dir + Math.PI / 2 - (Math.PI * k) / 6; return [end[0] + Math.cos(a) * r, end[1] + Math.sin(a) * r]; });
  return `M${[...left, ...cap, ...right.reverse()].map(pt).join("L")}Z`;
}

/** One half of the mustache (the right), as its spine: cubic segments in units from the middle of the mustache under
 * the nose. It droops out along the lip, then curls up and hooks back in. */
const STACHE: [P, P, P][] = [
  [[4, 1.3], [9, 2.9], [12.6, 0.9]],
  [[15.6, -1], [16.3, -5.6], [13.7, -7]],
  [[12.1, -7.8], [10.9, -6.5], [11.7, -5.3]],
];

/** A curly handlebar mustache: its middle top sits just under any nose (they all end 2.4 under `muzzle`), its lower
 * edge over the top of the mouth, so the open mouth shows under it. Chestnut (clear of the mouth's dark inside), or cream on a dark
 * coat (the horn colour: a grandpa's). Both halves are outlined first and filled after, so they read as one shape. */
function mustache(ctx: Ctx): Drawing {
  const { rig } = ctx, cx = rig.at.mouth.x, cy = rig.at.muzzle.y + 2.4 + 2.8, u = Math.min(15, rig.faceHalf - 7) / 15;
  const half = (side: number) => {
    let at: P = [-1.6, 0];
    const spine: P[] = [at];
    for (const [c1, c2, p] of STACHE) { spine.push(...cubic(at, c1, c2, p)); at = p; }
    return tube(spine.map(([x, y]): P => [cx + side * x * u, cy + y * u]), (t) => (0.65 + 2.15 * (1 - t) ** 0.9) * u);
  };
  const right = half(1), left = half(-1);
  const sh = ctx.shade(isDarkCoat(ctx.spec) ? "horn" : STACHE_BROWN);
  const arc = (s: number) => `M${n(cx + s * 2.4 * u)} ${n(cy - 1.5 * u)}Q${n(cx + s * 7 * u)} ${n(cy - 0.7 * u)} ${n(cx + s * 10.5 * u)} ${n(cy + 0.3 * u)}`;
  const hi = ctx.size === "stage" ? `<path class="b09-stache-hi" d="${arc(1)}${arc(-1)}"/>` : "";
  return { over: `<g class="b09-stache"><path class="b09-stache-k" d="${right}${left}"/><path fill="${sh}" d="${right}"/><path fill="${sh}" d="${left}"/>${hi}</g>` };
}

/* ---------- the batch ---------- */

/** What a clip can't sit beside: tops whose eyes sit on stalks (the frog's domes, B11's eye stalks: no forehead for a clip
 * to sit by), tops that fill the crown (`blocks-clips`: B12's flame and star; the clip would sit on them) and the bone
 * clip, which already sits there. */
const CLIP_EXCLUDES = ["#stalks", "#blocks-clips", "top:bone-clip"];

export default batch({

  parts: [
    /* ---------- headgear: hats ---------- */
    { ...TALL, id: "party-hat", label: "gorro de fiesta", draw: hat(partyHat) },
    // The top hat tips on every word (its own group, the shared brow lift).
    { ...TALL, id: "tophat", label: "chistera", group: "b09-tip", draw: hat(topHat) },
    { ...HAT, id: "beret", label: "boina", draw: hat(beret) },
    { ...TALL, id: "chef-hat", label: "gorro de chef", draw: hat(chefHat) },
    { ...HAT, id: "hardhat", label: "casco de obra", draw: hat(hardHat) },
    { ...HAT, id: "bucket", label: "gorro de pescador", draw: hat(bucket) },
    // The XX bucket, one part per puff colour, each at a modest weight (1 against a hat's usual 10): about a tenth of the
    // bucket's showing, the three together. Their own ids let a seed ask for one colour by name.
    { ...HAT, tags: ["blocks-band"], id: "xx-bucket-purple", label: "gorro XX morado", weight: 1, draw: hat(xxBucket(XX_PUFF.purple)) },
    { ...HAT, tags: ["blocks-band"], id: "xx-bucket-lime", label: "gorro XX lima", weight: 1, draw: hat(xxBucket(XX_PUFF.lime)) },
    { ...HAT, tags: ["blocks-band"], id: "xx-bucket-orange", label: "gorro XX naranja", weight: 1, draw: hat(xxBucket(XX_PUFF.orange)) },
    { ...HAT, id: "straw", label: "sombrero de paja", draw: hat(straw) },
    { ...HAT, id: "leaf-hat", label: "hoja", group: "sprout", draw: hat(leafHat) },
    { ...HAT, id: "propeller-cap", label: "gorra con hélice", noise: 3, tags: ["blocks-band"], draw: hat(propellerCap) },

    /* ---------- headgear: clips in the hair (crownR; the bone clip already sits there) ---------- */
    { id: "hairbow", slot: "headgear", label: "lazo", at: "crownR", socket: [72.1, 44], pair: false, excludes: CLIP_EXCLUDES, draw: hairbow },
    { id: "flower-clip", slot: "headgear", label: "margarita", at: "crownR", socket: [72.1, 44], pair: false, noise: 1, excludes: CLIP_EXCLUDES, draw: flowerClip },

    /* ---------- earwear ---------- */
    // Tops on the temples (B06's hanging ears, B05's ram horns) carry `blocks-temples` (catalogue §4.3).
    // Weight 5 (B14): where the headphones fit too, they win two times in three (the earmuffs fit nearly any head).
    { id: "earmuffs", slot: "earwear", label: "orejeras", weight: 5, excludes: ["#blocks-temples"], draw: earmuffs },

    /* ---------- eyewear (what sits on the eyes rides them: `rides: "eyes"` follows eye stalks that move) ---------- */
    { id: "sunglasses", slot: "eyewear", label: "gafas de sol", rides: "eyes", draw: sunglasses },
    { id: "monocle", slot: "eyewear", label: "monóculo", rarity: "uncommon", lod: 1, rides: "eyes", excludes: ["#many-eyes"], draw: monocle },
    { id: "goggles", slot: "eyewear", label: "gafas de aviador", rides: "eyes", excludes: ["#many-eyes"], draw: goggles },
    // Rare, and it fits nearly any face: a rare weight well under 1 (B14), or it takes most rare rolls (it was 4% of bichos).
    { id: "star-glasses", slot: "eyewear", label: "gafas de estrella", rarity: "rare", weight: 0.25, rides: "eyes", excludes: ["#many-eyes"], draw: starGlasses },
    // Every beak carries `beak`, the core one too (B08 also excludes the mustache from its side).
    { id: "mustache", slot: "eyewear", label: "bigote", excludes: ["#beak"], draw: mustache },
  ],

  css: `
    /* asleep = idle without a pastime (the mascots', the frozen figures') or the nap: the quiet pose and the pastimes stay awake */
    /* clips: the face of the clip, over the brows */
    .b09-clip path { stroke: #1b1428; stroke-width: 2.2; stroke-linejoin: round }
    .b09-clip .b09-fold { fill: none; stroke: color-mix(in oklab, var(--bx-spot), #1b1428 45%); stroke-width: 1.3; stroke-linecap: round }
    .b09-seeds circle { fill: #b0751e }

    /* hat decor */
    .b09-crease, .b09-pleat, .b09-stitch, .b09-weave { fill: none; stroke-linecap: round }
    .b09-crease { stroke: #1b1428; stroke-width: 1.4; opacity: .4 }
    .b09-pleat { stroke: #1b1428; stroke-width: 1.2; opacity: .22 }
    .b09-stitch { stroke: color-mix(in oklab, var(--bx-spot), white 55%); stroke-width: 1.1; stroke-dasharray: 2 1.8 }
    .b09-weave { stroke: #a8730f; stroke-width: 1.2; stroke-dasharray: 2.4 1.6; opacity: .75 }
    .b09-fluff { fill: color-mix(in oklab, var(--bx-belly), white 55%); opacity: .55 }

    /* the top hat tips on every word; the propeller spins while working and ticks while waiting (as the shared spin) */
    &[data-mood=speaking][data-beat=a] .pg-b09-tip { animation: bx-brow-a .34s ease-out }
    &[data-mood=speaking][data-beat=b] .pg-b09-tip { animation: bx-brow-b .34s ease-out }
    .pg-b09-prop { transform-box: fill-box; transform-origin: 50% 50% }
    &[data-mood=working] .pg-b09-prop { animation: bx-spin 1.2s linear infinite }
    &[data-mood=waiting] .pg-b09-prop { animation: bx-tick 1.3s cubic-bezier(.3,1.6,.5,1) infinite }

    /* sunglasses */
    .b09-lens { opacity: .9 }
    .b09-glare { fill: none; stroke: #fff; stroke-width: 1.8; stroke-linecap: round; opacity: .75 }
    .b09-frame { fill: none; stroke: #1b1428; stroke-width: 4.6; stroke-linejoin: round; stroke-linecap: round }
    .b09-frame-c { fill: none; stroke: var(--bx-spot); stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round }
    .b09-temple { fill: none; stroke: #1b1428; stroke-width: 2.4; stroke-linecap: round }
    .b09-shades { transition: transform .3s cubic-bezier(.3,1.4,.5,1) }
    &[data-mood=speaking][data-beat=a] .b09-shades { animation: bx-brow-a .34s ease-out }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .b09-shades { transform: translateY(var(--b09-up)) }
    &[data-mood=waiting] .b09-shades { transform: translateY(2.5px) }

    /* monocle and goggles */
    .b09-glass { fill: rgb(255 255 255 / .16) }
    .b09-goggle-glass { fill: color-mix(in oklab, #8fe3ff 34%, transparent) }
    .b09-rim-k { fill: none; stroke: #1b1428; stroke-width: 5.2 }
    .b09-rim { fill: none; stroke: var(--bx-gold); stroke-width: 2.6 }
    .b09-shine { fill: none; stroke: #fff; stroke-width: 1.8; stroke-linecap: round; opacity: .8 }
    .b09-chain-k, .b09-chain { fill: none; stroke-linecap: round; stroke-dasharray: 0 3.2 }
    .b09-chain-k { stroke: #1b1428; stroke-width: 3.4 }
    .b09-chain { stroke: var(--bx-gold); stroke-width: 1.9 }
    .b09-rivet { fill: #fff6c8 }
    .b09-strap { fill: var(--bx-spot); stroke: #1b1428; stroke-width: 2.2; stroke-linejoin: round }
    .b09-bridge-k { fill: none; stroke: #1b1428; stroke-width: 5; stroke-linecap: round }
    .b09-bridge { fill: none; stroke: var(--bx-gold); stroke-width: 2.2; stroke-linecap: round }

    /* party star glasses */
    .b09-plate { stroke: #1b1428; stroke-width: 2.4; stroke-linejoin: round }
    .b09-glitter { stroke: #fff; stroke-width: 2.2; stroke-linecap: round }
    .b09-star { transform-box: fill-box; transform-origin: 50% 50% }
    &[data-mood=speaking] .b09-star { animation: bx-twinkle 1.8s ease-in-out infinite }
    &[data-mood=working] .b09-star { animation: bx-tick 1.3s cubic-bezier(.3,1.6,.5,1) infinite }

    /* mustache: it hops with every word */
    .b09-stache-k { fill: none; stroke: #1b1428; stroke-width: 4.6; stroke-linejoin: round }
    .b09-stache-hi { fill: none; stroke: #fff; stroke-width: 1.3; stroke-linecap: round; opacity: .35 }
    &[data-mood=speaking][data-beat=a] .b09-stache { animation: bx-brow-a .34s ease-out }
    &[data-mood=speaking][data-beat=b] .b09-stache { animation: bx-brow-b .34s ease-out }
  `,
});
