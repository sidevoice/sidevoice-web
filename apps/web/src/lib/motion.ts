import { useSyncExternalStore } from "react";

/* Whether the page's drawings may move (web#278). What moves — the creature on the stage and on the call card, the
 * stage's backdrop and desk — moves as GPU layers (features/avatar/layers.ts): transform and opacity on whole HTML
 * layers, which the GPU composites without painting anything again. Without hardware acceleration a layer is
 * composited on the CPU, and a moving drawing would cost what desktop#149 measured; so the drawings move only where the
 * GPU is there, and in doubt they hold still. Under reduced motion they hold still too.
 *
 * The decision is said once, on the page's root as data-motion = gpu | still (the CSS keys on it, styles/call.css), and
 * logged with its reason. "sidevoice.motion" in this origin's storage (gpu | still) sets it by hand, for a test or a
 * machine whose GPU is misjudged. */

export type Motion = "gpu" | "still";

export const MOTION_KEY = "sidevoice.motion";

/** Renderers that draw on the CPU: Chrome's SwiftShader, Mesa's llvmpipe and softpipe, Windows' Basic Render Driver. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|swrast|software|basic render/i;

/** Why there is no GPU to move the drawings on, or null when there is one (and its renderer, for the log). */
function gpuProblem(): { problem: string | null; renderer?: string } {
  try {
    const canvas = document.createElement("canvas");
    // A context the browser would draw in software, or one it can only give with a major performance caveat, fails.
    const gl = canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true });
    if (!gl) return { problem: "no hardware-accelerated WebGL" };
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    if (SOFTWARE.test(renderer)) return { problem: `software renderer (${renderer})`, renderer };
    return { problem: null, renderer };
  } catch (error) {
    return { problem: `WebGL probe failed (${error instanceof Error ? error.message : String(error)})` };
  }
}

function setByHand(): Motion | null {
  try {
    const value = globalThis.localStorage?.getItem(MOTION_KEY);
    return value === "gpu" || value === "still" ? value : null;
  } catch { return null; }
}

const reduced = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
const listeners = new Set<() => void>();
let current: Motion = "still";
let decided = false;
let gpu: { problem: string | null; renderer?: string } | null = null;

function decide(): { motion: Motion; reason: string } {
  const hand = setByHand();
  if (hand) return { motion: hand, reason: `set by ${MOTION_KEY}` };
  if (reduced()?.matches) return { motion: "still", reason: "reduced motion" };
  gpu ??= gpuProblem();
  return gpu.problem ? { motion: "still", reason: gpu.problem } : { motion: "gpu", reason: `GPU: ${gpu.renderer || "unnamed"}` };
}

function apply(root: HTMLElement) {
  const { motion, reason } = decide();
  if (decided && motion === current) return;
  decided = true;
  current = motion;
  root.dataset.motion = motion;
  console.info(`[sidevoice] drawings ${motion === "gpu" ? "move as GPU layers" : "hold still"}: ${reason}`);
  for (const listener of listeners) listener();
}

let following = false;
/** Decides for this page (again if called again, after a change by hand), and again when reduced motion is turned on
 *  or off. */
export function startMotion(root: HTMLElement = document.documentElement) {
  apply(root);
  if (following) return;
  following = true;
  reduced()?.addEventListener("change", () => apply(root));
}

/** How the page's drawings move now: "still" until startMotion has decided (and in tests). */
export const motion = (): Motion => current;

/** Calls `listener` whenever the decision changes (reduced motion turned on or off). */
export const subscribeMotion = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useMotion(): Motion {
  return useSyncExternalStore(subscribeMotion, motion, motion);
}
