/* The desktop app's call controls card talks to the app through one seam, `window.__sidevoiceDesktop.host.callControls`,
 * which the app injects into the card's window (sidevoice-desktop bridge/call-controls-bridge.js, docs/BRIDGE.md →
 * "The call controls card"). The card never sees the room page: the app relays the call to it and carries its
 * buttons back. Outside the app the seam is absent and the page shows nothing. The playground's preview gives the card
 * page the same seam, fed from the room frame beside it (preview/mock/card-host.mjs). */
import type { AgentState, AudioDeviceOption, AudioDevices, CallCardView, CallEnded, CallModel, MicCode } from "../state/room-session-state.js";
import type { CardCaption } from "../state/card-caption";

export type { AgentState, AudioDeviceOption, AudioDevices, CallEnded, CallModel, CardCaption, MicCode };

/** The call as the card shows it (snapshot version 2 of the desktop bridge): the room's own projection of it, the
 *  store's `callCard` (state/room-session-state.js `callCardView`), passed through, with what is the host's own on top
 *  — the bridge's version and when the call (A) or the voice (B) went on. One projection, never mapped again by the host
 *  (briefs/FLOATING-CARD-SPEC.md FC0). The host may mark `devices.busy` while a choice it carries is on its way. */
export interface CallSnapshot extends CallCardView {
  version: number;
  /** When the call was joined (A), or the voice turned on (B) (ms since the epoch); null when neither. */
  since: number | null;
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
  /** The words being said, from the room's caption channel (state/card-caption.ts; FC8): page → app `bridge_caption`,
   *  app → card. Absent where the host carries none: the card then says the state instead. */
  caption?: CardCaption | null;
}

export type CallCommand =
  | { command: "toggle-mute" }
  | { command: "hang-up" }
  /** Call model B (contract gap #38): the voice off (the room stays), and the agents muted or not. */
  | { command: "voice-off" }
  | { command: "toggle-agents" }
  | { command: "skip-reply" }
  | { command: "open-app" }
  | { command: "select-participant"; threadId: string }
  | { command: "select-audio-device"; kind: "input" | "output"; id: string }
  /** Call model B: "Hear it" for the active conversation, which has a mark (FC9; the room's `hearIt`). */
  | { command: "hear-it"; threadId: string }
  /** The idle warning's Keep: a sign of the person, so the call (A) or the voice (B) stays on (FC6). */
  | { command: "keep-alive" }
  /** The exit notice's Close: the card goes at once instead of when its time is up (FC7; card-local, the host's). */
  | { command: "dismiss" };

export interface CallControlsHost {
  /** Called with the whole state at once, and again on every change. Returns the function that stops it. */
  subscribe(listener: (state: CallControlsState) => void): () => void;
  run(command: CallCommand): void;
  /** The card's size in CSS pixels, its window's margin included: the app sizes the window to it. */
  layout(size: { width: number; height: number }): void;
  /** Moving the card: when it starts, on every move, and when it ends. The host follows the pointer itself (it knows
   *  where it is across displays of different scales), or hands the move to the window system. */
  drag(phase: "start" | "move" | "end"): void;
}

declare global {
  interface Window {
    __sidevoiceDesktop?: { host?: { callControls?: CallControlsHost } & Record<string, unknown> } & Record<string, unknown>;
  }
}

export function callControlsHost(): CallControlsHost | null {
  return window.__sidevoiceDesktop?.host?.callControls ?? null;
}
