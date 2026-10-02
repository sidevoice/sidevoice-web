import type { LocalHostBridge, LocalHostBridgeError, LocalHostStatus } from "../../services/desktop-host";
import { localHostBridge } from "../../services/desktop-host";
import type { HostMessageKey } from "./messages/en";

export type HostTranslate = (key: HostMessageKey, params?: Record<string, string | number>) => string;

const CAUSES = new Set([
  "import.missing-module", "bind.port-in-use", "identity.unreadable", "identity.unsafe-directory", "start.failed",
  "executable-missing", "permission-denied", "start-limit", "not-loaded",
]);
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

export function localHostBridgeErrorText(error: LocalHostBridgeError, t: HostTranslate) {
  const key = INSTALL_CAUSES[error.key] ?? "localInstall.error.unknown";
  const check = typeof error.params?.check === "string" && error.params.check ? error.params.check : t("localInstall.error.verificationCheck");
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
    case "backoff": return t("hosts.status.backoff", { attempts: status.attempts ?? "?", limit: status.limit ? ` of ${status.limit}` : "" });
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
