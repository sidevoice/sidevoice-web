import { parseBrowser, type NavigatorFacts } from "./identity";

/* The page's viewport, decided in one place from what the host says (an app, or a browser) and the system it runs on. Two
 * things want it, and they are one decision:
 *
 *  - A native phone app is not a web document: it must not pinch-zoom or double-tap zoom, and a focused field must not
 *    zoom it. The page says so in its viewport, which is what WebKit re-reads on every layer-tree commit (the native
 *    side's own lock, the scroll view's pinch recognizer, is rewritten by it) and what Android's WebView honours. The
 *    system's own Zoom (iOS) and Magnification (Android) work over any app, so nothing of accessibility is lost.
 *  - A browser must stay zoomable (WCAG 1.4.4), so there nothing blocks pinch. iOS Safari zooms in on a focused field with
 *    text under 16px; `maximum-scale=1` stops that and still lets it pinch (since iOS 10), so it is added there and only
 *    there. Android browsers do not auto-zoom, and for them `maximum-scale` would block pinch.
 *
 * The app is told apart by `identity.build`, a phone or tablet by the system its web view says it runs on: the bridge does
 * not say mobile or desktop, and the desktop app's web views ignore the viewport anyway, so any other app keeps the default. */

/** What the markup ships (`index.html`); every host that nothing below changes keeps it. */
export const DEFAULT_VIEWPORT = "width=device-width, initial-scale=1.0, viewport-fit=cover";

const IOS_BROWSER_VIEWPORT = "width=device-width, initial-scale=1.0, maximum-scale=1, viewport-fit=cover";
const NATIVE_PHONE_VIEWPORT = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

/** The viewport content for a page: `app` is whether an app hosts it (`host().identity.build !== null`). */
export function viewportContent(app: boolean, nav: NavigatorFacts | undefined = globalThis.navigator): string {
  const { os } = parseBrowser(nav);
  const phone = os === "ios" || os === "android";
  if (app) return phone ? NATIVE_PHONE_VIEWPORT : DEFAULT_VIEWPORT;
  return os === "ios" ? IOS_BROWSER_VIEWPORT : DEFAULT_VIEWPORT;
}

/** Sets the viewport meta of `doc` to what `viewportContent` says; a page without one is left as it is. */
export function applyViewport(doc: Document, app: boolean, nav?: NavigatorFacts): void {
  const meta = doc.querySelector('meta[name="viewport"]');
  if (meta) meta.setAttribute("content", viewportContent(app, nav ?? doc.defaultView?.navigator));
}
