import type { CallLink, CallSocket } from "./types";

/* The browser's side of the call's link to the room: the page's own websocket, which is a `CallSocket` as it is. An app
 * that holds the link itself offers its own (`host.callLink`, native.ts); the call drives either the same way. */

/** The page's own websocket to the room. */
export function browserCallLink(): CallLink {
  return {
    runs: "page",
    open: (url, protocols) => new WebSocket(url, protocols) as unknown as CallSocket,
  };
}
