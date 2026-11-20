import { afterEach, describe, expect, test, vi } from "vitest";
import { installApp, removeApp } from "../../host/testing";
import type { MachineView } from "../../state/room-types";
import { webLogSources } from "./install-log-sources";

const machine = (over: Partial<MachineView>): MachineView => ({ id: "m1", host: "Mini", revoked: false, reach: "direct", state: "connected", ...over });
afterEach(() => { removeApp(); delete (window as { sidevoiceActions?: unknown }).sidevoiceActions; });

describe("webLogSources", () => {
  test("this device has a source only where the app serves its log", () => {
    const sources = webLogSources(() => []);
    expect(sources.open({ kind: "device" })).toBeNull();
    installApp({ appLog: { read: async () => ({}) } });
    expect(sources.open({ kind: "device" })).not.toBeNull();
  });

  test("a machine's source reads over its pairing's fingerprint, not its row id", async () => {
    const hostFetch = vi.fn(async () => new Response(JSON.stringify({ lines: [], cursor: "c0", more: false })));
    (window as unknown as { sidevoiceActions: unknown }).sidevoiceActions = { hostFetch };
    const sources = webLogSources(() => [machine({ pairingId: "fp-1" })]);
    await sources.open({ kind: "machine", id: "m1" })!.tail({ limit: 10 }, new AbortController().signal);
    expect(hostFetch).toHaveBeenCalledWith("fp-1", "/api/logs?limit=10", expect.objectContaining({ cache: "no-store" }));
  });

  test("a machine without a pairing, or an unknown one, has none", () => {
    const sources = webLogSources(() => [machine({})]);
    expect(sources.open({ kind: "machine", id: "m1" })).toBeNull();
    expect(sources.open({ kind: "machine", id: "nope" })).toBeNull();
  });
});
