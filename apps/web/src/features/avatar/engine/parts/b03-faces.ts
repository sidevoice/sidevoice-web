import { INK, LAYER, batch, closedLids, darkMark, ellipse, eyePair, isDarkCoat, isPaleCoat, n, spanAt, toonBrows, topAt, type Ctx, type Drawing, type Eye, type Piece } from "../bichos/kit";

/* B03 Faces I (docs/catalogue.md §2.2, §2.4, §5.2): eight new eyes and seven new noses.
 *
 * Every eye is drawn in place from the face anchors (`eyeL/R`, or a top's `stalkL/R` through `eyePair`), so it lands
 * at the same spot on every body. They all keep the cast's behaviours through the shared classes: the markup goes in
 * `.eyes` (it blinks, and idle hides it), what should follow the gaze goes in `.look` (down-right while working),
 * brows use `.brow-l/-r` (lift per word, knit while working, worry while waiting) and the closed lids go in
 * `.eyes-closed` (idle). The toon look stays: a white sclera with a 2.6 ink ring, an ink pupil and a white glint.
 *
 * Noses sit on `muzzle` as inner pieces, most with a thin ink edge like the existing one; glosses hide at rail. They
 * are drawn on the nose layer, after the eyes and before the mouth, so a big nose sits in front of a cyclops eye (the
 * teddy muzzle's patch stays under the eyes; only its little nose comes forward).
 *
 * This file's own CSS only touches its own classes: the sleepy lid (`b03-lid`), the googly eyes' wider gaze
 * (`b03-googly`) and their loose pupils (`b03-rattle`). It reuses existing keyframes only. */

type Pt = [number, number];

const RING = `stroke="${INK}" stroke-width="2.6"`;
const sclera = (e: Eye) => `<circle fill="#fff" ${RING} cx="${e.x}" cy="${e.y}" r="${e.r}"/>`;
const dot = (x: number, y: number, r: number, fill = "#fff") => `<circle fill="${fill}" cx="${n(x)}" cy="${n(y)}" r="${n(r)}"/>`;
/** The gaze group; `inner` names an extra group inside it (the googly rattle). */
const look = (html: string, inner = "") => `<g class="look">${inner ? `<g class="${inner}">${html}</g>` : html}</g>`;
/** The cast's pupil and glint (as `toonEyes`), for eyes that only change what is around them. */
const toonPupil = (e: Eye, dx = 0) => dot(e.x + dx, e.y + 1, e.r * 0.52, INK) + dot(e.x + dx + e.r * 0.2, e.y - e.r * 0.12, e.r * 0.18);

const onStalks = ({ rig }: Ctx) => !!(rig.at.stalkL && rig.at.stalkR);
/** Eyes with no sclera (button, hollow) sink into a dark coat; there they sit in a thin socket of the belly colour. */
const socket = (ctx: Ctx, x: number, y: number, rx: number, ry: number) =>
  isDarkCoat(ctx.spec) ? `<ellipse fill="var(--bx-belly)" cx="${n(x)}" cy="${n(y)}" rx="${n(rx + 1.5)}" ry="${n(ry + 1.5)}"/>` : "";
/** Half the distance between the pair's anchors: past it, two eyes of that radius overlap. */
const halfGap = ({ rig }: Ctx) => 60 - rig.at.eyeL.x;

/** An eyes part's drawing: geometry, open markup, brows and closed lids (shared defaults unless given). The shared
 * brows get the rig, so big or raised eyes on a low crown (wide, tri) keep them under the real head top. */
const eyesOut = (ctx: Ctx, eyes: Eye[], html: string, more: { brows?: string; closed?: string; browEyes?: Eye[] } = {}): Drawing => ({
  eyes,
  face: { eyes: html, brows: more.brows ?? toonBrows(more.browEyes ?? eyes, ctx.rig), closed: more.closed ?? closedLids(eyes, INK) },
});

/** A four-point twinkle (the sparkle glint), arms `a` long. */
function twinkle(x: number, y: number, a: number) {
  const c = a * 0.2;
  return `<path fill="#fff" d="M${n(x)} ${n(y - a)}Q${n(x + c)} ${n(y - c)} ${n(x + a)} ${n(y)}Q${n(x + c)} ${n(y + c)} ${n(x)} ${n(y + a)}Q${n(x - c)} ${n(y + c)} ${n(x - a)} ${n(y)}Q${n(x - c)} ${n(y - c)} ${n(x)} ${n(y - a)}Z"/>`;
}

/** The lower crescent of a circle (an iris catching the light from below). */
function crescent(x: number, y: number, r: number, fill: string) {
  const at = (deg: number): Pt => [x + r * Math.cos((deg * Math.PI) / 180), y + r * Math.sin((deg * Math.PI) / 180)];
  const [l, rt] = [at(158), at(22)];
  return `<path fill="${fill}" d="M${n(l[0])} ${n(l[1])}A${n(r)} ${n(r)} 0 0 0 ${n(rt[0])} ${n(rt[1])}A${n(r * 0.98)} ${n(r * 0.4)} 0 0 1 ${n(l[0])} ${n(l[1])}Z"/>`;
}

/** The part of an eye's circle above `lineY` (a lid), as a closed path. */
function cap(e: Eye, lineY: number) {
  const dy = lineY - e.y, w = Math.sqrt(Math.max(0, e.r * e.r - dy * dy));
  return `M${n(e.x - w)} ${n(lineY)}A${e.r} ${e.r} 0 ${dy > 0 ? 1 : 0} 1 ${n(e.x + w)} ${n(lineY)}Z`;
}

/* ---------- eyes ---------- */

/** Button: solid ink ovals and a glint, no sclera (Sumikko, Molang). The whole dot rides `.look`: with no white around
 * it, a small shift of the dot is what reads as a glance. A touch bigger at rail, so it stays a dot and not a speck. */
function button(ctx: Ctx): Drawing {
  const eyes = eyePair(ctx, 1, ctx.size === "rail" ? 7.2 : 6.6);
  const html = eyes.map((e) => {
    const rx = e.r * 0.74, ry = e.r;
    const small = ctx.size === "stage" ? dot(e.x - rx * 0.34, e.y + ry * 0.44, rx * 0.15) : "";
    return look(`${socket(ctx, e.x, e.y, rx, ry)}<ellipse fill="${INK}" cx="${e.x}" cy="${e.y}" rx="${n(rx)}" ry="${n(ry)}"/>${dot(e.x + rx * 0.3, e.y - ry * 0.4, rx * 0.38)}${small}`);
  }).join("");
  return eyesOut(ctx, eyes, html);
}

/** Sparkle: a big sclera, a big iris with a light crescent below, a round glint, a small one and a twinkle. As big as
 * the pair allows without the rings touching. Rail keeps the iris and one glint. */
function sparkle(ctx: Ctx): Drawing {
  const eyes = eyePair(ctx, 0, onStalks(ctx) ? 9.5 : Math.min(9.5, halfGap(ctx) - 1));
  const rail = ctx.size === "rail", stage = ctx.size === "stage";
  const html = eyes.map((e) => {
    const r = e.r, py = e.y + r * 0.1, pr = r * (rail ? 0.58 : 0.64);
    return sclera(e) + look(
      dot(e.x, py, pr, INK)
      + (rail ? "" : crescent(e.x, py, pr * 0.8, "var(--bx-spot)"))
      + dot(e.x + r * 0.24, e.y - r * 0.22, r * (rail ? 0.32 : 0.24))
      + (rail ? "" : dot(e.x + r * 0.4, e.y + r * 0.16, r * 0.09))
      + (stage ? twinkle(e.x - r * 0.28, e.y + r * 0.22, r * 0.26) : ""),
    );
  }).join("");
  return eyesOut(ctx, eyes, html);
}

/** Sleepy: the toon eye under a body-colour lid. A light lid always covers the top quarter; the heavy lid (`b03-lid`,
 * down to the middle) lifts while talking and sags back on every pause (CSS). The lids live inside `.eyes`, so they
 * blink with it. */
function sleepy(ctx: Ctx): Drawing {
  const eyes = eyePair(ctx, 0, 8.5);
  const lid = (e: Eye, k: number, cls = "") => `<path${cls ? ` class="${cls}"` : ""} fill="var(--bx-body)" ${RING} stroke-linejoin="round" d="${cap(e, e.y - e.r + 2 * e.r * k)}"/>`;
  const html = eyes.map((e) => sclera(e)
    + look(dot(e.x, e.y + e.r * 0.24, e.r * 0.52, INK) + dot(e.x + e.r * 0.2, e.y + e.r * 0.06, e.r * 0.17))
    + lid(e, 0.24) + lid(e, 0.47, "b03-lid")).join("");
  return eyesOut(ctx, eyes, html);
}

/** Wide-set: pushed out towards the edge of the face (goofy), the pupils drifting apart. Placed on the body's real
 * outline at the eye line, so on narrow heads (pear, pill) they get a little smaller rather than poke out. */
function wideSet(ctx: Ctx): Drawing {
  if (onStalks(ctx)) { const eyes = eyePair(ctx, 0, 8); return eyesOut(ctx, eyes, eyes.map((e, i) => sclera(e) + look(toonPupil(e, (i ? 1 : -1) * e.r * 0.2))).join("")); }
  const { rig } = ctx, d = halfGap(ctx), y = rig.eyeY;
  const span = spanAt(rig, y), reach = span ? Math.min(60 - span[0], span[1] - 60) : rig.faceHalf;
  const target = d * 1.4, room = 3.4;
  const r = Math.max(6.4, Math.min(8, reach - room - target));
  const off = Math.min(target, reach - room - r);
  const eyes: Eye[] = [{ x: n(60 - off), y, r }, { x: n(60 + off), y, r }];
  return eyesOut(ctx, eyes, eyes.map((e, i) => sclera(e) + look(toonPupil(e, (i ? 1 : -1) * e.r * 0.2))).join(""));
}

/** Googly: oversized sclera, a tiny loose pupil that settles low (each at its own seeded angle). The gaze swings half
 * as far again (CSS on `b03-googly`) and the pupils hop on every word (`b03-rattle`). The rings may touch: they are
 * googly eyes. The pupil grows at rail so it still reads. */
function googly(ctx: Ctx): Drawing {
  // On a narrow crown (pear) the head top comes down to the eyes: leave the brows a little room under it.
  const { rig } = ctx, room = rig.eyeY - topAt(rig, rig.at.eyeL.x) - 7;
  const eyes = eyePair(ctx, -0.5, onStalks(ctx) ? 10.5 : Math.max(8.5, Math.min(10.5, halfGap(ctx) + 0.5, room)));
  const rnd = ctx.rng("b03-googly");
  const html = eyes.map((e) => {
    const pr = e.r * (ctx.size === "rail" ? 0.42 : 0.33), reach = (e.r - pr - 1.3) * 0.6;
    const a = ((90 + rnd.range(-40, 40)) * Math.PI) / 180, px = e.x + Math.cos(a) * reach, py = e.y + Math.sin(a) * reach;
    return sclera(e) + look(dot(px, py, pr, INK) + (ctx.size === "rail" ? "" : dot(px + pr * 0.32, py - pr * 0.32, pr * 0.3)), "b03-rattle");
  }).join("");
  return eyesOut(ctx, eyes, `<g class="b03-googly">${html}</g>`);
}

/** Lashes: the toon eye plus three lashes flicking out from the outer top; closed, they hang from the lid line.
 * Lashes are hairlines at 28 px, so the rail draws the plain eye. */
function lashes(ctx: Ctx): Drawing {
  const eyes = eyePair(ctx, 0, 8.5), show = ctx.size !== "rail";
  const LASH = `fill="none" stroke="${INK}" stroke-width="2.3" stroke-linecap="round"`;
  const open = (e: Eye, side: number) => [[210, 4.8], [233, 4.3], [255, 3.6]].map(([deg, len]) => {
    const t = ((side < 0 ? deg : 180 - deg) * Math.PI) / 180, k = ((side < 0 ? deg - 12 : 192 - deg) * Math.PI) / 180;
    const p0: Pt = [e.x + Math.cos(t) * (e.r + 0.4), e.y + Math.sin(t) * (e.r + 0.4)];
    const p1: Pt = [e.x + Math.cos(k) * (e.r + len), e.y + Math.sin(k) * (e.r + len)];
    const c: Pt = [e.x + Math.cos(t) * (e.r + len * 0.7), e.y + Math.sin(t) * (e.r + len * 0.7)];
    return `M${n(p0[0])} ${n(p0[1])}Q${n(c[0])} ${n(c[1])} ${n(p1[0])} ${n(p1[1])}`;
  }).join("");
  const shut = (e: Eye, side: number) => [[0.08, 3.4], [0.25, 3.6], [0.42, 3]].map(([t, len]) => {
    // On the closed lid's curve (closedLids), from its outer end; each lash leans down and out along the curve's normal.
    const x0 = -0.8 * e.r, y0 = 1, cy = 0.8 * e.r, u = 1 - t;
    const bx = u * u * x0 + t * t * -x0, by = u * u * y0 + 2 * u * t * cy + t * t * y0;
    const tx = 2 * u * (0 - x0) + 2 * t * (-x0), ty = 2 * u * (cy - y0) + 2 * t * (y0 - cy), m = Math.hypot(tx, ty);
    const nx = -ty / m, ny = tx / m;
    return `M${n(e.x - side * bx)} ${n(e.y + by)}l${n(-side * nx * len)} ${n(ny * len)}`;
  }).join("");
  const html = eyes.map((e, i) => sclera(e) + look(toonPupil(e)) + (show ? `<path ${LASH} d="${open(e, i ? 1 : -1)}"/>` : "")).join("");
  const closed = closedLids(eyes, INK) + (show ? `<path ${LASH} d="${eyes.map((e, i) => shut(e, i ? 1 : -1)).join("")}"/>` : "");
  return eyesOut(ctx, eyes, html, { closed });
}

/** Hollow: dark ovals with no glint (kodama, ghosts), tilted in a little and never quite the same size; inside, a
 * faint rim in the body's dark colour gives them depth and is what shifts with the gaze. */
function hollow(ctx: Ctx): Drawing {
  const rnd = ctx.rng("b03-hollow"), tilt = rnd.range(4, 12), grow = [1 + rnd.range(-0.06, 0.06), 1 + rnd.range(-0.06, 0.06)];
  const eyes = eyePair(ctx, 1, 7.6).map((e, i) => ({ ...e, r: n(e.r * grow[i]) }));
  const html = eyes.map((e, i) => {
    const rx = e.r * 0.7, rot = `transform="rotate(${n((i ? -1 : 1) * tilt)} ${e.x} ${e.y})"`;
    const rim = ctx.size === "rail" ? "" : look(`<path fill="var(--bx-dark)" opacity=".75" d="M${n(e.x - rx * 0.62)} ${n(e.y + e.r * 0.42)}Q${e.x} ${n(e.y + e.r * 0.86)} ${n(e.x + rx * 0.62)} ${n(e.y + e.r * 0.42)}Q${e.x} ${n(e.y + e.r * 0.62)} ${n(e.x - rx * 0.62)} ${n(e.y + e.r * 0.42)}Z"/>`);
    return `<g ${rot}>${socket(ctx, e.x, e.y, rx, e.r)}<ellipse fill="${INK}" cx="${e.x}" cy="${e.y}" rx="${n(rx)}" ry="${e.r}"/>${rim}</g>`;
  }).join("");
  return eyesOut(ctx, eyes, html);
}

/** Four (rare): a pair of toon eyes with a small pair under them. Sized and placed from the room between the eye line
 * and the mouth, so the small pair clears an open mouth even on the squat faces (wide, tri, round). Brows go over the
 * big pair. The geometry lists the eyes left to right (big, small, small, big). */
function four(ctx: Ctx): Drawing {
  const { rig } = ctx, d = halfGap(ctx), k = 0.62, gap = 2.8;
  const floor = rig.mouthY - 3.2, want = Math.min(7.2, d - 1.2);
  // Lower centre = upper centre + ru + rl + gap, and the lower eye's bottom stays above `floor`.
  const fits = (uy: number) => (floor - uy - gap) / (1 + 2 * k);
  const uy = Math.max(rig.eyeY - 5.5, Math.min(rig.eyeY - 1.5, floor - gap - want * (1 + 2 * k)));
  const ru = Math.max(4.6, Math.min(want, fits(uy))), rl = ru * k, ly = uy + ru + rl + gap;
  const at = (x: number, y: number, r: number): Eye => ({ x: n(x), y: n(y), r: n(rig.fit(x, r)) });
  const uL = at(rig.at.eyeL.x + 0.5, uy, ru), uR = at(rig.at.eyeR.x - 0.5, uy, ru);
  const lL = at(rig.at.eyeL.x + 2, ly, rl), lR = at(rig.at.eyeR.x - 2, ly, rl);
  const eyes = [uL, lL, lR, uR];
  return eyesOut(ctx, eyes, eyes.map((e) => sclera(e) + look(toonPupil(e))).join(""), { browEyes: [uL, uR] });
}

/* ---------- noses (on `muzzle`) ----------
 * `muzzle` is 5 above the mouth line and the cast's mouth opens 2 above it, so every nose keeps its bottom within
 * muzzle.y + 2.4: it never dips into an open mouth. The mouth is drawn over inner pieces, so that would show. */

const gloss = (x: number, y: number, rx: number, ry: number): Piece => ({ d: ellipse(x, y, rx, ry), c: "#ffffff", ink: "inner", flat: true, lod: 1 });
/** A rounded nose, wider at the top (dog, teddy): `w` half width, `h` height, centred on x, y. */
const noseShape = (x: number, y: number, w: number, h: number) => {
  const t = y - h * 0.55, b = y + h * 0.45, m = t + h * 0.3;
  return `M${n(x - w)} ${n(m)}Q${n(x - w)} ${n(t)} ${n(x)} ${n(t)}Q${n(x + w)} ${n(t)} ${n(x + w)} ${n(m)}Q${n(x + w * 0.9)} ${n(b - h * 0.18)} ${n(x)} ${n(b)}Q${n(x - w * 0.9)} ${n(b - h * 0.18)} ${n(x - w)} ${n(m)}Z`;
};
/** A heart, tip at (x, y), `k` = 1 is 16 wide (as the clover's leaflets in b02). */
const heartShape = (x: number, y: number, k: number) => {
  const p = (dx: number, dy: number) => `${n(x + dx * k)} ${n(y + dy * k)}`;
  return `M${p(0, 0)}C${p(-1.5, -1.5)} ${p(-8, -4)} ${p(-8, -9)}C${p(-8, -13)} ${p(-2.5, -14.2)} ${p(0, -10.6)}C${p(2.5, -14.2)} ${p(8, -13)} ${p(8, -9)}C${p(8, -4)} ${p(1.5, -1.5)} ${p(0, 0)}Z`;
};
const muzzleAt = ({ rig }: Ctx) => rig.at.muzzle;
/** Drawn after the eyes, before the mouth. */
const NOSE = { layer: LAYER.nose } as const;

export default batch({
  parts: [
    /* ---------- eyes ---------- */
    { id: "button", slot: "eyes", label: "botón", draw: button },
    { id: "sparkle", slot: "eyes", label: "brillantes", draw: sparkle },
    { id: "sleepy", slot: "eyes", label: "dormilones", draw: sleepy },
    { id: "wide-set", slot: "eyes", label: "separados", draw: wideSet },
    { id: "googly", slot: "eyes", label: "saltones", draw: googly },
    { id: "lashes", slot: "eyes", label: "pestañas", rarity: "uncommon", draw: lashes },
    { id: "hollow", slot: "eyes", label: "huecos", draw: hollow },
    // More than a pair: eyewear that needs one or two eyes excludes `#many-eyes` (a one-bar pair of sunglasses fits).
    { id: "four", slot: "eyes", label: "cuatro", rarity: "rare", tags: ["many-eyes"], draw: four },

    /* ---------- noses ---------- */
    {
      ...NOSE, id: "button", slot: "nose", label: "nariz botón",
      draw: (ctx) => { const { x, y } = muzzleAt(ctx); return { pieces: [{ d: ellipse(x, y - 0.8, 3.7, 3), c: "dark", ink: "inner", stroke: 1.8 }, gloss(x - 1.3, y - 2.1, 1.2, 0.8)] }; },
    },
    {
      ...NOSE, id: "heart", slot: "nose", label: "nariz corazón",
      draw: (ctx) => { const { x, y } = muzzleAt(ctx); return { pieces: [{ d: heartShape(x, y + 2.3, 0.52), c: "pink", ink: "inner", stroke: 1.6 }] }; },
    },
    {
      // The belly colour, or pink on a pale coat (where the belly turns white and the snout would vanish).
      ...NOSE, id: "snout-pig", slot: "nose", label: "hocico de cerdo", noise: 1,
      draw: (ctx) => {
        const { x, y } = muzzleAt(ctx), cy = y - 2, pale = isPaleCoat(ctx.spec), holes = darkMark(ctx.spec);
        return {
          pieces: [
            { d: ellipse(x, cy, 7.2, 4.4), c: pale ? "pink" : "belly", ink: "inner", stroke: 2.2 },
            { d: ellipse(x - 2.6, cy, 1.25, 1.9), c: holes, ink: "inner", flat: true },
            { d: ellipse(x + 2.6, cy, 1.25, 1.9), c: holes, ink: "inner", flat: true },
          ],
        };
      },
    },
    {
      ...NOSE, id: "snout-dog", slot: "nose", label: "trufa",
      draw: (ctx) => { const { x, y } = muzzleAt(ctx); return { pieces: [{ d: noseShape(x, y - 1.2, 5.6, 7.6), c: "dark", ink: "inner", stroke: 2.2 }, gloss(x - 2.1, y - 4.1, 2, 1.1)] }; },
    },
    {
      // A teddy muzzle: a belly patch behind the nose and the mouth, with its own small nose (the slot holds one).
      id: "muzzle", slot: "nose", label: "morrito",
      draw: (ctx) => {
        const { rig } = ctx, m = rig.at.muzzle, cy = (m.y + rig.at.mouth.y) / 2 + 1.5, rx = Math.min(12.5, rig.faceHalf * 0.46);
        return { pieces: [{ d: ellipse(60, cy, rx, 8.6), c: "belly", ink: "inner" }, { d: noseShape(m.x, m.y - 0.8, 3.8, 4.8), c: "dark", ink: "inner", stroke: 1.8, layer: LAYER.nose }, { ...gloss(m.x - 1.3, m.y - 2.6, 1.2, 0.7), layer: LAYER.nose }] };
      },
    },
    {
      ...NOSE, id: "nostrils", slot: "nose", label: "fosas nasales", lod: 1,
      draw: (ctx) => { const { x, y } = muzzleAt(ctx); return { pieces: [{ d: ellipse(x - 3, y - 0.5, 1.2, 1.6), c: "ink", ink: "inner", flat: true }, { d: ellipse(x + 3, y - 0.5, 1.2, 1.6), c: "ink", ink: "inner", flat: true }] }; },
    },
    {
      ...NOSE, id: "bulb", slot: "nose", label: "narizota", noise: 1,
      draw: (ctx) => { const { x, y } = muzzleAt(ctx), cy = y - 2.6; return { pieces: [{ d: ellipse(x, cy, 5.6, 5), c: "spot", ink: "inner", stroke: 2.4 }, gloss(x - 2, cy - 1.9, 1.8, 1.2)] }; },
    },
  ],

  css: `
    /* sleepy: the heavy lid lifts while talking and sags back on every pause */
    .b03-lid { transition: opacity .15s }
    &[data-mood=speaking] .b03-lid { opacity: 0 }
    &[data-mood=speaking][data-pause] .b03-lid { opacity: 1 }

    /* googly: the gaze swings half as far again, and the loose pupils hop on every word */
    &[data-mood=working] .b03-googly .look { transform: translate(3px, 2.25px) }
    &[data-mood=waiting] .b03-googly .look { transform: translate(0, 2.25px) }
    &[data-mood=speaking][data-beat=a] .b03-rattle { animation: bx-brow-a .34s ease-out }
    &[data-mood=speaking][data-beat=b] .b03-rattle { animation: bx-brow-b .34s ease-out }
  `,
});
