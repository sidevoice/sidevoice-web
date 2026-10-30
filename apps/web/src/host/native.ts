import type {
  AppBuild, AppUpdater, AppVoice, CallControlsBridge, Host, HostDebugBridge, HostIdentity, HostPresence, HostStorage, LocalHostBridge, MicrophoneBridge,
  MuteShortcutBridge, PairingsStore, ResetBridge,
} from "./types";

/* What an app injects into its page, as the app does today: `window.__sidevoiceDesktop.host`, one optional member per
 * thing the app offers (sidevoice-desktop `docs/BRIDGE.md`). A member is looked for as it is asked for, and used only when
 * it has the functions the page calls: an app before a member has none of it, and the page then shows nothing of it. The
 * members are the app's own objects, passed through as they are: a live getter stays live. */
declare global {
  interface Window {
    __sidevoiceDesktop?: { host?: Record<string, unknown> } & Record<string, unknown>;
  }
}

type Injected = Record<string, unknown>;

function injected(): Injected | undefined {
  return (globalThis.window as Window | undefined)?.__sidevoiceDesktop?.host;
}

/** A member the app offers, when it is an object with every one of `functions`. */
function member<T>(app: Injected | undefined, name: string, functions: readonly string[]): T | null {
  const found = app?.[name] as Record<string, unknown> | undefined;
  return found && functions.every((fn) => typeof found[fn] === "function") ? found as T : null;
}

function build(app: Injected | undefined): AppBuild | null {
  const found = app?.build as Record<string, unknown> | undefined;
  if (!found || typeof found !== "object") return null;
  const channel = found.channel === "release" || found.channel === "nightly" || found.channel === "dev" ? found.channel : "unknown";
  const text = (value: unknown) => typeof value === "string" ? value : null;
  return { channel, version: text(found.version) ?? "", commit: text(found.commit), date: text(found.date) };
}

/** The members an app offers through the global it injects, `null` for the rest; the identity here is what the app says
 *  (its build, its computer's name), the system being the browser's to tell. */
export type NativeHost = Omit<Host, "identity" | "presence" | "reach" | "voice"> & {
  identity: Omit<HostIdentity, "os">;
  presence: Pick<HostPresence, "media">;
  /** The voice and the models the app runs for the page; null where the page runs them. */
  voice: AppVoice | null;
};

export function nativeHost(): NativeHost {
  const app = injected();
  const data = app?.data as Record<string, unknown> | undefined;
  const pairings = data?.pairings as PairingsStore | undefined;
  const storage: HostStorage | null = pairings && typeof pairings.read === "function" && typeof pairings.write === "function" ? { pairings } : null;
  const debug = app?.debug as Partial<HostDebugBridge> | undefined;
  const microphone = app?.microphone as Partial<MicrophoneBridge> | undefined;
  const updater = app?.updater as AppUpdater | undefined;
  return {
    identity: {
      build: build(app),
      deviceName() {
        const name = app?.computerName;
        return typeof name === "string" && name.trim() ? name.trim() : null;
      },
    },
    microphone: microphone && typeof microphone === "object" ? microphone : null,
    voice: app?.voice ? { voice: app.voice as AppVoice["voice"], engine: app.engine as AppVoice["engine"] } : null,
    presence: { media: app?.mediaKeys === "native" ? "app" : "page" },
    storage,
    localHost: member<LocalHostBridge>(app, "localHost", ["state", "subscribe", "pairing"]),
    reset: storage ? member<ResetBridge>(app, "data", ["deleteAll", "resetReport"]) : null,
    muteShortcut: member<MuteShortcutBridge>(app, "muteShortcut", ["get", "set"]),
    callControls: member<CallControlsBridge>(app, "callControls", ["settings", "setAlwaysShown"]),
    updater: updater && typeof updater.status === "function" ? updater : null,
    debug: debug && Array.isArray(debug.available) && typeof debug.set === "function" ? debug as HostDebugBridge : null,
  };
}

/** The seam of the app's call controls card, in the card's own window: its contract is the card's (call-controls/host.ts),
 *  not the room's `callControls` member, which carries the same name there. */
export function nativeCardSeam(): unknown {
  return injected()?.callControls ?? null;
}
