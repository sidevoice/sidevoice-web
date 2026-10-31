import type { Host } from "./types";
import { nativeCardSeam, nativeHost } from "./native";

export type * from "./types";

/** The page's host, as it is now: an app may inject its members after the page's script runs, so this is read where it is
 *  needed and not kept. The one way into anything the browser or an app offers beyond the page itself. */
export function host(): Host {
  return nativeHost();
}

/** The call controls card's seam, in the card's own window (call-controls/host.ts holds its contract). */
export function cardSeam(): unknown {
  return nativeCardSeam();
}
