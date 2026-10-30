import type { HostOS } from "./types";

/* What a browser says of itself, read once and in one place: the system it runs on and the browser it is. It stood in three
 * places before (the device's default name, the pairing's fallback name, the microphone's settings), each with its own
 * reading of the user agent. Two readings are kept exactly as those had them, because each is what its copy needs:
 * `os` is the microphone's (case-insensitive, a phone and a touch Mac are not a desktop), `system` and `app` are the
 * device name's words (case-sensitive, the ones people read: "Safari on iPhone"). */

/** The members of `navigator` that tell what the page runs on. */
export interface NavigatorFacts {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string };
}

export interface BrowserIdentity {
  os: HostOS;
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
  const os: HostOS = /android/.test(said) ? "android" : /iphone|ipad|ipod/.test(said) || (/mac/.test(said) && touch) ? "ios"
    : /mac/.test(said) ? "macos" : /win/.test(said) ? "windows" : /linux|x11|cros/.test(said) ? "linux" : "other";
  return { os, system, app };
}
