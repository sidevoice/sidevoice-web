import type { Pairing } from "./device-pairing.js";

export type LocalHostStatusName = "absent" | "installing" | "not-installed" | "stopped-by-person" | "starting" |
  "backoff" | "running" | "failed" | "service-failed" | "refused" | "incompatible";

export interface LocalHostStatus {
  state: LocalHostStatusName;
  service?: "launchd" | "systemd" | "none";
  installed?: boolean;
  core?: { pid?: number; version?: string; api?: number; launch_id?: string } | null;
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
  reconnect?(): Promise<unknown>;
  revealLog?(): Promise<unknown> | unknown;
  pairingCode?(): Promise<LocalPairingCode>;
  pairRoom?(url: string, code: string): Promise<unknown>;
  install?(onProgress?: (event: LocalHostInstallProgress) => void): LocalHostInstallOperation;
  cancel?(job: string): Promise<boolean>;
  agents?(): Promise<{ agents: unknown[]; scanned_at: string }>;
  update?(): Promise<LocalHostStatus>;
  version?(): Promise<LocalHostVersion>;
}

export function localHostBridge(): LocalHostBridge | null {
  const host = desktopHost();
  const localHost = host?.localHost as LocalHostBridge | undefined;
  return localHost && typeof localHost.state === "function" && typeof localHost.subscribe === "function" &&
    typeof localHost.pairing === "function" ? localHost : null;
}

function desktopHost() {
  return (globalThis.window as Window & { __sidevoiceDesktop?: { host?: Record<string, unknown> } } | undefined)
    ?.__sidevoiceDesktop?.host;
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
