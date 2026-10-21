import type { Pairing } from "./device-pairing.js";
import type { CardCorner } from "../state/floating-card";

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

export function localHostBridge(): LocalHostBridge | null {
  const host = desktopHost();
  const localHost = host?.localHost as LocalHostBridge | undefined;
  return localHost && typeof localHost.state === "function" && typeof localHost.subscribe === "function" &&
    typeof localHost.pairing === "function" ? localHost : null;
}

export function desktopHost() {
  return (globalThis.window as Window & { __sidevoiceDesktop?: { host?: Record<string, unknown> } } | undefined)
    ?.__sidevoiceDesktop?.host;
}

/** Private remote pairings are available in every desktop build. */
export interface DesktopDataBridge {
  pairings: {
    read(): Promise<{ pairings: Pairing[]; pendingRevokes?: Pairing[] }>;
    write(value: { pairings: Pairing[]; pendingRevokes: Pairing[] }): Promise<void>;
  };
}

/** Machine reset is offered only where the native app supports it (currently macOS). */
export interface DesktopResetBridge extends DesktopDataBridge {
  deleteAll(): Promise<{
    state: "needs-restart" | "partial";
    service: "removed" | "absent";
    agents: Record<string, { outcome?: "removed" | "foreign" | "unknown" | "failed" }>;
    failed: { step: string; key: string; agent?: string }[];
    pending: string[];
  }>;
  resetReport(): Promise<null | { state: "complete" | "partial"; completed: string[]; failed: { step: string; key: string; agent?: string }[]; agents: Record<string, unknown> }>;
}

export function desktopDataBridge(): DesktopDataBridge | null {
  const data = desktopHost()?.data as Partial<DesktopDataBridge> | undefined;
  return data && typeof data.pairings?.read === "function" && typeof data.pairings?.write === "function"
    ? data as DesktopDataBridge : null;
}

export function desktopResetBridge(): DesktopResetBridge | null {
  const data = desktopDataBridge() as DesktopResetBridge | null;
  return data && typeof data.deleteAll === "function" && typeof data.resetReport === "function" ? data : null;
}

/** Uninstall: the reset, then the app itself moved to the Trash once it quits; not relaunched (sidevoice-desktop
 *  `host.data.uninstall`, macOS). Resolves like `deleteAll()`, with `"app"` pending; refuses `reset.app-unremovable` for
 *  a copy that cannot remove itself (a disk image), before anything is deleted. */
export interface DesktopUninstallBridge extends DesktopResetBridge {
  uninstall(): Promise<Omit<Awaited<ReturnType<DesktopResetBridge["deleteAll"]>>, "state"> & { state: "needs-quit" | "partial" }>;
}

export function desktopUninstallBridge(): DesktopUninstallBridge | null {
  const data = desktopResetBridge() as DesktopUninstallBridge | null;
  return data && typeof data.uninstall === "function" ? data : null;
}

/** The desktop app's own build (sidevoice-desktop #56, `host.build`): a release — the only one with an updater
 *  (`host.updater`) —, a nightly, or a development build; its version, and where the build came from. */
export interface DesktopBuild {
  /** `unknown`: a channel this version does not know yet (sidevoice-core#112) — said of no channel, and updated as an app
   *  with its updater, or without one, is. */
  channel: "release" | "nightly" | "dev" | "unknown";
  version: string;
  commit?: string | null;
  date?: string | null;
}
/** The desktop app's global shortcut to mute the microphone (sidevoice-desktop, after #56): the accelerator set, how it
 *  reads, whether the system took it (`refused`: another app has it), others to pick instead, and whether it clashes
 *  with VoiceOver. `set` rejects `{ key: "shortcut_invalid" }` for one the app cannot register. */
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
/** The desktop app's floating card, as the app keeps it: whether it shows always or only while the app is minimised; and
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
}
/** The app's mute shortcut and call controls settings, where it offers them (an app before them has neither). */
export function muteShortcutBridge(): MuteShortcutBridge | null {
  const bridge = desktopHost()?.muteShortcut as Partial<MuteShortcutBridge> | undefined;
  return bridge && typeof bridge.get === "function" && typeof bridge.set === "function" ? bridge as MuteShortcutBridge : null;
}
export function callControlsBridge(): CallControlsBridge | null {
  const bridge = desktopHost()?.callControls as Partial<CallControlsBridge> | undefined;
  return bridge && typeof bridge.settings === "function" && typeof bridge.setAlwaysShown === "function" ? bridge as CallControlsBridge : null;
}

/** Where nightly builds are published, to update one by hand. */
export const DESKTOP_NIGHTLY_URL = "https://github.com/sidevoice/sidevoice-desktop/releases/tag/nightly";

/** This page's desktop app build, or null outside the app (or an app too old to say). A channel this version does not
 *  know yet is `unknown`, not no build: the app is still there, with its version. */
export function desktopBuild(): DesktopBuild | null {
  const build = desktopHost()?.build as Record<string, unknown> | undefined;
  if (!build || typeof build !== "object") return null;
  const channel = build.channel === "release" || build.channel === "nightly" || build.channel === "dev" ? build.channel : "unknown";
  const text = (value: unknown) => typeof value === "string" ? value : null;
  return { channel, version: text(build.version) ?? "", commit: text(build.commit), date: text(build.date) };
}

/** What the desktop app's debugging seam can switch: Safari's Web Inspector on its web views, WebKit's compositing
 *  borders (each layer the GPU draws) and its repaint counters (how often the CPU repainted each layer). */
export type DebugSwitch = "inspectable" | "compositingBorders" | "repaintCounters";
/** The desktop app's debugging seam (`host.debug`, sidevoice-desktop #168), present only in a nightly or a development
 *  build. `available` is the switches this platform has (all three on macOS, none elsewhere): the page shows only
 *  those. Each switch is a live getter, so it is read when it is needed, and again once `set` resolves, for what took.
 *  A rejection means the app did not change it. */
export interface DesktopDebugBridge {
  readonly available: readonly DebugSwitch[];
  readonly inspectable: boolean;
  readonly compositingBorders: boolean;
  readonly repaintCounters: boolean;
  set(name: DebugSwitch, on: boolean): Promise<void>;
}
export function desktopDebugBridge(): DesktopDebugBridge | null {
  const debug = desktopHost()?.debug as Partial<DesktopDebugBridge> | undefined;
  return debug && Array.isArray(debug.available) && typeof debug.set === "function" ? debug as DesktopDebugBridge : null;
}

export function desktopComputerName() {
  const name = desktopHost()?.computerName;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/** The desktop app has already verified this host over its Unix socket. Its URL points at the per-launch proxy. */
export function normalizeLocalHostPairing(value: unknown): Pairing | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as LocalHostPairing;
  const fp = candidate.fp || candidate.node?.fingerprint;
  const publicKey = candidate.public_key || candidate.node?.public_key;
  if (typeof fp !== "string" || !fp || typeof publicKey !== "string" || !publicKey ||
      typeof candidate.device_id !== "string" || !candidate.device_id || typeof candidate.token !== "string" || !candidate.token ||
      !Array.isArray(candidate.urls) || typeof candidate.urls[0] !== "string" || !candidate.urls[0]) return null;
  return {
    fp, public_key: publicKey, device_id: candidate.device_id, token: candidate.token,
    urls: candidate.urls.filter((url): url is string => typeof url === "string"),
    host: candidate.host || candidate.node?.host || null, paired_at: 0, local: true,
  };
}

/** Native already proved the local identity over the peer-checked socket; the per-launch proxy is the locator. */
export function localHostLocator(pairing: Pairing | null, status: LocalHostStatus) {
  if (!pairing?.local || status.reachable !== true || typeof pairing.urls[0] !== "string" || !pairing.urls[0]) return null;
  return { base: pairing.urls[0], via: "direct" as const };
}
