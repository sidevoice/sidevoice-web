import type {
  AppBuild, AppUpdater, AppVoice, CallControlsBridge, CallSurfaceBridge, CueBridge, Host, HostDebugBridge, HostIdentity, HostPresence, HostStorage, LocalHostBridge,
  MediaDuckBridge, MessageOverlay, MicrophoneBridge, MuteShortcutBridge, PairingsStore, ReachTransport, ResetBridge, ScreenBridge, ShortcutsBridge, TextScaleBridge,
} from "./types";

/* What an app injects into its page: `window.__sidevoiceHost`, the object the desktop and mobile apps share
 * (sidevoice-desktop `docs/BRIDGE.md`). Its `host` has one optional member per thing the app offers, and a member that is
 * there is offered. A member is looked for as it is asked for, and used only when it has the functions the page calls: an
 * app before a member has none of it, and the page then shows nothing of it. The members are the app's own objects, passed
 * through as they are: a live getter stays live. `version` says which contract the app speaks; `snapshot()` and `run()` are
 * the app's presence protocol, which it reads and calls and the page does not touch.
 *
 * There is no other name: the web and the app ship together, and the one they used before (`__sidevoiceDesktop`) is not read. */
declare global {
  interface Window {
    __sidevoiceHost?: { version?: number; host?: Record<string, unknown> } & Record<string, unknown>;
  }
}

type Injected = Record<string, unknown>;

function injected(): Injected | undefined {
  return (globalThis.window as Window | undefined)?.__sidevoiceHost?.host;
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

const named = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

/** The members an app offers through the global it injects, `null` for the rest; the identity here is what the app says
 *  (its build, its computer's name, its shortcut modifier), the browser's to tell where it does not. */
export type NativeHost = Omit<Host, "exclusive" | "systemTextSize" | "identity" | "microphone" | "presence" | "reach" | "storage" | "voice"> & {
  identity: Omit<HostIdentity, "deviceName" | "shortcutModifier" | "followKeyboardLayout"> & { deviceName(): string | null; shortcutModifier: string | null };
  /** The app's permission bridge, and its help for a blocked one when it words it. */
  microphone: Partial<MicrophoneBridge> | null;
  presence: Pick<HostPresence, "media">;
  /** What the app says of its transport; null where it says nothing. */
  reach: ReachTransport | null;
  /** The app's pairings; null where it keeps none for the page. */
  storage: { pairings: PairingsStore } | null;
  /** The voice and the models the app runs for the page; null where the page runs them. */
  voice: AppVoice | null;
};

/** The app's overlay for one language, as the app gives it (it is read as every text is drawn, so it is not copied or
 *  filtered: the translator takes only the texts that are text). An app without one, a language it has none for, or one
 *  that fails, has none. */
function overlay(app: Injected | undefined, language: string): MessageOverlay {
  try {
    const found = app?.messages;
    if (typeof found !== "function") return {};
    const table: unknown = found.call(app, language);
    return table && typeof table === "object" ? table as MessageOverlay : {};
  } catch { return {}; }
}

/** The app's overlay for `language` without the rest of the host: the translator's source. */
export function messageOverlay(language: string): MessageOverlay {
  return overlay(injected(), language);
}

export function nativeHost(): NativeHost {
  const app = injected();
  const pairings = app?.pairings as PairingsStore | undefined;
  const storage: HostStorage | null = pairings && typeof pairings.read === "function" && typeof pairings.write === "function" ? { pairings } : null;
  const reach = app?.reach as Partial<ReachTransport> | undefined;
  const presence = app?.presence as { media?: unknown } | undefined;
  const debug = app?.debug as Partial<HostDebugBridge> | undefined;
  const microphone = app?.microphone as Partial<MicrophoneBridge> | undefined;
  const updater = app?.updater as AppUpdater | undefined;
  return {
    messages: (language) => overlay(app, language),
    identity: {
      build: build(app),
      deviceName: () => named(app?.deviceName),
      shortcutModifier: named(app?.shortcutModifier),
    },
    microphone: microphone && typeof microphone === "object" ? microphone : null,
    voice: app?.voice ? { voice: app.voice as AppVoice["voice"], engine: app.engine as AppVoice["engine"] } : null,
    presence: { media: presence?.media === "app" ? "app" : "page" },
    reach: typeof reach?.plainHttpPrivate === "boolean" ? { plainHttpPrivate: reach.plainHttpPrivate } : null,
    storage,
    localHost: member<LocalHostBridge>(app, "localHost", ["state", "subscribe", "pairing"]),
    reset: member<ResetBridge>(app, "reset", ["deleteAll", "resetReport"]),
    muteShortcut: member<MuteShortcutBridge>(app, "muteShortcut", ["get", "set"]),
    shortcuts: member<ShortcutsBridge>(app, "shortcuts", ["get"]),
    mediaDuck: member<MediaDuckBridge>(app, "mediaDuck", ["get", "set"]),
    textScale: member<TextScaleBridge>(app, "textScale", ["get"]),
    callControls: member<CallControlsBridge>(app, "callControls", ["settings", "setAlwaysShown"]),
    callSurface: member<CallSurfaceBridge>(app, "callSurface", ["active", "still", "forget"]),
    cue: member<CueBridge>(app, "cue", ["start", "stop"]),
    screen: member<ScreenBridge>(app, "screen", ["locked"]),
    updater: updater && typeof updater.status === "function" ? updater : null,
    debug: debug && Array.isArray(debug.available) && typeof debug.set === "function" ? debug as HostDebugBridge : null,
  };
}

/** How often, and how many times, a member an app offers late is looked for (`watchHostMember`): every quarter of a second
 *  for the first half minute of the watch. */
const LATE_MEMBER = { everyMs: 250, looks: 120 } as const;

/** Calls `arrived` once the app's host offers `name`, when it did not at first. An app may offer a member only after a reply
 *  of its own, soon after the page loads (iOS's `cue`: whether the phone has a player is asked once, as the page loads), and
 *  says nothing when it does, so the member is looked for again, a while: never in a browser (no app to offer it), never once
 *  it is there. Returns the unsubscription. */
export function watchHostMember(name: string, arrived: () => void): () => void {
  if (!(globalThis.window as Window | undefined)?.__sidevoiceHost || injected()?.[name]) return () => undefined;
  let left: number = LATE_MEMBER.looks;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const look = () => {
    if (injected()?.[name]) { arrived(); return; }
    if (--left > 0) timer = setTimeout(look, LATE_MEMBER.everyMs);
  };
  timer = setTimeout(look, LATE_MEMBER.everyMs);
  return () => clearTimeout(timer);
}

/** The seam of the app's call controls card, in the card's own window: its contract is the card's (call-controls/host.ts),
 *  not the room's `callControls` member, which carries the same name there. */
export function nativeCardSeam(): unknown {
  return injected()?.callControls ?? null;
}
