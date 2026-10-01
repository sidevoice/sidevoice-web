/* Requests to one host — the one in use or any other paired one (ONBOARDING_AND_HOSTS.md §4.8 "per-host requests"):
 * every request carries that host's base and token, and a caller applies the answer only if the host page it was
 * asked for is still the one shown (`(fp, epoch)`, kept by the caller).
 *
 * A host answers with JSON. A refusal is `{key, message}` (or FastAPI's `{detail}`); no answer at all — a network
 * error or the timeout — is `unreachable`, which is not the same as a refusal. */
import type { DetectedAgent } from "./desktop-host";
import type { IntegrationListing } from "../state/room-types";

export interface HostTarget { fp: string; base: string; token: string }

export class HostError extends Error {
  constructor(public status: number, public key: string, message: string) { super(message); }
}

export const HOST_TIMEOUT_MS = 8000;

export async function hostRequest<T>(target: HostTarget, method: string, path: string, body?: unknown, timeoutMs = HOST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(target.base + path, {
      method,
      headers: { authorization: "Bearer " + target.token, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
  } catch {
    throw new HostError(0, "unreachable", "unreachable");
  } finally {
    clearTimeout(timer);
  }
  let answer: unknown = null;
  try { answer = await response.json(); } catch { /* no body */ }
  if (!response.ok) {
    const refusal = (answer ?? {}) as { key?: string; message?: string; detail?: string };
    throw new HostError(response.status, refusal.key || (response.status === 401 ? "unauthorized" : "http-" + response.status), refusal.message || refusal.detail || "");
  }
  return answer as T;
}

export interface AgentsListing { agents: DetectedAgent[]; scanned_at: number }
export interface DeviceRow { device_id: string; name: string; kind: "code" | "local"; created_at: number; last_seen: number | null }

export const listAgents = (target: HostTarget, rescan = false) =>
  hostRequest<AgentsListing>(target, "GET", "/api/host/agents" + (rescan ? "?rescan=1" : ""));
export const agentAction = (target: HostTarget, id: string, action: "connect" | "disconnect" | "dismiss") =>
  hostRequest<{ agent: DetectedAgent; manual?: { file: string; snippet: string } }>(target, "POST", `/api/host/agents/${encodeURIComponent(id)}/${action}`);
export const listDevices = (target: HostTarget) => hostRequest<{ devices: DeviceRow[] }>(target, "GET", "/api/device/devices");
export const revokeDevice = (target: HostTarget, id: string) => hostRequest<unknown>(target, "DELETE", "/api/device/devices/" + encodeURIComponent(id));
export const listIntegrations = (target: HostTarget) => hostRequest<IntegrationListing>(target, "GET", "/api/presentation/integrations");
export const putIntegrationKey = (target: HostTarget, id: string, key: string) =>
  hostRequest<IntegrationListing>(target, "PUT", "/api/presentation/integrations/" + encodeURIComponent(id), { key });
export const deleteIntegrationKey = (target: HostTarget, id: string) =>
  hostRequest<IntegrationListing>(target, "DELETE", "/api/presentation/integrations/" + encodeURIComponent(id));
/** Whether the host answers at all: its open rendezvous route (§4.3 `api`). */
export const hostAbout = (target: HostTarget, timeoutMs = HOST_TIMEOUT_MS) =>
  hostRequest<{ kind: string; fingerprint: string; api?: number; version?: string }>(target, "GET", "/api/rendezvous", undefined, timeoutMs);
