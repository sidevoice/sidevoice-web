/** What a server's `GET /api/rendezvous` said it is. */
export interface TargetDescription {
  kind: "room" | "node";
  /** A node's id, as it names itself. */
  id: string | null;
  /** A node's fingerprint (docs/DEVICE_PAIRING.md): whether the target is the node a pairing names. */
  fingerprint: string | null;
  /** The web build a room serves, when it said. */
  build: string | null;
}

declare global {
  interface Window {
    /** Set before this page loads — by a desktop shell, or a standalone deployment's `target.js` — to the
     *  room or node it talks to. */
    __SIDEVOICE_TARGET__?: string;
  }
}

export function resolveTarget(sources?: { injected?: unknown; origin?: string | null }): string;
export function pageTarget(): string;
export function isNodePath(path: string): boolean;
export function routeUrl(path: string, target: string, nodeBase: string | null): string | null;
export function callSocketUrl(nodeBase: string, location: { protocol: string; host: string }): string;
export function describeTarget(answer: unknown): TargetDescription | null;
export function patiently<T>(promise: Promise<T>, ms?: number): Promise<T>;
export function askTarget(target: string, get?: typeof fetch, timeoutMs?: number): Promise<TargetDescription | null>;
export function askRoomNode(room: string, id: string, get?: typeof fetch, timeoutMs?: number): Promise<boolean | null>;
