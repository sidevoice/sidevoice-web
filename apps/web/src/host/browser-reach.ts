import type { ReachTransport } from "./types";

/* What the browser's transport can do. A page served over https may not send plain http to anything but loopback (mixed
 * content); one served over http may. This is a fact about the transport, and nothing of what the page does with it: which
 * addresses a secret may go to, the person's consent to plain http, and "public http is always forbidden" are the pairing's
 * (services/device-pairing.js), the same for every host. */

/** The transport of a page served from `origin`. */
export function reachOfOrigin(origin: string): ReachTransport {
  return { plainHttpPrivate: !/^https:/.test(origin) };
}

/** This page's own, read where it is asked for. */
export function browserReach(): ReachTransport {
  return { get plainHttpPrivate() { return reachOfOrigin(globalThis.location?.origin || "").plainHttpPrivate; } };
}
