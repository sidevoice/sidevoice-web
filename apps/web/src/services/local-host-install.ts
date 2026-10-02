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
    job: string | null;
    step: string | null;
    done: number | null;
    total: number | null;
    cancellable: boolean;
    cancelling: boolean;
    cancelState: "too-late" | "failed" | null;
  }
  | { phase: "failed"; step: string | null; error: LocalHostBridgeError }
  | { phase: "cancelled"; step: string | null }
  | { phase: "succeeded" };

const IDLE: LocalHostInstallSnapshot = Object.freeze({ phase: "idle" });
const sensitiveName = /(token|secret|password|pairing|authorization|environment|env|home|path|api[_ -]?key)/i;

function boundedText(value: string, max = 300) {
  return value.trim().slice(0, max)
    .replace(/\bSV1\.[A-Za-z0-9._~-]+\b/g, "[redacted]")
    .replace(/(bearer\s+)[A-Za-z0-9._~-]+/gi, "$1[redacted]")
    .replace(/\b([\w.-]*(?:token|secret|password|api[_ -]?key|private[_ -]?key)[\w.-]*)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

function safeStep(value: unknown) {
  return typeof value === "string" && /^[\w.-]{1,100}$/.test(value) ? value : null;
}

function safeParams(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 20)) {
    if (sensitiveName.test(key)) continue;
    if (typeof entry === "string") result[key] = boundedText(entry, 200);
    else if (typeof entry === "number" && Number.isFinite(entry)) result[key] = entry;
  }
  return Object.keys(result).length ? result : undefined;
}

function safeLogTail(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const lines = value.filter((line): line is string => typeof line === "string")
    .filter((line) => !/^\s*(environment|env(?:ironment)?\s+variables?|printenv(?:\s|$)|home=|path=|user=)/i.test(line))
    .filter((line) => (line.match(/\b[A-Z_][A-Z0-9_]*=/g) || []).length < 3)
    .slice(-20).map((line) => boundedText(line));
  return lines.length ? lines : undefined;
}

export function normalizeLocalHostBridgeError(value: unknown, fallbackStep: string | null = null): LocalHostBridgeError {
  const outer = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const source = outer.failure && typeof outer.failure === "object" ? outer.failure as Record<string, unknown> : outer;
  const key = typeof source.key === "string" && /^[\w.-]{1,100}$/.test(source.key) ? source.key : "install.unknown";
  const params = safeParams(source.params);
  const logTail = safeLogTail(source.log_tail);
  return {
    key,
    ...(safeStep(source.step) || fallbackStep ? { step: safeStep(source.step) || fallbackStep || undefined } : {}),
    ...(params ? { params } : {}),
    ...(logTail ? { log_tail: logTail } : {}),
  };
}

export interface LocalHostInstallController {
  getSnapshot(): LocalHostInstallSnapshot;
  subscribe(listener: () => void): () => void;
  start(): boolean;
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

  function start() {
    if (snapshot.phase === "installing") return false;
    const bridge = bridgeProvider();
    if (!bridge || typeof bridge.install !== "function") return false;

    const currentAttempt = ++attempt;
    activeBridge = bridge;
    let lastStep: string | null = null;
    publish({ phase: "installing", job: null, step: null, done: null, total: null, cancellable: false, cancelling: false, cancelState: null });

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
      publish({ phase: "failed", step: lastStep, error: normalizeLocalHostBridgeError(error, lastStep) });
      activeBridge = null;
      return true;
    }

    if (!operation || typeof operation.job !== "string" || !operation.job) {
      publish({ phase: "failed", step: lastStep, error: normalizeLocalHostBridgeError({ key: "bridge.invalid-response" }, lastStep) });
      activeBridge = null;
      return true;
    }
    const waiting = readSnapshot();
    if (waiting.phase === "installing") {
      publish({ ...waiting, job: operation.job, cancellable: typeof bridge.cancel === "function" });
    }
    void Promise.resolve(operation).then((_status: LocalHostStatus) => {
      if (attempt !== currentAttempt) return;
      publish({ phase: "succeeded" });
      activeBridge = null;
    }).catch((error: unknown) => {
      if (attempt !== currentAttempt) return;
      const normalized = normalizeLocalHostBridgeError(error, lastStep);
      if (normalized.key === "install.cancelled") publish({ phase: "cancelled", step: normalized.step || lastStep });
      else publish({ phase: "failed", step: normalized.step || lastStep, error: normalized });
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

export function isVisibleLocalHostInstall(snapshot: LocalHostInstallSnapshot) {
  return snapshot.phase === "installing" || snapshot.phase === "failed" || snapshot.phase === "cancelled";
}
