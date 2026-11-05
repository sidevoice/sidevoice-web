/* What stands in for a creature where none can be drawn: no WebGL, a context refused, or one lost and not given back, or
 * the creature's code not loaded. It is the creature's body colour in a plain rounded outline, with no face, so the agent
 * is never missing from the page. It is deliberately not a drawing of the creature: it is the least that is not blank.
 * The page draws it as an SVG (CharacterAvatar) and a native call surface's still draws it on a canvas
 * (state/call-surface-still.ts). Both use this one outline.
 *
 * It sits in a 100 × 100 box, its top and bottom where the stage's figure box has the creature's crown and feet (20 and
 * 106 of its 120: CharacterAvatar FIGURE), so on the stage it stands where the creature stands. Kept apart from the rig,
 * so it is there when three.js is not. */

type Curve = readonly [number, number, number, number, number, number];

const TOP = 2000 / 120, FEET = 10600 / 120, H = FEET - TOP;
const FROM = [50, TOP] as const;
/** Cubic Bézier segments (two control points, then the end), clockwise from the top: a body a little wider below. */
const CURVES: readonly Curve[] = [
  [70, TOP, 82, TOP + H * 0.28, 82, TOP + H * 0.6],
  [82, TOP + H * 0.86, 68, FEET, 50, FEET],
  [32, FEET, 18, TOP + H * 0.86, 18, TOP + H * 0.6],
  [18, TOP + H * 0.28, 30, TOP, 50, TOP],
];

const n = (v: number) => Math.round(v * 100) / 100;
/** The outline as an SVG path, in a 100 × 100 view box. */
export const FALLBACK_PATH = `M${FROM.map(n).join(" ")} ${CURVES.map((c) => "C" + c.map(n).join(" ")).join(" ")}Z`;

/** The outline filled with `color` on a canvas `px` square (a native surface's still). */
export function drawFallback(g: CanvasRenderingContext2D, px: number, color: string) {
  const k = px / 100;
  g.beginPath();
  g.moveTo(FROM[0] * k, FROM[1] * k);
  for (const [x1, y1, x2, y2, x, y] of CURVES) g.bezierCurveTo(x1 * k, y1 * k, x2 * k, y2 * k, x * k, y * k);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}
