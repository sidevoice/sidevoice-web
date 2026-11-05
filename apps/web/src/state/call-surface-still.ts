import { creatureFromSeed } from "../features/avatar/creature/catalogue";
import { STILL_EXPR } from "../features/avatar/creature/faces";
import { drawFallback } from "../features/avatar/creature/fallback";
import { loadCreatureHost } from "../features/avatar/creature-loader";
export interface RenderedStill { png: string; px: number; k: number }

/* A conversation's creature as a PNG for a native surface (HANDOVER §3): its still face at rest (creature/host.ts, the
 * whole creature fitted in a square, as every still copy of it in the page), drawn on a transparent square of `px`
 * pixels. Where the page cannot draw creatures (no WebGL, a context lost and not given back), the still is the fallback
 * the page shows (creature/fallback.ts) in the creature's body colour, so the surface does not lose the agent. */

/** `k`: how much of the still the body takes; 1 whole, until the drawing reports an accessory (HANDOVER §3 "Fit"). */
export const STILL_K = 1;

/** The failures already told, so one that repeats does not fill the log. */
const warned = new Set<string>();

/** The host shows its own mark instead, and the reason goes to the console, once per still and reason. Only the mobile
 *  app draws stills, and it does not forward the page's console yet (desktop row S5b): until it does, no device log has
 *  it. */
function tell(threadId: string, px: number, error: unknown) {
  const told = `${threadId}#${px}:${String(error)}`;
  if (!warned.has(told)) { warned.add(told); console.warn(`[sidevoice] call surface: no still for ${threadId} at ${px}px:`, error); }
}

/** The still as PNG (base64, no prefix), or null where there is none to give yet. */
export async function renderStill(threadId: string, px: number): Promise<RenderedStill | null> {
  let face: HTMLCanvasElement | null;
  try {
    // The rig (three.js) loads with the first creature a page draws; this waits for it if it has not.
    const { faceImage } = await loadCreatureHost();
    face = await faceImage(threadId, STILL_EXPR.idle);
  } catch (error) {
    // Its code did not load, most likely for a moment: no still yet, and the snapshot names none until there is one. The
    // publisher asks again by itself (call-surface-publisher.ts retryStills), even on a call where nothing changes. A
    // fallback here would stay for the whole call, since a still handed over is not drawn again.
    tell(threadId, px, error);
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = px;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d canvas context");
    if (face) {
      context.imageSmoothingQuality = "high";
      context.drawImage(face, 0, 0, px, px);
    } else drawFallback(context, px, creatureFromSeed(threadId).color);
    const png = canvas.toDataURL("image/png").split(",")[1];
    if (!png) throw new Error("the canvas gave no PNG");
    return { png, px, k: STILL_K };
  } catch (error) {
    tell(threadId, px, error);
    return null;
  }
}
