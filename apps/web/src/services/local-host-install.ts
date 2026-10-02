import {
  localHostBridge,
  type LocalHostBridge,
  type LocalHostBridgeError,
  type LocalHostInstallProgress,
  type LocalHostStatus,
} from "./desktop-host";

export type LocalHostInstallSnapshot =
  | { phase: "idle" }
  | {
    phase: "installing";
    source: LocalHostInstallSource;
    job: string | null;
    step: string | null;
    done: number | null;
    total: number | null;
    cancellable: boolean;
    cancelling: boolean;
    cancelState: "too-late" | "failed" | null;
  }
  | { phase: "failed"; source: LocalHostInstallSource; step: string | null; error: LocalHostBridgeError }
  | { phase: "cancelled"; source: LocalHostInstallSource; step: string | null }
  | { phase: "succeeded"; source: LocalHostInstallSource };

export type LocalHostInstallSource = "no-machine" | "machines";

const IDLE: LocalHostInstallSnapshot = Object.freeze({ phase: "idle" });
const SAFE_VERIFICATION_CHECKS = new Set([
  "sha256", "sigstore", "sigstore-bundle", "issuer", "workflow", "source", "repository-id", "runner",
  "build-config", "predicate", "subject", "manifest", "developer-override", "platform", "download",
  "download-size", "archive-path", "archive-link", "archive-size", "archive-type",
]);
const SAFE_NUMERIC_PARAMS = new Set(["attempt", "attempts", "limit", "bytes", "duration_ms"]);

function safeStep(value: unknown) {
  return typeof value === "string" && /^[\w.-]{1,100}$/.test(value) ? value : null;
}

function safeParams(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 20)) {
    if (key === "check" && typeof entry === "string") {
      const check = entry.trim().toLowerCase();
      if (SAFE_VERIFICATION_CHECKS.has(check)) result.check = check;
    } else if (SAFE_NUMERIC_PARAMS.has(key) && typeof entry === "number" && Number.isFinite(entry)) {
      result[key] = entry;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

export function normalizeLocalHostBridgeError(value: unknown, fallbackStep: string | null = null): LocalHostBridgeError {
  const outer = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const source = outer.failure && typeof outer.failure === "object" ? outer.failure as Record<string, unknown> : outer;
  const key = typeof source.key === "string" && /^[\w.-]{1,100}$/.test(source.key) ? source.key : "install.unknown";
  const params = safeParams(source.params);
  return {
    key,
    ...(safeStep(source.step) || fallbackStep ? { step: safeStep(source.step) || fallbackStep || undefined } : {}),
    ...(params ? { params } : {}),
  };
}

export interface LocalHostInstallController {
  getSnapshot(): LocalHostInstallSnapshot;
  subscribe(listener: () => void): () => void;
  start(source?: LocalHostInstallSource): boolean;
  cancel(): Promise<boolean>;
  clear(): void;
}

/** One renderer-side install job shared by the room and Machines entry points. Native remains the authority
 * for install locking, cancellation boundaries and host projection. */
export function createLocalHostInstallController(bridgeProvider: () => LocalHostBridge | null = localHostBridge): LocalHostInstallController {
  let snapshot: LocalHostInstallSnapshot = IDLE;
  let attempt = 0;
  let activeBridge: LocalHostBridge | null = null;
  const listeners = new Set<() => void>();

  function publish(next: LocalHostInstallSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function readSnapshot(): LocalHostInstallSnapshot { return snapshot; }

  function start(source: LocalHostInstallSource = "machines") {
    if (snapshot.phase === "installing") return false;
    const bridge = bridgeProvider();
    if (!bridge || typeof bridge.install !== "function") return false;

    const currentAttempt = ++attempt;
    activeBridge = bridge;
    let lastStep: string | null = null;
    publish({ phase: "installing", source, job: null, step: null, done: null, total: null, cancellable: false, cancelling: false, cancelState: null });

    let operation;
    try {
      operation = bridge.install((event: LocalHostInstallProgress) => {
        if (attempt !== currentAttempt) return;
        const current = snapshot;
        if (current.phase !== "installing") return;
        const step = safeStep(event?.step);
        if (step) lastStep = step;
        const done = typeof event?.done === "number" && Number.isFinite(event.done) && event.done >= 0 ? event.done : null;
        const total = typeof event?.total === "number" && Number.isFinite(event.total) && event.total > 0 ? event.total : null;
        publish({ ...current, step, done, total });
      });
    } catch (error) {
      publish({ phase: "failed", source, step: lastStep, error: normalizeLocalHostBridgeError(error, lastStep) });
      activeBridge = null;
      return true;
    }

    if (!operation || typeof operation.job !== "string" || !operation.job) {
      publish({ phase: "failed", source, step: lastStep, error: normalizeLocalHostBridgeError({ key: "bridge.invalid-response" }, lastStep) });
      activeBridge = null;
      return true;
    }
    const waiting = readSnapshot();
    if (waiting.phase === "installing") {
      publish({ ...waiting, job: operation.job, cancellable: typeof bridge.cancel === "function" });
    }
    void Promise.resolve(operation).then((_status: LocalHostStatus) => {
      if (attempt !== currentAttempt) return;
      publish({ phase: "succeeded", source });
      activeBridge = null;
    }).catch((error: unknown) => {
      if (attempt !== currentAttempt) return;
      const normalized = normalizeLocalHostBridgeError(error, lastStep);
      if (normalized.key === "install.cancelled") publish({ phase: "cancelled", source, step: normalized.step || lastStep });
      else publish({ phase: "failed", source, step: normalized.step || lastStep, error: normalized });
      activeBridge = null;
    });
    return true;
  }

  async function cancel() {
    if (snapshot.phase !== "installing" || !snapshot.cancellable || snapshot.cancelling || !snapshot.job || !activeBridge?.cancel) return false;
    const currentAttempt = attempt;
    const bridge = activeBridge;
    const job = snapshot.job;
    const cancelOperation = bridge.cancel;
    if (!cancelOperation) return false;
    publish({ ...snapshot, cancelling: true, cancellable: false, cancelState: null });
    try {
      const accepted = await cancelOperation.call(bridge, job);
      if (attempt === currentAttempt && snapshot.phase === "installing") {
        publish({ ...snapshot, cancelling: accepted, cancellable: false, cancelState: accepted ? null : "too-late" });
      }
      return accepted;
    } catch {
      if (attempt === currentAttempt && snapshot.phase === "installing") {
        publish({ ...snapshot, cancelling: false, cancellable: false, cancelState: "failed" });
      }
      return false;
    }
  }

  function clear() {
    if (snapshot.phase === "installing") return;
    ++attempt;
    activeBridge = null;
    publish(IDLE);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start,
    cancel,
    clear,
  };
}

export const localHostInstallController = createLocalHostInstallController();

export function isVisibleLocalHostInstall(snapshot: LocalHostInstallSnapshot, source?: LocalHostInstallSource) {
  return snapshot.phase !== "idle" && (!source || snapshot.source === source);
}
