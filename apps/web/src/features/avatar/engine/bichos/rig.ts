import { n, type Rng } from "../core";
import type { Anchor, BodyDef, Frame, Jitter, Rig } from "./kit";

/* Where parts land. A body declares a frame (top, eyeY, mouthY, armY, half, bottom, optional faceHalf) and the rig
 * derives the standard anchors from it. The formulas are the ones the existing parts were placed with, so on the
 * existing bodies every migrated part lands exactly where it did. A body can override any anchor; `hat` follows the
 * body's crown (overridden or not) unless the body sets it too. */

/** The body the existing parts were drawn on: crown at 40, half width 32, arms at 72, base at 96. */
export const REF_FRAME: Frame = { top: 40, eyeY: 58, mouthY: 78, armY: 72, half: 32, bottom: 96 };

const mirror = (a: Anchor): Anchor => ({ ...a, x: 120 - a.x, a: a.a === undefined ? undefined : -a.a });
const right = (name: string) => name.slice(0, -1) + "R";

export function standardAnchors(f: Required<Frame>): Record<string, Anchor> {
  const h = f.half, fh = f.faceHalf, s = Math.min(12, fh * 0.4);
  const left: Record<string, Anchor> = {
    crownL: { x: 60 - fh * 0.3 - 2.5, y: f.top + 4, a: -20 },
    earL: { x: 60 - fh * 0.6, y: f.top + 2, a: -40 },
    eyeL: { x: 60 - s, y: f.eyeY },
    templeL: { x: 60 - fh, y: f.eyeY - 1, a: -90 },
    cheekL: { x: 60 - s - 8, y: f.mouthY - 3 },
    shoulderL: { x: 66 - h, y: f.armY + 2, a: -100 },
    backL: { x: 60 - h * 0.85, y: (f.top + f.armY) / 2, a: -62 },
    footL: { x: 51, y: f.bottom - 4, a: 180 },
  };
  const at: Record<string, Anchor> = {
    crown: { x: 60, y: f.top + 2, a: 0 },
    hat: { x: 60, y: f.top + 2, a: 0 },
    forehead: { x: 60, y: f.eyeY - 14 },
    eyes: { x: 60, y: f.eyeY },
    muzzle: { x: 60, y: f.mouthY - 5 },
    mouth: { x: 60, y: f.mouthY },
    // The cast's open D: its bottom 13 under the mouth line, plus half its ink edge.
    chin: { x: 60, y: f.mouthY + 14.5 },
    neck: { x: 60, y: f.mouthY + 10 },
    dorsal: { x: 60 + h * 0.25, y: f.top + 3, a: 15 },
    belly: { x: 60, y: f.bottom - 12 },
    rump: { x: 60 + h - 10, y: f.bottom - 2, a: 110 },
    hem: { x: 60, y: f.bottom - 3, a: 180 },
    base: { x: 60, y: f.bottom, a: 180 },
    ground: { x: 60, y: Math.min(110, f.bottom + 9) },
  };
  for (const [name, a] of Object.entries(left)) { at[name] = a; at[right(name)] = mirror(a); }
  return at;
}

const full = (f: Frame): Required<Frame> => ({ ...f, faceHalf: f.faceHalf ?? f.half });

export function rigOf(body: Pick<BodyDef, "frame" | "outline" | "anchors">, r: Rng): Rig {
  const f = full(body.frame);
  const at = standardAnchors(f);
  for (const [name, a] of Object.entries(body.anchors ?? {})) {
    at[name] = a;
    if (name.endsWith("L") && at[right(name)] && !body.anchors?.[right(name)]) at[right(name)] = mirror(a);
  }
  if (!body.anchors?.hat) at.hat = { ...at.crown };
  return {
    ...f,
    outline: body.outline(r),
    spread: Math.min(12, f.faceHalf * 0.4),
    u: f.half / 32,
    at,
    fit: (x, rad) => Math.min(rad, f.faceHalf - Math.abs(x - 60) - 2),
  };
}

export const REF = standardAnchors(full(REF_FRAME));

/** The default gloss stroke, from the frame. */
export const defaultShine = (g: Rig) => `M${n(60 - g.half * 0.72)} ${g.eyeY + 2} Q${n(60 - g.half * 0.7)} ${g.top + 6} ${n(60 - g.half * 0.3)} ${g.top + 2}`;

export interface Placement {
  /** SVG transform for the part's drawing ("" when it lands as drawn). */
  t: string;
  /** Maps a point of the drawing into the 120 box. */
  map(x: number, y: number): [number, number];
  /** The socket, placed: the pivot of the part's groups. */
  origin: [number, number];
}

/** Lands `socket` on `anchor`, turned by the anchor's normal relative to the reference body's and scaled by its `s`. */
export function place(anchor: Anchor, ref: Anchor | undefined, socket: [number, number], jit?: Required<Pick<Jitter, "dx" | "dy" | "rot" | "size">>): Placement {
  const [sx, sy] = socket;
  const rot = (ref && anchor.a !== undefined && ref.a !== undefined ? anchor.a - ref.a : 0) + (jit?.rot ?? 0);
  const k = (anchor.s ?? 1) * (1 + (jit?.size ?? 0));
  const ax = anchor.x + (jit?.dx ?? 0), ay = anchor.y + (jit?.dy ?? 0);
  if (!rot && k === 1) {
    const dx = ax - sx, dy = ay - sy;
    return { t: n(dx) || n(dy) ? `translate(${n(dx)} ${n(dy)})` : "", map: (x, y) => [x + dx, y + dy], origin: [ax, ay] };
  }
  const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180);
  return {
    t: `translate(${n(ax)} ${n(ay)}) rotate(${n(rot)}) scale(${n(k)}) translate(${n(-sx)} ${n(-sy)})`,
    map: (x, y) => { const px = (x - sx) * k, py = (y - sy) * k; return [ax + px * c - py * s, ay + px * s + py * c]; },
    origin: [ax, ay],
  };
}
