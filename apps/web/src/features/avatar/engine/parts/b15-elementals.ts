import {
  LAYER, SOFT_INK, add, batch, bottomAt, centreline, clamp, darkMark, dir, ellipse, halfAt, isDarkCoat, isPaleCoat, lerp, mul, n,
  onRim, path, perp, pt, spanAt, sub, tangent, topAt, tube, unit,
  type Cmd, type Ctx, type Drawing, type Paint, type Piece, type Pt, type Rig,
} from "../bichos/kit";

/* B15 Elementals (elementales): little creatures made of an element. Fire (the llamita, moved here from the spirits with
 * its look and id, on B12's flame), water (a wave), earth (a pebble), crystal (a quartz), air (a swirl), lightning (a
 * spark), ice (a snowflake), a leaf-wisp, magma and soot (Spirited Away's susuwatari). What games do with elements, and
 * what reads at 28 px, decided the parts: Pokémon types and Pikmin read by one signature shape on the head (a flame, a
 * bolt, a crystal); Slime Rancher's rock, crystal and boom slimes are one blob plus rocks, crystals or glowing cracks;
 * Pixar's Elemental gives each element its own matter (a wave of hair, a body that steams); the soot sprites are a
 * fuzzy silhouette and two eyes.
 *
 * - Tops: a breaking wave, a crown of rocks, a crystal cluster, a floating wind swirl, a lightning bolt, ice shards, a
 *   flame made of leaves and a little crater of lava. Tops that hug the head are fitted and read its real outline
 *   (`topAt`, `onRim`): the wave and the crater continue the head (`span: "body"`), the rocks and the shards stand on it.
 *   Rigid tops (crystals, swirl, bolt, leaves) are drawn on the reference crown (60, 42) and join `crown`.
 * - Patterns (kept on the flanks and the lower body, off the face): lava cracks, crystal facets, frost and stone specks.
 * - Legs: a puddle the body rises from, a tornado it spins on and a little cloud it rides; the tornado and the cloud make
 *   the body float (its shadow shrinks and fades, `Drawing.shadow`).
 * - Tails: a lightning bolt and a tail with a flame on its tip. Back: soot fuzz all round the outline. Held: a will-o'-
 *   the-wisp, floating upright over the left hand (`rides`, `upright`).
 *
 * Moods only recombine shared keyframes, in this file's groups (`pg-b15-*`) and the documented `sub` groups:
 * - working: the element visibly at work: sparks crackle round the bolt, the rocks grind (and chips fly), the swirl spins,
 *   crystals shimmer, snow falls from the shards, leaves whirl, the lava bubbles and smokes, the tornado churns, the wave
 *   churns and bubbles, the soot fuzz buzzes. Particles are stage-only props (`prop-work`), drawn from the part
 *   (`overBox`), each animated with `bx-puff`, `bx-sweat` or `bx-twinkle`.
 * - waiting: a cheerful alert: tops pop (`bx-pop`), the wisp and the cloud bob.
 * - idle: dimmed and asleep: glows go low (lava cracks, the crater, the wisp), the bolt and the wave droop, the swirl
 *   settles, ice and frost frost over (a rime layer only shown asleep).
 * Translucent sheens, glows and the asleep-only rime sit in `sub` groups this file styles with opacity, so they move with
 * their part. */

type P = Pt;

/* ---------- fixed colours (an element keeps its colour on any coat) ---------- */

const WHITE = "#ffffff";
/** Ice: a pale cyan, shaded like any role; its facets and rime are white. */
const ICE = "#d3f1fd";
/** Lava: orange round a gold core, with the flame's hot white-yellow in the middle (B12's flame core). */
const LAVA = "#ff7a2f";
const HOT = "#fff1b8";
/** A cloud's white, a breath off pure white so the shade still shows. */
const CLOUD = "#f2f5fc";

/* ---------- small shape helpers (the shared geometry is the kit's) ---------- */

const poly = (pts: P[]) => `M${pts.map(pt).join("L")}Z`;
const line = (pts: P[]) => `M${pts.map(pt).join("L")}`;

/** A pointed blade along a centreline: no width at either end, `w(t)` either side (leaves, shards, flame tongues). */
function blade(c: P[], w: (t: number) => number): string {
  const m = c.length - 1, left: P[] = [], right: P[] = [];
  c.forEach((p, i) => { const v = perp(tangent(c, i)), r = w(i / m); left.push(add(p, mul(v, r))); right.push(sub(p, mul(v, r))); });
  return poly([...left, ...right.reverse()]);
}

/** Points round an ellipse, from angle a0 to a1 (degrees clockwise from up). */
function arcPts(c: P, rx: number, ry: number, a0: number, a1: number, count = 24): P[] {
  return Array.from({ length: count + 1 }, (_, i) => { const d = dir(a0 + ((a1 - a0) * i) / count); return [c[0] + d[0] * rx, c[1] + d[1] * ry] as P; });
}

/** A rounded little flame tongue standing on `base`, `h` tall and `w` wide, leaning `lean` (a teardrop with a point). */
function tongue(base: P, h: number, w: number, lean = 0): string {
  const [x, y] = base, tip: P = [x + lean, y - h];
  return `M${pt(tip)}C${n(x + w * 0.9)} ${n(y - h * 0.55)} ${n(x + w)} ${n(y - h * 0.12)} ${n(x)} ${n(y)}C${n(x - w)} ${n(y - h * 0.12)} ${n(x - w * 0.9)} ${n(y - h * 0.55)} ${pt(tip)}Z`;
}

/** A four-point twinkle (a sparkle) of radius r. */
function twinkle([x, y]: P, r: number): string {
  const k = r * 0.28;
  return `M${n(x)} ${n(y - r)}Q${n(x + k)} ${n(y - k)} ${n(x + r)} ${n(y)}Q${n(x + k)} ${n(y + k)} ${n(x)} ${n(y + r)}Q${n(x - k)} ${n(y + k)} ${n(x - r)} ${n(y)}Q${n(x - k)} ${n(y - k)} ${n(x)} ${n(y - r)}Z`;
}

/** A little snowflake: three crossed strokes with forks. */
function snowflake([x, y]: P, r: number): string {
  let d = "";
  for (const a of [0, 60, 120]) {
    const u = dir(a), e1 = add([x, y], mul(u, r)), e2 = sub([x, y], mul(u, r));
    d += `M${pt(e1)}L${pt(e2)}`;
    for (const [e, s] of [[e1, 1], [e2, -1]] as [P, number][]) {
      const back = sub(e, mul(u, s * r * 0.42)), side = mul(perp(u), r * 0.3);
      d += `M${pt(add(back, side))}L${pt(sub(e, mul(u, s * r * 0.12)))}L${pt(sub(back, side))}`;
    }
  }
  return d;
}

/** A small zigzag spark (a bit of lightning), from `a` towards `b`. */
function spark(a: P, b: P): string {
  const v = sub(b, a), u = perp(unit(v)), l = Math.hypot(v[0], v[1]);
  return line([a, add(lerp(a, b, 0.4), mul(u, l * 0.22)), add(lerp(a, b, 0.6), mul(u, -l * 0.22)), b]);
}

/* ---------- the head: fitted tops scale with it ---------- */

/** Where a fitted top sits: the head's real top over x = 60 and a scale from its width just below (B12's flame does the
 * same), so a top drawn round (0, 0), y up negative, fits a narrow tip or a broad dome. */
function headFrame(rig: Rig, sink = 3) {
  const top = topAt(rig, 60), w = halfAt(rig, top + 8);
  const k = clamp(w / 18.5, 0.72, 1.15), y0 = top + sink * k;
  return { top, k, y0, map: ([x, y]: P): P => [60 + x * k, y0 + y * k], at: (x: number, y: number): P => [60 + x * k, y0 + y * k] };
}

/** The face, for patterns that keep off it: a band round the eyes (with room for the brows) and a box round the shut
 * mouth. Thin paint under the mouth may run on below it: the open mouth is drawn over it (as over B12's bee bands). The
 * flanks beside the mouth stay free. */
function faceBox(ctx: Ctx) {
  const { rig } = ctx, eyes = ctx.eyes.length ? ctx.eyes : [{ x: 60 - rig.spread, y: rig.eyeY, r: 8 }, { x: 60 + rig.spread, y: rig.eyeY, r: 8 }];
  const x0 = Math.min(...eyes.map((e) => e.x - e.r)) - 3, x1 = Math.max(...eyes.map((e) => e.x + e.r)) + 3;
  const y0 = Math.min(...eyes.map((e) => e.y - e.r)) - 6, y1 = Math.max(...eyes.map((e) => e.y + e.r)) + 3;
  const m0 = rig.at.mouth.y - 6, m1 = rig.at.mouth.y + 6, mw = 13.5;
  const has = ([x, y]: P, m = 0) => (x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m) || (Math.abs(x - 60) < mw + m && y > m0 - m && y < m1 + m);
  return { y1, has };
}

/** Is a point inside the body, `m` units in from its outline? */
function inside(rig: Rig, [x, y]: P, m = 0): boolean {
  const s = spanAt(rig, y);
  return !!s && x > s[0] + m && x < s[1] - m && y > topAt(rig, x) + m && y < bottomAt(rig, x) - m;
}

/* ---------- tops ---------- */

/** The wave: a crest rising from the back of the head and breaking forward to the left, its lip curled over, foam on the
 * crest and two drops of spray off the lip. It continues the head (the body's colour, shaded across the body's box), and
 * a curl line shows the barrel. Drawn round the head's top (0, 0). */
const WAVE: Cmd[] = [
  ["M", [17, 9]], ["C", [22, -4], [21.4, -20], [12.4, -29.4]], ["C", [4, -37.6], [-10.6, -38.4], [-18.6, -31]],
  ["C", [-24.6, -25.4], [-25.4, -15.6], [-20.4, -10.6]], ["C", [-17, -7.6], [-12.8, -8.8], [-12.2, -12.8]],
  // the hollow under the lip: up the inside of the curl, over the barrel and down its back wall to the head
  ["C", [-11.4, -17.2], [-7, -19.6], [-3.6, -17.4]], ["C", [-0.6, -15.2], [-0.4, -9], [-2.6, -4.6]], ["C", [-4.4, -1], [-6, 3], [-6.4, 9]], ["Z"],
];
const WAVE_CURL: Cmd[] = [["M", [-17.4, -20.4]], ["C", [-16.8, -28.4], [-6.4, -32.4], [1.6, -28]], ["C", [8, -24.4], [9, -15], [4.4, -10.4]]];
const WAVE_FOAM: [number, number, number][] = [[-21.8, -16.4, 3.2], [-22.4, -24.2, 3.4], [-16.6, -30.8, 3.4], [-8.4, -34.6, 3]];
const WAVE_SPRAY: [number, number, number][] = [[-28.4, -21, 2.2], [-27.4, -12.6, 1.6]];

function wave(ctx: Ctx): Drawing {
  const { map, at, k } = headFrame(ctx.rig, 3);
  const pieces: Piece[] = [
    { d: path(WAVE, map), c: "body", span: "body" },
    ...WAVE_FOAM.map(([x, y, r]): Piece => ({ d: ellipse(...at(x, y), r * k, r * k), c: WHITE })),
    { d: path(WAVE_CURL, map), c: "belly", w: 2.1, ink: "inner", flat: true, lod: 1 },
    ...WAVE_SPRAY.map(([x, y, r]): Piece => ({ d: tongue(at(x, y + r), r * 2.6 * k, r * k, 0.6 * k), c: "body", sub: "flick", pivot: at(x, y), lod: 1 })),
  ];
  // Working: bubbles rise off the crest (stage-only props).
  const b = (x: number, y: number, r: number) => `<circle cx="${n(at(x, y)[0])}" cy="${n(at(x, y)[1])}" r="${n(r * k)}"/>`;
  return { pieces, pivot: at(0, 6), overBox: `<g class="prop-work b15-bubbles">${b(14, -32, 2.6)}${b(22, -24, 1.8)}${b(7, -40, 1.6)}</g>` };
}

/** The rock crown: three chunky dark stones sitting on the head's real top, the middle one biggest, each a little different
 * per bicho; a lit face on each and a crack on the big one at stage. While working they grind against each other and
 * chips fly. */
function rockCrown(ctx: Ctx): Drawing {
  const { rig } = ctx, r = ctx.rng("b15-rocks"), k = clamp(rig.faceHalf / 30, 0.75, 1.1);
  // Dark stones with a lit face; on a dark coat (where the dark role sinks into the ink) the coat itself, lit by the belly.
  const [stone, lit]: Paint[] = isDarkCoat(ctx.spec) ? ["body", "belly"] : ["dark", "body"];
  const stones: [number, number, number, string][] = [[-14.5, 12.5, 13, "b15-grind-a"], [0.5, 16.5, 19.5, "b15-grind-b"], [15, 12, 12.5, "b15-grind-a"]];
  const pieces: Piece[] = [], chips: string[] = [];
  stones.forEach(([dx, w0, h0, g], i) => {
    const x = 60 + dx * k, w = w0 * k * (1 + r.range(-0.08, 0.08)), h = h0 * k * (1 + r.range(-0.1, 0.1));
    const base = topAt(rig, x) + 3 * k, j = () => r.range(-0.9, 0.9) * k;
    const pts: P[] = [
      [x - w / 2, base + 2], [x - w / 2 - 1 + j(), base - h * 0.5], [x - w * 0.2 + j(), base - h + j() * 0.5],
      [x + w * 0.26 + j(), base - h * 0.93], [x + w / 2 + j(), base - h * 0.44], [x + w / 2 - 0.4, base + 2],
    ];
    const pivot: P = [x, base], mid: P = [x + w * 0.04, base - h * 0.5];
    pieces.push({ d: poly(pts), c: stone, sub: g, pivot });
    // The lit face, so each stone reads as a faceted chunk.
    pieces.push({ d: poly([pts[1], pts[2], pts[3], lerp(pts[3], pts[4], 0.45), lerp(mid, pts[2], 0.3)]), c: lit, ink: "inner", sub: g, pivot });
    if (i === 1) pieces.push({ d: line([lerp(pts[2], pts[3], 0.55), [x + w * 0.02, base - h * 0.72], [x + w * 0.12, base - h * 0.58]]), c: darkMark(ctx.spec, SOFT_INK, "dark"), w: 1.3, ink: "inner", flat: true, sub: g, pivot, lod: 2 });
    // Chips knocked off where the stones grind together (stage-only, while working).
    if (i < 2) { const cx = x + w * 0.5 + 1.6 * k, cy = base - h * 0.7; chips.push(poly([[cx - 2.2, cy + 1.2], [cx - 0.6, cy - 2.4], [cx + 2.4, cy - 1], [cx + 1.4, cy + 2]])); }
  });
  const dust = (x: number, y: number) => `<circle cx="${n(x)}" cy="${n(y)}" r="2.2"/>`;
  const head = topAt(rig, 60);
  return { pieces, overBox: `<g class="prop-work b15-chips">${chips.map((d) => `<path d="${d}"/>`).join("")}${dust(60 - 22 * k, head - 4)}</g>` };
}

/** The crystal cluster: three pointed prisms, the tall one in the middle, the spot colour with a white ridge and a
 * translucent sheen on their lit faces, a glint on the tall one. They shimmer while working (sparkles twinkle round
 * them), pop while waiting. Drawn on the reference crown (60, 42). */
function prism(base: P, deg: number, w: number, h: number) {
  const u = dir(deg), v = perp(u), at = (a: number, b: number): P => add(base, add(mul(v, a), mul(u, b)));
  const tip = w * 0.85;
  return {
    d: poly([at(-w / 2, -2), at(-w / 2, h - tip), at(0, h), at(w / 2, h - tip), at(w / 2, -2)]),
    face: poly([at(-w / 2, -2), at(-w / 2, h - tip), at(0, h), at(-w * 0.12, h - tip), at(-w * 0.12, -2)]),
    ridge: line([at(-w * 0.12, 3), at(-w * 0.12, h - tip), at(0, h - 0.6)]),
    glint: at(-w * 0.28, h - tip - 2.4),
  };
}
const GEMS = [prism([50.6, 47.5], -30, 8.4, 19), prism([69.6, 47.5], 26, 8.8, 21), prism([60, 46], 0, 11, 30)];
const GEM_SPARKS: P[] = [[44, 26], [77, 22], [67, 10]];

/** The wind swirl: a ribbon of air curling into a spiral, floating just over the head; it spins while working. */
const SWIRL_C: P = [60, 22.5];
const SWIRL = (() => {
  const pts: P[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const t = i / 60, a = 200 + t * 560, r = 2 + t * 12.2;
    pts.push(add(SWIRL_C, mul(dir(a), r)));
  }
  return tube(centreline(pts, 60), (t) => 1.4 + 2.9 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7));
})();
const SWIRL_TAILS = "M41.6 31.2Q36.4 29.6 33.8 25.2M78.4 18.6Q83.6 20.4 86 24.8";

/** The lightning bolt: a gold zigzag standing on the crown, a white glint. Sparks crackle round it while working. */
const BOLT = poly([[53.6, 46], [57.8, 30.6], [52.4, 31.6], [60.6, 11.2], [67.8, 26.6], [62.4, 26.2], [67.4, 46]]);
const BOLT_GLINT = "M56.6 27.2L59.8 18.4";
const BOLT_SPARKS: [P, P][] = [[[46, 22], [40, 15]], [[73, 14], [80, 8]], [[75, 32], [83, 30]], [[44, 36], [37, 37]]];

/** Ice shards: a crown of jagged shards fanning out of the head's real top, icy cyan with a white ridge and a sheen;
 * asleep a white rime frosts their bases over. Snow falls from them while working. */
function iceShards(ctx: Ctx): Drawing {
  const { rig } = ctx, k = clamp(rig.faceHalf / 30, 0.75, 1.1), r = ctx.rng("b15-ice");
  const fan: [number, number, number][] = [[-40, 11, 3.6], [-19, 17, 4.2], [2, 22, 4.6], [22, 16, 4.1], [41, 10.5, 3.5]];
  const pieces: Piece[] = [], snow: string[] = [];
  const pivot: P = [60, topAt(rig, 60) + 4];
  for (const [deg, l0, w0] of fan) {
    const { p, nrm } = onRim(rig, deg), u = unit(lerp(nrm, [0, -1], 0.45)), v = perp(u);
    const l = l0 * k * (1 + r.range(-0.08, 0.08)), w = w0 * k, kink = r.range(-1, 1) * k;
    const base = sub(p, mul(u, 3.5 * k)), at = (a: number, b: number): P => add(base, add(mul(v, a), mul(u, b)));
    const shard = poly([at(-w, 0), at(-w * 0.8 + kink * 0.3, l * 0.55), at(kink * 0.4, l + 3.5 * k), at(w * 0.7 + kink * 0.3, l * 0.5), at(w, 0)]);
    pieces.push({ d: shard, c: ICE });
    pieces.push({ d: poly([at(-w, 0), at(-w * 0.8 + kink * 0.3, l * 0.55), at(kink * 0.4, l + 3.5 * k), at(-w * 0.12, l * 0.5), at(-w * 0.2, 0)]), c: WHITE, ink: "inner", flat: true, sub: "b15-sheen" });
    pieces.push({ d: line([at(-w * 0.16, 2), at(-w * 0.12, l * 0.5), at(kink * 0.4, l + 2.6 * k)]), c: WHITE, w: 1.1, ink: "inner", flat: true, lod: 1 });
    // Rime: a white crust over the shard's lower half, only shown asleep.
    pieces.push({ d: poly([at(-w - 0.4, -0.5), at(-w * 0.9, l * 0.3), at(-w * 0.3, l * 0.22), at(w * 0.1, l * 0.36), at(w * 0.55, l * 0.24), at(w + 0.4, -0.5)]), c: WHITE, ink: "inner", flat: true, sub: "b15-rime", pivot, lod: 1 });
    snow.push(`<path d="${snowflake(add(at(0, l + 6 * k), mul(v, 3)), 2.6 * k)}"/>`);
  }
  return { pieces, overBox: `<g class="prop-work b15-snow">${snow.slice(0, 4).join("")}</g>`, pivot };
}

/** The leaf flame: five leaves fanned like the tongues of a fire, leaning out and turning up at the tips, the colours
 * alternating; it droops asleep, sways while talking and perks up while waiting (the shared `sprout`). Leaves whirl off
 * it while working. Drawn on the reference crown (60, 42). */
const LEAVES = ([[-66, 18, 5, -1], [-34, 28, 6.8, -1], [4, 38, 8, 0.5], [36, 27, 6.6, 1], [66, 17, 4.8, 1]] as [number, number, number, number][]).map(([deg, l, w, s]) => {
  // Each leaf leaves the crown leaning out and turns up towards its tip (s: which way), like a tongue of fire.
  const base: P = [60 + deg * 0.08, 46], pts: P[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8, d = dir(deg - s * 44 * t * t);
    pts.push(add(i ? pts[i - 1] : base, i ? mul(d, l / 8) : [0, 0]));
  }
  const c = centreline(pts, 24);
  return { d: blade(c, (t) => w * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.96 + 0.04)), 0.75) * (t < 0.08 ? 0.6 + t * 5 : 1)), rib: line(c.slice(3, 19)) };
});
/** Two little leaves that whirl off it while working (stage-only props). */
const LEAF_BITS = [blade(centreline([[36, 30], [32, 27], [29, 22]], 10), (t) => 2.2 * Math.sin(Math.PI * t)), blade(centreline([[82, 36], [87, 33], [89, 28]], 10), (t) => 2 * Math.sin(Math.PI * t))];

/** The crater: the head rises into a little volcano, a dark lip round a pool of glowing lava, a bubble on it and a
 * drip down the front. While working the bubble pops and smoke rises; asleep the lava burns low. Drawn round the head's
 * top (0, 0). */
const CRATER: Cmd[] = [["M", [-20, 9]], ["C", [-18, 0], [-15.6, -7.4], [-13, -12.6]], ["L", [13, -12.6]], ["C", [15.6, -7.4], [18, 0], [20, 9]], ["Z"]];
const CRATER_DRIP: Cmd[] = [["M", [2.4, -10]], ["C", [3.6, -7.4], [4.2, -6], [4.4, -4.4]], ["C", [4.6, -1.4], [8.8, -1.4], [8.8, -4.4]], ["C", [8.8, -6.4], [9.4, -8], [10.6, -10]], ["Z"]];

function crater(ctx: Ctx): Drawing {
  const { map, at, k } = headFrame(ctx.rig, 4.5);
  const lip = (rx: number, ry: number, dy = 0) => ellipse(...at(0, -12.6 + dy), rx * k, ry * k);
  const bubble = at(-3.8, -19.2);
  const smoke = (x: number, y: number, r: number) => `<circle cx="${n(at(x, y)[0])}" cy="${n(at(x, y)[1])}" r="${n(r * k)}"/>`;
  return {
    pieces: [
      { d: path(CRATER, map), c: "body", span: "body" },
      { d: lip(13.8, 4.9), c: darkMark(ctx.spec, "dark", "belly") },
      { d: lip(11, 3.3, 0.5), c: LAVA, ink: "inner", sub: "b15-glow" },
      { d: lip(6, 1.5, 0.5), c: HOT, ink: "inner", flat: true, sub: "b15-glow", lod: 1 },
      { d: path(CRATER_DRIP, map), c: LAVA, ink: "inner", stroke: 1.6, sub: "b15-glow" },
      { d: ellipse(...bubble, 3.8 * k, 3.6 * k), c: LAVA, sub: "b15-bubble", pivot: add(bubble, [0, 3.6 * k]) },
      { d: ellipse(bubble[0] - 1.1 * k, bubble[1] - 1.1 * k, 1 * k, 0.8 * k), c: HOT, ink: "inner", flat: true, sub: "b15-bubble", pivot: add(bubble, [0, 3.6 * k]), lod: 1 },
    ],
    overBox: `<g class="prop-work b15-smoke">${smoke(-7, -28, 4.4)}${smoke(3, -35, 3.4)}${smoke(-2, -42, 2.6)}</g>`,
  };
}

/* ---------- patterns ---------- */

/** Lava cracks: glowing seams, orange round a gold core: an uneven crack across the lower body with short branches, and
 * shorter ones in from the upper head and the flanks where there is room (never into the face, never under the arms).
 * They flicker while working and burn low asleep. */
function lavaCracks(ctx: Ctx): Drawing {
  const { rig } = ctx, r = ctx.rng("b15-lava"), face = faceBox(ctx), k = clamp(rig.half / 32, 0.8, 1.15);
  // The arms cover the flanks from a little over the shoulder down: seams there would hide under them.
  const arms = ([x, y]: P) => ctx.has("arms") && y > rig.armY - 4 && y < rig.armY + 10 && Math.abs(x - 60) > halfAt(rig, y) - 6;
  const runs: P[][] = [];
  // A seam across the lower body, under the shut mouth (the open mouth is drawn over its middle), zigzagging from flank
  // to flank, with a few short branches.
  const ys = Math.min(rig.bottom - 7, Math.max(rig.at.mouth.y + 8, (rig.at.mouth.y + 6 + rig.bottom) / 2));
  const hs = halfAt(rig, ys) - 2.6;
  if (hs > 10) {
    // Uneven joints: not a stitch, a crack (the step and the swing vary, and now and then it runs on the same way).
    const count = Math.max(4, Math.round((2 * hs) / (6.4 * k))), seam: P[] = [];
    let side = 1, drift = 0;
    for (let i = 0; i <= count; i += 1) {
      side = r.chance(0.72) ? -side : side;
      drift = clamp(drift + r.range(-1, 1), -1.6, 1.6);
      const x = 60 - hs + (2 * hs * i) / count + (i && i < count ? r.range(-1.4, 1.4) * k : 0);
      seam.push([x, ys + (drift + side * r.range(0.6, 2.4)) * k]);
    }
    runs.push(seam);
    for (const i of [1, Math.floor(count / 2) + 1, count - 1]) {
      const from = seam[i], to = add(from, [r.range(-2, 2) * k, (i % 2 ? -1 : 1) * 4.6 * k]);
      if (inside(rig, to, 2.5) && !face.has(to, 1) && !arms(to)) runs.push([from, to]);
    }
  }
  for (const deg of [-44, 46, -128, 132]) {
    const a = deg + r.range(-6, 6), { p, nrm } = onRim(rig, a);
    let at = sub(p, mul(nrm, 2.6));
    if (arms(at) || face.has(at, 2)) continue;
    const run: P[] = [at], inward = mul(nrm, -1);
    for (let i = 0; i < 4; i += 1) {
      const step = add(mul(inward, (4.2 + r.range(0, 2)) * k), mul(perp(inward), (i % 2 ? 1 : -1) * r.range(1.6, 3.2) * k));
      const next = add(at, step);
      if (face.has(next, 2) || !inside(rig, next, 2.5) || arms(next)) break;
      run.push(next); at = next;
    }
    if (run.length < 2) continue;
    runs.push(run);
    if (run.length < 3) continue;
    // One fork off the second joint.
    const f = run[1], fd = add(mul(inward, 3.6 * k), mul(perp(inward), (r.chance(0.5) ? 1 : -1) * 4 * k)), tip = add(f, fd);
    if (!face.has(tip, 2) && inside(rig, tip, 2.5)) runs.push([f, tip]);
  }
  const d = runs.map(line).join("");
  return {
    pieces: [
      { d, c: LAVA, w: 3.6, ink: "inner", flat: true, layer: LAYER.skin, sub: "b15-glow" },
      { d, c: "gold", w: 1.5, ink: "inner", flat: true, layer: LAYER.skin, sub: "b15-glow", lod: 1 },
    ],
  };
}

/** Crystal facets: the edge cut into planes (up to two kites per side), a translucent sheen on the upper plane of each;
 * the lines in the belly colour. Off the face (a kite with no room is left out). */
function facets(ctx: Ctx): Drawing {
  const { rig } = ctx, face = faceBox(ctx);
  const lines: string[] = [], sheens: string[] = [];
  const depth = clamp(rig.half * 0.28, 6.5, 9.5);
  // Kites cut along the edge: three points on the outline and one inside, the upper plane catching the light.
  for (const s of [-1, 1]) for (const [d0, d1, d2] of [[56, 80, 102], [112, 136, 160]]) {
    const A = onRim(rig, s * d0), B = onRim(rig, s * d1), C = onRim(rig, s * d2);
    const a = sub(A.p, mul(A.nrm, 1.4)), b = sub(B.p, mul(B.nrm, 1.4)), c = sub(C.p, mul(C.nrm, 1.4));
    const I = sub(B.p, mul(B.nrm, depth));
    if (face.has(I, 1.5) || !inside(rig, I, 3)) continue;
    lines.push(line([a, I, c]), line([I, b]));
    sheens.push(poly([a, I, b]));
  }
  return {
    pieces: [
      { d: sheens.join(""), c: WHITE, ink: "inner", flat: true, layer: LAYER.skin, sub: "b15-sheen" },
      { d: lines.join(""), c: isPaleCoat(ctx.spec) ? "dark" : "belly", w: 1.4, ink: "inner", flat: true, layer: LAYER.skin, lod: 1 },
    ],
  };
}

/** Frost: a white rime in round scallops along the outer lower flanks, clipped to the body, and two little snowflakes at
 * stage; asleep a deeper rime runs round the whole base and caps the head (shown only then: frosting over). */
function frost(ctx: Ctx): Drawing {
  const { rig } = ctx, r = ctx.rng("b15-frost"), k = clamp(rig.half / 32, 0.8, 1.15), face = faceBox(ctx);
  // A drift of snow along the outline: its inner edge in round scallops (`bumps` of them), a little uneven.
  const crust = (from: number, to: number, depth: [number, number], bumps: number) => {
    const outer: P[] = [], inner: P[] = [], count = bumps * 8, lift = Array.from({ length: bumps }, () => r.range(0.8, 1.15));
    for (let i = 0; i <= count; i += 1) {
      const t = i / count, { p, nrm } = onRim(rig, from + (to - from) * t), b = Math.min(bumps - 1, Math.floor(t * bumps));
      outer.push(add(p, mul(nrm, 3)));
      const ends = Math.min(1, t * 6, (1 - t) * 6);
      inner.push(sub(p, mul(nrm, (depth[0] + (depth[1] - depth[0]) * Math.sqrt(Math.abs(Math.sin(Math.PI * t * bumps))) * lift[b]) * k * ends)));
    }
    return poly([...outer, ...inner.reverse()]);
  };
  const flakes = ([[-1, 0.7], [1, 0.62]] as [number, number][]).map(([s, f]): string => {
    const y = lerp([0, face.y1], [0, rig.bottom], 0.35)[1], h = halfAt(rig, y), at: P = [60 + s * h * f, y - 4];
    return inside(rig, at, 4) && !face.has(at, 2) ? snowflake(at, 2.6) : "";
  }).join("");
  // Rime along the outer flanks (a white edge right under the mouth would read as teeth), joined asleep by a deeper rime
  // that runs round the whole base and caps the head. White shows on any coat but a pale one that isn't blue (a white
  // yeti, a pink one): there the awake rime is a pale ice blue.
  const { hue, sat } = ctx.spec.color, icy = isPaleCoat(ctx.spec) && !(hue >= 165 && hue <= 235 && sat >= 25);
  return {
    pieces: [
      { d: crust(92, 170, [1.6, 5.4], 5) + crust(190, 268, [1.6, 5.4], 5), c: icy ? "#bfe6fa" : "#eef9ff", ink: "inner", flat: true, clip: true, layer: LAYER.skin },
      { d: flakes, c: WHITE, w: 1.1, ink: "inner", flat: true, layer: LAYER.skin, lod: 2 },
      { d: crust(112, 248, [3, 8.5], 9) + crust(-54, 54, [2, 5.5], 6), c: WHITE, ink: "inner", flat: true, clip: true, layer: LAYER.skin, sub: "b15-rime" },
    ],
  };
}

/** Stone specks: granite grains on the flanks and the lower body (little dark chips and light flecks), and one hairline
 * crack; never on the face. */
function specks(ctx: Ctx): Drawing {
  const { rig } = ctx, r = ctx.rng("b15-specks"), face = faceBox(ctx);
  const dark: string[] = [], light: string[] = [];
  for (let i = 0, made = 0; i < 80 && made < 14; i += 1) {
    const p: P = [r.range(60 - rig.half, 60 + rig.half), r.range(rig.top + 6, rig.bottom - 4)];
    if (!inside(rig, p, 4) || face.has(p, 3)) continue;
    const s = r.range(0.9, 1.7), a = r.range(0, 120);
    const tri = poly([0, 120, 240].map((d): P => add(p, mul(dir(a + d), s * (d ? 1 : 1.3)))));
    (made % 3 === 2 ? light : dark).push(tri);
    made += 1;
  }
  return {
    pieces: [
      { d: dark.join(""), c: darkMark(ctx.spec, SOFT_INK, "dark"), ink: "inner", flat: true, layer: LAYER.skin },
      { d: light.join(""), c: "belly", ink: "inner", flat: true, layer: LAYER.skin, lod: 1 },
    ],
  };
}

/* ---------- legs ---------- */

/** Legs that make a standing body float: its shadow shrinks and fades like the floating dome's; a body that floats
 * already (`#floats`) keeps its own. */
const floating = (ctx: Ctx): Drawing => (ctx.has("#floats") ? {} : { shadow: { rx: n(ctx.rig.half * 0.53), ry: 3.6, opacity: 0.75 } });

/** The puddle: the body rises out of a pool of itself on the ground (merged, so they read as one), with ripple rings
 * that breathe while talking, waiting and working. */
function puddle(ctx: Ctx): Drawing {
  const { rig } = ctx, g = rig.at.ground.y, yb = rig.bottom - 7, hb = Math.max(8, halfAt(rig, yb) - 0.6);
  const rx = Math.max(hb + 12, rig.half * 0.98), ry = 4.8, cy = g - 3.4, r = ctx.rng("b15-puddle");
  // The base flares out into the pool like a drop that has just landed; the pool's rim wobbles a little.
  const wob = () => r.range(-0.7, 0.7);
  const d = `M${n(60 - hb)} ${n(yb)}C${n(60 - hb)} ${n(yb + 6)} ${n(60 - rx + 7)} ${n(cy - ry - 1)} ${n(60 - rx)} ${n(cy + wob())}`
    + `C${n(60 - rx - 1)} ${n(cy + ry * 0.9)} ${n(60 - rx * 0.5)} ${n(cy + ry + wob())} ${n(60)} ${n(cy + ry)}`
    + `C${n(60 + rx * 0.5)} ${n(cy + ry + wob())} ${n(60 + rx + 1)} ${n(cy + ry * 0.9)} ${n(60 + rx)} ${n(cy + wob())}`
    + `C${n(60 + rx - 7)} ${n(cy - ry - 1)} ${n(60 + hb)} ${n(yb + 6)} ${n(60 + hb)} ${n(yb)}Z`;
  // Ripples on the pool either side of the body, and a glint on the near rim.
  const ripple = (s: number) => line(arcPts([60 + s * (hb + (rx - hb) * 0.5), cy + 0.6], (rx - hb) * 0.36, 1.7, s * 60, s * 160, 8));
  const pivot: P = [60, cy];
  return {
    pieces: [
      { d, c: "body", span: "body" },
      { d: ripple(-1) + ripple(1), c: "belly", w: 1.4, ink: "inner", flat: true, sub: "b15-ripple", pivot, lod: 1 },
      { d: line(arcPts([60, cy], rx * 0.82, ry * 0.7, 212, 238, 6)), c: WHITE, w: 1.3, ink: "inner", flat: true, lod: 2 },
    ],
    shadow: { rx: n(rx + 2), ry: 5.4, opacity: 0.55 },
  };
}

/** The tornado: the body's base turns into a funnel of wind, bands narrowing to a tip that curls aside just off the
 * ground (merged, the body's colour), and two gusts blow across the lower body, each ending in a curl (white strokes with
 * an ink edge, under the arms; stage only). Alternate bands and gusts sway against each other, faster while working; asleep the
 * gusts die down. */
function tornado(ctx: Ctx): Drawing {
  const { rig } = ctx, k = clamp(rig.half / 33, 0.8, 1.1), yb = rig.bottom - 6, g = rig.at.ground.y;
  const w0 = Math.min(halfAt(rig, yb) - 1, rig.half * 0.66), span = Math.max(11, g - yb);
  // Bands from the top down: where each starts (along the span), its half width, its offset and its height.
  const bands: [number, number, number, number][] = [[0, 0.8, 0, 0.4], [0.3, 0.56, 3, 0.32], [0.54, 0.36, 7, 0.26], [0.74, 0.2, 11, 0.2]];
  const pieces: Piece[] = [];
  bands.forEach(([t, wf, dx, hf], i) => {
    const h = Math.max(2.4, span * hf * 0.58), cy = yb + span * t + h, w = Math.max(3, w0 * wf), x = 60 + dx * k;
    const g2 = i % 2 ? "b15-twist-b" : "b15-twist-a", pivot: P = [60, yb + span * t];
    pieces.push({ d: ellipse(x, cy, w, h), c: "body", span: "body", g: g2, pivot });
  });
  // The gusts: a stroke of wind in from past one side, across the lower body, ending in a curl.
  for (const [f, s] of [[0.15, 1], [0.75, -1]] as [number, number][]) {
    const y = lerp([0, rig.at.mouth.y + 7], [0, rig.bottom - 3], f)[1], h = halfAt(rig, y);
    const x0 = 60 - s * (h + 4), x1 = 60 + s * h * 0.32, rc = 3 * k, c: P = [x1, y - rc];
    const pts: P[] = [[x0, y + 1.6], [(x0 + x1) / 2, y + 1.4], [x1, y]];
    for (let i = 1; i <= 7; i += 1) pts.push(add(c, mul(dir(180 - s * i * 42), rc * (1 - i * 0.07))));
    const d = line(centreline(pts, 28)), g2 = s > 0 ? "b15-gust-a" : "b15-gust-b", pivot: P = [60, y];
    pieces.push({ d, c: "ink", w: 4.4, ink: "inner", flat: true, layer: LAYER.skin, g: g2, pivot, lod: 2 });
    pieces.push({ d, c: WHITE, w: 1.9, ink: "inner", flat: true, layer: LAYER.skin, g: g2, pivot, lod: 2 });
  }
  return { pieces, ...floating(ctx) };
}

/** The cloud: the body rides a little white cloud wrapped round its base (puffs merged into the outline), which bobs
 * while talking and waiting, shivers while working and sags a little asleep. */
function cloudBase(ctx: Ctx): Drawing {
  const { rig } = ctx, k = clamp(rig.half / 32, 0.85, 1.15), y = rig.bottom + 1.5, w = Math.max(halfAt(rig, rig.bottom - 6) + 4, 20 * k);
  // Enough puffs that they always overlap (a wide body gets more, not bigger gaps), the middle ones biggest and highest.
  const count = clamp(Math.round(w / 8.5), 5, 8), step = (2.16 * w) / (count - 1);
  const ds = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1), mid = Math.sin(Math.PI * t), x = 60 - 1.08 * w + step * i;
    const r0 = Math.max(6.4 * k, step * (0.62 + 0.18 * mid)) * (i % 2 ? 1.06 : 1), dy = (0.5 - 1.05 * mid) * 4 * k + (i % 2 ? -0.8 : 0.6);
    return ellipse(x, y + dy, r0, r0 * 0.86);
  });
  const pivot: P = [60, y], f = { sub: "b15-cloud", pivot };
  // Behind the body, merged (the silhouette); then over its base: every puff with an ink edge, and every puff again
  // without one, so only the cloud's outer edge keeps its line (the fills hide where the puffs overlap).
  const pieces: Piece[] = [
    ...ds.map((d): Piece => ({ d, c: CLOUD, ...f })),
    ...ds.map((d): Piece => ({ d, c: CLOUD, ink: "inner", stroke: 3, layer: LAYER.skin, ...f })),
    ...ds.map((d): Piece => ({ d, c: CLOUD, ink: "inner", layer: LAYER.skin, ...f })),
    { d: line([[60 - w * 0.62, y - 3 * k], [60 - w * 0.3, y - 5.6 * k]]), c: WHITE, w: 1.6, ink: "inner", flat: true, layer: LAYER.skin, ...f, lod: 2 },
  ];
  return { pieces, shadow: { rx: n(w * 0.95), ry: 3.6, opacity: 0.7 } };
}

/* ---------- tails (rump, reference body) ---------- */

/** The bolt tail: a zigzag of lightning out of the rump, gold, with a white glint. */
const BOLT_TAIL = poly([[76.6, 89.4], [88.6, 84.2], [85.2, 79.4], [98.6, 71.6], [95, 66.6], [109.6, 55.2], [102.2, 70.8], [105.8, 74], [92, 82.6], [95.8, 87], [79.6, 98]]);
const BOLT_TAIL_GLINT = "M88.6 80.2L96.2 75.4";

/** The ember tail: a tapering tail curving up behind the body, ending in a little flame that flickers on its own. */
const EMBER_LINE = centreline([[75.6, 90.4], [87.6, 94.4], [98, 90.6], [102.8, 81.6]], 30);
const EMBER_TAIL = tube(EMBER_LINE, (t) => 4.6 * (1 - t) + 2.2);
const EMBER_TIP: P = [103.4, 80.4];

/* ---------- back ---------- */

/** Soot fuzz: soft spikes all round the outline, behind the body and merged into it, so the whole silhouette turns
 * fuzzy (a soot sprite's). It buzzes while working and breathes asleep. */
function fuzz(ctx: Ctx): Drawing {
  const { rig } = ctx, r = ctx.rng("b15-fuzz"), k = clamp(rig.half / 32, 0.85, 1.15), count = 26;
  const spikes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const deg = -180 + (360 * (i + r.range(-0.2, 0.2))) / count, { p, nrm } = onRim(rig, deg), t = perp(nrm);
    const l = (4.4 + r.range(0, 2.4)) * k, wb = 3.6 * k, lean = r.range(-1.4, 1.4) * k;
    spikes.push(poly([add(sub(p, mul(nrm, 2)), mul(t, wb)), add(add(p, mul(nrm, l)), mul(t, lean)), sub(sub(p, mul(nrm, 2)), mul(t, wb))]));
  }
  const mid: P = [60, (rig.top + rig.bottom) / 2];
  return { pieces: [{ d: spikes.join(""), c: "body", g: "b15-fuzz", pivot: mid }] };
}

/* ---------- held ---------- */

/** The will-o'-the-wisp: a little flame floating over the left hand, upright whatever the arm does (the shared
 * `upright`), in the spot colour round a white heart; it bobs, flickers while working and burns low asleep. */
const WISP: Cmd[] = [
  ["M", [0, 6]], ["C", [-6, 6], [-7.6, 1], [-6.6, -2]], ["C", [-6, -5], [-7.6, -8], [-8.6, -11.4]], ["C", [-5, -10.4], [-3.6, -8.4], [-3, -6.6]],
  ["C", [-3, -10.4], [-1, -14.4], [1.6, -16.4]], ["C", [2, -12.8], [3.4, -10.2], [4.6, -8.2]], ["C", [5.6, -9.6], [7.2, -10.2], [8.6, -10.6]],
  ["C", [7, -7.2], [7.8, -3], [6.6, 0]], ["C", [6, 4], [3.6, 6], [0, 6]], ["Z"],
];

function fatuo(ctx: Ctx): Drawing {
  const hand = ctx.rig.at.handL;
  if (!hand) return {};
  const c: P = [hand.x + 0.6, hand.y - 13.6], f = { sub: "b15-wisp", pivot: [hand.x, hand.y] as P };
  const map = ([x, y]: P): P => [c[0] + x * 1.18, c[1] + y * 1.18], d = path(WISP, map);
  return {
    pieces: [
      { d, c: "spot", ...f }, { d, c: "spot", ink: "inner", stroke: 2.4, ...f },
      { d: tongue(map([0, 3.6]), 9.8, 3.5, 0.5), c: WHITE, ink: "inner", flat: true, ...f },
    ],
  };
}

/* ---------- compatibility ---------- */

/** The tornado hangs where a tail would join, from bodies whose base can taper (B12's hem and wisp take the same list,
 * plus the tall egg). */
const ON_FLOAT = ["body:dome|drop|round|orb|tall"];
/** Tops that fill the crown: a headphone band would cut through them, a clip beside them would sit on them. */
const CROWN = ["blocks-band", "blocks-clips"];

/* ---------- the batch ---------- */

export default batch({
  label: "B15 Elementales",

  parts: [
    /* ---------- tops ---------- */
    { id: "wave", slot: "top", label: "ola", group: "b15-wave", tags: ["tall", ...CROWN], draw: wave },
    { id: "rock-crown", slot: "top", label: "corona de rocas", tags: ["hat-hidden", ...CROWN], draw: rockCrown },
    {
      id: "crystals", slot: "top", label: "cristales", at: "crown", socket: [60, 42], group: "b15-gem", tags: ["tall", ...CROWN], jitter: { rot: 5, size: 0.05 },
      draw: {
        pieces: [
          ...GEMS.map((g): Piece => ({ d: g.d, c: "spot" })),
          ...GEMS.map((g): Piece => ({ d: g.face, c: WHITE, ink: "inner", flat: true, sub: "b15-sheen" })),
          ...GEMS.map((g): Piece => ({ d: g.ridge, c: WHITE, w: 1.2, ink: "inner", flat: true, lod: 1 })),
          { d: twinkle(GEMS[2].glint, 2.6), c: WHITE, ink: "inner", flat: true, sub: "flick", pivot: GEMS[2].glint, lod: 1 },
        ],
        over: `<g class="prop-work b15-twinkles">${GEM_SPARKS.map((p, i) => `<path d="${twinkle(p, i === 2 ? 3.4 : 2.8)}"/>`).join("")}</g>`,
      },
    },
    {
      id: "swirl", slot: "top", label: "remolino", at: "crown", socket: [60, 42], group: "b15-swirl", tags: ["tall", ...CROWN], jitter: { rot: 6 },
      draw: {
        pieces: [{ d: SWIRL, c: "belly", sub: "spin", pivot: SWIRL_C }],
        over: `<g class="prop-work b15-gusts"><path d="${SWIRL_TAILS}"/></g>`,
      },
    },
    {
      id: "lightning", slot: "top", label: "rayo", at: "crown", socket: [60, 42], group: "b15-bolt", tags: ["tall", ...CROWN], jitter: { rot: 7, size: 0.05 },
      draw: {
        pieces: [{ d: BOLT, c: "gold" }, { d: BOLT_GLINT, c: WHITE, w: 1.8, ink: "inner", flat: true, lod: 1 }],
        over: `<g class="prop-work b15-sparks">${BOLT_SPARKS.map(([a, b]) => `<path d="${spark(a, b)}"/>`).join("")}</g>`,
      },
    },
    { id: "ice-shards", slot: "top", label: "esquirlas de hielo", group: "b15-ice", tags: ["tall", ...CROWN], draw: iceShards },
    {
      id: "leaf-flame", slot: "top", label: "llama de hojas", at: "crown", socket: [60, 42], group: "sprout", tags: ["tall", ...CROWN], jitter: { rot: 5, size: 0.05 },
      draw: (ctx) => {
        // The inner pair in the dark role, the rest in the spot; on a dark coat the inner pair takes the belly instead.
        const inner: Paint = isDarkCoat(ctx.spec) ? "belly" : "dark";
        return {
          pieces: [
            // Outer leaves first, so the tall middle one lies over its neighbours.
            ...[0, 4, 1, 3, 2].map((i): Piece => ({ d: LEAVES[i].d, c: i === 1 || i === 3 ? inner : "spot" })),
            ...LEAVES.map((l): Piece => ({ d: l.rib, c: "belly", w: 1.1, ink: "inner", flat: true, lod: 1 })),
          ],
          over: `<g class="prop-work b15-leaves">${LEAF_BITS.map((d) => `<path d="${d}"/>`).join("")}</g>`,
        };
      },
    },
    { id: "crater", slot: "top", label: "cráter", tags: ["hat-hidden", ...CROWN], draw: crater },

    /* ---------- patterns ---------- */
    { id: "lava-cracks", slot: "pattern", label: "grietas de lava", excludes: ["pattern:frost|belly|bands"], draw: lavaCracks },
    { id: "facets", slot: "pattern", label: "facetas", excludes: ["pattern:belly|fur-tips|scales"], draw: facets },
    { id: "frost", slot: "pattern", label: "escarcha", tags: ["clipped"], excludes: ["#clipped"], draw: frost },
    { id: "specks", slot: "pattern", label: "motas de piedra", noise: 1, excludes: ["pattern:spots|seeds|sprinkles"], draw: specks },

    /* ---------- legs ---------- */
    { id: "puddle", slot: "legs", label: "charco", noise: 1, excludes: ["#floats"], draw: puddle },
    { id: "tornado", slot: "legs", label: "torbellino", noise: 1, requires: ON_FLOAT, excludes: ["tail"], draw: tornado },
    { id: "cloud-base", slot: "legs", label: "nube", noise: 1, draw: cloudBase },

    /* ---------- tails ---------- */
    {
      id: "bolt-tail", slot: "tail", label: "de rayo", at: "rump", socket: [82, 94], group: "tail", jitter: { rot: 6 },
      draw: { pieces: [{ d: BOLT_TAIL, c: "gold" }, { d: BOLT_TAIL_GLINT, c: WHITE, w: 1.6, ink: "inner", flat: true, lod: 1 }] },
    },
    {
      id: "ember-tail", slot: "tail", label: "de llama", at: "rump", socket: [82, 94], group: "tail", jitter: { rot: 6 },
      draw: {
        pieces: [
          { d: EMBER_TAIL, c: "body" },
          { d: tongue(EMBER_TIP, 19, 7.6, 1.8), c: LAVA, sub: "b15-ember", pivot: EMBER_TIP },
          { d: tongue([EMBER_TIP[0], EMBER_TIP[1] - 0.8], 11, 4, 1.2), c: "gold", ink: "inner", flat: true, sub: "b15-ember", pivot: EMBER_TIP, lod: 1 },
        ],
      },
    },

    /* ---------- back ---------- */
    { id: "fuzz", slot: "back", label: "pelusa de hollín", draw: fuzz },

    /* ---------- held ---------- */
    // Uncommon: the gear step offers it to any bicho with a hand, beside the other held items.
    {
      id: "fatuo", slot: "held", label: "fuego fatuo", rarity: "uncommon", pair: false, requires: ["#hand"], rides: "handL", upright: true,
      lod: 2, layer: LAYER.arms - 0.5, draw: fatuo,
    },
  ],

  families: [
    // Elementals: one element each, read by one signature part. They lend their element tops, the glowing patterns and
    // the two tails to other families' bichos through the cross-family roll (a cat with a lightning bolt, a bear with
    // frost).
    {
      id: "elementals", label: "Elementales", weight: 8, color: { hue: [0, 360], sat: [55, 75], light: [56, 66], spot: 180 },
      pools: { cheeks: { p: 0.4, pick: "blush" } },
      cross: {
        top: { lightning: 5, crystals: 4, "ice-shards": 3, "leaf-flame": 3, swirl: 2 },
        pattern: { frost: 3, "lava-cracks": 2, facets: 2 },
        tail: { "ember-tail": 4, "bolt-tail": 4 },
        legs: { "cloud-base": 2 },
      },
    },
  ],

  members: [
    {
      // Fire: B12's flame on a teardrop (moved here from the spirits, unchanged).
      id: "llamita", family: "elementals", label: "llamita", bodies: "drop",
      fixed: { top: "flame", arms: "nubs", legs: "feet" },
      pools: { eyes: { two: 10, sparkle: 5, button: 5, googly: 3 }, mouth: { smile: 10, grin: 5, tongue: 4, tiny: 3 }, cheeks: { p: 0.5, pick: "blush" } },
      color: { hue: [14, 40], sat: [86, 95], light: [55, 61], spot: 210 },
    },
    {
      // Water: a wave breaking over its head, rising out of a puddle of itself.
      id: "olita", family: "elementals", label: "olita", bodies: { round: 3, blob: 2 },
      fixed: { top: "wave", legs: { puddle: 10, feet: 3 }, arms: "nubs" },
      pools: { eyes: { two: 10, sparkle: 6, googly: 3 }, mouth: { smile: 10, tongue: 6, wavy: 4, tiny: 3 }, cheeks: { p: 0.5, pick: "blush" } },
      color: { hue: [190, 215], sat: [62, 78], light: [58, 66], spot: 160 },
    },
    {
      // Earth: a pebble with a crown of stones and granite specks.
      id: "pedrusco", family: "elementals", label: "pedrusco", bodies: { wide: 3, blob: 2, box: 1 },
      fixed: { top: "rock-crown", pattern: ["specks"], arms: "nubs", legs: "feet" },
      pools: { eyes: { two: 10, sleepy: 6, button: 5, wonky: 3 }, mouth: { smile: 10, grin: 5, stitch: 4, gap: 3, teeth: 3 } },
      color: [{ weight: 2, hue: [20, 45], sat: [10, 22], light: [52, 62], spot: 100 }, { weight: 1, hue: [215, 260], sat: [8, 16], light: [54, 62], spot: 100 }],
    },
    {
      // Crystal: a quartz, faceted all over, with a cluster of crystals on its head.
      id: "cuarzo", family: "elementals", label: "cuarzo", bodies: { round: 2, tri: 2, pear: 1 },
      fixed: { top: "crystals", pattern: ["facets"], arms: "nubs", legs: "feet" },
      pools: { eyes: { sparkle: 10, two: 8, lashes: 3 }, mouth: { smile: 10, tiny: 6, grin: 3 }, cheeks: { p: 0.5, pick: "blush" } },
      color: { hue: { pick: [180, 200, 270, 290, 320] }, sat: [40, 58], light: [70, 80], spot: { pick: [270, 90, 120] } },
    },
    {
      // Air: a breeze with a swirl over its head, spinning on a tornado.
      id: "remolino", family: "elementals", label: "remolino", bodies: { round: 3, drop: 2 },
      fixed: { top: "swirl", legs: { tornado: 10, "cloud-base": 3 }, arms: "nubs" },
      pools: { eyes: { two: 10, sleepy: 6, sparkle: 4, button: 4 }, mouth: { smile: 10, tiny: 6, wavy: 4 }, cheeks: { p: 0.6, pick: "blush" } },
      color: { hue: [170, 210], sat: [30, 50], light: [80, 88], spot: 180 },
    },
    {
      // Lightning: a spark with a bolt on its head and a bolt for a tail; now and then it rides a cloud.
      id: "chispita", family: "elementals", label: "chispita", bodies: { round: 3, blob: 1 },
      fixed: { top: "lightning", tail: "bolt-tail", arms: "nubs", legs: { feet: 10, "cloud-base": 3 } },
      pools: { eyes: { two: 10, sparkle: 6, googly: 4, "wide-set": 3 }, mouth: { grin: 10, smile: 8, tongue: 5, fangs: 3 }, cheeks: { p: 0.6, pick: "blush" } },
      color: [{ weight: 3, hue: [48, 56], sat: [88, 96], light: [60, 66], spot: 180 }, { weight: 1, hue: [250, 275], sat: [45, 60], light: [54, 62], spot: 180 }],
    },
    {
      // Ice: a snowflake sprite with ice shards on its head and frost round its base.
      id: "copito", family: "elementals", label: "copito", bodies: { round: 3, drop: 2, tall: 1 },
      fixed: { top: "ice-shards", pattern: ["frost"], arms: "nubs", legs: "feet" },
      pools: { eyes: { two: 10, sparkle: 6, button: 5, sleepy: 3 }, mouth: { smile: 10, tiny: 7, tongue: 3 }, cheeks: { p: 0.7, pick: "blush" }, neckwear: { p: 0.15, pick: "scarf" } },
      color: { hue: [190, 215], sat: [40, 60], light: [76, 84], spot: 150 },
    },
    {
      // A leaf-wisp: a forest wisp whose flame is made of leaves, green and autumn, trailing a wisp.
      id: "hojarasca", family: "elementals", label: "hojarasca", bodies: { drop: 3, dome: 2 },
      fixed: { top: "leaf-flame", legs: { wisp: 10, feet: 3 }, arms: "nubs" },
      pools: { eyes: { two: 10, hollow: 6, button: 5, sleepy: 3 }, mouth: { smile: 10, tiny: 8 }, cheeks: { p: 0.5, pick: "blush" }, held: { p: 0.2, pick: "fatuo" } },
      color: { hue: [90, 140], sat: [38, 55], light: [62, 72], spot: { pick: [265, 280] } },
    },
    {
      // Magma: a lump of basalt with lava glowing in its cracks and a crater on its head.
      id: "magmita", family: "elementals", label: "magmita", bodies: { blob: 2, round: 2, wide: 1 },
      fixed: { top: "crater", pattern: ["lava-cracks"], arms: "nubs", legs: "feet" },
      pools: { eyes: { two: 10, sparkle: 4, wonky: 3 }, mouth: { grin: 10, fangs: 6, smile: 6, saw: 3 } },
      color: { hue: [0, 25], sat: [14, 26], light: [37, 43], spot: 180 },
    },
    {
      // Soot: Spirited Away's susuwatari, a fuzzball with two big eyes; sometimes carrying a wisp of fire.
      id: "hollin", family: "elementals", label: "hollín", bodies: "round",
      fixed: { back: "fuzz", eyes: { two: 10, googly: 4, "wide-set": 3 }, arms: "nubs", legs: "feet" },
      pools: { mouth: { tiny: 10, smile: 6, gap: 3 }, held: { p: 0.25, pick: "fatuo" } },
      color: { hue: [240, 290], sat: [6, 14], light: [26, 32], spot: 130 },
    },
  ],

  // Elements on members declared in other files (each adds a weighted option or a pool there).
  extend: [
    // Some droplets sit in a puddle; some little dragons carry a flame on their tail; some yetis are frosted.
    { family: "pond", member: "gotita", fixed: { legs: { puddle: 4 } } },
    { family: "spirits", member: "dragoncito", fixed: { tail: { "ember-tail": 4 } } },
    { family: "spirits", member: "yeti", pools: { pattern: { p: 0.25, pick: "frost" } } },
  ],

  // The parts on other families' bichos (gear that would cover them pinned off).
  showcase: [
    "bicho:monsters/monster:b15-rayo?top=lightning&tail=bolt-tail&eyes=two&headgear=none",
    "bicho:furry/bear:b15-escarcha?top=ice-shards&pattern=frost",
    "bicho:pond/gotita:b15-charco?legs=puddle",
    "bicho:spirits/dragoncito:b15-cola?tail=ember-tail",
    "bicho:monsters/flotin:b15-tornado?top=swirl&legs=tornado",
    "bicho:bots/robot:b15-nube?legs=cloud-base&top=lightning",
    "bicho:furry/cat:b15-geoda?top=crystals&pattern=facets",
    "bicho:spirits/fantasmita:b15-fatuo?held=fatuo&headgear=none",
    "bicho:monsters/monster:b15-volcan?top=crater&pattern=lava-cracks&body=round&neckwear=none",
  ],

  css: `
    /* asleep = idle without a pastime (the mascots', the frozen figures') or the nap: the quiet pose and the pastimes stay awake */
    /* sheens on ice and crystal faces, translucent; the rime only shows asleep (frosting over) */
    .pg-b15-sheen { opacity: .38 }
    .pg-b15-rime { opacity: 0 }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b15-rime { opacity: .92 }

    /* glows (the lava cracks, the crater's pool and drip): they flicker while working, blink slowly while waiting and
       burn low asleep */
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b15-glow { opacity: .42 }
    &[data-mood=working] .pg-b15-glow { animation: bx-bulb .5s steps(1) infinite }
    &[data-mood=waiting] .pg-b15-glow { animation: bx-bulb 1s steps(1) infinite }

    /* the wave laps while talking, churns while working, pops while waiting and lies down asleep */
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b15-wave { transform: rotate(-7deg) scale(.94,.8) }
    &[data-mood=speaking] .pg-b15-wave { animation: bx-feel 2.2s ease-in-out infinite }
    &[data-mood=working] .pg-b15-wave { animation: bx-feel .5s ease-in-out infinite }
    &[data-mood=waiting] .pg-b15-wave { animation: bx-pop 1.3s cubic-bezier(.3,1.8,.5,1) infinite }

    /* the rocks grind against each other while working, hop while waiting and settle asleep */
    &[data-mood=working] .pg-b15-grind-a { animation: bx-jitter .09s linear infinite alternate }
    &[data-mood=working] .pg-b15-grind-b { animation: bx-jitter .09s linear infinite alternate-reverse }
    &[data-mood=waiting] .pg-b15-grind-a { animation: bx-step .325s ease-in-out infinite alternate }
    &[data-mood=waiting] .pg-b15-grind-b { animation: bx-step .325s ease-in-out infinite alternate-reverse }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) :is(.pg-b15-grind-a, .pg-b15-grind-b) { transform: translateY(1px) }

    /* crystals shimmer while working, twinkle while talking, pop while waiting */
    &[data-mood=speaking] .pg-b15-gem { animation: bx-twinkle 1.6s ease-in-out infinite }
    &[data-mood=working] .pg-b15-gem { animation: bx-bulb .6s steps(1) infinite }
    &[data-mood=waiting] .pg-b15-gem { animation: bx-pop 1.3s cubic-bezier(.3,1.8,.5,1) infinite }

    /* the swirl: it bobs while talking and waiting (it spins while working, the shared spin), and settles asleep */
    &:is([data-mood=speaking], [data-mood=waiting]) .pg-b15-swirl { animation: bx-feel 2s ease-in-out infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b15-swirl { transform: translateY(4px) scale(.82) }

    /* the bolt crackles while working (a flicker and a shiver), twinkles while talking, pops while waiting, droops asleep */
    &[data-mood=speaking] .pg-b15-bolt { animation: bx-twinkle 1.1s ease-in-out infinite }
    &[data-mood=working] .pg-b15-bolt { animation: bx-bulb .3s steps(1) infinite, bx-jitter .08s linear infinite alternate }
    &[data-mood=waiting] .pg-b15-bolt { animation: bx-pop 1.3s cubic-bezier(.3,1.8,.5,1) infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b15-bolt { transform: rotate(16deg) scale(.88) }

    /* ice: it shivers while working and pops while waiting */
    &[data-mood=working] .pg-b15-ice { animation: bx-jitter .1s linear infinite alternate }
    &[data-mood=waiting] .pg-b15-ice { animation: bx-pop 1.3s cubic-bezier(.3,1.8,.5,1) infinite }

    /* the crater's bubble pops while working, bobs while waiting and is gone asleep */
    &[data-mood=working] .pg-b15-bubble { animation: bx-pop .6s cubic-bezier(.3,1.8,.5,1) infinite }
    &[data-mood=waiting] .pg-b15-bubble { animation: bx-feel 1.3s ease-in-out infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b15-bubble { opacity: 0 }

    /* the puddle's ripples breathe; the tornado's bands sway against each other, faster while working */
    &:is([data-mood=speaking], [data-mood=waiting]) .pg-b15-ripple { animation: bx-breathe 2s ease-in-out infinite }
    &[data-mood=working] .pg-b15-ripple { animation: bx-breathe .6s ease-in-out infinite }
    &:is([data-mood=speaking], [data-mood=waiting]) .pg-b15-twist-a { animation: bx-feel 1.6s ease-in-out infinite }
    &:is([data-mood=speaking], [data-mood=waiting]) .pg-b15-twist-b { animation: bx-feel 1.6s ease-in-out infinite reverse }
    &[data-mood=working] .pg-b15-twist-a { animation: bx-feel .4s ease-in-out infinite }
    &[data-mood=working] .pg-b15-twist-b { animation: bx-feel .4s ease-in-out infinite reverse }
    /* its gusts sway with it, and die down asleep */
    &:is([data-mood=speaking], [data-mood=waiting]) .pg-b15-gust-a { animation: bx-feel 1.6s ease-in-out infinite reverse }
    &:is([data-mood=speaking], [data-mood=waiting]) .pg-b15-gust-b { animation: bx-feel 1.6s ease-in-out infinite }
    &[data-mood=working] .pg-b15-gust-a { animation: bx-feel .4s ease-in-out infinite reverse }
    &[data-mood=working] .pg-b15-gust-b { animation: bx-feel .4s ease-in-out infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) :is(.pg-b15-gust-a, .pg-b15-gust-b) { opacity: 0 }

    /* the ember on the tail's tip flickers while talking and working, pops while waiting and burns low asleep */
    &[data-mood=speaking] .pg-b15-ember { animation: bx-twinkle 1.1s ease-in-out infinite }
    &[data-mood=working] .pg-b15-ember { animation: bx-pulse .45s ease-in-out infinite }
    &[data-mood=waiting] .pg-b15-ember { animation: bx-pop 1.3s cubic-bezier(.3,1.8,.5,1) infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b15-ember { transform: scale(.7) }

    /* crystals lose their shine asleep */
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b15-gem .pg-b15-sheen { opacity: .14 }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b15-gem .pg-flick { opacity: 0 }

    /* the cloud bobs while talking and waiting and shivers while working */
    &:is([data-mood=speaking], [data-mood=waiting]) .pg-b15-cloud { animation: bx-feel 2.4s ease-in-out infinite }
    &[data-mood=working] .pg-b15-cloud { animation: bx-jitter .12s linear infinite alternate }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b15-cloud { transform: translateY(1.5px) scale(1,.92) }

    /* soot fuzz buzzes while working, puffs up while waiting and breathes asleep */
    &[data-mood=working] .pg-b15-fuzz { animation: bx-jitter .07s linear infinite alternate }
    &[data-mood=waiting] .pg-b15-fuzz { animation: bx-pulse .65s ease-in-out infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b15-fuzz { animation: bx-breathe 4s ease-in-out infinite }

    /* the will-o'-the-wisp bobs, flickers while working and burns low asleep */
    &:is([data-mood=speaking], [data-mood=waiting]) .pg-b15-wisp { animation: bx-feel 2s ease-in-out infinite }
    &[data-mood=working] .pg-b15-wisp { animation: bx-pulse .45s ease-in-out infinite }
    &[data-mood=idle]:is(:not([data-idle]), [data-idle=nap]) .pg-b15-wisp { transform: scale(.7) translateY(3px); opacity: .7 }

    /* particles (stage-only props, drawn by the parts): sparks crackle, chips and smoke and bubbles puff away, snow and
       leaves fall, sparkles twinkle, gusts blow */
    :is(.b15-sparks, .b15-chips, .b15-smoke, .b15-bubbles, .b15-snow, .b15-leaves, .b15-twinkles, .b15-gusts) > * { transform-box: fill-box; transform-origin: 50% 50% }
    .b15-sparks path { fill: none; stroke: var(--bx-gold); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round }
    .b15-chips path { fill: var(--bx-body); stroke: #1b1428; stroke-width: 1.3; stroke-linejoin: round }
    .b15-chips circle { fill: var(--bx-belly); stroke: #1b1428; stroke-width: 1.2 }
    .b15-smoke circle { fill: #c9c3d3; stroke: #1b1428; stroke-width: 1.4 }
    .b15-bubbles circle { fill: rgb(255 255 255 / .55); stroke: #1b1428; stroke-width: 1.3 }
    .b15-snow path { fill: none; stroke: #fff; stroke-width: 1.4; stroke-linecap: round }
    .b15-leaves path { fill: var(--bx-spot); stroke: #1b1428; stroke-width: 1.2; stroke-linejoin: round }
    .b15-twinkles path { fill: #fff; stroke: #1b1428; stroke-width: 1 }
    .b15-gusts path { fill: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; opacity: .85 }
    &[data-mood=working] .b15-sparks path { animation: bx-puff .5s steps(3) infinite }
    &[data-mood=working] .b15-sparks path:nth-child(2n) { animation-delay: .25s }
    &[data-mood=working] .b15-sparks path:nth-child(3) { animation-delay: .12s }
    &[data-mood=working] :is(.b15-chips, .b15-smoke, .b15-bubbles) > * { animation: bx-puff 1.2s ease-out infinite }
    &[data-mood=working] .b15-chips > *:nth-child(2) { animation-delay: .4s }
    &[data-mood=working] .b15-chips > *:nth-child(3) { animation-delay: .8s }
    &[data-mood=working] :is(.b15-smoke, .b15-bubbles) > *:nth-child(2) { animation-delay: .4s }
    &[data-mood=working] :is(.b15-smoke, .b15-bubbles) > *:nth-child(3) { animation-delay: .8s }
    &[data-mood=working] :is(.b15-snow, .b15-leaves) > * { animation: bx-sweat 1.4s ease-in infinite }
    &[data-mood=working] :is(.b15-snow, .b15-leaves) > *:nth-child(2) { animation-delay: .5s }
    &[data-mood=working] :is(.b15-snow, .b15-leaves) > *:nth-child(3) { animation-delay: .9s }
    &[data-mood=working] .b15-snow > *:nth-child(4) { animation-delay: .25s }
    &[data-mood=working] .b15-twinkles > * { animation: bx-twinkle .8s ease-in-out infinite }
    &[data-mood=working] .b15-twinkles > *:nth-child(2) { animation-delay: .3s }
    &[data-mood=working] .b15-gusts > * { animation: bx-puff 1s ease-out infinite }
  `,
});
