/* The desktop app's call controls card talks to the app through one seam, `window.__sidevoiceDesktop.host.callControls`,
 * which the app injects into the card's window (sidevoice-desktop bridge/call-controls-bridge.js, docs/BRIDGE.md →
 * "The call controls card"). The card never sees the room page: the app relays the call to it and carries its
 * buttons back. Outside the app the seam is absent and the page shows nothing. The playground's preview gives the card
 * page the same seam, fed from the room frame beside it (preview/mock/card-host.mjs). */
import type { AgentState, AudioDeviceOption, AudioDevices, CallCardView, CallEnded, CardFacts } from "../state/room-session-state.js";

export type { AgentState, AudioDeviceOption, AudioDevices, CallEnded };

/** The call as the card shows it (snapshot version 2 of the desktop bridge): the room's own projection of it, the
 *  store's `callCard` (state/room-session-state.js `callCardView`), passed through, with what is the host's own on top
 *  — the bridge's version and when the call went on. One projection, never mapped again by the host
 *  (briefs/FLOATING-CARD-SPEC.md FC0). The host may mark `devices.busy` while a choice it carries is on its way. */
export interface CallSnapshot extends Omit<CallCardView, "facts"> {
  /** The room's facts for the card's formats (CallCardView.facts), relayed as they are. Absent from a host that does not
   *  relay them yet: the card then has the snapshot's own fields only, and its stage stays empty. */
  facts?: CardFacts;
  version: number;
  /** When the call was joined (ms since the epoch); null out of a call. */
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
  /** The output level of the reply sounding, 0–1, and the conversation (its key) whose it is: the room's
   *  `sidevoiceUI.playbackLevel` channel (state/playback-level.ts), relayed as it publishes, so the card's avatar moves
   *  its mouth as the stage's does. Absent from a host that does not relay it: the mouth stays at rest. */
  playback?: { level: number; threadId: string | null };
  /** Which half of the screen's work area the card's middle is in: its captions and lists open toward the screen's
   *  middle (below it in the upper half, above it in the lower), and the avatar's dock opens on its left or right.
   *  Absent: upper right. */
  place?: { vertical: "upper" | "lower"; horizontal: "left" | "right" };
  /** The picture-in-picture's window, as the person last resized it (CSS pixels, its margin included); null or absent at
   *  a preset size, which the card lays out itself (`layout`). */
  size?: { width: number; height: number } | null;
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
  | { command: "select-audio-device"; kind: "input" | "output"; id: string }
  /** The idle warning's Keep: a sign of the person, so the call stays on (FC6). */
  | { command: "keep-alive" }
  /** The exit notice's Close: the card goes at once instead of when its time is up (FC7; card-local, the host's). */
  | { command: "dismiss" }
  /** The card's ×: hidden for the rest of this call (as the tray's "Hide call controls"); the next call shows it. */
  | { command: "hide" }
  /** The card's gear: the room in front, at Settings → Floating card. */
  | { command: "open-settings" }
  /** Taking back the person's turn while it is recorded or transcribed: the room's `sidevoiceActions.cancelInput()`. */
  | { command: "cancel-input" };

/** Where the card's body is inside its window (CSS pixels): what the host places, drags, remembers and keeps still while
 *  the window grows around it (captions opening above it, a list below). */
export interface CardBox { x: number; y: number; width: number; height: number }

export interface CallControlsHost {
  /** Called with the whole state at once, and again on every change. Returns the function that stops it. */
  subscribe(listener: (state: CallControlsState) => void): () => void;
  run(command: CallCommand): void;
  /** The card's size in CSS pixels, its window's margin included: the app sizes the window to it. `card`: where the
   *  card's body is in it, kept where it rests on screen as the window grows. `resizable`: the picture-in-picture, which the person may resize (`resize`) freely in both directions, down
   *  to `minWidth` and `minHeight` (the window's, margin included); its stage keeps 16:9 inside whatever shape the window takes. */
  layout(size: { width: number; height: number; card?: CardBox; resizable?: { minWidth: number; minHeight: number } }): void;
  /** Resizing the picture-in-picture by its grip, as `drag`: the host follows the pointer, resizes the window, keeps the
   *  size, and tells the card (`size`). Optional: a host without it offers the preset sizes only. */
  resize?(phase: "start" | "move" | "end", edge: "nw" | "ne" | "sw" | "se"): void;
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
