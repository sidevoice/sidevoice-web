import { expect, test } from "vitest";
import { createRoomSessionStore, reachNote, type SessionFacts } from "./room-session-state.js";

const remote = {
  fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], rv: { url: "https://room.example", node: "nuc" },
  device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false,
};

test("an unavailable native host keeps a stable row without a pairing, beside a remote that says its own link", () => {
  const store = createRoomSessionStore({
    pairings: [remote], machineLinks: { "fp-nuc": { reach: "ok", via: "room" } }, localHostAvailable: true,
    localHostStatus: { state: "backoff", reachable: false, attempts: 4, limit: 8 },
  });

  const [local, nuc] = store.getState().machines;
  expect(local).toMatchObject({ id: "local-host", pairingId: undefined, host: "", local: true, state: "offline" });
  expect(nuc).toMatchObject({ id: "fp-nuc", local: false, state: "connected", reach: "room" });
  expect(local).not.toHaveProperty("inUse");
  expect(JSON.stringify(local)).not.toMatch(/token|url|fingerprint/i);
});

test("native reachability, rather than service state, makes the local machine connected", () => {
  const store = createRoomSessionStore({
    pairings: [{ ...remote, fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:43127"] }],
    localHostAvailable: true, localHostStatus: { state: "service-failed", reachable: true, installed: true, service: "launchd" },
  });

  expect(store.getState().machines[0]).toMatchObject({ id: "local-host", pairingId: "fp-local", host: "MacBook", state: "connected", reach: "direct" });
});

test("every remote machine's row says its own link: none of them is the one in use", () => {
  const pairings = ["fp-a", "fp-b", "fp-c", "fp-d"].map((fp) => ({ ...remote, fp, host: fp }));
  const store = createRoomSessionStore({ pairings, machineLinks: {
    "fp-a": { reach: "ok", via: "node" }, "fp-b": { reach: "ok", via: "room" }, "fp-c": { reach: "away", via: "" },
  } });

  expect(store.getState().machines.map((m) => [m.id, m.state, m.reach])).toEqual([
    ["fp-a", "connected", "direct"], ["fp-b", "connected", "room"], ["fp-c", "offline", "offline"], ["fp-d", "checking", "checking"]]);
  expect(store.getState().machines.some((m) => "inUse" in m || "selectable" in m)).toBe(false);
});

test("the no-machine state stays empty when the desktop bridge says no local host exists", () => {
  const store = createRoomSessionStore({ localHostAvailable: true, localHostStatus: { state: "absent" } });
  expect(store.getState().machines).toEqual([]);
});

// Two machines can each have a conversation the room calls "t1": the page tells them apart by machine.
const nuc = { ...remote, fp: "fp-nuc", host: "NUC" }, ws = { ...remote, fp: "fp-ws", host: "Workstation", alias: true };
const row = (node: string, title: string) => ({ thread_id: "t1", node, title, available: true, reach: { state: "listening" }, machine: { host: node, id: "c-" + node } });

test("two machines' conversations with the same thread are two rows, each keyed and named by its machine", () => {
  const store = createRoomSessionStore({ pairings: [nuc, ws], callNode: "fp-ws", roomBinding: { thread_id: "t1", title: "web" },
    machineLinks: { "fp-nuc": { reach: "ok", via: "node" }, "fp-ws": { reach: "ok", via: "room" } }, people: [row("fp-nuc", "api"), row("fp-ws", "web")] });

  expect(store.getState().participants.map((p) => [p.threadId, p.title, p.machine, p.machineId, p.selected])).toEqual([
    ["fp-nuc|t1", "api", "NUC", "fp-nuc", false], ["fp-ws|t1", "web", "Workstation", "fp-ws", true]]);
});

test("a machine whose link is down lists its conversations as offline; the other machine's stay as they say", () => {
  const store = createRoomSessionStore({ pairings: [nuc, ws],
    machineLinks: { "fp-nuc": { reach: "offline", via: "" }, "fp-ws": { reach: "ok", via: "node" } }, people: [row("fp-nuc", "api"), row("fp-ws", "web")] });

  expect(store.getState().participants.map((p) => [p.threadId, p.available, p.reach])).toEqual([
    ["fp-nuc|t1", false, "offline"], ["fp-ws|t1", true, "listening"]]);
});

test("out of a call, the reach note speaks of the machine of the conversation being looked at", () => {
  const facts: Partial<SessionFacts> = { pairings: [nuc, ws], machinesReady: true, viewedThread: "fp-nuc|t1",
    machineLinks: { "fp-nuc": { reach: "offline", via: "" }, "fp-ws": { reach: "ok", via: "node" } } };

  expect(reachNote(createRoomSessionStore(facts).getState().facts)).toBe("«NUC» no está conectada a la sala ahora mismo. Comprueba que está encendida.");
  expect(reachNote(createRoomSessionStore({ ...facts, viewedThread: "fp-ws|t1" }).getState().facts)).toBe("");
  // None looked at, one still answering: nothing to say yet; every one away: no machine at all.
  expect(reachNote(createRoomSessionStore({ ...facts, viewedThread: null }).getState().facts)).toBe("");
  expect(reachNote(createRoomSessionStore({ ...facts, viewedThread: null,
    machineLinks: { "fp-nuc": { reach: "offline", via: "" }, "fp-ws": { reach: "away", via: "" } } }).getState().facts)).toMatch(/^Ninguna máquina disponible/);
});

test("a pairing kept without encryption by the person's choice is a machine like any other: its view says nothing of it", () => {
  const machines = (insecure: boolean) => createRoomSessionStore({ pairings: [{ ...remote, urls: ["http://192.168.1.20:8768"], rv: null, ...(insecure ? { insecure } : {}) }],
    machineLinks: { "fp-nuc": { reach: "ok", via: "node" } } }).getState().machines;
  expect(machines(true)).toEqual(machines(false));
  expect(machines(true)[0]).not.toHaveProperty("insecure");
});
