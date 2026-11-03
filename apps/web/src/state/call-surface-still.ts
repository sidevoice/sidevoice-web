import { avatarFor, avatarTone } from "../features/avatar/avatar-spec";
import { drawAvatar } from "../features/avatar/bicho-draw";
import { bichosStylesheet } from "../features/avatar/engine-stylesheet";
import type { SurfaceStill } from "./call-surface.js";

/* A conversation's creature as a PNG for a native surface (HANDOVER §3): the same drawing every copy of it in the page is
 * (drawAvatar), at rest, in a square of `px` pixels, rasterised through the browser's own SVG engine. The page's rules for
 * its avatar (styles/call.css) are carried with it, so it looks as it does on the stage's thumbnails. */

/** `k`: how much of the still the body takes; 1 whole, until the drawing reports an accessory (HANDOVER §3 "Fit"). */
export const STILL_K = 1;

/** The page's own rules about its avatars, as written. */
function pageAvatarRules(): string {
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules))
        if (rule instanceof CSSStyleRule && rule.selectorText.includes("sv-avatar")) rules.push(rule.cssText);
    } catch { /* A sheet from another origin cannot be read, and holds none of ours. */ }
  }
  return rules.join("\n");
}

/** The markup of the still: the creature on a transparent square, nothing moving. */
export function stillMarkup(threadId: string, px: number): string {
  const drawing = drawAvatar(avatarFor(threadId), "small");
  const tone = Object.entries(avatarTone(drawing.tone)).map(([name, value]) => `${name}:${value}`).join(";");
  const css = `${bichosStylesheet()}\n${pageAvatarRules()}\n.sv-avatar{background:none!important;display:block}*{animation:none!important;transition:none!important}`;
  // The root is the avatar's own, so the rules written for `.sv-avatar svg` reach the drawing; no foreignObject, which taints the canvas in WebKit.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" class="sv-avatar" data-style="bichos" data-size="sidebar" data-mood="idle" data-avatar-state="idle" data-mouth="still" style="${tone}">`
    + `<style>${css}</style>${drawing.html.replace(/<svg\b/, `<svg width="${px}" height="${px}"`)}</svg>`;
}

/** The still as PNG (base64, no prefix), or null where the page cannot draw one (no canvas). */
export async function renderStill(threadId: string, px: number): Promise<SurfaceStill | null> {
  try {
    const url = URL.createObjectURL(new Blob([stillMarkup(threadId, px)], { type: "image/svg+xml" }));
    try {
      const image = new Image(px, px);
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = px;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(image, 0, 0, px, px);
      const png = canvas.toDataURL("image/png").split(",")[1];
      return png ? { png, px, k: STILL_K } : null;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
