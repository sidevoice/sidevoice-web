import { expect, test, vi } from "vitest";
import { actionableAgent, actionableHostFingerprints, createHostAgentsController } from "./host-agents";
import type { HostAgentsListing, HostAgentsState } from "../state/room-types";

const agent = (id: string, changes: Partial<HostAgentsListing["agents"][number]> = {}) => ({
  id, label: id, present: true, version: null, registration: "not-connected" as const, connect: "auto" as const, ...changes,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(request: (fp: string, path: string, options?: RequestInit) => Promise<unknown>) {
  const states = new Map<string, HostAgentsState>();
  const controller = createHostAgentsController({
    request,
    hasHost: (fp) => fp === "host-a" || fp === "host-b",
    getState: (fp) => states.get(fp),
    setState: (fp, value) => states.set(fp, value),
  });
  return { controller, states };
}

test("agent responses stay with the fingerprint that requested them", async () => {
  const a = deferred<unknown>();
  const b = deferred<unknown>();
  const api = vi.fn((fp: string, _path: string) => fp === "host-a" ? a.promise : b.promise);
  const { controller, states } = harness(api);

  const loadingA = controller.load("host-a", { rescan: true });
  const loadingB = controller.load("host-b", { rescan: true });
  b.resolve({ agents: [agent("codex", { label: "Codex B" })], scanned_at: "2026-10-02T10:00:00Z" });
  await loadingB;
  a.resolve({ agents: [agent("claude", { label: "Claude A" })], scanned_at: "2026-10-02T10:00:01Z" });
  await loadingA;

  expect(states.get("host-a")?.value?.agents[0].label).toBe("Claude A");
  expect(states.get("host-b")?.value?.agents[0].label).toBe("Codex B");
  expect(api.mock.calls.map(([fp, path]) => [fp, path])).toEqual([
    ["host-a", "/api/host/agents?rescan=1"], ["host-b", "/api/host/agents?rescan=1"],
  ]);
});

test("a newer scan for one host supersedes its own late response", async () => {
  const old = deferred<unknown>();
  const current = deferred<unknown>();
  const api = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const { controller, states } = harness(api);

  const loadingOld = controller.load("host-a");
  const loadingCurrent = controller.load("host-a", { rescan: true, watch: "codex" });
  current.resolve({ agents: [agent("codex", { version: "2" })], scanned_at: 2 });
  await loadingCurrent;
  old.resolve({ agents: [agent("codex", { version: "1" })], scanned_at: 1 });
  await loadingOld;

  expect(states.get("host-a")?.value?.agents[0].version).toBe("2");
  expect(api.mock.calls[1][1]).toBe("/api/host/agents?rescan=1&watch=codex");
});

test("invalidating a forgotten host removes pending read results", async () => {
  const pending = deferred<unknown>();
  const { controller, states } = harness(vi.fn(() => pending.promise));
  const loading = controller.load("host-a");

  controller.invalidate("host-a");
  pending.resolve({ agents: [agent("codex", { actionable: true })], scanned_at: 3 });
  await loading;

  expect(states.get("host-a")).toMatchObject({ status: "idle", value: null });
});

test("Not now clears an actionable notice even if the host response is stale", async () => {
  const listing: HostAgentsListing = { agents: [agent("cursor", { actionable: true })], scanned_at: 1 };
  const api = vi.fn(async () => ({ ...listing, agents: [agent("cursor", { actionable: true, dismissed: true })] }));
  const { controller, states } = harness(api);
  states.set("host-a", { status: "ready", value: listing, error: null, busy: {}, actionErrors: {} });

  await controller.act("host-a", "cursor", "dismiss");

  const state = states.get("host-a");
  expect(state?.value?.agents[0]).toMatchObject({ dismissed: true, actionable: false });
  expect(actionableHostFingerprints({ "host-a": state! })).toEqual([]);
  expect(api).toHaveBeenCalledWith("host-a", "/api/host/agents/cursor/dismiss", expect.objectContaining({ method: "POST" }));
});

test("the connector actionable flag drives notices, with a conservative legacy fallback", () => {
  expect(actionableAgent(agent("codex", { actionable: true }))).toBe(true);
  expect(actionableAgent(agent("codex", { actionable: false }))).toBe(false);
  expect(actionableAgent(agent("codex", { actionable: true, registration: "connected" }))).toBe(false);
  expect(actionableAgent(agent("codex", { actionable: true, registration: "foreign" }))).toBe(false);
  expect(actionableAgent(agent("codex", { actionable: true, registration: "unknown" }))).toBe(false);
  expect(actionableAgent(agent("codex", { actionable: true, dismissed: true }))).toBe(false);
  expect(actionableAgent(agent("codex", { actionable: undefined, connect: "manual" }))).toBe(true);
  expect(actionableAgent(agent("codex", { actionable: undefined, registration: "foreign" }))).toBe(false);
  expect(actionableAgent(agent("codex", { actionable: undefined, present: false }))).toBe(false);
  expect(actionableHostFingerprints({ "host-a": { status: "ready", value: { agents: [agent("codex", { actionable: true })], scanned_at: 1 }, error: null, busy: {}, actionErrors: {} } }, new Set())).toEqual([]);
});
