import { translator } from "../i18n/translator";

/* What a browser says of itself, read once and in one place, and what the browser's host answers from it: the device's default
 * name, the shortcut modifier's label and (browser-microphone-help.ts) the microphone's help. Nothing outside `src/host` reads
 * the user agent or the platform, or is told which system it runs on: it is given these, already resolved.
 *
 * Two readings of the user agent, each what its words need: `os` is the system's (case-insensitive, a phone and a touch Mac are
 * not a desktop), `system` and `app` are the device name's words (case-sensitive, the ones people read: "Safari on iPhone"). */

/** The members of `navigator` that tell what the page runs on. */
export interface NavigatorFacts {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string };
}

/** The system a browser runs on; `other` where it cannot tell. */
export type BrowserSystem = "macos" | "windows" | "linux" | "ios" | "android" | "other";

export interface BrowserIdentity {
  os: BrowserSystem;
  /** The system as a device name says it: iPhone, iPad, Android, Mac, Windows, ChromeOS or Linux; empty when the page does
   *  not say. */
  system: string;
  /** The browser as a device name says it: Edge, Opera, Firefox, Chrome or Safari; empty when the page does not say. */
  app: string;
}

export function parseBrowser(nav: NavigatorFacts | undefined = globalThis.navigator): BrowserIdentity {
  const agent = String(nav?.userAgent || "");
  const named = agent + " " + String(nav?.userAgentData?.platform || nav?.platform || "");
  const system = /iPhone/.test(named) ? "iPhone" : /iPad/.test(named) ? "iPad" : /Android/.test(named) ? "Android"
    : /Mac/.test(named) ? "Mac" : /Win/.test(named) ? "Windows" : /CrOS/.test(named) ? "ChromeOS" : /Linux/.test(named) ? "Linux" : "";
  const app = /Edg\//.test(agent) ? "Edge" : /OPR\/|Opera/.test(agent) ? "Opera" : /Firefox\/|FxiOS/.test(agent) ? "Firefox"
    : /CriOS|Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "";
  // A phone says it is Linux (Android) or a Mac (an iPad asking for the desktop site): it is neither a Linux nor a Mac
  // desktop, whose microphone settings are the system's.
  const said = `${nav?.userAgentData?.platform ?? ""} ${nav?.platform ?? ""} ${agent}`.toLowerCase();
  const touch = (nav?.maxTouchPoints ?? 0) > 1;
  const os: BrowserSystem = /android/.test(said) ? "android" : /iphone|ipad|ipod/.test(said) || (/mac/.test(said) && touch) ? "ios"
    : /mac/.test(said) ? "macos" : /win/.test(said) ? "windows" : /linux|x11|cros/.test(said) ? "linux" : "other";
  return { os, system, app };
}

/** A browser's default name for this device, whole and in the page's language: "{browser} on {system}" ("Chrome on Mac",
 *  "Safari on iPhone"), a browser it cannot tell is a Browser, and a page that says neither is "Sidevoice". */
export function browserDeviceName(nav: NavigatorFacts | undefined = globalThis.navigator, say = translator()): string {
  const { app, system } = parseBrowser(nav);
  if (!app && !system) return "Sidevoice";
  return say("pair.deviceNameBrowser", { browser: app || "Browser", os: system || "?" });
}

/** The modifier a browser's shortcuts are written with: ⌘ on the Mac and the iPhone (a keyboard on an iPad too), else Ctrl. */
export function browserShortcutModifier(nav: NavigatorFacts | undefined = globalThis.navigator): string {
  const { os } = parseBrowser(nav);
  return os === "macos" || os === "ios" ? "⌘" : "Ctrl";
}
