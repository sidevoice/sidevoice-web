import { INK, LAYER, batch, closedLids, ellipse, eyeAt as eye, eyePair as pairEyes, n, pair, toonEyes, toonMouth, type Ctx, type Eye } from "../bichos/kit";

/* The face and the decor on the skin: the existing eyes, mouths, patterns, cheeks, marks and nose. Face parts are
 * drawn in place from the body's anchors (they don't move as one rigid piece): eyes hang off `eyes` / `eyeL/R` (or a
 * top's `stalkL/R`), the mouth sits on `mouth`, the nose on `muzzle`, blush on `cheekL/R`.
 *
 * Eyes that are not a pair say so with a tag, for eyewear: `one-eye` (cyclops) and `many-eyes` (three); the beak is
 * tagged `beak`, like every later beak, so the mustache and the like exclude them all with one ref. Blush and
 * whiskers are paint on the skin (LAYER.skin): over the body, under arms and hats. Mouths that open smaller than the
 * cast's D emit their own `chin` (the open mouth's lowest point). */

const toon = (eyes: Eye[]) => ({ eyes, face: toonEyes(eyes) });

/** The robot's LED face: cyan rects on an ink screen, no brows, no gloss. The screen is as wide as the face allows
 * (31 either side on the box) and clipped to the body, so on a round body it reads as a visor, not a sign. */
function led(ctx: Ctx) {
  const s = ctx.rig.spread, eyes = [eye(ctx, -s - 2, 0, 6), eye(ctx, s + 2, 0, 6)];
  const y0 = ctx.rig.eyeY - 14, y1 = ctx.rig.mouthY + 11, l = 60 - Math.min(31, ctx.rig.faceHalf - 3), r = 120 - l;
  return {
    eyes,
    pieces: [{ d: `M${l + 4} ${y0} L${r - 4} ${y0} Q${r} ${y0} ${r} ${y0 + 4} L${r} ${y1 - 4} Q${r} ${y1} ${r - 4} ${y1} L${l + 4} ${y1} Q${l} ${y1} ${l} ${y1 - 4} L${l} ${y0 + 4} Q${l} ${y0} ${l + 4} ${y0}Z`, c: "ink" as const, ink: "inner" as const, flat: true, clip: true }],
    face: {
      eyes: eyes.map((e) => `<rect fill="#7df9ff" x="${e.x - e.r}" y="${e.y - e.r}" width="${e.r * 2}" height="${n(e.r * 2.2)}" rx="3"/>`).join(""),
      brows: "",
      closed: closedLids(eyes, "#7df9ff"),
      shine: "",
    },
  };
}

const mouthAt = ({ rig }: Ctx) => rig.at.mouth;
const LINE = `fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
const W = 10;

export default batch({
  slots: [
    { id: "eyes", label: "Ojos", order: 20, required: true, layer: LAYER.face, noise: 0 },
    { id: "mouth", label: "Boca", order: 30, required: true, layer: LAYER.face, noise: 0 },
    { id: "pattern", label: "Dibujo", row: "Detalles", order: 40, multi: true, max: 2, layer: LAYER.decor, noise: 1 },
    { id: "cheeks", label: "Mofletes", row: "Detalles", order: 42, layer: LAYER.decor, noise: 1 },
    { id: "marks", label: "Marcas", row: "Detalles", order: 44, layer: LAYER.decor, noise: 1 },
    { id: "nose", label: "Nariz", row: "Detalles", order: 46, layer: LAYER.decor, noise: 0 },
  ],
  parts: [
    /* ---------- eyes ---------- */
    { id: "two", slot: "eyes", label: "dos", draw: (ctx) => toon(pairEyes(ctx, 0, 8.5)) },
    { id: "beady", slot: "eyes", label: "pequeños", draw: (ctx) => toon(pairEyes(ctx, 1, 6)) },
    {
      id: "big", slot: "eyes", label: "de búho",
      draw: (ctx) => {
        const eyes = pairEyes(ctx, -1, 9.5);
        return { ...toon(eyes), pieces: eyes.map((e) => ({ d: ellipse(e.x, e.y, e.r + 3.5, e.r + 3.5), c: "belly" as const, ink: "inner" as const })) };
      },
    },
    { id: "cyclops", slot: "eyes", label: "cíclope", tags: ["one-eye"], draw: (ctx) => toon([eye(ctx, 0, 0, 12)]) },
    { id: "three", slot: "eyes", label: "tres", tags: ["many-eyes"], draw: (ctx) => { const s = ctx.rig.spread; return toon([eye(ctx, -s - 2, 2, 7), eye(ctx, 0, -6, 8), eye(ctx, s + 2, 2, 7)]); } },
    { id: "wonky", slot: "eyes", label: "desparejos", draw: (ctx) => { const s = ctx.rig.spread; return toon([eye(ctx, -s, 0, 10), eye(ctx, s + 1, 2, 6.5)]); } },
    // Legacy (the old robot's face plate): weight 0, so the v4 roller never pools it, not even to fill a required slot.
    // It stays for `v3:` seeds, which name it, and for stored specs and the editor.
    { id: "led", slot: "eyes", label: "LED", weight: 0, excludes: ["cheeks", "eyewear"], draw: led },

    /* ---------- mouths (every mouth gives a rest and an open shape) ---------- */
    { id: "smile", slot: "mouth", label: "sonrisa", draw: (ctx) => { const { x, y } = mouthAt(ctx); return { face: toonMouth(x, y) }; } },
    {
      id: "fangs", slot: "mouth", label: "colmillos",
      draw: (ctx) => {
        const { x, y } = mouthAt(ctx);
        return { face: toonMouth(x, y, { rest: `<path fill="#fff" stroke="${INK}" stroke-width="1" d="M${x - 7} ${y + 1.8} l2 4 l2 -3z M${x + 3} ${y + 2.4} l2 3.5 l2 -4z"/>`, teeth: `<path fill="#fff" d="M${x - W + 2} ${y - 2} l3 5 l3 -5z M${x + W - 8} ${y - 2} l3 5 l3 -5z"/>` }) };
      },
    },
    { id: "teeth", slot: "mouth", label: "dientes", draw: (ctx) => { const { x, y } = mouthAt(ctx); return { face: toonMouth(x, y, { teeth: `<path fill="#fff" d="M${x - W + 2} ${y - 2} h${W * 2 - 4} v4 h-${W * 2 - 4}z"/>` }) }; } },
    { id: "gap", slot: "mouth", label: "mellada", draw: (ctx) => { const { x, y } = mouthAt(ctx); return { face: toonMouth(x, y, { teeth: `<path fill="#fff" d="M${x - 5.5} ${y - 2} h5 v4.5 h-5z M${x + 0.5} ${y - 2} h5 v4.5 h-5z"/>` }) }; } },
    { id: "tongue", slot: "mouth", label: "lengua", draw: (ctx) => { const { x, y } = mouthAt(ctx); return { face: toonMouth(x, y, { rest: `<path fill="#ff6f91" stroke="${INK}" stroke-width="2" d="M${x + 2} ${y + 3} q2 7 6 3 q-1 -3 -2 -4z"/>` }) }; } },
    {
      id: "cat", slot: "mouth", label: "de gato",
      draw: (ctx) => {
        const { x, y } = mouthAt(ctx), w = 6;
        return {
          emits: { chin: { x, y: n(y + w * 1.6 + 1.3) } },
          face: {
            mouthRest: `<path ${LINE} d="M${x - w} ${y} Q${x - w / 2} ${y + 4} ${x} ${y} Q${x + w / 2} ${y + 4} ${x + w} ${y}"/>`,
            mouthOpen: `<path fill="#3a0f22" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" d="M${x - w} ${y - 1} Q${x} ${y + 1} ${x + w} ${y - 1} Q${x + w} ${y + w * 1.6} ${x} ${y + w * 1.6} Q${x - w} ${y + w * 1.6} ${x - w} ${y - 1}Z"/><ellipse fill="#ff6f91" cx="${x}" cy="${n(y + w * 1.15)}" rx="${n(w * 0.55)}" ry="${n(w * 0.4)}"/>`,
          },
        };
      },
    },
    {
      id: "beak", slot: "mouth", label: "pico", tags: ["beak"], excludes: ["nose", "marks:whiskers"],
      draw: (ctx) => {
        const { x, y } = mouthAt(ctx), edge = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"`;
        return {
          emits: { chin: { x, y: y + 9.2 } },
          face: {
            mouthRest: `<path fill="#f2b13c" ${edge} d="M${x - 7} ${y - 5} L${x + 7} ${y - 5} L${x} ${y + 4}Z"/>`,
            mouthOpen: `<path fill="#c98420" ${edge} d="M${x - 5.5} ${y} L${x + 5.5} ${y} L${x} ${y + 8}Z"/><path fill="#f2b13c" ${edge} d="M${x - 7} ${y - 7} L${x + 7} ${y - 7} L${x} ${y}Z"/>`,
          },
        };
      },
    },
    {
      // Legacy, like the LED eyes: weight 0 keeps it out of every v4 roll; `v3:` seeds still draw it.
      id: "led", slot: "mouth", label: "LED", weight: 0,
      draw: (ctx) => {
        const { x, y } = mouthAt(ctx);
        return { emits: { chin: { x, y: y + 4 } }, face: { mouthRest: `<rect fill="#7df9ff" x="${x - 9}" y="${y - 1.5}" width="18" height="3" rx="1.5"/>`, mouthOpen: `<rect fill="#7df9ff" x="${x - 9}" y="${y - 4}" width="18" height="8" rx="3"/>` } };
      },
    },

    /* ---------- patterns (stay on the lower body and the flanks, never over the face) ---------- */
    { id: "belly", slot: "pattern", label: "barriga", noise: 0, draw: ({ rig }) => ({ pieces: [{ d: ellipse(rig.at.belly.x, rig.at.belly.y, rig.half * 0.52, 10), c: "belly", ink: "inner" }] }) },
    {
      id: "spots", slot: "pattern", label: "manchas",
      draw: (ctx) => {
        const { rig } = ctx, r = ctx.rng("spots"), pieces = [];
        for (let i = 0, count = r.int(2, 4); i < count; i += 1) {
          const side = i % 2 ? 1 : -1, x = n(60 + side * r.range(rig.half * 0.5, rig.half * 0.72)), y = n(r.range(rig.mouthY - 2, rig.bottom - 10)), rad = n(r.range(2.5, 4.2));
          pieces.push({ d: ellipse(x, y, rad, rad), c: "spot" as const, ink: "inner" as const, flat: true });
        }
        return { pieces };
      },
    },
    {
      // Tabby marks on the forehead, just under the crown.
      id: "stripes", slot: "pattern", label: "rayas",
      draw: ({ rig }) => {
        const x = rig.at.crown.x, t = rig.at.crown.y - 2;
        return { pieces: [{ d: `M${x - 5} ${t + 3} L${x - 4} ${t + 11} M${x + 5} ${t + 3} L${x + 4} ${t + 11} M${x} ${t + 2} L${x} ${t + 9}`, c: "dark", w: 3, ink: "inner", flat: true }] };
      },
    },

    /* ---------- cheeks, marks, nose ---------- */
    { id: "blush", slot: "cheeks", label: "mofletes", layer: LAYER.skin, draw: ({ rig }) => ({ pieces: pair(ellipse(n(rig.at.cheekL.x), rig.at.cheekL.y, 4, 3), "pink", { ink: "inner", flat: true }) }) },
    {
      id: "whiskers", slot: "marks", label: "bigotes", lod: 1, layer: LAYER.skin,
      draw: ({ rig }) => {
        const x = rig.at.templeL.x, y = rig.mouthY;
        return { pieces: pair(`M${n(x)} ${y - 5} L${n(x + 12)} ${y - 3} M${n(x)} ${y + 2} L${n(x + 12)} ${y + 1}`, "ink", { w: 1.6, ink: "inner", flat: true }) };
      },
    },
    {
      id: "nose", slot: "nose", label: "nariz",
      draw: ({ rig }) => { const { x, y } = rig.at.muzzle; return { pieces: [{ d: `M${x - 3} ${y - 2} L${x + 3} ${y - 2} L${x} ${n(y + 1.4)}Z`, c: "pink", ink: "inner", stroke: 1.6 }] }; },
    },
  ],
});
