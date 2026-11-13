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
  /** false: this host has no keys of the page's own to offer (a phone). Absent: it has, as ever. */
  inApp?: boolean;
}

/* The page never asks which system it runs on (sidevoice-desktop#289, D-HOST-OS). What a system decides about the page's
 * words is answered by the host already resolved, so a new platform touches its own app and never the web: the microphone's
 * help (`HostMicrophone.help`), the shortcut modifier's label and the device's default name (`HostIdentity`). */

export interface HostIdentity {
  /** The app hosting this page, or null in a browser (or an app too old to say). */
  readonly build: AppBuild | null;
  /** This device's default name, whole: what the computer calls itself where the app knows it ("Mac de Ana"); else what
   *  the browser is ("Chrome on Mac", in the page's language); else "Sidevoice". The person's own choice is the page's. */
  deviceName(): string;
  /** The label of the modifier a shortcut is written with on this host: `⌘` or `Ctrl`. */
  readonly shortcutModifier: string;
  /** Hands `onMap` what the keyboard layout types on each physical key (`BracketRight` → `+` on a Spanish layout) now and when
   *  the layout changes, where the browser says (Chromium); nothing elsewhere. Answers how to stop. */
  followKeyboardLayout(onMap: (map: { get(code: string): string | undefined }) => void): () => void;
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
  /** Asks for the lock, inside the gesture that started the call when there is one. A request granted after a `release()`
   *  lets its own lock go and answers `held` all the same: the one that released has moved on and does not use it. */
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
  /** The page's own. Null would be a host that decides for itself; none says so yet. */
  screenAwake: ScreenAwake | null;
}

/** What a person is told when the microphone is blocked, as this host words it: for where the page runs (a browser's site
 *  permission, a system's privacy settings), in the language it was asked for. The page shows it as it is. */
export interface MicrophoneHelp {
  /** How to allow it, one line or two: the first is the answer, the other comes beneath it. */
  readonly steps: readonly string[];
  /** The label of the button that opens the system's microphone settings, where the host has `openSettings`. */
  readonly openSettings?: string;
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
  /** How to allow a blocked microphone on this system, in `language` (a tag: `es`, `pt-BR`), or in English where the app has
   *  no words in it. Read as the page draws, so it answers at once. */
  help?(language: string): MicrophoneHelp;
}

/** The host's microphone: what the app offers of the permission, and always the help for a blocked one (the browser's own
 *  where the app has none). */
export interface HostMicrophone extends Partial<MicrophoneBridge> {
  help(language: string): MicrophoneHelp;
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

/** The pairings kept in this page's own storage, which only a browser's is. It reads at once, so the page starts with the
 *  machines it has and not an empty list; it writes as well as it can, and a store that refuses still pairs for this
 *  visit (the caller tells the person); and the machines that could not be told are read live, as another tab left them. */
export interface PagePairings {
  readState(): { list: Pairing[] };
  /** False when the browser kept nothing; the pairing still happens. */
  write(book: { list: Pairing[] }): boolean;
  readRevokes(): Pairing[];
  writeRevokes(list: Pairing[]): void;
}

export interface HostStorage {
  pairings: PairingsStore;
  /** Present where the host keeps the pairings in this page's own storage: the browser's. The app's are `pairings` alone,
   *  read and written asynchronously, and a write it refuses fails the change. */
  page?: PagePairings;
}

export type LocalHostStatusName = "absent" | "installing" | "not-installed" | "stopped-by-person" | "starting" |
  "backoff" | "running" | "failed" | "service-failed" | "refused" | "incompatible";

export interface LocalHostStatus {
  state: LocalHostStatusName;
  service?: "launchd" | "systemd" | "none";
  installed?: boolean;
  /** `port`: the service's own TCP port, from its core's ready file — never the app's proxy's, which is another each launch. */
  core?: { pid?: number; version?: string; api?: number; launch_id?: string; port?: number } | null;
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

/** Where this device's service stands against the minor the app pins (`public/service.pin.json`): `available` an older
 *  patch or minor, which the app updates in the background; `updating` while it does (`progress`); `waiting-call` held
 *  until the call ends; `newer-installed` a minor above the pinned one, which the app never touches. */
export type LocalHostUpdateState = "current" | "available" | "updating" | "waiting-call" | "newer-installed" | "incompatible" | "unknown";

/** What `version()` says (sidevoice-desktop#67): `bundled.minor` the minor this page's build pins (none, `{}`, where the
 *  bundled web has no `service.pin.json`); `installed.version` the installed service's `product_version`, none where
 *  nothing is installed; `latest` the newest npm patch of the pinned minor, where known; `progress` 0 to 1 while
 *  `update` is `updating`. A bridge may leave `latest` and `progress` out: nothing is said of them. */
export interface LocalHostVersion {
  bridge: number;
  bundled: { minor?: string };
  installed: { version: string } | null;
  core_api: number | null;
  update: LocalHostUpdateState;
  latest?: string | null;
  progress?: number | null;
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
 *  VoiceOver. `set` rejects `{ key: "shortcut_invalid" }` for one the app cannot read, and `{ key: "shortcut_unsupported" }` for a key
 *  this system cannot register as itself (the ISO `<>` key; the keypad's `=` and Enter on Windows and Linux). */
export interface MuteShortcut {
  accelerator: string | null;
  label: string | null;
  /** `refused`: another app has it; `needsPermission`: it waits for a permission the system has not given (a single key
   *  on macOS: Input Monitoring); `unavailable`: this system cannot take it. */
  state: "on" | "off" | "refused" | "needsPermission" | "unavailable";
  alternatives: string[];
  voiceOver: boolean;
}
export interface MuteShortcutBridge {
  get(): Promise<MuteShortcut>;
  set(accelerator: string | null): Promise<MuteShortcut>;
  subscribe?(listener: (shortcut: MuteShortcut) => void): () => void;
}

/** A global shortcut of the new `host.shortcuts` (desktop#447, GLOBAL_SHORTCUTS.md §7): today's mute shortcut, plus whether
 *  the system itself owns it (`managedBySystem`: a Wayland portal) and what it clashes with, by name. A single key is an
 *  accelerator too, with the trigger as a suffix: `"Fn:hold"`, `"RightAlt:tap"`, `"F13:double"`; the key is one of `Fn`,
 *  `RightAlt`, `RightCommand`, `RightControl`, `F13`..., the trigger `:hold`, `:tap` or `:double`. */
export interface GlobalShortcut extends MuteShortcut {
  managedBySystem?: boolean;
  conflictWith?: string;
  /** Linux (X11): the key registers by the character the layout types on it, not by its position, so under a non-US layout it
   *  may be another key, or none. A warning, not a refusal. */
  layoutBound?: boolean;
  /** Never chosen (or restored): it follows this system's default. Absent on an older host. */
  isDefault?: boolean;
  /** This system's default accelerator for the action; null: it has none. Absent on an older host. */
  default?: string | null;
  /** `state: "refused"`: another Sidevoice action holds the keys, or the system or another app does. Absent on an older host. */
  refusal?: { reason: "duplicate"; action: ShortcutAction } | { reason: "taken" } | null;
}
/** Why a key pressed while recording was not taken: a left-hand modifier alone (macOS), or a modifier or Fn alone (Windows, Linux). */
export type RecordHint = "leftModifier" | "loneModifier";
export type ShortcutAction = "mute" | "holdToTalk" | "oneTurn";
export type HeadsetPress = "mute" | "oneTurn" | "skip" | "none";
export interface HeadsetStatus {
  press: HeadsetPress;
  /** null: this headset cannot send a double press. */
  doublePress: HeadsetPress | null;
  outsideCall: "leave" | "join";
  /** The system's call holds the headset (CallKit, Telecom): the system mutes, and the choices are not the app's to make; the page
   *  shows the rows read-only. Absent: they are. */
  managedBySystem?: boolean;
  /** Choosing anything but the defaults adds a playback card to the lock screen (iOS, beside the Live Activity); the page says so.
   *  Reported by older iOS builds only. */
  nonDefaultAddsCard?: boolean;
  /** What each press can do on this host: the page offers only these, and a press with one action is a line, not a choice (an
   *  iPhone: the system's mute alone). Absent, or a press absent from it: every action, as an older host reports. Whether the double
   *  press reaches the app at all is `doublePress` (`null`: no row). */
  actions?: { press?: HeadsetPress[]; doublePress?: HeadsetPress[] };
}
export interface ShortcutsStatus {
  /** The global shortcuts this host offers, by action. An action it does not offer is absent, and none at all (`{}`) is no group:
   *  a phone, whose only shortcuts are the headset's presses. */
  shortcuts: Partial<Record<ShortcutAction, GlobalShortcut>>;
  /** What the system must allow for single keys (`inputMonitoring`, macOS) or for the shortcuts at all (`portal`, Linux). */
  permission: { kind: "inputMonitoring" | "portal"; state: "granted" | "notAsked" | "denied" } | null;
  /** null: no headset path on this host. */
  headset: HeadsetStatus | null;
  /** false: this host has no keys of the page's own to offer (a phone). Absent: it has, as ever. */
  inApp?: boolean;
}
export interface ShortcutsBridge {
  get(): Promise<ShortcutsStatus>;
  /** Rejects `{ key: "shortcut_invalid" }` for an accelerator the app cannot register. */
  set?(action: ShortcutAction, accelerator: string | null): Promise<GlobalShortcut>;
  /** Back to this system's default, as if never chosen. Absent on an older host. */
  restore?(action: ShortcutAction): Promise<GlobalShortcut>;
  subscribe?(listener: (status: ShortcutsStatus) => void): () => void;
  /** Asks the system for the permission, only now. */
  request?(permission: "inputMonitoring" | "portal"): Promise<ShortcutsStatus>;
  setHeadset?(partial: Partial<HeadsetStatus>): Promise<ShortcutsStatus>;
  /** The app captures the next key itself (Fn included, which a page cannot see): resolves with the accelerator, null on Esc;
   *  rejects `{ key: "record_timeout" }` after 15 s with no key. `onHint` says why a key was ignored while it goes on. */
  record?(action: ShortcutAction, onHint?: (hint: RecordHint) => void): Promise<string | null>;
}

/** What the app does to other apps' media while the microphone is open or the agent is speaking in a call (sidevoice-desktop
 *  `host.mediaDuck`): the person's choice, and how far this system can carry it out. `lower`: `per-app` (any app, one by
 *  one), `some-apps` (only named apps: Music and Spotify on a Mac without System Audio Recording) or `none`; `pause`:
 *  `media-controls`, `some-apps` or `none`. The app restores only what it took. */
export type MediaDuckMode = "lower" | "pause" | "off";
/** How far Lower goes: `half` (50 % of the app's volume), `quarter` (25 %, the default) or `mute` (silent). */
export type MediaDuckLevel = "half" | "quarter" | "mute";
/** The permissions the status reports, as the page asks for one: `capture` (macOS System Audio Recording, lowering any
 *  app) and `automation` (macOS Automation, controlling Music and Spotify). */
export type MediaDuckPermission = "capture" | "automation";
/** `restart` (System Audio Recording only): allowed, but the running app cannot see it until it is restarted. */
export type MediaDuckAccess = "granted" | "denied" | "undetermined" | "unknown" | "restart";
export interface MediaDuckStatus {
  mode: MediaDuckMode;
  /** How far Lower goes; absent from an app that has no level to choose. */
  level?: MediaDuckLevel;
  lower: "per-app" | "some-apps" | "none";
  pause: "media-controls" | "some-apps" | "none";
  /** Whether the system lets the app control the named apps it lowers or pauses (macOS Automation of Music and Spotify);
   *  absent where nothing has to be allowed for that. `denied` is the person's no; `unknown`: the system answers only with
   *  one of the apps open, and none is. */
  access?: MediaDuckAccess;
  /** Whether the system lets the app lower any app on its own (macOS 14.4 and later: System Audio Recording); absent where
   *  there is no such permission. `unknown`: the app could not ask. `restart`: allowed, applied by `restart()`. */
  capture?: MediaDuckAccess;
}
/** The phone's text size, as a multiple of its default (sidevoice-desktop `host.textScale`: iOS Dynamic Type, Android font
 *  scale; 1 is the default). Only an app whose WebView does not follow it by itself offers this (an Android WebView keeps
 *  `textZoom` at 100); the page clamps the value (lib/text-scale.ts). `subscribe` calls back when the person changes it. */
export interface TextScaleBridge {
  get(): number;
  subscribe?(listener: (scale: number) => void): () => void;
}

export interface MediaDuckBridge {
  get(): Promise<MediaDuckStatus>;
  /** The person's own request, from the list of permissions, to let the app do what `permission` names: the system may
   *  ask now. Never called by the page on its own. */
  allow?(permission: MediaDuckPermission): Promise<MediaDuckStatus>;
  /** The system's page where the person turns `permission` back on (macOS). */
  openSettings?(permission: MediaDuckPermission): Promise<MediaDuckStatus>;
  /** Quits and reopens the app so an allowed permission applies (`capture` is `restart`). Rejects with the key
   *  `media_duck.restart-in-call` while a call is joined, `media_duck.restart-not-needed` when none is due. Absent from
   *  an app that cannot: the page then only says to restart. */
  restart?(): Promise<MediaDuckStatus>;
  set(mode: MediaDuckMode): Promise<MediaDuckStatus>;
  /** How far Lower goes; applied at once while lowered. Absent from an app that has no level to choose. */
  setLevel?(level: MediaDuckLevel): Promise<MediaDuckStatus>;
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
 *  layer the GPU draws) and its repaint counters (how often the CPU repainted each layer) on the desktop; on a phone,
 *  whether the call is a call of the system's (CallKit, Telecom: sidevoice-desktop #393). */
export type DebugSwitch = "inspectable" | "compositingBorders" | "repaintCounters" | "systemCall";
/** What the app's debugging seam can choose among values (`choose`): on an iPhone, the audio session's mode for the call
 *  audio mode test (sidevoice-desktop, docs/MOBILE.md → "The call audio mode test"). */
export type DebugChoice = "callAudio";
/** The audio session's modes `callAudio` chooses among: voice chat (the default), video chat, default, and default outside
 *  the room's call with voice chat in it. */
export type CallAudioMode = "voiceChat" | "videoChat" | "default" | "voiceChatInCalls";
/** The app's debugging seam (`host.debug`, sidevoice-desktop #168), present only in a nightly or a development build.
 *  `available` is the switches this platform has (all three on macOS, none elsewhere): the page shows only those. Each
 *  switch is a live getter, so it is read when it is needed, and again once `set` resolves, for what took. A rejection
 *  means the app did not change it. */
export interface HostDebugBridge {
  readonly available: readonly (DebugSwitch | DebugChoice)[];
  /** Each switch is read only when `available` lists it: the desktop has the first three, a phone `systemCall`. */
  readonly inspectable?: boolean;
  readonly compositingBorders?: boolean;
  readonly repaintCounters?: boolean;
  readonly systemCall?: boolean;
  /** The call audio mode chosen, read only when `available` lists `callAudio`. */
  readonly callAudio?: CallAudioMode;
  set(name: DebugSwitch, on: boolean): Promise<void>;
  /** Chooses `value` for a choice `available` lists; resolves when done, and the choice then reads what took. A rejection
   *  means the app did not change it. Absent where the app has no choice. */
  choose?(name: DebugChoice, value: string): Promise<void>;
}

/** The host's wording of the texts its place changes (a phone has no browser, a Control Center, …): web catalogue keys to the
 *  host's own text, for one language tag exactly. A host with none answers `{}`. The translator applies it over its catalogue
 *  (i18n/translator.ts); a key the catalogue no longer has is simply never read. */
export type MessageOverlay = Readonly<Record<string, string>>;
/* A value of the host's table that is not a non-empty string is not a text: the translator skips it. */

/** A creature's PNG, handed to the host once per `id` (state/call-surface.d.ts SurfaceStillRef): `png` is base64 with no
 *  prefix, `px` its width and height. */
export interface CallSurfaceStill { id: string; png: string; px: number }

/** The app's native call surface (the phone's Lock Screen card, Dynamic Island, ongoing notification): it reads the
 *  room's `callSurface` (state/call-surface.d.ts) from the store, and the page publishes what costs it work only while
 *  `active()`. The creatures' stills go by reference: the snapshot carries `{ id, k }`, and the bytes cross here, once per
 *  id and always before the snapshot that names it; the host keeps them by id until `forget`. An app without a surface
 *  offers none, and the page does none of that. */
export interface CallSurfaceBridge {
  active(): boolean;
  still(still: CallSurfaceStill): void;
  /** Ids the page no longer shows (a conversation removed, or left the faces) or every id when the surface closes. */
  forget(ids: string[]): void;
}

/** The system's own picker for where the call's audio plays (`host.audioRoute`; iOS's route sheet: speaker, car, AirPods, AirPlay).
 *  An app cannot choose an arbitrary output there, only the system can, so where the app can open that sheet it offers this and
 *  the page shows a button of its own that calls `open()`. The sheet is the system's (its look, its choice): the call's audio
 *  follows the route. Rejects with the app's refusal (`{key, code}`) when it cannot be shown. The button is labelled with where the
 *  audio plays now: `current()` is that output's name as the system gives it (`null` when it names none; never rejects) and
 *  `subscribe` is told each new name as the route changes (it says nothing on subscribing) and returns the unsubscribe.
 *  Offered after a reply of the app's own, so a page looks again for a while (`onHostMember("audioRoute", …)`). */
export interface AudioRouteBridge {
  open(): Promise<void>;
  current(): Promise<string | null>;
  subscribe(listener: (name: string | null) => void): () => void;
}

/** The app's own sound for the cues the page decides on (`host.cue`): the page says when, the app plays it through the
 *  audio session its call already owns, where a webview's Web Audio is not sure to come out (a phone's native call session,
 *  sidevoice-web#439). `thinking` is the sound that says the agent works. `start` and `stop` are idempotent. An app
 *  without it leaves the page to play the cue in its own Web Audio. */
export type CueName = "thinking";
/** Which thinking sound a start plays, how loud and how often (services/thinking-sounds.ts): `sound`, an id of the manifest
 *  the app bundles with the web; `gainDb`, the person's offset from its level; `intervalScale`, the person's frequency, a
 *  factor from 0.5 to 3 on the silence after each play (drawn in the sound's `interval`; 1: its own cadence). Without them,
 *  the default sound at its level and cadence; an app before the frequency plays the sound's own cadence. `whileLocked`:
 *  the app holds the cue and plays it only while the screen is locked, starting and stopping it itself at lock and unlock
 *  (a page may be suspended once the screen locks, and could not start it then); none, it plays at once. */
export interface CueOptions { sound?: string; gainDb?: number; intervalScale?: number; whileLocked?: boolean }
export interface CueBridge {
  /** A start while the cue plays changes nothing with the same options, and plays the new ones instead with others. */
  start(cue: CueName, options?: CueOptions): void;
  stop(cue: CueName): void;
  /** The options `start` honours, by name (`sound`, `gainDb`, `intervalScale`, `whileLocked`). An app before them has
   *  none: its start plays a sound of its own, whatever is asked, and the page plays the chosen one itself instead. The
   *  frequency is sent whether or not it is listed: an app before it plays the sound's own cadence, which the page has
   *  nothing better than. `whileLocked` is sent only to an app that lists it: one before it would play at once. */
  readonly options?: readonly string[];
}

/** What the app says of the person's screen (`host.screen`), where the system tells it: whether it is locked now. A page
 *  without it reads the screen as the browser says it (the page shown or not), except in an app that shows the call in a
 *  card of its own (`callControls`), where a hidden page is not a screen off. */
export interface ScreenBridge {
  locked(): Promise<boolean>;
}

export interface Host {
  identity: HostIdentity;
  /** The host's overlay for `language` (a tag: `es`, `zh-Hans`) exactly: nothing from its primary subtag or English, which
   *  the translator tries itself. Read as the page draws, so it answers at once. */
  messages(language: string): MessageOverlay;
  /** What the app offers under `microphone`, as it says it (the permission bridge, or only the settings link), and the help. */
  microphone: HostMicrophone;
  voice: VoiceMember;
  presence: HostPresence;
  storage: HostStorage;
  /** One tab at a time for a named piece of work across this site's tabs (the browser's Web Locks); see `exclusively`. */
  /** The size in px of the platform's body text where it follows the person's text size and the page can measure it (iOS
   *  WebKit's `-apple-system-body`: 17 at the default size); null elsewhere. lib/text-scale.ts turns it into a scale. */
  systemTextSize(): number | null;
  exclusive<T>(name: string, run: () => T | Promise<T>, options?: { ifAvailable?: boolean }): Promise<T | undefined>;
  reach: ReachTransport;
  localHost: LocalHostBridge | null;
  reset: ResetBridge | null;
  muteShortcut: MuteShortcutBridge | null;
  /** The global shortcuts and the headset's buttons (supersedes `muteShortcut`, which stays for an app without it). */
  shortcuts: ShortcutsBridge | null;
  mediaDuck: MediaDuckBridge | null;
  /** The phone's text scale, when the app reports it; null where the page reads it itself (lib/text-scale.ts) or there is none. */
  textScale: TextScaleBridge | null;
  callControls: CallControlsBridge | null;
  callSurface: CallSurfaceBridge | null;
  /** The app's own player for the page's cues; null where the page plays them itself. */
  cue: CueBridge | null;
  /** The system's output picker, opened from the page's own button; null where the host has none (a browser, Android). */
  audioRoute: AudioRouteBridge | null;
  /** Whether the person's screen is locked, from the app; null where it does not say. */
  screen: ScreenBridge | null;
  updater: AppUpdater | null;
  debug: HostDebugBridge | null;
}
