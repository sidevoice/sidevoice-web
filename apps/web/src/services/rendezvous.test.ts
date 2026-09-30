import { afterEach, expect, test } from "vitest";
import { askRendezvous, callSocketUrl, isNodePath, locateNode, pageTarget, pickNode, resolveTarget, routeUrl } from "./rendezvous.js";

const ORIGIN = "https://room.example";
const machine = (id: string, connected: boolean, host = id) => ({ id, host, connected, platform: "macOS", version: "0.6.0", via: connected ? "outbound" : null });

afterEach(() => { delete window.__SIDEVOICE_TARGET__; });

test("the target is what a shell set, else the page's own origin — never something a link names", () => {
  expect(resolveTarget({ injected: "https://other.example/", origin: ORIGIN })).toBe("https://other.example");
  expect(resolveTarget({ injected: undefined, origin: ORIGIN })).toBe("");
  expect(resolveTarget({})).toBe("");
  // A link cannot point the room's own page at another server: its microphone and keys would go there.
  window.history.replaceState(null, "", "/voice/?target=https://attacker.example");
  expect(pageTarget()).toBe("");
  window.history.replaceState(null, "", "/");
});

test("a target that is not an http address is not a target, and the page stays on its own origin", () => {
  expect(resolveTarget({ injected: "javascript:alert(1)", origin: ORIGIN })).toBe("");
  expect(resolveTarget({ injected: "   ", origin: ORIGIN })).toBe("");
  expect(resolveTarget({ injected: 42, origin: ORIGIN })).toBe("");
});

test("a target keeps its path, loses its query and trailing slash, and the page's own origin reads as relative", () => {
  expect(resolveTarget({ injected: "https://host.example/sidevoice/?x=1#y", origin: ORIGIN })).toBe("https://host.example/sidevoice");
  // Pointing a page at the origin that serves it changes nothing: every path stays relative, as before the split.
  expect(resolveTarget({ injected: "https://room.example/", origin: ORIGIN })).toBe("");
});

test("the page reads its target from the window a shell writes to, before its own address", () => {
  expect(pageTarget()).toBe("");
  window.__SIDEVOICE_TARGET__ = "http://127.0.0.1:8767/";
  expect(pageTarget()).toBe("http://127.0.0.1:8767");
});

test("a room with no machine connected has no node base, and says which machines it has", () => {
  const found = locateNode({ kind: "room", nodes: [machine("a", false)] }, "");
  expect(found).toMatchObject({ kind: "room", node: null, base: null });
  expect(found.nodes.map((node) => node.id)).toEqual(["a"]);
  expect(locateNode({ kind: "room", nodes: [] }, "https://room.example").base).toBeNull();
});

test("with one machine connected the page talks to it, behind the room's relay", () => {
  const found = locateNode({ kind: "room", web_build: "b1", nodes: [machine("off", false), machine("mac/1", true)] }, "");
  expect(found).toMatchObject({ kind: "room", node: "mac/1", base: "/nodes/mac%2F1", build: "b1" });
  expect(locateNode({ kind: "room", nodes: [machine("mac", true)] }, "https://room.example").base).toBe("https://room.example/nodes/mac");
});

test("with two connected, the one this device chose last wins, else the first connected", () => {
  const nodes = [machine("a", false), machine("b", true), machine("c", true)];
  expect(locateNode({ kind: "room", nodes }, "").node).toBe("b");
  expect(locateNode({ kind: "room", nodes }, "", { remembered: "c" }).node).toBe("c");
  // A remembered machine that is away is not waited for: the page lands on one that answers.
  expect(locateNode({ kind: "room", nodes }, "", { remembered: "a" }).node).toBe("b");
  expect(locateNode({ kind: "room", nodes }, "", { remembered: "gone" }).node).toBe("b");
});

test("a reconnecting call stays with its machine while the room still lists it, connected or not", () => {
  const nodes = [machine("a", false), machine("b", true)];
  expect(pickNode(nodes, { keep: "a", remembered: "b" })).toBe("a");
  // Revoked, or removed: the room no longer lists it, and the ordinary choice applies.
  expect(pickNode(nodes, { keep: "gone", remembered: "b" })).toBe("b");
  expect(pickNode([], { keep: "a" })).toBeNull();
});

test("a node is its own node base, and anything else a room from before this version", () => {
  expect(locateNode({ kind: "node", id: "mac", host: "macbook" }, "http://node.lan:8767")).toMatchObject({ kind: "node", node: "mac", base: "http://node.lan:8767", nodes: [] });
  expect(locateNode(null, "")).toMatchObject({ kind: "legacy", base: "", node: null });
  expect(locateNode({ binding: null }, "https://room.example")).toMatchObject({ kind: "legacy", base: "https://room.example" });
  // Malformed rows are not machines.
  expect(locateNode({ kind: "room", nodes: [null, { id: "" }, { connected: true }, machine("ok", true)] }, "").nodes.map((node) => node.id)).toEqual(["ok"]);
});

test("asking the target: a 404 is an older room, a failure is no answer at all", async () => {
  const asked: string[] = [];
  const answer = (status: number, body: unknown = {}) => (async (url: string) => { asked.push(url); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;

  expect(await askRendezvous("", {}, answer(404))).toMatchObject({ kind: "legacy", base: "" });
  expect(asked).toEqual(["/api/rendezvous"]);
  expect(await askRendezvous("https://room.example", { remembered: "b" }, answer(200, { kind: "room", nodes: [machine("a", true), machine("b", true)] })))
    .toMatchObject({ kind: "room", node: "b", base: "https://room.example/nodes/b" });
  expect(asked.at(-1)).toBe("https://room.example/api/rendezvous");
  expect(await askRendezvous("", {}, answer(200, { kind: "node", id: "mac" }))).toMatchObject({ kind: "node", base: "" });
  // Nothing learned: the page keeps the node it had rather than forget it over one lost request.
  expect(await askRendezvous("", {}, answer(502))).toBeNull();
  expect(await askRendezvous("", {}, (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch)).toBeNull();
  expect(await askRendezvous("", {}, (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch)).toBeNull();
});

test("a conversation's request goes to the node, pairing and telemetry to the target", () => {
  for (const path of ["/api/presentation", "/api/presentation?session_id=s", "/api/presentation/history?session_id=s", "/api/presentation/transcription/credential", "/api/presentation/client-error"])
    expect([path, isNodePath(path)]).toEqual([path, true]);
  for (const path of ["/api/connectors", "/api/connectors/pairing-code", "/api/connectors/c-1", "/api/telemetry", "/api/presentationx", "/voice-browser/room-client.js"])
    expect([path, isNodePath(path)]).toEqual([path, false]);

  expect(routeUrl("/api/presentation/participants?session_id=s", "", "/nodes/mac")).toBe("/nodes/mac/api/presentation/participants?session_id=s");
  expect(routeUrl("/api/connectors", "", "/nodes/mac")).toBe("/api/connectors");
  expect(routeUrl("/api/presentation", "https://room.example", "https://room.example/nodes/mac")).toBe("https://room.example/nodes/mac/api/presentation");
  expect(routeUrl("/api/telemetry", "https://room.example", "https://room.example/nodes/mac")).toBe("https://room.example/api/telemetry");
  // Unchanged, byte for byte, against a room from before this version.
  expect(routeUrl("/api/presentation/select", "", "")).toBe("/api/presentation/select");
  // No machine: nothing of a node can be asked, while the room's own endpoints still answer.
  expect(routeUrl("/api/presentation/languages", "", null)).toBeNull();
  expect(routeUrl("/api/connectors/pairing-code", "", null)).toBe("/api/connectors/pairing-code");
});

test("the call socket opens on the node base, in the page's scheme or the target's own", () => {
  const page = { protocol: "https:", host: "room.example" };
  expect(callSocketUrl("", page)).toBe("wss://room.example/api/presentation/ws");
  expect(callSocketUrl("/nodes/mac", page)).toBe("wss://room.example/nodes/mac/api/presentation/ws");
  expect(callSocketUrl("/nodes/mac", { protocol: "http:", host: "127.0.0.1:5173" })).toBe("ws://127.0.0.1:5173/nodes/mac/api/presentation/ws");
  expect(callSocketUrl("http://node.lan:8767", page)).toBe("ws://node.lan:8767/api/presentation/ws");
  expect(callSocketUrl("https://room.example/nodes/mac", page)).toBe("wss://room.example/nodes/mac/api/presentation/ws");
});
