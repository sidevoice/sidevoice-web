import type { DetectedAgent, HostAgentsListing, HostAgentsState } from "../state/room-types";

export type HostAgentAction = "connect" | "disconnect" | "dismiss";

export interface HostAgentRequestError extends Error {
  key?: string;
  params?: Record<string, string | number>;
}

export interface HostAgentsController {
  load(fp: string, options?: { rescan?: boolean; watch?: string }): Promise<void>;
  act(fp: string, id: string, action: HostAgentAction): Promise<void>;
  invalidate(fp: string): void;
}

export function actionableAgent(agent: DetectedAgent): boolean {
  if (!agent.present || agent.registration !== "not-connected" || agent.dismissed) return false;
  if (agent.actionable !== undefined) return agent.actionable;
  return agent.registration === "not-connected" &&
    (agent.connect === "auto" || agent.connect === "manual");
}

export function actionableHostFingerprints(hostAgents: Record<string, HostAgentsState>, activeFingerprints?: ReadonlySet<string>): string[] {
  return Object.entries(hostAgents).filter(([, listing]) =>
    listing.status === "ready" && listing.value?.agents.some(actionableAgent))
    .map(([fp]) => fp)
    .filter((fp) => !activeFingerprints || activeFingerprints.has(fp));
}

export function isHostAgentsListing(value: unknown): value is HostAgentsListing {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HostAgentsListing>;
  return Array.isArray(candidate.agents) && (typeof candidate.scanned_at === "string" || typeof candidate.scanned_at === "number");
}

function safeParams(value: unknown): Record<string, string | number> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) =>
    typeof item === "string" || (typeof item === "number" && Number.isFinite(item)));
  return entries.length ? Object.fromEntries(entries) as Record<string, string | number> : undefined;
}

function errorData(reason: unknown, fallback: string) {
  const value = reason && typeof reason === "object" ? reason as HostAgentRequestError : null;
  return { key: typeof value?.key === "string" ? value.key : fallback, params: safeParams(value?.params) };
}

function initial(): HostAgentsState {
  return { status: "idle", value: null, error: null, busy: {}, actionErrors: {} };
}

/** Per-host generations keep stale reads and actions attached to the fingerprint that started them. */
export function createHostAgentsController(deps: {
  request(fp: string, path: string, options?: RequestInit): Promise<unknown>;
  hasHost(fp: string): boolean;
  getState(fp: string): HostAgentsState | undefined;
  setState(fp: string, next: HostAgentsState): void;
  removeState?(fp: string): void;
}): HostAgentsController {
  const generations = new Map<string, number>();
  const actionRuns = new Map<string, number>();
  const nextGeneration = (fp: string) => {
    const next = (generations.get(fp) ?? 0) + 1;
    generations.set(fp, next);
    return next;
  };
  const current = (fp: string, generation: number) => generations.get(fp) === generation && deps.hasHost(fp);
  const stateFor = (fp: string) => deps.getState(fp) ?? initial();
  function invalidate(fp: string) {
    nextGeneration(fp);
    if (deps.removeState) deps.removeState(fp);
    else deps.setState(fp, initial());
  }

  async function load(fp: string, options: { rescan?: boolean; watch?: string } = {}) {
    if (!deps.hasHost(fp)) return;
    const generation = nextGeneration(fp);
    const previous = stateFor(fp);
    deps.setState(fp, { ...previous, status: "loading", error: null });
    const query = new URLSearchParams();
    if (options.rescan) query.set("rescan", "1");
    if (options.watch) query.set("watch", options.watch);
    const encodedQuery = query.toString();
    const path = "/api/host/agents" + (encodedQuery ? `?${encodedQuery}` : "");
    try {
      const value = await deps.request(fp, path, { headers: { accept: "application/json" }, cache: "no-store" });
      if (!current(fp, generation)) return;
      if (!isHostAgentsListing(value)) throw Object.assign(new Error("invalid-agents-response"), { key: "invalid-response" });
      deps.setState(fp, { ...stateFor(fp), status: "ready", value, error: null });
    } catch (reason) {
      if (!current(fp, generation)) return;
      const error = errorData(reason, "unreachable");
      deps.setState(fp, { ...stateFor(fp), status: "failed", error });
    }
  }

  async function act(fp: string, id: string, action: HostAgentAction) {
    if (!deps.hasHost(fp)) return;
    const generation = nextGeneration(fp);
    const rowKey = `${fp}:${id}`;
    const run = (actionRuns.get(rowKey) ?? 0) + 1;
    actionRuns.set(rowKey, run);
    const before = stateFor(fp);
    const { [id]: _removedError, ...remainingErrors } = before.actionErrors;
    deps.setState(fp, { ...before, busy: { ...before.busy, [id]: action }, actionErrors: remainingErrors });
    try {
      const result = await deps.request(fp, `/api/host/agents/${encodeURIComponent(id)}/${action}`, { method: "POST", headers: { accept: "application/json" } });
      if (!current(fp, generation)) return;
      if (isHostAgentsListing(result)) {
        const value = action === "dismiss" ? { ...result, agents: result.agents.map((agent) =>
          agent.id === id ? { ...agent, dismissed: true, actionable: false } : agent) } : result;
        deps.setState(fp, { ...stateFor(fp), status: "ready", value, error: null });
      } else if (action === "dismiss") {
        const state = stateFor(fp);
        const value = state.value && { ...state.value, agents: state.value.agents.map((agent) =>
          agent.id === id ? { ...agent, dismissed: true, actionable: false } : agent) };
        deps.setState(fp, { ...state, status: value ? "ready" : state.status, value, error: null });
      } else {
        await load(fp);
      }
    } catch (reason) {
      if (!current(fp, generation)) return;
      const error = errorData(reason, action === "connect" ? "connect-failed" : "action-failed");
      const state = stateFor(fp);
      deps.setState(fp, { ...state, actionErrors: { ...state.actionErrors, [id]: error } });
    } finally {
      if (actionRuns.get(rowKey) === run) {
        const state = stateFor(fp);
        if (state.busy[id] === action) {
          const { [id]: _busy, ...busy } = state.busy;
          deps.setState(fp, { ...state, busy });
        }
      }
    }
  }

  return { load, act, invalidate };
}
