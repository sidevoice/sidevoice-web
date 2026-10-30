import type { VoiceHost } from "@sidevoice/voice";
import type { Pairing } from "../services/device-pairing.js";
import type { ModelCatalogs } from "../services/model-catalogs.js";
import type { CardCorner } from "../state/floating-card";

/* What the page asks of whatever hosts it: the browser it runs in, or an app that wraps it. The web owns this file; every
 * host conforms to it, and no other file of the web reads a host mechanism (the global an app injects, the user agent,
 * the Media Session, the wake lock). `host()` (index.ts) is the one way in.
 *
 * Members that an app alone offers are `null` elsewhere. The rest are the browser's own unless an app offers them: until
 * the browser's side of one is written (sidevoice-desktop#289, rows 11–16), it is what the app offers, or `null`. */

/** The app's own build (sidevoice-desktop #56, `host.build`): a release — the only one with an updater (`host.updater`) —,
 *  a nightly, or a development build; its version, and where the build came from. */
export interface AppBuild {
  /** `unknown`: a channel this version does not know yet (sidevoice-core#112) — said of no channel, and updated as an app
   *  with its updater, or without one, is. */
  channel: "release" | "nightly" | "dev" | "unknown";
  version: string;
  commit?: string | null;
  date?: string | null;
}

/** The system a page runs on, for factual copy only (where the microphone's settings are, which keys a shortcut shows): never
 *  a switch for what is available. `other` where the page cannot tell. */
export type HostOS = "macos" | "windows" | "linux" | "ios" | "android" | "other";

export interface HostIdentity {
  readonly os: HostOS;
  /** The app hosting this page, or null in a browser (or an app too old to say). */
  readonly build: AppBuild | null;
  /** What the computer calls itself where the app knows it ("Mac de Ana"); null in a browser. */
  deviceName(): string | null;
}

/** The page's own microphone and Web Audio, begun in the Join gesture before models or chunks are awaited. */
export interface AudioActivation {
  context: AudioContext;
  resumed: Promise<void>;
  stream: Promise<MediaStream>;
  release(): void;
}

/** The call's voice and the models it chooses from: the app's when it runs them, else this page's own. */
export interface VoiceMember {
  /** The call's voice, `@sidevoice/voice's` seam. */
  host(): Promise<VoiceHost>;
  /** The engine's catalogues and the provider keys, the web's seam (services/model-catalogs.js). */
  catalogs(): Promise<ModelCatalogs>;
  /** Begins the microphone and Web Audio inside the Join gesture, where the page runs the voice; null where the app does. */
  activate(input: string | null): AudioActivation | null;
  /** Where the models run and the provider keys are kept. */
  readonly runs: "page" | "app";
}

/** The voice and the models an app runs for the page (`host.voice` and `host.engine`): there only when the app, not the
 *  page, runs them. */
export interface AppVoice {
  voice: VoiceHost;
  /** The app's engine: the catalogues and the provider keys, taking the web's own options (sidevoice-desktop#51). */
  engine: Partial<ModelCatalogs> | undefined;
}

/** What the lock screen or a headset asks of the call, as a state it wants and not as the platform's own buttons. */
export type RemoteCommand = { type: "set-muted"; muted: boolean } | { type: "toggle-muted" } | { type: "hang-up" };

/** The call on the lock screen and the headset: the page's Media Session and its Now Playing element where the page owns
 *  them. The host supplies the mechanism; when to show the call, and what a command does to it, are the call's. */
export interface RemoteControls {
  /** Called inside the Join gesture, before anything is awaited: iOS lets an element play only from a gesture the first time. */
  prime(): void;
  /** Shows the call, and again as the microphone opens and closes: `live` is whether it is open, which the tile reads as playing. */
  show(meta: { title: string; subtitle: string; live: boolean }): void;
  clear(): void;
  onCommand(listener: (command: RemoteCommand) => void): () => void;
}

/** Keeping the screen on: the mechanism, and whether this host has it. When to hold it is the call's. */
export interface ScreenAwake {
  /** Whether this browser can hold the screen at all. */
  readonly supported: boolean;
  /** Asks for the lock, inside the gesture that started the call when there is one. */
  acquire(): Promise<"held" | "unsupported" | "failed">;
  release(): void;
  /** The system took the lock back on its own (a screen that locked once, a route change). Returns how to stop. */
  onReleased(listener: () => void): () => void;
}

/** The lock screen and the screen's lock, three separate responsibilities. */
/** What the host's transport can do, and only that. */
export interface ReachTransport {
  /** Whether this host can send plain http to a private address at all. A page served over https cannot (mixed content). */
  readonly plainHttpPrivate: boolean;
}

export interface HostPresence {
  /** Who owns the lock screen's media: `app` when the app answers the headset and shows Now Playing itself (macOS), so the
   *  page makes no media element and registers no Media Session. */
  readonly media: "page" | "app";
  /** The page's own, where `media` is `page` and the browser has a Media Session; null where the app owns the media. */
  remote: RemoteControls | null;
  /** The page's own, null where the host decides: an app keeps its computer awake as any app does. */
  screenAwake: ScreenAwake | null;
}

/** The app's native microphone permission (sidevoice-desktop `host.microphone`, macOS: the system's own prompt and its
 *  answer; Windows offers only `openSettings`). `missing`: not denied, and the system lists no audio input device. */
export interface MicrophoneBridge {
  state(): Promise<"prompt" | "granted" | "denied" | "missing">;
  request(): Promise<"granted" | "denied" | "missing">;
  /** Where the app can open the system's microphone settings. */
  openSettings?(): Promise<void>;
  /** Tells when the system's answer changes (the person changed it in the system's settings); returns how to stop. */
  onChange?(listener: () => void): () => void;
}

/** What this device keeps of its machines: the remote pairings (never the local host's, which the app projects), and the
 *  machines it forgot without being able to tell them, to tell again (their token is still good there until then). */
export interface PairingsRecord {
  pairings: Pairing[];
  pendingRevokes?: Pairing[];
}

/** The pairings this device keeps, where the app keeps them (private remote pairings: every desktop build). A write that
 *  fails rejects, and the change it was part of does not happen. */
export interface PairingsStore {
  read(): Promise<PairingsRecord>;
  write(value: PairingsRecord & { pendingRevokes: Pairing[] }): Promise<void>;
}

export interface HostStorage {
  pairings: PairingsStore;
}

export type LocalHostStatusName = "absent" | "installing" | "not-installed" | "stopped-by-person" | "starting" |
  "backoff" | "running" | "failed" | "service-failed" | "refused" | "incompatible";

export interface LocalHostStatus {
  state: LocalHostStatusName;
  service?: "launchd" | "systemd" | "none";
  installed?: boolean;
  core?: { pid?: number; version?: string; api?: number; launch_id?: string } | null;
  /** The installed Sidevoice's version — the `sidevoice` package, which bundles the core — as the person knows it.
   *  The one version the UI shows. */
  product_version?: string | null;
  calls?: number | null;
  reachable?: boolean;
  attempts?: number | null;
  limit?: number | null;
  since?: string | null;
  window_started?: string | null;
  next_retry_at?: string | null;
  failure?: { key?: string; step?: string; message?: string; at?: string; log_tail?: string[] } | null;
}

export interface LocalHostPairing {
  fp?: string;
  public_key?: string;
  device_id: string;
  token: string;
  urls: string[];
  host?: string | null;
  node?: { fingerprint?: string; public_key?: string; host?: string | null };
  local?: true;
}

export interface LocalPairingCode {
  code: string;
  expires_in: number;
  reach: "direct" | "local-only";
}

export interface LocalHostInstallProgress {
  step: string;
  done: number | null;
  total: number | null;
  cancellable?: boolean;
}

/** Stable, machine-readable failure data. `message` is deliberately omitted from the web-facing type: UI copy
 * comes from the English message bundle and native prose may contain implementation details. */
export interface LocalHostBridgeError {
  key: string;
  step?: string;
  params?: Record<string, string | number>;
  log_tail?: string[];
}

export interface LocalHostInstallOperation extends Promise<LocalHostStatus> {
  job: string;
}

export type LocalHostUpdateState = "available" | "current" | "newer-installed" | "incompatible" | "unknown";

/** Build metadata stays opaque until desktop publishes the finalized R4-c metadata fields. */
export interface LocalHostBuildMetadata {
  [key: string]: unknown;
}

export interface LocalHostVersion {
  bridge: number;
  bundled: LocalHostBuildMetadata;
  installed: LocalHostBuildMetadata | null;
  core_api: number | null;
  update: LocalHostUpdateState;
}

export interface LocalHostBridge {
  state(): Promise<LocalHostStatus> | LocalHostStatus;
  subscribe(listener: (status: LocalHostStatus) => void): () => void;
  pairing(): Promise<LocalHostPairing | null> | LocalHostPairing | null;
  start?(): Promise<unknown>;
  stop?(): Promise<unknown>;
  restart?(): Promise<unknown>;
  serviceInstall?(): Promise<unknown>;
  serviceUninstall?(): Promise<unknown>;
  /** Whether the service starts at the next sign-in, and only that: a running service keeps running, a stopped one stays
   *  stopped. (serviceInstall/serviceUninstall also start and stop it.) */
  setStartAtLogin?(enabled: boolean): Promise<unknown>;
  reconnect?(): Promise<unknown>;
  revealLog?(): Promise<unknown> | unknown;
  pairingCode?(): Promise<LocalPairingCode>;
  install?(onProgress?: (event: LocalHostInstallProgress) => void): LocalHostInstallOperation;
  cancel?(job: string): Promise<boolean>;
  update?(): Promise<LocalHostStatus>;
  version?(): Promise<LocalHostVersion>;
}

export interface ResetOutcome {
  service: "removed" | "absent";
  agents: Record<string, { outcome?: "removed" | "foreign" | "unknown" | "failed" }>;
  failed: { step: string; key: string; agent?: string }[];
  pending: string[];
}

/** Deleting Sidevoice's data from this machine, offered only where the native app supports it (currently macOS). */
export interface ResetBridge {
  deleteAll(): Promise<ResetOutcome & { state: "needs-restart" | "partial" }>;
  resetReport(): Promise<null | { state: "complete" | "partial"; completed: string[]; failed: { step: string; key: string; agent?: string }[]; agents: Record<string, unknown> }>;
  /** Uninstall: the reset, then the app itself moved to the Trash once it quits; not relaunched (sidevoice-desktop
   *  `host.reset.uninstall`, macOS). Resolves like `deleteAll()`, with `"app"` pending; refuses `reset.app-unremovable` for
   *  a copy that cannot remove itself (a disk image), before anything is deleted. */
  uninstall?(): Promise<ResetOutcome & { state: "needs-quit" | "partial" }>;
}

/** The app's global shortcut to mute the microphone (sidevoice-desktop, after #56): the accelerator set, how it reads,
 *  whether the system took it (`refused`: another app has it), others to pick instead, and whether it clashes with
 *  VoiceOver. `set` rejects `{ key: "shortcut_invalid" }` for one the app cannot register. */
export interface MuteShortcut {
  accelerator: string | null;
  label: string | null;
  state: "on" | "off" | "refused";
  alternatives: string[];
  voiceOver: boolean;
}
export interface MuteShortcutBridge {
  get(): Promise<MuteShortcut>;
  set(accelerator: string | null): Promise<MuteShortcut>;
  subscribe?(listener: (shortcut: MuteShortcut) => void): () => void;
}

/** The app's floating card, as the app keeps it: whether it shows always or only while the app is minimised; and
 *  (where the app offers them) the corner a card first appears in, whether the person has moved or resized it
 *  (`moved`), forgetting that, and showing the card a moment after a change in Settings. Its format and starting size
 *  are this device's (state/floating-card.ts). */
export interface CallControlsBridge {
  settings(): Promise<{ alwaysShown: boolean; corner?: CardCorner; moved?: boolean; enabled?: boolean }>;
  /** Whether the card shows at all during a call (on by default); an app before it has neither this nor `enabled`. */
  setEnabled?(enabled: boolean): Promise<{ enabled: boolean }>;
  setAlwaysShown(enabled: boolean): Promise<{ alwaysShown: boolean }>;
  setCorner?(corner: CardCorner): Promise<{ corner: CardCorner }>;
  resetPlace?(): Promise<void>;
  /** Drops only a remembered custom picture-in-picture size (all displays), keeping the places: a starting size was picked. */
  clearSize?(): Promise<void>;
  preview?(): void;
  /** Leaving Settings: a preview showing goes at once. */
  endPreview?(): void;
  /** Whether the room shows the call's stage, and where in the viewport (sidevoice-desktop#165): the card shows while it
   *  is out of view, Settings included. An app before it has none, and decides from its window alone. */
  setStageVisible?(visible: boolean, rect?: { x: number; y: number; width: number; height: number }): void;
}

export type UpdateMode = "automatic" | "manual";
export type UpdaterFailure = "update-check-failed" | "update-download-failed" | "update-install-failed" | "update-cancel-failed";
export interface UpdaterStatus {
  state: "idle" | "available" | "downloading" | "ready";
  version?: string;
  /** While downloading: 0 to 1. */
  progress?: number;
  error?: { code: UpdaterFailure };
}
/** The app's updater (sidevoice-desktop #56: a release's, and for now a nightly's; a development build or an older app
 *  has none, and then nothing of it shows: whatever its channel, it is the updater that says). Each method is looked for
 *  before it is used. Automatic downloads an update by itself; manual says one exists and `download` fetches it.
 *  `cancel` stops a download in progress (sidevoice-desktop #91): the partial is removed and the status is `available`
 *  again, the update still known. `restart` installs a ready one at once. */
export interface AppUpdater {
  settings?(): Promise<{ mode: UpdateMode }>;
  setMode?(mode: UpdateMode): Promise<{ mode: UpdateMode }>;
  status(): Promise<UpdaterStatus>;
  subscribe?(listener: (status: UpdaterStatus) => void): () => void;
  check?(): Promise<UpdaterStatus>;
  download?(): Promise<UpdaterStatus>;
  cancel(): Promise<void>;
  restart?(): Promise<void>;
}

/** What the app's debugging seam can switch: Safari's Web Inspector on its web views, WebKit's compositing borders (each
 *  layer the GPU draws) and its repaint counters (how often the CPU repainted each layer). */
export type DebugSwitch = "inspectable" | "compositingBorders" | "repaintCounters";
/** The app's debugging seam (`host.debug`, sidevoice-desktop #168), present only in a nightly or a development build.
 *  `available` is the switches this platform has (all three on macOS, none elsewhere): the page shows only those. Each
 *  switch is a live getter, so it is read when it is needed, and again once `set` resolves, for what took. A rejection
 *  means the app did not change it. */
export interface HostDebugBridge {
  readonly available: readonly DebugSwitch[];
  readonly inspectable: boolean;
  readonly compositingBorders: boolean;
  readonly repaintCounters: boolean;
  set(name: DebugSwitch, on: boolean): Promise<void>;
}

export interface Host {
  identity: HostIdentity;
  /** What the app offers under `microphone`, as it says it: the permission bridge, or only the settings link. */
  microphone: Partial<MicrophoneBridge> | null;
  voice: VoiceMember;
  presence: HostPresence;
  storage: HostStorage | null;
  reach: ReachTransport;
  localHost: LocalHostBridge | null;
  reset: ResetBridge | null;
  muteShortcut: MuteShortcutBridge | null;
  callControls: CallControlsBridge | null;
  updater: AppUpdater | null;
  debug: HostDebugBridge | null;
}
