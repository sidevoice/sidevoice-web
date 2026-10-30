import { batch, smoothLoop, type Rng } from "../bichos/kit";

/* B01 Bodies: pear, drop, tri, dome and pill (docs/catalogue.md §0.2).
 *
 * Each silhouette is a symmetric profile: [y, half width] samples from the top of the head to the base. The outline is
 * a smooth loop through them, nudged per bicho by its shape stream, so every bicho differs a little and redraws the
 * same. The anchor overrides were measured on the same profile, so tops, faces, limbs and gear land on the real edge. */

/** [y, half width] samples of a symmetric silhouette, top to bottom; the first and the last sit on the axis. */
type Profile = [number, number][];

/** A smooth loop through the profile (right side down, left side up). `w` wobbles each point's width, `wy` its height. */
const silhouette = (prof: Profile, w: number, wy = 0.5) => (r: Rng) => {
  const right = prof.map(([y, h]): [number, number] => [60 + h, y]);
  const left = prof.slice(1, -1).reverse().map(([y, h]): [number, number] => [60 - h, y]);
  return smoothLoop([...right, ...left].map(([x, y]): [number, number] => [60 + (x - 60) * (1 + r.range(-w, w)), y + r.range(-wy, wy)]));
};


/* ---------- profiles ---------- */

/** Pear: a narrow head on a heavy bottom (chick, penguin, yeti, ant). */
const PEAR: Profile = [[36, 0], [37.4, 7.6], [40.6, 14.2], [45.6, 19.6], [52, 23], [58.5, 23.9], [64, 23], [69, 21.6], [73.5, 22.6], [78.5, 26.6], [84, 31.2], [89.5, 33.8], [94.5, 32], [97.6, 25.8], [99.2, 15.5], [99.6, 0]];
/** Drop: a teardrop with a rounded tip up (slime, flame, acorn, raindrop). */
const DROP: Profile = [[27, 0], [28.4, 2.6], [31.2, 5.6], [36.5, 10.2], [43.5, 16], [50.5, 21.4], [57, 25.4], [64, 28.2], [71, 29.2], [79, 28.4], [86.5, 25.4], [92.5, 19.6], [96, 10], [96.8, 0]];
/** Tri: a rounded triangle with soft, bulging sides (onigiri, spiky monster, mountain yeti). */
const TRI: Profile = [[31.5, 0], [32.8, 4.2], [36, 8.6], [44, 14.6], [54, 21.2], [64, 27.4], [74, 33], [83, 37.4], [89.5, 39.6], [94, 38.6], [96.6, 32], [97.6, 18], [97.8, 0]];
/** Dome: a bell with a flat, slightly flared base that floats (ghost, jellyfish, octopus, drone). */
const DOME: Profile = [[34, 0], [35.4, 9], [38.8, 17], [44.5, 24.4], [51.5, 29.4], [60, 32.2], [70, 33.2], [79, 33.8], [84, 34.6], [88, 34.6], [90.2, 30.5], [91, 20], [91.2, 0]];
/** Pill: a tall capsule with a round top and a softer, standing base (cactus, mushroom stalk, can bot, pudding). */
const PILL: Profile = [[30, 0], [31.2, 7.6], [34, 13.8], [38.5, 18.6], [45, 22.4], [53, 24], [62, 24.2], [74, 24.2], [83, 23.8], [89, 21.8], [93.6, 17.6], [96.4, 10.6], [97.2, 0]];

export default batch({
  /* Anchor overrides follow one rule: a part lands on each body as it lands on the reference body. Ear sockets sit on
   * the outline, the crown 4 units under the outline's top (as on the existing bodies), horn and bunny sockets ~4 units
   * inside it, and shoulders 4–6 units inside the edge at the arm line. Tops on the crown keep 0.94 of their size; hats
   * have their own anchor (`hat`): 0.86 on the narrow heads (pear, pill), and seated lower down the slope on drop and
   * tri. Horns and ears scale to 0.86 on narrow heads; slopes (drop, tri) turn them outward by their normal. Each body
   * draws its own gloss, clear of the eyes. */
  bodies: [
    {
      id: "pear", label: "pera",
      frame: { top: 38, eyeY: 59, mouthY: 74, armY: 80, half: 33.8, bottom: 100, faceHalf: 23.8 },
      outline: silhouette(PEAR, 0.03),
      anchors: {
        crown: { x: 60, y: 40, a: 0, s: 0.94 },
        hat: { x: 60, y: 40.5, a: 0, s: 0.86 },
        crownL: { x: 50.5, y: 43, a: -20, s: 0.86 },
        earL: { x: 45, y: 41.5, a: -40, s: 0.86 },
        // A touch wider than the default spread, so a pair of eyes doesn't touch on the narrow head.
        eyeL: { x: 49.8, y: 59 },
        cheekL: { x: 44, y: 71 },
        shoulderL: { x: 35, y: 82, a: -100 },
        backL: { x: 38, y: 64, a: -62 },
        // On the heavy bottom's flank, so a tail clears the body instead of hiding behind it.
        rump: { x: 88, y: 96, a: 120 },
        ground: { x: 60, y: 107 },
      },
      shine: () => "M41.5 55 Q43 44.5 52.5 41",
    },
    {
      // `top` is the rounded tip. The crown sits on the tip; horns, ears and the hat are placed down the slopes explicitly
      // (a hat covers the tip, and the headphones' band arches from the hat).
      id: "drop", label: "gota",
      frame: { top: 29, eyeY: 64, mouthY: 79, armY: 78, half: 29, bottom: 98, faceHalf: 28 },
      outline: silhouette(DROP, 0.035),
      anchors: {
        crown: { x: 60, y: 31, a: 0, s: 0.94 },
        hat: { x: 60, y: 39, a: 0, s: 0.9 },
        crownL: { x: 49.5, y: 42, a: -35, s: 0.9 },
        earL: { x: 43, y: 46, a: -48, s: 0.9 },
        backL: { x: 37, y: 56, a: -55 },
        dorsal: { x: 66, y: 40, a: 30 },
        rump: { x: 80, y: 90, a: 110 },
      },
      shine: () => "M42 55.5 Q49.6 45 55.5 38.5",
    },
    {
      // As the drop: `top` is the rounded apex, and the hat sits down the slope.
      id: "tri", label: "triángulo",
      frame: { top: 33.5, eyeY: 68, mouthY: 81, armY: 83, half: 39, bottom: 99, faceHalf: 27 },
      outline: silhouette(TRI, 0.025),
      anchors: {
        crown: { x: 60, y: 35.5, a: 0, s: 0.94 },
        hat: { x: 60, y: 41, a: 0, s: 0.9 },
        crownL: { x: 50, y: 43, a: -32, s: 0.9 },
        earL: { x: 43, y: 48, a: -55, s: 0.9 },
        backL: { x: 37, y: 60, a: -57 },
        dorsal: { x: 66, y: 42, a: 32 },
        // The face sits low on an onigiri; this keeps a scarf on the base rather than under it.
        neck: { x: 60, y: 90 },
      },
      shine: () => "M43 58 Q48.2 49.5 54.2 41",
    },
    {
      id: "dome", label: "campana",
      frame: { top: 36, eyeY: 60, mouthY: 74, armY: 70, half: 34, bottom: 91, faceHalf: 32 },
      outline: silhouette(DOME, 0.022),
      anchors: {
        earL: { x: 40.8, y: 40.8, a: -40 },
        // It floats: the shadow stays on the floor, smaller and fainter.
        ground: { x: 60, y: 106 },
      },
      shadow: { rx: 18, ry: 3.6, opacity: 0.75 },
      // Tagged `floats`: legs that hang from a floating body (ribbons, hover jets) require it, standing ones exclude it.
      tags: ["floats"],
      shine: () => "M35.5 62 Q33 56.2 48.6 41.5",
      // A floating bell: no feet (catalogue §4.3). Hem, tentacles, ribbons and hover jets are its legs. The ids not
      // drawn yet are the catalogue's feet from later batches; until they land the registry only warns about them.
      excludes: ["legs:feet|paws|bird|webbed|stick|boots|root|many|wheel"],
    },
    {
      id: "pill", label: "cápsula",
      frame: { top: 32, eyeY: 54, mouthY: 69, armY: 72, half: 24, bottom: 98 },
      outline: silhouette(PILL, 0.025),
      anchors: {
        eyeL: { x: 49.6, y: 54 },
        crown: { x: 60, y: 34, a: 0, s: 0.94 },
        hat: { x: 60, y: 35.5, a: 0, s: 0.86 },
        crownL: { x: 50.3, y: 36, a: -20, s: 0.86 },
        earL: { x: 45.6, y: 34.5, a: -40, s: 0.86 },
        rump: { x: 76, y: 92, a: 115 },
      },
      shine: () => "M43.5 45 Q46.5 40.4 55.5 36.5",
    },
  ],
});
