import { host } from "../host";
import type { TextScaleBridge } from "../host";

/* How much bigger or smaller than its default the person has set the text on this phone (iOS Dynamic Type, Android font
 * scale). The type tokens (styles/theme.css) are `base × var(--sv-text-scale, 1)`: text only follows it, and spacing,
 * icons, the creature and the stage frame do not, as in a native app.
 *
 * Where the number comes from, in this order:
 * - the host, when it reports one (`host.textScale`): an Android WebView keeps `textZoom` at 100 and does not follow the
 *   font scale by itself, so the app reads it and says it;
 * - on iOS WebKit (the app's WKWebView, mobile Safari), a hidden probe in `font: -apple-system-body`, which is 17px at the
 *   default size and follows Dynamic Type: the scale is its size over 17;
 * - anywhere else, 1 (a desktop browser and the desktop app never scale).
 * Standard sizes are followed in full (iOS xS-XXXL are 0.82-1.35); the accessibility sizes (up to about 3.1 on iOS) stop at
 * MAX_TEXT_SCALE, because the layout is a phone's and past 2 it would be a different design. */

export const MIN_TEXT_SCALE = 0.8;
export const MAX_TEXT_SCALE = 2;
/** From this scale up the root says `data-text-large`, which the few layouts that keep one line at the default size key on. */
export const LARGE_TEXT_SCALE = 1.2;
/** The size of `-apple-system-body` at the default Dynamic Type size, in px. */
export const IOS_BODY_PX = 17;

export interface TextScaleSources {
  /** The host's bridge; absent or without a usable value, the probe is next. */
  host?: Pick<TextScaleBridge, "get"> | null;
  /** The size of `-apple-system-body` in px, or null where that is not an iOS WebKit page. */
  probe?: () => number | null;
}

export function clampTextScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, scale));
}

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

function hostScale(bridge: TextScaleSources["host"]): number | null {
  try {
    const value: unknown = bridge?.get();
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  } catch { return null; }
}

/** The phone's text scale now, in [MIN_TEXT_SCALE, MAX_TEXT_SCALE]. */
export function systemTextScale(sources: TextScaleSources = {}): number {
  const reported = hostScale("host" in sources ? sources.host : host().textScale);
  if (reported !== null) return clampTextScale(reported);
  const px = (sources.probe ?? iosBodyProbe)();
  return px === null ? 1 : clampTextScale(px / IOS_BODY_PX);
}

/** Says the scale on the root, as `--sv-text-scale`; returns it. */
export function applyTextScale(root: HTMLElement = document.documentElement, sources?: TextScaleSources): number {
  const scale = systemTextScale(sources);
  const value = String(Math.round(scale * 1000) / 1000);
  if (root.style.getPropertyValue("--sv-text-scale") !== value) root.style.setProperty("--sv-text-scale", value);
  // Layouts that hold one line at the default size say where they stop holding (a footer's actions: they wrap from here).
  root.toggleAttribute("data-text-large", scale >= LARGE_TEXT_SCALE);
  return scale;
}

/** At start: the scale, and again whenever the person may have changed it (they set it in Settings and come back) or the
 *  host says it changed. Returns what stops that. */
export function startTextScale(root: HTMLElement = document.documentElement, sources?: TextScaleSources): () => void {
  const read = () => { applyTextScale(root, sources); };
  read();
  document.addEventListener("visibilitychange", read);
  const bridge = host().textScale;
  let unsubscribe: (() => void) | undefined;
  try { unsubscribe = bridge?.subscribe?.(read); } catch { /* The visibility change still re-reads it. */ }
  return () => {
    document.removeEventListener("visibilitychange", read);
    try { unsubscribe?.(); } catch { /* Already gone. */ }
  };
}
