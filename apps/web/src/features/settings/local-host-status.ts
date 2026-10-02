import type { LocalHostBridge, LocalHostBridgeError, LocalHostStatus, LocalHostStatusName } from "../../services/desktop-host";
import { localHostBridge } from "../../services/desktop-host";
import type { HostMessageKey } from "./messages/en";

export type HostTranslate = (key: HostMessageKey, params?: Record<string, string | number>) => string;

const CAUSES = new Set([
  "import.missing-module", "bind.port-in-use", "identity.unreadable", "identity.unsafe-directory", "start.failed",
  "executable-missing", "permission-denied", "start-limit", "not-loaded",
]);
const HOST_STATES = new Set<LocalHostStatusName>([
  "absent", "installing", "not-installed", "stopped-by-person", "starting", "backoff", "running", "failed",
  "service-failed", "refused", "incompatible",
]);
const SERVICES = new Set(["launchd", "systemd", "none"]);
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const MAX_STATUS_COUNT = 1_000_000_000;

export interface SafeLocalHostStatusDetails {
  state: LocalHostStatusName | "unknown";
  service?: "launchd" | "systemd" | "none";
  installed?: boolean;
  core?: { pid?: number; version?: string; api?: number };
  calls?: number;
  reachable?: boolean;
  attempts?: number;
  limit?: number;
  since?: string;
  window_started?: string;
  next_retry_at?: string;
  failure?: { key?: string; at?: string };
}

export function safeLocalHostCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_STATUS_COUNT
    ? value : undefined;
}

function safeTimestamp(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const milliseconds = typeof value === "number" ? value < 1e12 ? value * 1000 : value : Date.parse(value);
  if (!Number.isFinite(milliseconds)) return undefined;
  const date = new Date(milliseconds);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

/** Copy only stable, bounded host facts. Native messages and logs can contain credentials or pairing codes. */
export function safeLocalHostStatusDetails(status: LocalHostStatus): SafeLocalHostStatusDetails {
  const source = status as unknown as Record<string, unknown>;
  const details: SafeLocalHostStatusDetails = {
    state: HOST_STATES.has(source.state as LocalHostStatusName) ? source.state as LocalHostStatusName : "unknown",
  };
  if (SERVICES.has(source.service as string)) details.service = source.service as SafeLocalHostStatusDetails["service"];
  if (typeof source.installed === "boolean") details.installed = source.installed;
  if (typeof source.reachable === "boolean") details.reachable = source.reachable;
  for (const field of ["calls", "attempts", "limit"] as const) {
    const count = safeLocalHostCount(source[field]);
    if (count !== undefined) details[field] = count;
  }
  for (const field of ["since", "window_started", "next_retry_at"] as const) {
    const timestamp = safeTimestamp(source[field]);
    if (timestamp) details[field] = timestamp;
  }
  if (source.core && typeof source.core === "object" && !Array.isArray(source.core)) {
    const core = source.core as Record<string, unknown>;
    const safeCore: NonNullable<SafeLocalHostStatusDetails["core"]> = {};
    const pid = safeLocalHostCount(core.pid);
    const api = safeLocalHostCount(core.api);
    if (pid !== undefined) safeCore.pid = pid;
    if (api !== undefined) safeCore.api = api;
    if (typeof core.version === "string" && VERSION.test(core.version)) safeCore.version = core.version;
    if (Object.keys(safeCore).length) details.core = safeCore;
  }
  if (source.failure && typeof source.failure === "object" && !Array.isArray(source.failure)) {
    const failure = source.failure as Record<string, unknown>;
    const safeFailure: NonNullable<SafeLocalHostStatusDetails["failure"]> = {};
    if (typeof failure.key === "string" && CAUSES.has(failure.key)) safeFailure.key = failure.key;
    const at = safeTimestamp(failure.at);
    if (at) safeFailure.at = at;
    if (Object.keys(safeFailure).length) details.failure = safeFailure;
  }
  return details;
}
const INSTALL_CAUSES: Record<string, HostMessageKey> = {
  "install.network": "localInstall.error.network",
  "install.proxy": "localInstall.error.proxy",
  "install.disk": "localInstall.error.disk",
  "install.checksum": "localInstall.error.checksum",
  "install.no-bundle": "localInstall.error.noBundle",
  "install.authenticity": "localInstall.error.authenticity",
  "install.self-test": "localInstall.error.selfTest",
  "install.rollback": "localInstall.error.rollback",
  "install.rollback-failed": "localInstall.error.rollbackFailed",
  "cli.timeout": "localInstall.error.timeout",
  "install.executable-missing": "localInstall.error.executableMissing",
  "unsupported": "localInstall.error.unsupported",
  "install.unsafe": "localInstall.error.unsafe",
  "service.failed": "localInstall.error.service",
  "service.start.failed": "localInstall.error.service",
  "launch.failed": "localInstall.error.launch",
};
const INSTALL_CHECKS: Record<string, HostMessageKey> = {
  sha256: "localInstall.check.sha256",
  sigstore: "localInstall.check.sigstore",
  "sigstore-bundle": "localInstall.check.sigstoreBundle",
  issuer: "localInstall.check.issuer",
  workflow: "localInstall.check.workflow",
  source: "localInstall.check.source",
  "repository-id": "localInstall.check.repositoryId",
  runner: "localInstall.check.runner",
  "build-config": "localInstall.check.buildConfig",
  predicate: "localInstall.check.predicate",
  subject: "localInstall.check.subject",
  manifest: "localInstall.check.manifest",
  "developer-override": "localInstall.check.developerOverride",
  platform: "localInstall.check.platform",
  download: "localInstall.check.download",
  "download-size": "localInstall.check.downloadSize",
  "archive-path": "localInstall.check.archivePath",
  "archive-link": "localInstall.check.archiveLink",
  "archive-size": "localInstall.check.archiveSize",
  "archive-type": "localInstall.check.archiveType",
};

export function localHostBridgeErrorText(error: LocalHostBridgeError, t: HostTranslate) {
  const key = INSTALL_CAUSES[error.key] ?? "localInstall.error.unknown";
  const checkKey = typeof error.params?.check === "string" ? INSTALL_CHECKS[error.params.check] : undefined;
  const check = checkKey ? t(checkKey) : t("localInstall.error.verificationCheck");
  return t(key, { check });
}

export function hostCause(status: LocalHostStatus, t: HostTranslate) {
  const key = status.failure?.key || "unknown";
  const messageKey = `hosts.cause.${key}` as HostMessageKey;
  return t(CAUSES.has(key) ? messageKey : "hosts.cause.unknown");
}

export function hostStatusText(status: LocalHostStatus, t: HostTranslate) {
  switch (status.state) {
    case "running": return t("hosts.status.running");
    case "not-installed": return t("hosts.status.not-installed");
    case "stopped-by-person": return t("hosts.status.stopped-by-person");
    case "starting": return t("hosts.status.starting");
    case "backoff": {
      const attempts = safeLocalHostCount(status.attempts) ?? "?";
      const limit = safeLocalHostCount(status.limit);
      return t("hosts.status.backoff", { attempts, limit: limit ? ` of ${limit}` : "" });
    }
    case "failed": return t("hosts.status.failed", { cause: hostCause(status, t) });
    case "service-failed": return t("hosts.status.service-failed", { cause: hostCause(status, t) });
    case "refused": return t("hosts.status.refused");
    case "incompatible": return t("hosts.status.incompatible");
    case "installing": return t("hosts.status.starting");
    default: return t("hosts.status.absent");
  }
}

const methodFor = {
  start: "start", stop: "stop", restart: "restart", serviceInstall: "serviceInstall",
  serviceUninstall: "serviceUninstall", reconnect: "reconnect", revealLog: "revealLog",
} as const;
export type LocalHostAction = keyof typeof methodFor;

export function canRunLocalHostAction(action: LocalHostAction, bridge = localHostBridge()): bridge is LocalHostBridge {
  return !!bridge && typeof bridge[methodFor[action]] === "function";
}

export async function runLocalHostAction(action: LocalHostAction, bridge = localHostBridge()) {
  if (!bridge) return false;
  const method = bridge[methodFor[action]];
  if (typeof method !== "function") return false;
  await method.call(bridge);
  return true;
}
