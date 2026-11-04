import { avatarFor, avatarTone } from "../features/avatar/avatar-spec";
import { drawAvatar } from "../features/avatar/bicho-draw";
import { bichosStylesheet } from "../features/avatar/engine-stylesheet";
export interface RenderedStill { png: string; px: number; k: number }

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
  // The CSS goes in as CDATA: a nesting `&` or a `<` in a value is not XML, and one anywhere would leave every still undrawable.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" class="sv-avatar" data-style="bichos" data-size="sidebar" data-mood="idle" data-avatar-state="idle" data-mouth="still" style="${tone}">`
    + `<style><![CDATA[${css.replaceAll("]]>", "]]]]><![CDATA[>")}]]></style>${drawing.html.replace(/<svg\b/, `<svg width="${px}" height="${px}"`)}</svg>`;
}

/** The failures already told, so one that repeats does not fill the log. */
const warned = new Set<string>();

/** The still as PNG (base64, no prefix), or null where the page cannot draw one (no canvas). */
export async function renderStill(threadId: string, px: number): Promise<RenderedStill | null> {
  try {
    const url = URL.createObjectURL(new Blob([stillMarkup(threadId, px)], { type: "image/svg+xml" }));
    try {
      const image = new Image(px, px);
      // Its load, not decode(), which not every WebKit has been seen to keep for an SVG.
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("the SVG did not load as an image"));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = px;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no 2d canvas context");
      context.drawImage(image, 0, 0, px, px);
      const png = canvas.toDataURL("image/png").split(",")[1];
      if (!png) throw new Error("the canvas gave no PNG");
      return { png, px, k: STILL_K };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    // The host shows its own mark instead, and the reason goes to the console, once per still and reason. Only the mobile
    // app draws stills, and it does not forward the page's console yet (desktop row S5b): until it does, no device log has it.
    const told = `${threadId}#${px}:${String(error)}`;
    if (!warned.has(told)) { warned.add(told); console.warn(`[sidevoice] call surface: no still for ${threadId} at ${px}px:`, error); }
    return null;
  }
}
