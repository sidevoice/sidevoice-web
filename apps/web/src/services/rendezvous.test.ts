import { afterEach, expect, test } from "vitest";
import { askRoomNode, askTarget, callSocketUrl, describeTarget, isNodePath, pageTarget, resolveTarget, routeUrl } from "./rendezvous.js";

const ORIGIN = "https://room.example";

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

test("what a target is: a node by its fingerprint, a room by the build it serves, or neither", () => {
  expect(describeTarget({ kind: "node", id: "mac", host: "macbook", fingerprint: "fp-1" })).toEqual({ kind: "node", id: "mac", fingerprint: "fp-1", build: null });
  expect(describeTarget({ kind: "room", nodes: [], web_build: "b1" })).toEqual({ kind: "room", id: null, fingerprint: null, build: "b1" });
  // A 404's body, a static server's page, a room from before rendezvous: not a node, not a room.
  for (const answer of [null, {}, { binding: null }, { kind: "other" }]) expect(describeTarget(answer)).toBeNull();
});

test("asking the target: a failure, or anything that is not a node or a room, is no answer at all", async () => {
  const asked: string[] = [];
  const answer = (status: number, body: unknown = {}) => (async (url: string) => { asked.push(url); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;

  expect(await askTarget("https://room.example", answer(200, { kind: "room", nodes: [], web_build: "b2" }))).toMatchObject({ kind: "room", build: "b2" });
  expect(asked.at(-1)).toBe("https://room.example/api/rendezvous");
  expect(await askTarget("", answer(200, { kind: "node", id: "mac", fingerprint: "fp" }))).toMatchObject({ kind: "node", fingerprint: "fp" });
  expect(asked.at(-1)).toBe("/api/rendezvous");
  expect(await askTarget("", answer(404))).toBeNull();
  expect(await askTarget("", answer(502))).toBeNull();
  expect(await askTarget("", (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch)).toBeNull();
  expect(await askTarget("", (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch)).toBeNull();
  // A target that never answers is no answer, after a while, rather than a page that waits for ever.
  const hangs = (() => new Promise(() => {})) as unknown as typeof fetch;
  expect(await askTarget("https://blackhole.example", hangs, 5)).toBeNull();
  expect(await askRoomNode("https://blackhole.example", "m-1", hangs, 5)).toBeNull();
});

test("a room answers only for the node a page names, and says whether it is connected", async () => {
  const asked: string[] = [];
  const room = (body: unknown, status = 200) => (async (url: string) => { asked.push(url); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
  expect(await askRoomNode("https://room.example", "m/1", room({ kind: "room", nodes: [{ id: "m/1", connected: true }] }))).toBe(true);
  expect(asked.at(-1)).toBe("https://room.example/api/rendezvous?nodes=m%2F1");
  expect(await askRoomNode("https://room.example", "m-1", room([{ id: "m-1", connected: false }]))).toBe(false);
  // Not named in the answer, a failure, or no answer: nothing is known.
  expect(await askRoomNode("https://room.example", "m-1", room({ kind: "room", nodes: [] }))).toBeNull();
  expect(await askRoomNode("https://room.example", "m-1", room({}, 500))).toBeNull();
  expect(await askRoomNode("https://room.example", "m-1", (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).toBeNull();
});

test("a conversation's request, and this device's pairing, go to the node; telemetry to the target", () => {
  for (const path of ["/api/presentation", "/api/presentation?session_id=s", "/api/presentation/history?session_id=s", "/api/presentation/integrations/openai", "/api/presentation/client-error",
    "/api/device/identity?nonce=n", "/api/device/devices/d-1"])
    expect([path, isNodePath(path)]).toEqual([path, true]);
  for (const path of ["/api/connectors", "/api/connectors/pairing-code", "/api/connectors/c-1", "/api/telemetry", "/api/presentationx", "/api/devices", "/voice-browser/room-client.js"])
    expect([path, isNodePath(path)]).toEqual([path, false]);

  expect(routeUrl("/api/presentation/participants?session_id=s", "", "/nodes/mac")).toBe("/nodes/mac/api/presentation/participants?session_id=s");
  expect(routeUrl("/api/connectors", "", "/nodes/mac")).toBe("/api/connectors");
  expect(routeUrl("/api/presentation", "https://room.example", "https://room.example/nodes/mac")).toBe("https://room.example/nodes/mac/api/presentation");
  expect(routeUrl("/api/telemetry", "https://room.example", "https://room.example/nodes/mac")).toBe("https://room.example/api/telemetry");
  // A node that serves the page itself keeps every path relative.
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
