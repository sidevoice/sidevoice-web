import type { Host } from "./types";
import { parseBrowser } from "./identity";
import { nativeCardSeam, nativeHost } from "./native";

export type * from "./types";

/** What the browser says of itself: its system and its name, as a device name says them; `os` is the host's. */
export const describeBrowser = parseBrowser;

/** The page's host, as it is now: an app may inject its members after the page's script runs, so this is read where it is
 *  needed and not kept. The one way into anything the browser or an app offers beyond the page itself. */
export function host(): Host {
  const app = nativeHost();
  // Told when it is read, and not before: parsing the user agent is for the caller that wants the system.
  return { ...app, identity: { ...app.identity, get os() { return parseBrowser().os; } } };
}

/** The call controls card's seam, in the card's own window (call-controls/host.ts holds its contract). */
export function cardSeam(): unknown {
  return nativeCardSeam();
}
