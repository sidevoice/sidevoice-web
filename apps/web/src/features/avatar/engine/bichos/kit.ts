import { n, type Rng, type Size } from "../core";

/* The authoring kit for bicho part files: the types a file in src/parts/ uses and a few drawing helpers.
 * A part file default-exports `batch({ ... })`; the registry finds it on its own (docs/parts-api.md). */

export { blob, hsl, n, rng, smoothLoop, type Rng } from "../core";

export const INK = "#1b1428";

/** The colour a piece is painted in. body, belly, dark and spot follow the bicho's colour; horn, gold, pink and ink are
 * fixed. A literal "#rrggbb" is allowed for the odd fixed colour (it gets the same shading), but prefer a role. */
export type Role = "body" | "belly" | "dark" | "spot" | "horn" | "gold" | "pink" | "ink";
export type Paint = Role | `#${string}`;

/* ---------- bodies, frames and anchors ---------- */

/** What a body declares about its shape; every standard anchor is derived from it (rig.ts). `faceHalf` is the half
 * width at the eyes when that is not the widest point (pear, tri): eye spread, fit and the head anchors use it. */
export interface Frame { top: number; eyeY: number; mouthY: number; armY: number; half: number; bottom: number; faceHalf?: number }

/** A named point on (or in) a body. `a` is the outward normal in degrees (0 up, -90 left, 90 right, 180 down); a part
 * joined here turns by the difference from the reference body's normal. `s` scales parts joined here (default 1).
 * `r` caps the size of what sits on it (eye stalks). `g`/`o` are set on anchors emitted by a moving part (an arm's
 * hand): a part joined there rides that group (`pg-<g>`) around that pivot. When both eye stalks carry the same group,
 * `eyes` carries it too, and the face (eyes, lids, brows) rides it. */
export interface Anchor { x: number; y: number; a?: number; s?: number; r?: number; g?: string; o?: [number, number] }

/** The standard anchors every body has. L/R pairs mirror about x = 60. `hat` is where headgear sits: it defaults to the
 * body's `crown` (overridden or not), and a pointy body moves it down its slope so hats seat lower while tops stay on
 * the tip. `chin` is the lowest point the open mouth reaches, its ink edge included: the cast's D by default (mouth
 * line + 14.5); a mouth that opens smaller or deeper emits its own. `stalkL/R` and `handL/R` only exist when a part
 * emits them (a top with eye stalks, an arm with a hand). */
export const ANCHORS = [
  "crown", "hat", "crownL", "crownR", "earL", "earR", "forehead", "eyes", "eyeL", "eyeR", "templeL", "templeR",
  "cheekL", "cheekR", "muzzle", "mouth", "chin", "neck", "shoulderL", "shoulderR", "backL", "backR", "dorsal",
  "belly", "rump", "hem", "base", "footL", "footR", "ground",
] as const;
export const EMITTED = ["stalkL", "stalkR", "handL", "handR"] as const;
export type AnchorName = (typeof ANCHORS)[number] | (typeof EMITTED)[number];

/** A body's frame plus everything derived from it, as parts see it. */
export interface Rig extends Required<Frame> {
  /** The body outline actually drawn (wobble included). */
  outline: string;
  /** Eye spread: min(12, 0.4 * faceHalf). */
  spread: number;
  /** half / 32: the reference width the existing parts were drawn for. */
  u: number;
  at: Record<string, Anchor>;
  /** Shrinks a radius so a round thing at x stays inside the face. */
  fit(x: number, r: number): number;
}

export interface BodyDef {
  id: string;
  /** Spanish, shown on the editor chip. */
  label: string;
  frame: Frame;
  /** The silhouette path in the 120 box. `r` is the bicho's shape stream, for wobble. */
  outline: (r: Rng) => string;
  /** Overrides for standard anchors on this body. An L anchor alone also sets its R mirror. */
  anchors?: Record<string, Anchor>;
  /** The gloss stroke; default follows the frame (rig.ts). */
  shine?: (rig: Rig) => string;
  /** The gloss is painted under the arms and everything worn, as under a hat (see `Drawing.glossUnder`): for a body whose
   * highlight runs where the arms join. */
  glossUnder?: boolean;
  /** The ground shadow under the `ground` anchor, in the 120 box: half width `rx` (default 0.85·half), half height `ry`
   * (default 4.5) and `opacity` (default 1). A body that floats gives a smaller, fainter one. */
  shadow?: { rx?: number; ry?: number; opacity?: number };
  requires?: string[]; excludes?: string[]; hides?: string[]; tags?: string[];
}

/* ---------- parts ---------- */

/** 1: hidden at rail (28 px). 2: stage only (hidden at sidebar and rail). */
export type Lod = 1 | 2;

/** A shape of the figure. Filled, or with `w` a round-capped line of that width. */
export interface Piece {
  d: string;
  c: Paint;
  w?: number;
  /** "merge": joins the fat outline (the default). "inner": drawn inside the silhouette, no outline. */
  ink?: "merge" | "inner";
  /** Plain colour instead of the shaded gradient. */
  flat?: boolean;
  /** A thin ink edge of this width (inner pieces). */
  stroke?: number;
  /** Animation group for this piece; overrides the part's. `null` for none. */
  g?: string | null;
  /** A group nested inside the piece's group (the part's, or the emitter's on an emitted anchor such as a hand): it
   * moves with it and adds its own motion (a balloon's float inside the arm). `-l`/`-r` on pairs, like `g`. */
  sub?: string;
  /** The pivot (transform-origin) of the piece's own group (`sub`, else `g`), in the drawing's coordinates: placed and
   * mirrored with the part. Without it the group's CSS sets the origin. */
  pivot?: [number, number];
  layer?: number;
  lod?: Lod;
  /** Clip to the body outline (patterns that would spill over it). Keep it rare. */
  clip?: boolean;
  /** "body": the piece's shade spans the body's box instead of its own, so a piece that extends the body (a ghost's
   * hem, a wisp, cloud puffs, a flame) shades as one with it, with no seam. Fitted parts only (a placed piece keeps its
   * own); it moves with the piece's groups. */
  span?: "body";
}

export interface Eye { x: number; y: number; r: number }

/** Markup for the shared face classes the CSS animates: `.eyes` (blinks; put pupils in `.look`), `.eyes-closed`
 * (idle), `.brows`, `.m-rest` and `.m-open` (the mouth while talking). `shine` replaces the body's gloss ("" removes it). */
export interface Face { eyes?: string; closed?: string; brows?: string; mouthRest?: string; mouthOpen?: string; shine?: string }

/** What a part draws. Coordinates are the 120 box; for a part with `at`, they are the part's own drawing, which the
 * renderer moves so `socket` lands on the anchor. */
export interface Drawing {
  pieces?: Piece[];
  /** Raw markup drawn above the face (CSS-classed decor: ribs, gems, lenses), placed and mirrored with the part. */
  over?: string;
  /** Raw markup like `over`, but in the 120 box: drawn once, neither placed nor mirrored with the part (one-sided decor
   * on a pair, a bubble stream beside a claw). */
  overBox?: string;
  face?: Face;
  /** Eyes slot: the eye geometry later parts read (glasses). */
  eyes?: Eye[];
  /** Anchors this part offers to the parts after it (eye stalks, hands), in the same coordinates as the drawing. */
  emits?: Record<string, Anchor>;
  /** The lowest y this part covers across the forehead (a cap's brim, its ink edge included), in the drawing's
   * coordinates (a rigid part's is placed with it). Later parts read the lowest one as `ctx.brim`. Brows that would
   * reach it when raised are not drawn: there is no room to push them down, since they sit right on the eyes. */
  brim?: number;
  /** The part sits on the body's edge, where the body's gloss can run (a robot's arm on a can's side): the gloss is painted
   * under it, as under a hat, so it never crosses the part, at rest or swinging. */
  glossUnder?: boolean;
  /** A fitted part's pivot for its `group` (a rigid part pivots on its socket). Without it the group's CSS sets it. */
  pivot?: [number, number];
  /** Overrides the body's ground shadow (`BodyDef.shadow`, field by field; the last part that sets it wins): legs that
   * make a standing body float (a ghost's hem) shrink and fade it as the floating dome does. */
  shadow?: { rx?: number; ry?: number; opacity?: number };
}

/** Seed-rolled nudges, bounded, so the same art lands a little differently per bicho. Pairs nudge symmetrically. */
export interface Jitter { dx?: number; dy?: number; rot?: number; size?: number; step?: number }

export interface Spec {
  body: string;
  /** slot id → part id (single slots) or part ids (multi slots). Absent means none. */
  parts: Record<string, string | string[]>;
  color: { hue: number; sat: number; light: number; spot: number };
  /** Seeds the body wobble, spots and jitter, so a spec redraws identically. */
  shape: string;
  name: string;
  /** The legendary palette (gold body). */
  shiny?: boolean;
}

/** What a part's draw function gets. */
export interface Ctx {
  rig: Rig;
  spec: Spec;
  size: Size;
  /** The eye geometry. Parts after the eyes slot get the eyes as drawn. Parts before it (tops) get the eyes planned:
   * the eyes part run ahead, before any top emitted eye stalks. */
  eyes: Eye[];
  /** The lowest brim drawn so far across the forehead (a cap top, a hat), in the 120 box; undefined if none. Headgear
   * is evaluated before cheeks, marks and noses, so they see a hat's brim. */
  brim?: number;
  /** A stream salted per use, from the spec's shape. */
  rng(salt: string): Rng;
  /** Is a part matching this ref drawn ("slot:id", "slot", "#tag")? */
  has(ref: string): boolean;
  /** The cast's shade (lit top-left, deep rim) for markup in `over`: returns a `url(#…)` fill, and the gradient joins
   * this bicho's defs (the same one its pieces of that colour use). Takes a role, "#rrggbb" or any CSS colour. */
  shade(color: Paint | string): string;
}

export interface PartDef {
  id: string;
  slot: string;
  /** Spanish, shown on the editor chip. */
  label: string;
  draw: Drawing | ((ctx: Ctx) => Drawing);
  /** Anchor the part joins. An L anchor draws the pair (the R side is the mirror) unless `pair: false`. */
  at?: AnchorName | string;
  /** For a fitted part (no `at`): an emitted anchor whose group it rides (a balloon drawn in place from `handL` moves
   * with the arm). Its pieces join the emitter's group and pivot, as a rigid part joined there would, and so do its
   * `over` and `overBox` markup. `"eyes"` rides whatever the eyes ride (eye stalks that move), else nothing: eyewear. */
  rides?: AnchorName | string;
  /** Held items that float (a balloon, a leaf umbrella): a counter-turn about the anchor it joins or rides undoes the
   * arm's turn, so it follows the hand and stays level (the shared `upright` group, inside the arm's). */
  upright?: boolean;
  /** The part's own attachment point, in its drawing; it lands on the anchor and is the pivot of its groups. */
  socket?: [number, number];
  pair?: boolean;
  /** Draw order (LAYER); default from the slot. */
  layer?: number;
  /** Default for its pieces. */
  ink?: "merge" | "inner";
  /** Animation group: pieces go in `<g class="pg-<group>">` (`-l`/`-r` on pairs), pivoted on the socket. */
  group?: string;
  lod?: Lod;
  jitter?: Jitter;
  /** Refs: "slot:id", "slot:a|b|c", "slot" (anything in it), "#tag", "body:id". */
  requires?: string[];
  /** Can't coexist (symmetric: either side declaring it is enough). The seed roller and the editor enforce it. */
  excludes?: string[];
  /** Not drawn while this part is (the editor allows the combo; the roller avoids it). */
  hides?: string[];
  tags?: string[];
  /** 0 face basics, 1 small decor, 2 protrudes from the silhouette, 3 loud. Default from the slot. */
  noise?: number;
  /** Uncommon parts weigh 4 instead of 10 in pools; rare parts only come from the rare roll (1 in 12). */
  rarity?: "uncommon" | "rare";
  /** Pool weight when a pool lists the part without one (default 10, uncommon 4). */
  weight?: number;
}

export interface SlotDef {
  id: string;
  /** Spanish label (editor row, or tooltip inside a shared row). */
  label: string;
  /** Evaluation order: emitters before readers (top before eyes, eyes before eyewear, arms before held). Ties in draw order follow it too. */
  order: number;
  /** Evaluation order when it must differ from `order` (draw ties, editor rows and the roller keep `order`). Headgear
   * runs at 43: after the eyes (a hat seats itself over them), before marks (they step clear of its brim). */
  evaluate?: number;
  /** Editor row this slot shares (e.g. "Detalles", "Accesorios"); default its own row. */
  row?: string;
  multi?: boolean;
  /** Most parts a multi slot holds. */
  max?: number;
  /** Always filled (eyes, mouth). */
  required?: boolean;
  /** Label of the "none" chip for optional single slots that get their own row. */
  none?: string;
  layer: number;
  noise?: number;
  /** A gear slot for the seed roller's gear step; slots with the same region never both get gear ("head"). */
  gear?: string;
  /** How often the gear step tries this slot first, against 1 for the others (default 1). */
  gearWeight?: number;
  /** A gear slot that also holds body parts (back: quills, shells): only its parts with this tag are gear, for the gear
   * step and the rare roll (the cape, the backpack and the jetpack carry `gear`). */
  gearTag?: string;
  /** Its parts are named in the traits line. */
  trait?: boolean;
}

/** Back to front. Ties go by slot order. Outline, fills and inner pieces are separate passes, each sorted by layer.
 * Two layers change the pass an inner piece is drawn in:
 * - `skin` (paint on the body): drawn in the fills pass, just over the body's fill and under every other part (arms,
 *   hats, caps). A merged piece there shows no outline while it lies on the body.
 * - `nose`: drawn in the face, after the eyes (and the closed lids) and before the mouth: a big nose in front of a
 *   cyclops eye. */
export const LAYER = { back: 8, tail: 10, top: 20, legs: 25, body: 30, skin: 30.5, face: 50, nose: 55, decor: 60, worn: 70, float: 75, arms: 80, held: 85 } as const;

/* ---------- families and members (the seed roller's templates) ---------- */

/** "id", ["a", "b"] (part weights), or { a: 3, b: 1 }. */
export type Weighted = string | string[] | Record<string, number>;
/** A slot a member may fill: `p` is the chance it is filled at all (default 1). */
export interface Pool { p?: number; pick: Weighted }
export type Num = number | [number, number] | { pick: number[] };
export interface ColorRule { weight?: number; hue?: Num; sat?: Num; light?: Num; spot?: Num }

export interface FamilyDef {
  id: string;
  label: string;
  weight: number;
  color?: ColorRule | ColorRule[];
  /** Added to every member's pools; other families borrow them too, through the cross-family roll. */
  pools?: Record<string, Pool | Weighted>;
  /** Offered only to other families' bichos, through the cross-family roll; never to this family's own members. A
   * slot here replaces the same slot of `pools` in that roll. */
  cross?: Record<string, Pool | Weighted>;
}

export interface MemberDef {
  id: string;
  family: string;
  /** Spanish: the editor's template chip and the bicho's name. */
  label: string;
  /** Default 10; the existing templates weigh 14, rare members 3. */
  weight?: number;
  bodies: Weighted;
  /** Always present (the signature parts plus fixed defaults). Multi slots take a list. "a|b" is a fallback list: the
   * first id that exists wins (a part from a later batch, with a stand-in until it lands). A single slot may also take
   * weighted options, `{ bunny: 10, "ears-lop": 3 }`: one of them is always there, never dropped or replaced. */
  fixed?: Record<string, string | string[] | Record<string, number>>;
  pools?: Record<string, Pool | Weighted>;
  /** Overrides the family's colour rule. */
  color?: ColorRule | ColorRule[];
}

/** Options a batch adds to a family or a member declared in another file (B06 lends the core cat its patch). The file
 * that owns the parts says where they roll; the base definition stays where it is. */
export interface Extension {
  family: string;
  /** Omitted: the family itself (its `pools` and `cross`). */
  member?: string;
  /** More options for a member's fixed single slot, by weight (the base pick weighs its part's weight). */
  fixed?: Record<string, Record<string, number>>;
  /** More pools: they add to the existing ones like a family's pools add to a member's (the highest `p` wins, each id
   * keeps its highest weight), so give `p` when the slot already has a pool. */
  pools?: Record<string, Pool | Weighted>;
  /** Families only: more cross pools (see `FamilyDef.cross`). */
  cross?: Record<string, Pool | Weighted>;
}

/** Old or new spec JSON; the loader adapts it. */
export type SpecInput = Partial<Spec> | Record<string, unknown>;

export interface Batch {
  /** Lab row title for this file's showcase. */
  label?: string;
  slots?: SlotDef[];
  bodies?: BodyDef[];
  parts?: PartDef[];
  families?: FamilyDef[];
  members?: MemberDef[];
  /** Options for families and members declared in other files. */
  extend?: Extension[];
  /** Seed prefixes: "monstruo:<rest>" → prefixes.monstruo(rest). */
  prefixes?: Record<string, (rest: string) => SpecInput>;
  /** Injected under `.av[data-style=bichos]`, with `&` nesting and top-level @keyframes. */
  css?: string;
  /** Seeds shown as a lab row (try "bicho:<family>/<member>:<seed>?slot=id"). Members get a row on their own. */
  showcase?: string[];
}

/** Types the default export of a part file. */
export const batch = (b: Batch): Batch => b;

/* ---------- colours ---------- */

/** Ready-made colours for the editor: the old paper-puppet card stock first, then louder sticker hues. */
export const SWATCHES: [string, number, number, number][] = [
  ["mostaza", 38, 73, 56], ["terracota", 15, 60, 53], ["verde azulado", 176, 39, 40], ["salvia", 90, 26, 53], ["ciruela", 268, 30, 50],
  ["añil", 217, 42, 52], ["frambuesa", 340, 50, 57], ["naranja", 28, 82, 60], ["lima", 95, 70, 55], ["cielo", 200, 80, 62], ["chicle", 320, 75, 70], ["nube", 220, 10, 82],
];

/** Coats the role colours read badly on. Dark (light < 40): the dark role sinks into the ink, and eyes without a
 * sclera vanish. Pale (light >= 74): the belly role turns near white and `dark` is only a pale grey. The shiny palette
 * is neither. */
export const COAT = { dark: 40, pale: 74 } as const;
export const isDarkCoat = (spec: Spec) => !spec.shiny && spec.color.light < COAT.dark;
export const isPaleCoat = (spec: Spec) => !spec.shiny && spec.color.light >= COAT.pale;

/** Nearly black, but a step lighter than the ink of a pupil, a button eye or a lid. */
export const SOFT_INK = "#3b3345";

/** The paint of a dark mark that stays visible on any coat (a mask, panda patches, stripes, nostrils): `pale` (default
 * SOFT_INK) on a pale coat, `dark` (default the light belly colour) on a dark coat, the dark role in between and on the
 * shiny palette. A part of the animal itself (a black bear's ears) passes `dark = "dark"`: it stays dark on a dark coat. */
export function darkMark(spec: Spec, pale: Paint = SOFT_INK, dark: Paint = "belly"): Paint {
  return isPaleCoat(spec) ? pale : isDarkCoat(spec) ? dark : "dark";
}

/* ---------- drawing helpers ---------- */

/** A closed ellipse as a path (quadratic arcs, the way the existing parts draw them). */
export const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${n(cx - rx)} ${n(cy)} Q${n(cx - rx)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)} Q${n(cx + rx)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy)} Q${n(cx + rx)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)} Q${n(cx - rx)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy)}Z`;

/** Mirror a path across x = 60, rewriting its numbers (so shading stays lit from the top-left). Handles every command,
 * absolute and relative; write arc flags as separate numbers. */
export function mirrorPath(d: string): string {
  let cmd = "", i = 0, out = "", prevNum = false;
  for (const [tok] of d.matchAll(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)) {
    if (/[A-Za-z]/.test(tok)) { cmd = tok; i = 0; out += tok; prevNum = false; continue; }
    const upper = cmd.toUpperCase(), abs = cmd === upper;
    let v = Number(tok), x = false, changed = false;
    if (upper === "H") x = true;
    else if (upper === "A") {
      const k = i % 7;
      if (k === 2) { v = -v; changed = true; } else if (k === 4) { v = 1 - v; changed = true; } else if (k === 5) x = true;
    } else if (upper !== "V") x = i % 2 === 0;
    if (x) { v = abs ? 120 - v : -v; changed = true; }
    i += 1;
    const text = changed ? String(n(v)) : tok;
    out += (prevNum && !text.startsWith("-") ? " " : "") + text;
    prevNum = true;
  }
  return out;
}

/** A left piece and its mirror; `g` becomes `<g>-l` / `<g>-r`. For parts drawn in place (no `at`). */
export const pair = (d: string, c: Paint, extra: Partial<Piece> = {}): Piece[] => [
  { ...extra, d, c, g: extra.g ? `${extra.g}-l` : extra.g },
  { ...extra, d: mirrorPath(d), c, g: extra.g ? `${extra.g}-r` : extra.g },
];

/** One eye `dx, dy` from the face centre (`eyes` anchor), shrunk to stay inside the face. */
export const eyeAt = ({ rig }: Ctx, dx: number, dy: number, r: number): Eye => ({ x: n(rig.at.eyes.x + dx), y: rig.at.eyes.y + dy, r: n(rig.fit(rig.at.eyes.x + dx, r)) });

/** A pair of eyes on `eyeL/R`, nudged `inward`. On a top's eye stalks (`stalkL/R`) it sits exactly on them, capped at the stalk's `r`. */
export function eyePair({ rig }: Ctx, inward: number, r: number): Eye[] {
  const { stalkL, stalkR, eyeL, eyeR } = rig.at;
  if (stalkL && stalkR) return [stalkL, stalkR].map((a) => ({ x: n(a.x), y: a.y, r: a.r ? Math.min(r, a.r) : r }));
  return [
    { x: n(eyeL.x + inward), y: eyeL.y, r: n(rig.fit(eyeL.x + inward, r)) },
    { x: n(eyeR.x - inward), y: eyeR.y, r: n(rig.fit(eyeR.x - inward, r)) },
  ];
}

/** The cast's toon eyes: white sclera with an ink ring, pupil and glint in `.look`, brows, closed lids. Pass the rig to
 * keep the brows under the head top (`toonBrows`). */
export function toonEyes(eyes: Eye[], rig?: Rig): Face {
  return {
    eyes: eyes.map((e) => `<circle fill="#fff" stroke="${INK}" stroke-width="2.6" cx="${e.x}" cy="${e.y}" r="${e.r}"/><g class="look"><circle fill="${INK}" cx="${e.x}" cy="${n(e.y + 1)}" r="${n(e.r * 0.52)}"/><circle fill="#fff" cx="${n(e.x + e.r * 0.2)}" cy="${n(e.y - e.r * 0.12)}" r="${n(e.r * 0.18)}"/></g>`).join(""),
    brows: toonBrows(eyes, rig),
    closed: closedLids(eyes, INK),
  };
}

/** Brows over each eye: hidden at rest, raised per word, knitted while working, worried while waiting (shared CSS).
 * With the rig, a brow that would float on the head's outline (big or high eyes on a low crown: wide, tri) comes down
 * to 5.5 under the real head top, never closer than 2.4 to its eye; eyes on stalks keep theirs over the eye. */
export function toonBrows(eyes: Eye[], rig?: Rig): string {
  const free = !!rig && !(rig.at.stalkL && rig.at.stalkR);
  return eyes.map((e, i) => {
    const side = eyes.length === 1 ? 0 : i < eyes.length / 2 ? -1 : 1;
    const y = free ? Math.min(e.y - e.r - 2.4, Math.max(e.y - e.r - 4, topAt(rig, e.x) + 5.5)) : e.y - e.r - 4;
    const peak = free ? y - 3 : e.y - e.r - 7;
    return `<g class="brow brow-${side < 0 ? "l" : side > 0 ? "r" : "c"}"><path fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" d="M${n(e.x - e.r * 0.7)} ${n(y)} Q${e.x} ${n(peak)} ${n(e.x + e.r * 0.7)} ${n(y)}"/></g>`;
  }).join("");
}

/** Closed eyes: one curved lid line per eye. */
export function closedLids(eyes: Eye[], color: string): string {
  return `<path fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" d="${eyes.map((e) => `M${n(e.x - e.r * 0.8)} ${e.y + 1}Q${e.x} ${n(e.y + e.r * 0.8)} ${n(e.x + e.r * 0.8)} ${e.y + 1}`).join("")}"/>`;
}

/** The cast's open mouth: a dark D with a tongue, plus optional extra markup at rest (fangs) and inside (teeth). */
export function toonMouth(x: number, y: number, { rest = "", teeth = "", w = 10, h = 15 } = {}): Face {
  const line = `fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
  const shape = `M${x - w} ${y - 2} H${x + w} Q${x + w} ${y - 2 + h} ${x} ${y - 2 + h} Q${x - w} ${y - 2 + h} ${x - w} ${y - 2}Z`;
  return {
    mouthRest: `<path ${line} d="M${x - w} ${y} Q${x} ${y + 7} ${x + w} ${y}"/>` + rest,
    mouthOpen: `<path fill="#3a0f22" d="${shape}"/><ellipse fill="#ff6f91" cx="${x + 1}" cy="${n(y - 2 + h * 0.72)}" rx="5" ry="${n(h * 0.25)}"/>${teeth}<path ${line} d="${shape}"/>`,
  };
}

/* ---------- hats ---------- */

/** Hats are drawn on the reference body with their top line at T; HAT_TOP (34) seats them 6 units above its crown. */
export const HAT_TOP = 34;
/** How far a hat may rise off its seat so the raised brows clear its brim and it still sits snug: past it the hat would
 * perch on the head, so it stays seated and the brows go (the renderer leaves out brows that reach a brim). */
export const HAT_LIFT = 3;
/** What a merged piece's fat outline shows past its edge: half its 7-unit stroke. */
export const MERGED_EDGE = 3.5;

/** Every hat: it joins `hat` (not `crown`) and hides what it would sit on, tall tops and `#hat-hidden` parts. */
export const HAT = { slot: "headgear", at: "hat", socket: [60, 42] as [number, number], hides: ["#tall", "#hat-hidden"] };

/** Where a hat drawn at HAT_TOP sits: its top line T, and its `brim` (the lowest it covers across the forehead, ink
 * edge included). `low` is the brim's lowest point below T, without the ink edge. It rises up to HAT_LIFT so a raised
 * brow (10 over the top of its eye) just clears the brim, else it stays seated and its brim leaves the brows out. With
 * `clearEyes` its brim also never comes down over an eye: big, raised or third eyes lift it as far as they need. */
export function seatHat({ rig, eyes }: Ctx, low: number, { clearEyes = false } = {}): { T: number; brim: number } {
  const { hat } = rig.at, s = hat.s ?? 1;
  const brimAt = (T: number) => T + low + MERGED_EDGE;
  if (!eyes.length) return { T: HAT_TOP, brim: brimAt(HAT_TOP) };
  const top = Math.min(...eyes.map((e) => e.y - e.r));
  // It rises a hair more than needed, so rounding never leaves the brim a breath under the brow.
  const need = hat.y + s * (brimAt(HAT_TOP) - 42) - (top - 10);
  let T = need > -0.05 && need <= HAT_LIFT ? HAT_TOP - (need + 0.05) / s : HAT_TOP;
  if (clearEyes) T = Math.min(T, 42 + (top - hat.y) / s - low - MERGED_EDGE);
  return { T, brim: brimAt(T) };
}

/** A hat's pieces: `body` (what lies on the head) drawn merged, then `rest` (what sticks up: a pompom, a stalk), then
 * `body` again as inner pieces, so the hat also lies over the inner pieces of what is under it (a cat's inner ears,
 * tabby stripes), which are drawn after every merged fill. */
export const wornHat = (body: Piece[], rest: Piece[] = []): Piece[] => [...body, ...rest, ...body.map((p) => ({ ...p, ink: "inner" as const }))];

/* ---------- geometry (points, centrelines, tubes, paths) ---------- */

/** A point in the 120 box. */
export type Pt = [number, number];
/** A point as path markup ("x y", two decimals). */
export const pt = (p: Pt) => `${n(p[0])} ${n(p[1])}`;
export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const len = (a: Pt) => Math.hypot(a[0], a[1]);
export const unit = (a: Pt): Pt => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
/** A quarter turn on screen (x right, y down): (1, 0) → (0, 1). */
export const perp = (a: Pt): Pt => [-a[1], a[0]];
export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const rad = (deg: number) => (deg * Math.PI) / 180;
/** A direction `deg` clockwise from straight up. */
export const dir = (deg: number): Pt => [Math.sin(rad(deg)), -Math.cos(rad(deg))];

/** Catmull-Rom through the points (open), resampled to `count` points evenly spaced along its length. */
export function centreline(pts: Pt[], count = 40): Pt[] {
  const dense: Pt[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 1; s <= 16; s += 1) {
      const t = s / 16, t2 = t * t, t3 = t2 * t;
      const f = (k: 0 | 1) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
      dense.push([f(0), f(1)]);
    }
  }
  const acc = [0];
  for (let i = 1; i < dense.length; i += 1) acc.push(acc[i - 1] + len(sub(dense[i], dense[i - 1])));
  const total = acc[acc.length - 1], out: Pt[] = [];
  for (let k = 0, j = 1; k < count; k += 1) {
    const at = (total * k) / (count - 1);
    while (j < dense.length - 1 && acc[j] < at) j += 1;
    const seg = acc[j] - acc[j - 1] || 1, u = (at - acc[j - 1]) / seg;
    out.push([dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * u, dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * u]);
  }
  return out;
}

/** The unit tangent of a polyline at point i (from its neighbours). */
export const tangent = (line: Pt[], i: number) => unit(sub(line[Math.min(line.length - 1, i + 1)], line[Math.max(0, i - 1)]));

/** A tube round a centreline, `w(t)` either side (t from 0 at the base to 1 at the tip), a round cap on the tip; the base
 * is flat (it hides in the body). Stalks, tails, tentacles, wisps. */
export function tube(line: Pt[], w: (t: number) => number): string {
  const m = line.length - 1, left: Pt[] = [], right: Pt[] = [];
  line.forEach((c, i) => { const v = perp(tangent(line, i)), r = w(i / m); left.push(add(c, mul(v, r))); right.push(sub(c, mul(v, r))); });
  const c = line[m], u = tangent(line, m), v = perp(u), r = w(1);
  const cap = [1, 2, 3, 4, 5, 6, 7].map((k) => add(c, add(mul(v, r * Math.cos((Math.PI * k) / 8)), mul(u, r * Math.sin((Math.PI * k) / 8)))));
  return `M${[...left, ...cap, ...right.reverse()].map(pt).join("L")}Z`;
}

/** A path as absolute commands, for `path()`. */
export type Cmd = ["M" | "L", Pt] | ["Q", Pt, Pt] | ["C", Pt, Pt, Pt] | ["Z"];
/** A path from absolute commands, each point passed through `map` (an affine map keeps the curves exact): draw once on
 * the reference body and fit it (B12's flame, the unicorn's horn on the mane). */
export function path(cmds: Cmd[], map: (p: Pt) => Pt = (p) => p): string {
  return cmds.map(([op, ...ps]) => op + (ps as Pt[]).map((p) => pt(map(p))).join(" ")).join("");
}

/** Maps a point drawn on the reference body round `ref` onto anchor `a`: turned by the anchor's normal against
 * `refAngle` (the reference anchor's), scaled by its `s`. For fitted parts that carry a rigid piece. */
export function onAnchor(a: Anchor, ref: Pt, refAngle = 0): (p: Pt) => Pt {
  const s = a.s ?? 1, t = rad((a.a ?? 0) - refAngle), cs = Math.cos(t), sn = Math.sin(t);
  return ([x, y]) => { const dx = (x - ref[0]) * s, dy = (y - ref[1]) * s; return [a.x + dx * cs - dy * sn, a.y + dx * sn + dy * cs]; };
}

/* ---------- reading a body's real outline ---------- */

/** A path flattened to polylines, one per subpath: M L H V C S Q T A Z, absolute or relative (curves and arcs sampled). */
export function flatten(d: string): Pt[][] {
  const tok = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const loops: Pt[][] = [];
  let cur: Pt[] = [], i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, last: Pt | null = null, lastOp = "";
  const num = () => Number(tok[i++]);
  const curve = (pts: Pt[], steps = 10) => {
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps, u = 1 - t;
      cur.push(pts.length === 3
        ? [u * u * pts[0][0] + 2 * u * t * pts[1][0] + t * t * pts[2][0], u * u * pts[0][1] + 2 * u * t * pts[1][1] + t * t * pts[2][1]]
        : [u * u * u * pts[0][0] + 3 * u * u * t * pts[1][0] + 3 * u * t * t * pts[2][0] + t * t * t * pts[3][0], u * u * u * pts[0][1] + 3 * u * u * t * pts[1][1] + 3 * u * t * t * pts[2][1] + t * t * t * pts[3][1]]);
    }
  };
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    else if (cmd === "" || /z/i.test(cmd)) { i += 1; continue; }
    const rel = cmd !== cmd.toUpperCase(), op = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    const from: Pt = [x, y];
    if (op === "M") {
      if (cur.length > 1) loops.push(cur);
      x = ox + num(); y = oy + num(); sx = x; sy = y; cur = [[x, y]]; cmd = rel ? "l" : "L"; last = null;
    } else if (op === "L") { x = ox + num(); y = oy + num(); cur.push([x, y]); last = null; }
    else if (op === "H") { x = (rel ? x : 0) + num(); cur.push([x, y]); last = null; }
    else if (op === "V") { y = (rel ? y : 0) + num(); cur.push([x, y]); last = null; }
    else if (op === "C" || op === "S") {
      const c1: Pt = op === "C" ? [ox + num(), oy + num()] : last && /[CS]/.test(lastOp) ? [2 * x - last[0], 2 * y - last[1]] : [x, y];
      const c2: Pt = [ox + num(), oy + num()];
      x = ox + num(); y = oy + num();
      curve([from, c1, c2, [x, y]]); last = c2;
    } else if (op === "Q" || op === "T") {
      const c1: Pt = op === "Q" ? [ox + num(), oy + num()] : last && /[QT]/.test(lastOp) ? [2 * x - last[0], 2 * y - last[1]] : [x, y];
      x = ox + num(); y = oy + num();
      curve([from, c1, [x, y]]); last = c1;
    } else if (op === "A") {
      let rx = Math.abs(num()), ry = Math.abs(num());
      const phi = (num() * Math.PI) / 180, large = num(), sweep = num();
      x = ox + num(); y = oy + num();
      // SVG arc, endpoint to centre parameterisation (SVG 2, appendix B.2.4), then sampled.
      const cp = Math.cos(phi), sp = Math.sin(phi), hx = (from[0] - x) / 2, hy = (from[1] - y) / 2;
      const x1 = cp * hx + sp * hy, y1 = -sp * hx + cp * hy;
      if (rx && ry) {
        const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
        if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
        const sq = Math.max(0, (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) / (rx * rx * y1 * y1 + ry * ry * x1 * x1));
        const k = (large === sweep ? -1 : 1) * Math.sqrt(sq), cx1 = (k * rx * y1) / ry, cy1 = (-k * ry * x1) / rx;
        const cx = cp * cx1 - sp * cy1 + (from[0] + x) / 2, cy = sp * cx1 + cp * cy1 + (from[1] + y) / 2;
        const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        const t0 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
        let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
        if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
        const steps = Math.max(4, Math.ceil(Math.abs(dt) / 0.2));
        for (let s = 1; s <= steps; s += 1) {
          const t = t0 + (dt * s) / steps, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
          cur.push([cp * ex - sp * ey + cx, sp * ex + cp * ey + cy]);
        }
      } else cur.push([x, y]);
      last = null;
    } else if (op === "Z") { x = sx; y = sy; cur.push([x, y]); if (cur.length > 1) loops.push(cur); cur = [[x, y]]; last = null; }
    else { i += 1; continue; }
    lastOp = op;
  }
  if (cur.length > 1) loops.push(cur);
  return loops;
}

const outlines = new Map<string, Pt[][]>();
/** The body's drawn outline (wobble included) as polylines, cached: every size of a bicho draws the same one. Shared:
 * read it, never change it. */
export function outlineLoops(rig: Pick<Rig, "outline">): Pt[][] {
  let loops = outlines.get(rig.outline);
  if (!loops) {
    if (outlines.size > 300) outlines.clear();
    loops = flatten(rig.outline);
    outlines.set(rig.outline, loops);
  }
  return loops;
}

/** Leftmost and rightmost x where the body's outline crosses height y (null above or below the body). */
export function spanAt(rig: Pick<Rig, "outline">, y: number): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (const loop of outlineLoops(rig)) for (let i = 1; i < loop.length; i += 1) {
    const [ax, ay] = loop[i - 1], [bx, by] = loop[i];
    if ((ay <= y && by >= y) || (ay >= y && by <= y)) {
      const x = ay === by ? Math.min(ax, bx) : ax + ((y - ay) / (by - ay)) * (bx - ax);
      const x2 = ay === by ? Math.max(ax, bx) : x;
      lo = Math.min(lo, x); hi = Math.max(hi, x2);
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/** The highest point of the body's outline straight above x: the real head top, wobble included (`rig.top` if none). */
export function topAt(rig: Pick<Rig, "outline" | "top">, x: number): number {
  let top = Infinity;
  for (const loop of outlineLoops(rig)) for (let i = 1; i < loop.length; i += 1) {
    const [ax, ay] = loop[i - 1], [bx, by] = loop[i];
    if ((ax <= x && bx >= x) || (ax >= x && bx <= x)) top = Math.min(top, ax === bx ? Math.min(ay, by) : ay + ((x - ax) / (bx - ax)) * (by - ay));
  }
  return Number.isFinite(top) ? top : rig.top;
}

/** The lowest point of the body's outline straight below x: the real base there, wobble included (`rig.bottom` if none). */
export function bottomAt(rig: Pick<Rig, "outline" | "bottom">, x: number): number {
  let low = -Infinity;
  for (const loop of outlineLoops(rig)) for (let i = 1; i < loop.length; i += 1) {
    const [ax, ay] = loop[i - 1], [bx, by] = loop[i];
    if ((ax <= x && bx >= x) || (ax >= x && bx <= x)) low = Math.max(low, ax === bx ? Math.max(ay, by) : ay + ((x - ax) / (bx - ax)) * (by - ay));
  }
  return Number.isFinite(low) ? low : rig.bottom;
}

/** The body's half width at height y (the narrower side, wobble included), or 0.7 of its half width off the body. */
export const halfAt = (rig: Pick<Rig, "outline" | "half">, y: number) => { const s = spanAt(rig, y); return s ? Math.min(60 - s[0], s[1] - 60) : rig.half * 0.7; };

/** Where a ray from `c`, `deg` clockwise from up, leaves the polylines (its farthest crossing; `c` if none). */
export function rim(loops: Pt[][], c: Pt, deg: number): Pt {
  const d = dir(deg);
  let best = -1;
  for (const loop of loops) for (let i = 1; i < loop.length; i += 1) {
    const a = loop[i - 1], e = sub(loop[i], a), w = sub(a, c);
    const det = e[0] * d[1] - d[0] * e[1];
    if (Math.abs(det) < 1e-9) continue;
    const s = (e[0] * w[1] - w[0] * e[1]) / det, u = (d[0] * w[1] - d[1] * w[0]) / det;
    if (u >= 0 && u <= 1 && s > best) best = s;
  }
  return best > 0 ? add(c, mul(d, best)) : c;
}

/** The body's middle, the point `onRim` casts its rays from. */
export const middle = (rig: Pick<Rig, "top" | "bottom">): Pt => [60, (rig.top + rig.bottom) / 2 + 2];

/** The body's outline at `deg` clockwise from up, seen from its middle: the point, the tangent there (from the points
 * `step` degrees either side) and the outward normal. For parts set along the outline (spines, plates, fur, a mane). */
export function onRim(rig: Pick<Rig, "outline" | "top" | "bottom">, deg: number, step = 3) {
  const loops = outlineLoops(rig), c = middle(rig), p = rim(loops, c, deg), t = unit(sub(rim(loops, c, deg + step), rim(loops, c, deg - step)));
  let nrm: Pt = [t[1], -t[0]];
  if ((p[0] - c[0]) * nrm[0] + (p[1] - c[1]) * nrm[1] < 0) nrm = mul(nrm, -1);
  return { p, t, nrm };
}
