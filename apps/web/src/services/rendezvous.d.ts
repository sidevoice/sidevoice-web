/** One machine as the room's `GET /api/rendezvous` lists it. */
export interface RendezvousNode {
  id: string;
  host?: string | null;
  platform?: string | null;
  version?: string | null;
  connected?: boolean;
  via?: string | null;
}
/** Where this page's conversations and call live, and what the target said to get there. */
export interface NodeLocation {
  kind: "room" | "node" | "legacy";
  nodes: RendezvousNode[];
  node: string | null;
  /** The node base: `''` is the page's own origin; `null` is a room with no machine connected. */
  base: string | null;
  /** The web build the room serves, when the target is a room that said. */
  build: string | null;
}
export interface NodeChoice {
  remembered?: string | null;
  keep?: string | null;
}

declare global {
  interface Window {
    /** Set by a desktop shell before this page loads: the room or node it talks to. */
    __SIDEVOICE_TARGET__?: string;
  }
}

export function resolveTarget(sources?: { injected?: unknown; origin?: string | null }): string;
export function pageTarget(): string;
export function isNodePath(path: string): boolean;
export function routeUrl(path: string, target: string, nodeBase: string | null): string | null;
export function callSocketUrl(nodeBase: string, location: { protocol: string; host: string }): string;
export function pickNode(nodes: RendezvousNode[], choice?: NodeChoice): string | null;
export function locateNode(answer: unknown, target: string, choice?: NodeChoice): NodeLocation;
export function askRendezvous(target: string, choice?: NodeChoice, get?: typeof fetch): Promise<NodeLocation | null>;
