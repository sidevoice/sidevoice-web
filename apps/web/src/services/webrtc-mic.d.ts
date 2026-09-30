export const GATHER_MS: number;
export const CONNECT_MS: number;
export const DISCONNECTED_MS: number;

export type MicPath = "socket" | "webrtc";
/** `idle` → `negotiating` → `connected` (⇄ `recovering`); ends in `off` (never tried), `fallback` or `closed`. */
export type MicLinkState = "idle" | "negotiating" | "connected" | "recovering" | "off" | "fallback" | "closed";
export type MicLinkReason =
  | "" | "page_off" | "unsupported" | "unavailable" | "node_off"
  | "offer" | "timeout" | "failed" | "closed" | "disconnected" | "track" | "error";

export interface MicLink {
  sessionId: string;
  path: MicPath;
  state: MicLinkState;
  reason: MicLinkReason;
  /** What the failing request or API said, when it said something. */
  detail: string;
  start(): Promise<void>;
  close(): void;
  replaceTrack(track: MediaStreamTrack): void;
}

export interface MicLinkClock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

export interface MicLinkOptions {
  sessionId: string;
  track: MediaStreamTrack | null;
  allowed?: boolean;
  Peer?: typeof RTCPeerConnection;
  config(): Promise<{ enabled?: boolean; ice_servers?: RTCIceServer[] }>;
  offer(body: { session_id: string; sdp: string; type: "offer" }): Promise<{ sdp: string; type?: string }>;
  announce(path: MicPath): void;
  onChange?(link: MicLink): void;
  clock?: MicLinkClock;
  gatherMs?: number;
  connectMs?: number;
  disconnectedMs?: number;
}

export function webrtcAllowed(sources?: { search?: string | null; stored?: string | null }): boolean;
export function createMicLink(options: MicLinkOptions): MicLink;
