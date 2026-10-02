import { expect, test } from "vitest";
import { createRoomSessionStore } from "./room-session-state.js";

const remote = {
  fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], rv: { url: "https://room.example", node: "nuc" },
  device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false,
};

test("an unavailable native host keeps a stable, selected row without a pairing", () => {
  const store = createRoomSessionStore({
    pairings: [remote], pairingInUse: "@sidevoice/local-host", localHostAvailable: true, localHostSelected: true,
    localHostStatus: { state: "backoff", reachable: false, attempts: 4, limit: 8 },
  });

  const [local, nuc] = store.getState().machines;
  expect(local).toMatchObject({ id: "local-host", pairingId: undefined, host: "", local: true, inUse: true, selectable: false, state: "offline" });
  expect(nuc).toMatchObject({ id: "fp-nuc", inUse: false, local: false });
  expect(JSON.stringify(local)).not.toMatch(/token|url|fingerprint/i);
});

test("native reachability, rather than service state, makes local pairing selectable", () => {
  const store = createRoomSessionStore({
    pairings: [{ ...remote, fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:43127"] }],
    pairingInUse: "fp-local", localHostAvailable: true, localHostSelected: true,
    localHostStatus: { state: "service-failed", reachable: true, installed: true, service: "launchd" },
  });

  expect(store.getState().machines[0]).toMatchObject({ id: "local-host", pairingId: "fp-local", host: "MacBook", inUse: true, selectable: true, state: "connected", reach: "direct" });
});

test("the no-machine state stays empty when the desktop bridge says no local host exists", () => {
  const store = createRoomSessionStore({ localHostAvailable: true, localHostStatus: { state: "absent" } });
  expect(store.getState().machines).toEqual([]);
});
