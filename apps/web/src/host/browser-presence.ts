import type { RemoteCommand, RemoteControls, ScreenAwake } from "./types";

/* The browser's side of a call's presence (sidevoice/sidevoice-web#8): the Media Session and the Now Playing element that
 * give a page the lock screen's tile and the headset's button, and the Screen Wake Lock. Mechanisms only. When to show
 * the call, what a command does to it, and when to hold the screen are the call's (room-session-controller.js). */

/** What a platform action asks of the call. A click arrives as play or pause, whichever the platform thinks is next:
 *  "play" always means open the microphone; "pause" toggles it, because a click may reach us as pause even while muted.
 *  "togglemicrophone" is where an AirPods press would arrive while the microphone is open, once Safari turns on the mute
 *  API it already has behind a flag (WebKit 54a7d6e278); Safari's own mute control uses it too. */
const ACTIONS: Record<string, (details?: { isActivating?: unknown } | null) => RemoteCommand> = {
  play: () => ({ type: "set-muted", muted: false }),
  pause: () => ({ type: "toggle-muted" }),
  togglemicrophone: (details) => typeof details?.isActivating === "boolean"
    ? { type: "set-muted", muted: !details.isActivating } : { type: "toggle-muted" },
};

/** iOS gives the lock-screen tile — and with it what a headphone click sends — to an ordinary media element, not to the
 *  live stream the call plays through (WebKit keeps calls from becoming "Now Playing" on purpose). So the call owns it
 *  with an element of its own: a faint looping file, far below the microphone's detector, playing while the microphone is
 *  open and paused while it is muted. It never touches the call's own output element, which is what echo cancellation
 *  listens to. */
function faintLoop() {
  const rate = 8000, seconds = 2, count = rate * seconds, bytes = new DataView(new ArrayBuffer(44 + count * 2));
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) bytes.setUint8(at + i, value.charCodeAt(i)); };
  text(0, "RIFF"); bytes.setUint32(4, 36 + count * 2, true); text(8, "WAVE"); text(12, "fmt "); bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true); bytes.setUint32(24, rate, true); bytes.setUint32(28, rate * 2, true);
  bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true); text(36, "data"); bytes.setUint32(40, count * 2, true);
  // About -80 dBFS: not digital silence, which iOS does not count as playing.
  for (let i = 0; i < count; i++) bytes.setInt16(44 + i * 2, Math.round((Math.random() * 2 - 1) * 3), true);
  return new Blob([bytes], { type: "audio/wav" });
}

let remote: RemoteControls | null = null;

/** The page's lock screen and headset, or null where the browser has no Media Session. One for the page. */
export function browserRemote(): RemoteControls | null {
  if (typeof navigator === "undefined" || !navigator.mediaSession) return null;
  if (remote) return remote;
  let loop: HTMLAudioElement | null = null;
  let shown: { title: string; subtitle: string } | null = null;
  const listeners = new Set<(command: RemoteCommand) => void>();
  const emit = (command: RemoteCommand) => { for (const listener of [...listeners]) listener(command); };
  const sync = (live: boolean) => {
    if (!loop) return;
    if (live && loop.paused) loop.play().catch(() => {});
    if (!live && !loop.paused) loop.pause();
  };
  remote = {
    prime() {
      if (loop || typeof Audio === "undefined") return;
      try {
        const element = new Audio();
        element.loop = true;
        element.setAttribute("playsinline", "");
        element.src = URL.createObjectURL(faintLoop());
        loop = element;
        element.play().catch(() => {});
      } catch { /* No tile to own. */ }
    },
    show({ title, subtitle, live }) {
      const session = navigator.mediaSession;
      if (!shown) {
        for (const [action, command] of Object.entries(ACTIONS)) {
          try { session.setActionHandler(action as MediaSessionAction, (details) => emit(command(details as { isActivating?: unknown } | null))); } catch { /* An action this browser does not know. */ }
        }
      }
      if (!shown || shown.title !== title || shown.subtitle !== subtitle) {
        try { session.metadata = new MediaMetadata({ title, artist: subtitle }); } catch { /* No tile text. */ }
        shown = { title, subtitle };
      }
      sync(live);
    },
    clear() {
      const session = navigator.mediaSession;
      for (const action of Object.keys(ACTIONS)) {
        try { session.setActionHandler(action as MediaSessionAction, null); } catch { /* An action this browser does not know. */ }
      }
      try { session.metadata = null; } catch { /* No tile text. */ }
      shown = null;
      sync(false);
    },
    onCommand(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  return remote;
}

let awake: ScreenAwake | null = null;

/** The page's Screen Wake Lock. One for the page, which holds the lock it was last granted. */
export function browserScreenAwake(): ScreenAwake {
  if (awake) return awake;
  let held: WakeLockSentinel | null = null;
  const listeners = new Set<() => void>();
  awake = {
    get supported() { return typeof navigator !== "undefined" && "wakeLock" in navigator; },
    async acquire() {
      if (!globalThis.navigator?.wakeLock?.request) return "unsupported";
      try {
        // Inside the gesture that started the call, when there is one: Safari grants the lock to the tap.
        const lock = await navigator.wakeLock.request("screen");
        held = lock;
        // The system takes the lock back on its own: a screen that locked once, a route change. Only the lock held now
        // is told of; one this host let go of itself is not.
        lock.addEventListener("release", () => {
          if (held !== lock) return;
          held = null;
          for (const listener of [...listeners]) listener();
        });
        return "held";
      } catch { return "failed"; }
    },
    release() {
      const lock = held;
      held = null;
      if (lock) lock.release().catch(() => {});
    },
    onReleased(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  return awake;
}
