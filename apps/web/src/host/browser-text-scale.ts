/* The one place the page reads the platform's text size itself: iOS WebKit's `-apple-system-body` follows Dynamic Type in a
 * WKWebView and in mobile Safari, so a probe in that font tells the size the person set (lib/text-scale.ts turns it into a
 * scale). Nothing else is probed: where the app reports a scale it is the host's `textScale`, and elsewhere there is none. */

/** Whether this is iOS WebKit (an iPad that says it is a Mac included): the only place `-apple-system-body` follows Dynamic
 *  Type. On a Mac the same font is a fixed 13px, which would shrink the desktop. */
function isIosWebKit(): boolean {
  const nav = globalThis.navigator as Navigator | undefined;
  if (!nav) return false;
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

/** The size, in px, of `font: -apple-system-body` on this page; null when this is not iOS WebKit or the font is unknown. */
export function iosBodyProbe(): number | null {
  if (typeof document === "undefined" || !isIosWebKit()) return null;
  const probe = document.createElement("span");
  probe.style.font = "-apple-system-body";
  if (probe.style.font === "") return null;
  probe.style.cssText += ";position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;overflow:hidden";
  probe.textContent = "A";
  (document.body ?? document.documentElement).appendChild(probe);
  try {
    const px = Number.parseFloat(getComputedStyle(probe).fontSize);
    return Number.isFinite(px) && px > 0 ? px : null;
  } finally { probe.remove(); }
}
