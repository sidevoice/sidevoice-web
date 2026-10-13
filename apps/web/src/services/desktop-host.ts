import type { Pairing } from "./device-pairing.js";

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
  rv?: Pairing["rv"];
  host?: string | null;
  node?: { fingerprint?: string; public_key?: string; host?: string | null };
  local?: true;
}

export interface LocalPairingCode {
  code: string;
  expires_in: number;
  reach: "room" | "direct" | "local-only";
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
  pairRoom?(url: string, code: string): Promise<unknown>;
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
/** Whether the desktop app's call controls (the floating card) show always, or only while the app is minimised. */
export interface CallControlsBridge {
  settings(): Promise<{ alwaysShown: boolean }>;
  setAlwaysShown(enabled: boolean): Promise<{ alwaysShown: boolean }>;
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
    urls: candidate.urls.filter((url): url is string => typeof url === "string"), rv: candidate.rv ?? null,
    host: candidate.host || candidate.node?.host || null, paired_at: 0, local: true,
  };
}

/** Native already proved the local identity over the peer-checked socket; the per-launch proxy is the locator. */
export function localHostLocator(pairing: Pairing | null, status: LocalHostStatus) {
  if (!pairing?.local || status.reachable !== true || typeof pairing.urls[0] !== "string" || !pairing.urls[0]) return null;
  return { base: pairing.urls[0], via: "direct" as const };
}
