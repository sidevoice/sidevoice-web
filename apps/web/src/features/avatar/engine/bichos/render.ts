import { hash, n, rng, uid, type Drawn, type Size } from "../core";
import { shade } from "../styles/mascots";
import { INK, LAYER, flatten, mirrorPath, outlineLoops, type Anchor, type Ctx, type Drawing, type Eye, type Face, type Lod, type Piece, type Pt, type Spec } from "./kit";
import { REF, defaultShine, place, rigOf, type Placement } from "./rig";
import { BODIES, asMatchable, bodyOf, hides, matches, slotOf, type Entry } from "./registry";
import { colorsOf, present, traitsOf } from "./spec";
import { idleProps } from "./idle";
import { workProps } from "./work";

/* A spec → SVG markup. Parts run in slot order (so a top's eye stalks exist before the eyes, and the eyes before the
 * glasses; a slot's `evaluate` moves it, as headgear runs before the marks); each lands on its anchor; then three passes
 * draw, each sorted by layer: the ink outline of every merged piece, their fills (with the inner pieces on the skin
 * layer right after the body), and the inner pieces. Face markup (with the inner pieces on the nose layer between the
 * eyes and the mouth), decor and props go on top, in the classes the CSS animates.
 *
 * Moving pieces sit in nested groups, outermost first: the part's group (or the group of the anchor it joins or rides,
 * such as an arm's hand), then a counter-turn for upright held items, then the piece's own `sub` group. Each group
 * pivots on its own point: the socket, the emitter's pivot, the hand, or the piece's `pivot`. */

/** A gear outline: `teeth` square-ish teeth around radius r. */
function cog(cx: number, cy: number, r: number, teeth: number) {
  const pts: string[] = [];
  for (let i = 0; i < teeth * 4; i += 1) {
    const a = (i / (teeth * 4)) * Math.PI * 2, rad = i % 4 < 2 ? r : r * 0.74;
    pts.push(`${n(cx + Math.cos(a) * rad)} ${n(cy + Math.sin(a) * rad)}`);
  }
  return `M${pts.join("L")}Z`;
}

/* ---------- the shared cues, placed beside the figure's real silhouette ----------
 * The mood cues every figure shares (mascots too) sit next to the figure, never on it: the cog pair (working, at every
 * size but the rail), the "!" (unread, a badge in the sidebar and the rail), the listening cue (sound waves flowing into
 * the side of the head; a badge at the rail), the zz, and the startle burst over the head (entering listening). Where
 * they go comes from the figure's profile: for every row of the 120 box, the leftmost and rightmost x any piece with an
 * outline reaches, ink included. Big ears, tall tops, wide bodies and the mascots' marks push them out of the way. */

/** The figure row by row: `L[y + PROFILE_TOP]` and `R[…]` are the leftmost and rightmost x it reaches at row y. */
export interface Profile { L: Float64Array; R: Float64Array; top: number }
const PROFILE_TOP = 30, PROFILE_ROWS = 170;

/** The profile of some shapes: polylines in the 120 box, each with the half width of its ink (a fill's outline or a line). */
export function profileOf(shapes: { loops: Pt[][]; r: number }[]): Profile {
  const L = new Float64Array(PROFILE_ROWS).fill(Infinity), R = new Float64Array(PROFILE_ROWS).fill(-Infinity);
  let top = Infinity;
  const mark = (x: number, y: number, r: number) => {
    for (let row = Math.max(0, Math.floor(y - r) + PROFILE_TOP), end = Math.min(PROFILE_ROWS - 1, Math.ceil(y + r) + PROFILE_TOP); row <= end; row += 1) {
      if (x - r < L[row]) L[row] = x - r;
      if (x + r > R[row]) R[row] = x + r;
    }
    top = Math.min(top, y - r);
  };
  for (const { loops, r } of shapes) for (const loop of loops) for (let i = 0; i < loop.length; i += 1) {
    const [x, y] = loop[i];
    mark(x, y, r);
    if (!i) continue;
    const [px, py] = loop[i - 1], steps = Math.ceil(Math.hypot(x - px, y - py) / 1.5);
    for (let k = 1; k < steps; k += 1) mark(px + ((x - px) * k) / steps, py + ((y - py) * k) / steps, r);
  }
  return { L, R, top: Number.isFinite(top) ? top : 40 };
}

const rowOf = (y: number) => Math.round(y) + PROFILE_TOP;
/** True when a circle on the right (`side` 1) or the left (-1) keeps `gap` clear of the figure. */
function clearCircle(p: Profile, cx: number, cy: number, r: number, side: 1 | -1, gap: number) {
  for (let y = Math.ceil(cy - r); y <= Math.floor(cy + r); y += 1) {
    const row = rowOf(y);
    if (row < 0 || row >= PROFILE_ROWS) continue;
    const w = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
    if (side === 1 ? cx - w < p.R[row] + gap : cx + w > p.L[row] - gap) return false;
  }
  return true;
}
/** The rightmost (`side` 1) or leftmost x of the figure over rows y0…y1. */
function edge(p: Profile, y0: number, y1: number, side: 1 | -1) {
  let e = side === 1 ? -Infinity : Infinity;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y += 1) {
    const row = rowOf(y);
    if (row >= 0 && row < PROFILE_ROWS) e = side === 1 ? Math.max(e, p.R[row]) : Math.min(e, p.L[row]);
  }
  return e;
}

/** A cluster of circles ([dx, dy, r] round a centre) near `at`: the first of a few spots up and outwards from it, then
 * smaller, that keeps clear of the figure; the default spot if none does (a crowded corner wins over leaving the box). */
function spotFor(p: Profile, at: Pt, circles: [number, number, number][], side: 1 | -1, scales = [1, 0.86, 0.74], mirror = side === -1): [number, number, number] {
  const m = mirror ? -1 : 1;
  for (const k of scales) for (let step = 0; step <= 8; step += 1) for (let up = 0; up <= step; up += 1) {
    const x = at[0] + side * (step - up) * 2.5, y = at[1] - up * 2.5;
    if (circles.every(([dx, dy, r]) => clearCircle(p, x + m * dx * k, y + dy * k, (r + 1.5) * k, side, 2.5))) return [n(x), n(y), k];
  }
  return [at[0], at[1], scales[0]];
}

/** Where the cues go for one figure at one size. */
export interface Spots {
  /** The big cog's centre and the pair's scale; the small cog sits at (12.5, 15.5) from it. */
  cogs: [number, number, number];
  /** The cog pair's shift to the other corner, for while the "!" holds this one (unread over working). */
  alt: [number, number];
  /** The "!" bubble's middle and scale. */
  bang: [number, number, number];
  /** The listening waves' middle, their scale, and their turn (degrees) so that they flow in towards the head. */
  ear: [number, number, number, number];
  /** The top of the figure over its middle: the startle burst's centre sits under it. */
  top: number;
}

const COG_PAIR: [number, number, number][] = [[0, 0, 11], [12.5, 15.5, 7]];
const WAVE_DISC: [number, number, number][] = [[3, 0, 13]];
const BANG: [number, number, number][] = [[0, -5, 9], [0, 5, 9]];

/** The cues' spots for a figure with profile `p`, its eyes on `eyeY`. Small sizes put the "!" (and the listening badge)
 * in the top-right corner as a badge, overhanging the box a little, wherever the figure is. */
export function spotsOf(p: Profile, eyeY: number, size: Size): Spots {
  // The other corner keeps the pair's shape and size (CSS only shifts it): the small cog stays on the big one's right.
  const cogs = spotFor(p, [99, 21], COG_PAIR, 1), left = spotFor(p, [12, 21], COG_PAIR, -1, [cogs[2]], false);
  const alt: [number, number] = [n(left[0] - cogs[0]), n(left[1] - cogs[1])];
  const bang: [number, number, number] = size === "stage" ? spotFor(p, [103, 18], BANG, 1) : size === "sidebar" ? [106.5, 16.5, 1.55] : [107, 18, 1.9];
  // The listening waves (stage) take the corner the cogs take (they never show together), a little lower, a size up,
  // and turn to flow in towards the head. The small sizes show a badge in the "!" corner instead.
  const k = 1.05, [ex, ey, ek] = spotFor(p, [100, 30], WAVE_DISC.map(([x, y, r]) => [x, y, r * k] as [number, number, number]), 1);
  const ear: [number, number, number, number] = [ex, ey, n(ek * k), n((Math.atan2(ey - (eyeY - 4), ex - 60) * 180) / Math.PI)];
  return { cogs, alt, bang, ear, top: n(Math.max(-6, p.top)) };
}

/** The listening waves round their middle: three copies of one arc that travel in on the same path (towards -x, turned
 * to face the head), shrinking and fading, a third of a cycle apart so they stay evenly spaced. Each also carries the
 * spot it holds in a still frame (reduced motion), spread out like "(((". */
const ARC = "M3.5 7Q-3.5 0 3.5 -7";
const WAVES = [0, 1, 2].map((i) => `<g class="listen-w" style="animation-delay:${n(-i * 0.6)}s;transform:translateX(${-6 + i * 8}px) scale(${n(0.75 + i * 0.2)})"><path class="ink" d="${ARC}"/><path class="tone" d="${ARC}"/></g>`).join("");
/** The listening badge (sidebar and rail): a little bubble with two arcs. */
const EAR_BADGE = `<rect x="-9" y="-12" width="18" height="24" rx="6"/><path d="M-1 -5Q-5 0 -1 5M4 -7.5Q-2 0 4 7.5"/>`;

/** The mood props, placed: the cog pair and the puffs (working), the "!" (unread), the zz (asleep), the listening cue,
 * and the startle burst (entering listening). */
export function props(s: Spots, size: Size): string {
  const [cx, cy, ck] = s.cogs, [bx, by, bk] = s.bang, [ex, ey, ek, ea] = s.ear, at = (x: number, y: number, k = 1) => `translate(${n(x)} ${n(y)})${k !== 1 ? ` scale(${n(k)})` : ""}`;
  const burst = [-56, -28, 0, 28, 56].map((a) => { const r = (a * Math.PI) / 180, s0 = Math.sin(r), c0 = Math.cos(r); return `M${n(s0 * 15)} ${n(-c0 * 15)}L${n(s0 * 23)} ${n(-c0 * 23)}`; }).join("");
  return `<g class="prop-work cogs keep-small" style="--cogs-alt:${s.alt[0]}px ${s.alt[1]}px"><g transform="${at(cx, cy, ck)}">
        <g class="cog cog-big"><path d="${cog(0, 0, 11, 8)}"/><circle r="3.6"/></g>
        <g class="cog cog-small"><path d="${cog(12.5, 15.5, 7, 6)}"/><circle cx="12.5" cy="15.5" r="2.4"/></g>
      </g></g>
      <g class="prop-work puffs"><circle cx="22" cy="98" r="4"/><circle cx="16" cy="92" r="2.6"/><circle cx="100" cy="98" r="3.4"/></g>
      <g transform="${at(bx, by, bk)}"><g class="prop-wait bang"><rect x="-9" y="-12" width="18" height="24" rx="6"/><text y="7" text-anchor="middle">!</text></g></g>
      <g transform="${at(bx - 7, by + 6)}"><g class="prop-idle zz"><text>z</text><text x="8" y="-8" class="z2">z</text></g></g>
      ${size !== "stage" ? `<g transform="${at(bx, by, bk)}"><g class="prop-listen listen-badge badge">${EAR_BADGE}</g></g>`
        : `<g transform="${at(ex, ey, ek)} rotate(${ea})"><g class="prop-listen listen keep-small">${WAVES}</g></g>`}
      ${size === "stage" ? `<g transform="${at(60, s.top + 21)}"><g class="enter-burst"><path d="${burst}"/></g></g>` : ""}`;
}

const FIXED: Record<string, string> = { pink: "#f6a9bb", ink: INK };
const ROLES = new Set(["body", "belly", "dark", "spot", "horn", "gold", "pink", "ink"]);

/** A group a piece sits in, and its pivot (none: the group's CSS sets it). */
interface Grp { g: string; o?: [number, number] }
interface Laid { p: Piece; layer: number; seq: number; t: string; gs: Grp[]; map?: (x: number, y: number) => [number, number] }
interface Over { html: string; layer: number; seq: number }

const visible = (lod: Lod | undefined, size: Size) => !(lod === 1 && size === "rail") && !(lod === 2 && size !== "stage");
const wrap = (html: string, t: string) => (t && html ? `<g transform="${t}">${html}</g>` : html);
const MIRROR = "matrix(-1 0 0 1 120 0)";

/** The parts that get drawn: known, coherent (the spec was resolved), and not hidden by another part or the body. In
 * evaluation order: the slot's `evaluate` (default its `order`), then the draw sequence. */
function drawable(spec: Spec): Entry[] {
  const list = present(spec);
  const body = bodyOf(spec.body);
  const when = (e: Entry) => { const s = slotOf(e.slot)!; return s.evaluate ?? s.order; };
  return list.filter((e) => !(body && (body.hides ?? []).some((r) => matches(r, e))) && !list.some((o) => hides(o, e)))
    .sort((a, b) => when(a) - when(b) || a.seq - b.seq);
}

/** The eyes as the eyes part will draw them, run ahead for the parts evaluated before it (a top that hugs the face).
 * Eye stalks don't exist yet at that point, so a top that emits them moves the eyes afterwards. */
function plannedEyes(parts: Entry[], ctx: Ctx): Eye[] {
  const e = parts.find((x) => x.slot === "eyes" && !x.at && visible(x.lod, ctx.size));
  if (!e) return [];
  return (typeof e.draw === "function" ? e.draw(ctx) : e.draw).eyes ?? [];
}

export function renderSpec(spec: Spec, size: Size): Drawn {
  const id = uid("bx");
  const body = bodyOf(spec.body) ?? BODIES[0];
  const rig = rigOf(body, rng(spec.shape, "shape"));
  const parts = drawable(spec);
  const gradients = new Map<string, string>();
  /** The cast's shade for a paint (a role, "#rrggbb" or any CSS colour): one gradient per paint per bicho, shared by
   * its pieces and by `ctx.shade` (markup in `over`). */
  const paint = (c: string) => {
    const literal = c.startsWith("#"), role = ROLES.has(c);
    return { key: literal ? `h${c.slice(1)}` : role ? c : `c${hash(c).toString(36)}`, css: literal ? c : role ? FIXED[c] ?? `var(--bx-${c})` : c };
  };
  const gradient = (c: string) => {
    const { key, css } = paint(c);
    if (!gradients.has(key)) gradients.set(key, shade(`${id}${key}`, css));
    return `url(#${id}${key})`;
  };
  /** The same shade spanning the body's box (in user space) instead of the piece's own: `span: "body"`. */
  const bodyGradient = (c: string) => {
    const { key, css } = paint(c), k = `${key}-b`;
    if (!gradients.has(k)) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const loop of outlineLoops(rig)) for (const [x, y] of loop) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      gradients.set(k, shade(`${id}${k}`, css).replace("<radialGradient ", `<radialGradient gradientUnits="userSpaceOnUse" gradientTransform="matrix(${n(x1 - x0)} 0 0 ${n(y1 - y0)} ${n(x0)} ${n(y0)})" `));
    }
    return `url(#${id}${k})`;
  };
  const ctx: Ctx = {
    rig, spec, size, eyes: [],
    rng: (salt) => rng(spec.shape, salt),
    has: (ref) => parts.some((e) => matches(ref, e)) || matches(ref, asMatchable(body)),
    shade: gradient,
  };
  ctx.eyes = plannedEyes(parts, ctx);
  const laid: Laid[] = [{ p: { d: rig.outline, c: "body" }, layer: 30, seq: -1, t: "", gs: [] }];
  const over: Over[] = [];
  const face: Required<Omit<Face, "shine">> = { eyes: "", closed: "", brows: "", mouthRest: "", mouthOpen: "" };
  let shine: string | undefined;
  /** The lowest brim any part draws across the forehead (see `Drawing.brim`). */
  let brim = -Infinity;
  /** A part asked for the body's gloss under it (see `Drawing.glossUnder`). */
  let partGlossUnder = false;
  /** Parts' overrides of the body's ground shadow (`Drawing.shadow`). */
  let shadowOver: Drawing["shadow"];
  /** Markup in a group (a riding part's `over`): `pg-<g>` round its pivot. */
  const inGroup = (html: string, g?: Grp) => (g && html ? `<g class="pg-${g.g}"${g.o ? ` style="transform-box:view-box;transform-origin:${n(g.o[0])}px ${n(g.o[1])}px"` : ""}>${html}</g>` : html);

  for (const e of parts) {
    const slot = slotOf(e.slot)!;
    if (!visible(e.lod, size)) continue;
    const drawing: Drawing = typeof e.draw === "function" ? e.draw(ctx) : e.draw;
    const layer = e.layer ?? slot.layer;
    // The eyes part rides whatever the eyes ride (moving eye stalks), its pieces too (the owl eyes' belly rings).
    const rides = e.rides ?? (e.slot === "eyes" && !e.at ? "eyes" : undefined);

    const collect = (d: Drawing, pl: Placement | null, suffix: string, mirrored: boolean, inherit?: Anchor) => {
      const t = [pl?.t, mirrored ? MIRROR : ""].filter(Boolean).join(" ");
      /** A point of the drawing, placed (and mirrored) like the part. */
      const put = (x: number, y: number): [number, number] => (pl ? pl.map(mirrored ? 120 - x : x, y) : [x, y]);
      // The part's group pivots on its socket (a fitted part's on its drawing's `pivot`), or the part rides the group
      // of the anchor it joins; a piece's own `g` or `sub` pivots on the piece's `pivot` (else its CSS sets it).
      const partOrigin = pl ? pl.origin : d.pivot && put(...d.pivot);
      // Upright: a counter-turn about the hand, inside the arm's group (the shared `upright-l/-r` undo `arm-l/-r`).
      const upright: Grp | undefined = e.upright && inherit?.g && /^arm-[lr]$/.test(inherit.g) ? { g: `upright-${inherit.g.slice(-1)}`, o: [inherit.x, inherit.y] } : undefined;
      const groupsOf = (p: Piece): Grp[] => {
        const own = p.pivot && put(...p.pivot), gs: Grp[] = [];
        if (p.g === null) { /* out of the part's group */ }
        else if (p.g) gs.push({ g: p.g + suffix, o: p.sub ? undefined : own });
        else if (e.group) gs.push({ g: e.group + suffix, o: partOrigin });
        else if (inherit?.g) { gs.push({ g: inherit.g, o: inherit.o }); if (upright) gs.push(upright); }
        if (p.sub) gs.push({ g: p.sub + suffix, o: own });
        return gs;
      };
      for (const p0 of d.pieces ?? []) {
        const p = mirrored ? { ...p0, d: mirrorPath(p0.d) } : p0;
        laid.push({ p: { ...p, ink: p.ink ?? e.ink }, layer: p.layer ?? layer, seq: e.seq, t: pl?.t ?? "", gs: groupsOf(p0), map: pl?.map });
      }
      // A riding part's markup rides with its pieces (eyewear on moving eye stalks); other parts' markup stays put.
      const ride: Grp | undefined = rides && inherit?.g ? { g: inherit.g, o: inherit.o } : undefined;
      if (d.over) over.push({ html: inGroup(wrap(d.over, t), ride), layer, seq: e.seq });
      if (d.overBox && !mirrored) over.push({ html: inGroup(d.overBox, ride), layer, seq: e.seq });
      if (d.shadow && !mirrored) shadowOver = { ...shadowOver, ...d.shadow };
      for (const k of ["eyes", "closed", "brows", "mouthRest", "mouthOpen"] as const) if (d.face?.[k]) face[k] += wrap(d.face[k]!, t);
      if (d.face?.shine !== undefined) shine = d.face.shine;
      if (d.glossUnder) partGlossUnder = true;
      if (d.brim !== undefined) ctx.brim = brim = Math.max(brim, pl ? pl.map(e.socket?.[0] ?? 60, d.brim)[1] : d.brim);
      if (d.eyes) ctx.eyes = pl ? d.eyes.map((ey) => { const [x, y] = pl.map(mirrored ? 120 - ey.x : ey.x, ey.y); return { x: n(x), y: n(y), r: ey.r }; }) : d.eyes;
      for (const [name, a] of Object.entries(d.emits ?? {})) {
        const [x, y] = pl ? pl.map(mirrored ? 120 - a.x : a.x, a.y) : [a.x, a.y];
        const named = mirrored && name.endsWith("L") ? name.slice(0, -1) + "R" : name;
        rig.at[named] = { ...a, x, y, g: e.group ? e.group + suffix : inherit?.g, o: e.group ? partOrigin : inherit?.o };
      }
      // Eye stalks that move as one (both carry the same group and pivot): the eyes ride them, and so does `eyes`, the
      // anchor eyewear rides (`rides: "eyes"`). Stalks that move apart (`-l`/`-r`) can't carry one face, so the eyes stay.
      const { stalkL: sl, stalkR: sr } = rig.at;
      if (d.emits && sl?.g && sl.g === sr?.g && sl.o?.[0] === sr.o?.[0] && sl.o?.[1] === sr.o?.[1]) rig.at.eyes = { ...rig.at.eyes, g: sl.g, o: sl.o };
    };

    if (!e.at) { collect(drawing, null, "", false, rides ? rig.at[rides] : undefined); continue; }
    const anchor = rig.at[e.at];
    if (!anchor || !e.socket) continue;
    const isPair = e.pair !== false && e.at.endsWith("L") && !!rig.at[e.at.slice(0, -1) + "R"];
    const j = e.jitter, r = j && rng(spec.shape, `jit:${e.slot}`);
    const q = (v: number) => (j?.step ? Math.round(v / j.step) * j.step : v);
    const jit = j && r ? { dx: q(r.range(-(j.dx ?? 0), j.dx ?? 0)), dy: q(r.range(-(j.dy ?? 0), j.dy ?? 0)), rot: q(r.range(-(j.rot ?? 0), j.rot ?? 0)), size: q(r.range(-(j.size ?? 0), j.size ?? 0)) } : undefined;
    const L = place(anchor, REF[e.at], e.socket, jit);
    collect(drawing, L, isPair ? "-l" : "", false, anchor);
    if (isPair) {
      const rName = e.at.slice(0, -1) + "R", rAnchor = rig.at[rName];
      const R = place(rAnchor, REF[rName], [120 - e.socket[0], e.socket[1]], jit && { ...jit, dx: -jit.dx, rot: -jit.rot });
      collect(drawing, R, "-r", true, rAnchor);
    }
  }

  // Draw order: by layer, then slot order; the body sits first among layer 30.
  laid.sort((a, b) => a.layer - b.layer || a.seq - b.seq);
  over.sort((a, b) => a.layer - b.layer || a.seq - b.seq);
  // At 28 px hairlines only add noise.
  const shown = laid.filter((l) => visible(l.p.lod, size) && !(size === "rail" && l.p.c === "ink" && (l.p.w ?? 9) < 2));

  const colors = colorsOf(spec);
  const fill = (p: Piece, placed: boolean) => {
    if (FIXED[p.c]) return FIXED[p.c];
    if (p.flat || p.w) return p.c.startsWith("#") ? p.c : `var(--bx-${p.c})`;
    return p.span === "body" && !placed ? bodyGradient(p.c) : gradient(p.c);
  };
  const piece = (l: Laid, outline: boolean) => {
    const { p } = l, at = l.t ? ` transform="${l.t}"` : "";
    if (p.w) return `<path d="${p.d}"${at} fill="none" stroke="${outline ? INK : fill(p, !!l.t)}" stroke-width="${outline ? p.w + 7 : p.w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (outline) return `<path d="${p.d}"${at} fill="${INK}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`;
    return `<path d="${p.d}"${at} fill="${fill(p, !!l.t)}"${p.stroke ? ` stroke="${INK}" stroke-width="${p.stroke}" stroke-linejoin="round"` : ""}/>`;
  };
  let clipped = false;
  const sameGroup = (a?: Grp, b?: Grp) => a?.g === b?.g && a?.o?.[0] === b?.o?.[0] && a?.o?.[1] === b?.o?.[1];
  /** Consecutive pieces of one group (same name, same pivot) share a <g class="pg-…">, nested groups inside it; clipped
   * runs share a clip group, innermost. */
  const pass = (list: Laid[], outline: boolean, depth = 0): string => {
    let html = "";
    for (let i = 0; i < list.length;) {
      const head = list[i].gs[depth], clip = !outline && !!list[i].p.clip;
      let j = i + 1;
      while (j < list.length && sameGroup(list[j].gs[depth], head) && !!list[j].p.clip === clip) j += 1;
      const run = list.slice(i, j);
      if (head) html += `<g class="pg-${head.g}"${head.o ? ` style="transform-box:view-box;transform-origin:${n(head.o[0])}px ${n(head.o[1])}px"` : ""}>${pass(run, outline, depth + 1)}</g>`;
      else {
        let inner = run.map((l) => piece(l, outline)).join("");
        if (clip) { clipped = true; inner = `<g clip-path="url(#${id}clip)">${inner}</g>`; }
        html += inner;
      }
      i = j;
    }
    return html;
  };
  // Inner pieces on the skin layer are drawn with the fills (right after the body's); on the nose layer, in the face.
  const isMerged = (l: Laid) => (l.p.ink ?? "merge") === "merge", onSkin = (l: Laid) => !isMerged(l) && l.layer === LAYER.skin, onNose = (l: Laid) => !isMerged(l) && l.layer === LAYER.nose;
  const shineD = shine ?? (body.shine ?? defaultShine)(rig), gloss = shineD ? `<path class="shine" d="${shineD}"/>` : "";
  // Under a hat (any drawn brim), or a body or part that asked for it (the robots'), the body's gloss is painted right after the
  // skin, so the hat, arms and everything worn cover it; a part's own gloss (`face.shine`: a cap's, a topping's highlight) stays where it always was, on top.
  const glossUnder = !!gloss && shine === undefined && (brim > -Infinity || partGlossUnder || !!body.glossUnder);
  const fills = shown.filter((l) => isMerged(l) || onSkin(l));
  const outlineHtml = pass(shown.filter(isMerged), true);
  const fillsHtml = glossUnder ? pass(fills.filter((l) => l.layer <= LAYER.skin), false) + gloss + pass(fills.filter((l) => l.layer > LAYER.skin), false) : pass(fills, false);
  const innerHtml = pass(shown.filter((l) => !isMerged(l) && !onSkin(l) && !onNose(l)), false), noseHtml = pass(shown.filter(onNose), false);
  // Brows under a brim: a raised brow tops out 10 over its eye (toonBrows: the arc and its stroke reach 7, the lift adds 3).
  // Pushing them down would land them on the eyes, so when they would reach the brim they are left out.
  if (ctx.eyes.length && Math.min(...ctx.eyes.map((e) => e.y - e.r)) - 10 < brim) face.brows = "";
  const shadow = { ...body.shadow, ...shadowOver };
  // Eyes on moving stalks ride them: the eyes, the closed lids and the brows (`eyes` carries the stalks' group).
  const eyeRide: Grp | undefined = rig.at.eyes.g ? { g: rig.at.eyes.g, o: rig.at.eyes.o } : undefined;
  // The working styles' props (shown by the root's `data-work`) and the arm angles their keyframes read (work.ts).
  const work = workProps(spec, rig, size, gradient);
  // The idle pastimes' props (shown by the root's `data-idle`) and the arm angles their keyframes read (idle.ts).
  const idle = idleProps(spec, rig, size, gradient, ctx.eyes);
  const defs =[...gradients.values()].join("") + (clipped ? `<clipPath id="${id}clip"><path d="${rig.outline}"/></clipPath>` : "");
  // The figure's silhouette (every merged piece drawn at this size, ink included), for where the cues go.
  const profile = profileOf(shown.filter(isMerged).map((l) => {
    const loops = flatten(l.p.d);
    return { loops: l.map ? loops.map((loop) => loop.map(([x, y]) => l.map!(x, y))) : loops, r: l.p.w ? (l.p.w + 7) / 2 : 3.5 };
  }));

  const html = `<svg viewBox="0 0 120 120" aria-hidden="true" style="--bx-body:${colors.body};--bx-belly:${colors.belly};--bx-dark:${colors.dark};--bx-spot:${colors.spot};--bx-horn:#fff3d6;--bx-gold:#f5c242${work.vars}${idle.vars}" data-kind="${body.id}">
      <defs>${defs}</defs>
      <ellipse class="ground" cx="${n(rig.at.ground.x)}" cy="${rig.at.ground.y}" rx="${n(shadow.rx ?? rig.half * 0.85)}" ry="${n(shadow.ry ?? 4.5)}"${shadow.opacity !== undefined ? ` opacity="${n(shadow.opacity)}"` : ""}/>
      <g class="fig"><g class="squash">
        ${work.under}<g class="outline">${outlineHtml}</g>
        <g class="fills">${fillsHtml}</g>
        ${innerHtml}
        ${glossUnder ? "" : gloss}
        <g class="brows">${inGroup(face.brows, eyeRide)}</g>
        <g class="eyes">${inGroup(face.eyes, eyeRide)}</g><g class="eyes-closed">${inGroup(face.closed, eyeRide)}</g>${noseHtml}
        <g class="m-rest">${face.mouthRest}</g><g class="m-open">${face.mouthOpen}</g>
        ${over.map((o) => o.html).join("")}${work.html}${idle.html}
        <path class="sweat prop-work" d="M92 38 Q97 45 92 48 Q87 45 92 38Z"/>
      </g></g>
      ${props(spotsOf(profile, rig.eyeY, size), size)}
    </svg>`;
  return { html, traits: traitsOf(spec), tone: colors.body };
}
