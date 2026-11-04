import { STILL_EXPR } from "../features/avatar/creature/faces";
export interface RenderedStill { png: string; px: number; k: number }

/* A conversation's creature as a PNG for a native surface (HANDOVER §3): its still face at rest (creature/host.ts, the
 * whole creature fitted in a square, as every still copy of it in the page), drawn on a transparent square of `px`
 * pixels. */

/** `k`: how much of the still the body takes; 1 whole, until the drawing reports an accessory (HANDOVER §3 "Fit"). */
export const STILL_K = 1;

/** The still as PNG (base64, no prefix), or null where the page cannot draw one (no WebGL, no canvas). */
export async function renderStill(threadId: string, px: number): Promise<RenderedStill | null> {
  try {
    // The rig (three.js) loads with the first creature a page draws; this waits for it if it has not.
    const { faceImage } = await import("../features/avatar/creature/host");
    const face = await faceImage(threadId, STILL_EXPR.idle);
    if (!face) return null;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = px;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingQuality = "high";
    context.drawImage(face, 0, 0, px, px);
    const png = canvas.toDataURL("image/png").split(",")[1];
    return png ? { png, px, k: STILL_K } : null;
  } catch {
    return null;
  }
}
