/* The desktop app's call controls card talks to the app through one seam, `window.__sidevoiceDesktop.host.callControls`,
 * which the app injects into the card's window (sidevoice-desktop bridge/call-controls-bridge.js, docs/BRIDGE.md →
 * "The call controls card"). The card never sees the room page: the app relays the call to it and carries its
 * buttons back. Outside the app the seam is absent and the page shows nothing. */
import type { ParticipantView } from "../state/room-types";
import type { AudioDevices } from "../state/room-session-state";

/** What the agent is doing: the avatar shows it, and only it. */
export type AgentState = "idle" | "working" | "speaking";

/** The call as the room window reports it to the app (snapshot version 2 of the desktop bridge). */
export interface CallSnapshot {
  version: number;
  ready: boolean;
  joined: boolean;
  /** Reconnecting or switching conversation. */
  busy: boolean;
  micEnabled: boolean;
  micDisabled: boolean;
  /** The conversation the call is on. */
  title: string;
  agent: AgentState;
  /** You are speaking (the room hears a turn open). */
  youTalking: boolean;
  /** Something is playing that "skip" would stop. */
  canSkip: boolean;
  /** When the call was joined (ms since the epoch); null when not in one. */
  since: number | null;
  participants: ParticipantView[];
  devices: AudioDevices | null;
}

export interface CallControlsState {
  call: CallSnapshot;
  /** The microphone's level, 0–100 (state/mic-level.ts in the room). */
  level: number;
  /** Whether the pointer is over the card, as the app sees it (it polls the cursor: a window that never takes focus
   *  may get no hover events). null where the app cannot tell (Wayland): the card's own pointer events decide. */
  pointerInside: boolean | null;
  /** The desktop setting "Show the call controls always". */
  alwaysExpanded: boolean;
  /** The global mute shortcut as the person reads it (⌃⌥M, Ctrl+Alt+M); empty when there is none. */
  muteShortcut: string;
  /** Counts clicks the person made outside the card (the app sees them; a window never focused does not): any change
   *  closes an open panel. Absent where the app cannot tell. */
  outsideClicks?: number;
}

export type CallCommand =
  | { command: "toggle-mute" }
  | { command: "hang-up" }
  | { command: "skip-reply" }
  | { command: "open-app" }
  | { command: "select-participant"; threadId: string }
  | { command: "select-audio-device"; kind: "input" | "output"; id: string };

export interface CallControlsHost {
  /** Called with the whole state at once, and again on every change. Returns the function that stops it. */
  subscribe(listener: (state: CallControlsState) => void): () => void;
  run(command: CallCommand): void;
  /** The card's size in CSS pixels, its window's margin included: the app sizes the window to it. */
  layout(size: { width: number; height: number }): void;
  /** Moving the card: the pointer's position on screen at the start, on every move, and at the end. */
  drag(phase: "start" | "move" | "end", screenX: number, screenY: number): void;
}

declare global {
  interface Window {
    __sidevoiceDesktop?: { host?: { callControls?: CallControlsHost } & Record<string, unknown> } & Record<string, unknown>;
  }
}

export function callControlsHost(): CallControlsHost | null {
  return window.__sidevoiceDesktop?.host?.callControls ?? null;
}
