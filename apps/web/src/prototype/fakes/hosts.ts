/* PROTOTYPE ONLY — the fake hosts behind `fetch`. Each host of the scenario has a real P-256 identity (so the page's
 * own pairing code, identity proof and redemption run unchanged), its agents, devices and integrations, and answers
 * the routes the screens use. A fixture's `routes` override a route's answers in order; the last one repeats. */
import { bytesToBase64url, IDENTITY_PREFIX, utf8 } from "../../services/device-pairing.js";
import type { DetectedAgent } from "../../services/desktop-host";
import type { HostSeed, RouteAnswer, Scenario, Toggles } from "../scenario";

export const LOCAL_BASE = "http://127.0.0.1:47123";
export const ROOM_URL = "https://sala.sidevoice.example";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

export interface FakeHost {
  alias: string;
  seed: HostSeed;
  name: string;
  fp: string;
  publicKey: string;
  keys: CryptoKeyPair;
  base: string;
  /** How a pairing reaches it: direct URLs, or the room relay. */
  urls: string[];
  rv: { url: string; node: string } | null;
  agents: DetectedAgent[];
  devices: { device_id: string; name: string; kind: "code" | "local"; created_at: number; last_seen: number | null }[];
  providers: Record<string, { configured: boolean; source: "stored" | "environment" | null; hint: string | null }>;
  secrets: Set<string>;
  refused: boolean;
  reachable: boolean;
  routeCalls: Map<string, number>;
  scannedAt: number;
}

export interface FakeHosts {
  byAlias: Map<string, FakeHost>;
  byBase(url: string): FakeHost | null;
  code(alias: string, variant?: "valid" | "expired" | "loopback" | "plaintext"): string;
  install(): void;
  /** The device id the scenario's own pairing with a host uses. */
  selfDevice(alias: string): string;
}

const PROVIDERS: Record<string, { label: string; capabilities: string[]; environment: string }> = {
  openai: { label: "OpenAI", capabilities: ["transcription"], environment: "VOICE_STT_API_KEY" },
  elevenlabs: { label: "ElevenLabs", capabilities: ["voice"], environment: "VOICE_ELEVENLABS_API_KEY" },
};

const now = () => Math.floor(Date.now() / 1000);

async function identity(): Promise<{ keys: CryptoKeyPair; publicKey: string; fp: string }> {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const spki = await crypto.subtle.exportKey("spki", keys.publicKey);
  const fp = bytesToBase64url(new Uint8Array(await crypto.subtle.digest("SHA-256", spki)));
  return { keys, publicKey: b64(spki), fp };
}

function codeFor(host: FakeHost, payload: Record<string, unknown>): string {
  const json = JSON.stringify({ v: 1, fp: host.fp, host: host.name, urls: host.urls, rv: host.rv, secret: "", exp: now() + 600, ...payload });
  return "SV1." + bytesToBase64url(utf8(json));
}

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function localAgentsFor(seed: HostSeed, toggles: Toggles): DetectedAgent[] {
  let agents = (seed.agents ?? []).map((agent) => ({ ...agent }));
  if (toggles.w3Foreign) agents = agents.map((a) => a.id === "codex" ? { ...a, registration: "foreign" as const } : a);
  if (toggles.w3ManualCodex) agents = agents.map((a) => a.id === "codex" && a.registration === "not-connected" ? { ...a, connect: "manual" as const,
    manual: { file: "~/.codex/config.toml", snippet: '[mcp_servers.sidevoice]\ncommand = "/Users/ana/.sidevoice/connector/0.4.0/sidevoice"\nargs = ["mcp"]' } } : a);
  if (toggles.w3Dismissed && !agents.some((a) => a.id === "cursor"))
    agents.push({ id: "cursor", label: "Cursor", present: true, version: "1.8.2", registration: "not-connected", connect: "auto", dismissed: true });
  return agents;
}

export async function createFakeHosts(scenario: Scenario, toggles: Toggles, localAgents: DetectedAgent[] | undefined, view: "app" | "browser" | "phone"): Promise<FakeHosts> {
  const byAlias = new Map<string, FakeHost>();
  const spare = await identity();
  const seeds: Record<string, HostSeed> = { ...scenario.hosts };
  if (scenario.bridge?.localHost && !seeds.local) seeds.local = { name: "MacBook de Ana" };
  for (const [alias, seed] of Object.entries(seeds)) {
    const { keys, publicKey, fp } = await identity();
    const isLocal = alias === "local";
    const node = alias + "-node";
    // Seen from a browser, this computer's host is reached through the room like any other.
    const viaRoom = isLocal ? view !== "app" : seed.via !== "direct";
    const direct = "https://" + alias + ".sidevoice.example";
    const host: FakeHost = {
      alias, seed, name: seed.name, fp, publicKey, keys,
      base: isLocal && view === "app" ? LOCAL_BASE : viaRoom ? ROOM_URL + "/nodes/" + node : direct,
      urls: isLocal && view === "app" ? [LOCAL_BASE] : viaRoom ? [] : [direct],
      rv: viaRoom ? { url: ROOM_URL, node } : null,
      agents: isLocal ? localAgentsFor({ ...seed, agents: seed.agents ?? localAgents }, toggles) : (seed.agents ?? []).map((a) => ({ ...a })),
      devices: (seed.devices ?? []).map((d, i) => ({ device_id: d.self ? "self-" + alias : "dev-" + alias + "-" + i, name: d.name, kind: d.kind,
        created_at: now() - d.created_days_ago * 86400, last_seen: d.seen_minutes_ago == null ? null : now() - d.seen_minutes_ago * 60 })),
      providers: Object.fromEntries(Object.keys(PROVIDERS).map((id) => {
        const state = seed.integrations?.[id];
        return [id, { configured: !!state, source: state ? state : null, hint: state ? (id === "openai" ? "x9Qa" : "7f2c") : null }];
      })),
      secrets: new Set(), refused: isLocal && !!scenario.bridge?.localHost?.refused, reachable: seed.reachable !== false,
      routeCalls: new Map(), scannedAt: now() - 120,
    };
    if (!host.devices.some((d) => d.device_id === "self-" + alias) && (isLocal || (scenario.pairings ?? []).some((p) => p.host === alias)))
      host.devices.unshift({ device_id: "self-" + alias, name: isLocal && view === "app" ? "Sidevoice en Mac" : "Sidevoice en Mac", kind: isLocal && view === "app" ? "local" : "code", created_at: now() - 86400 * 5, last_seen: now() });
    byAlias.set(alias, host);
  }

  function byBase(url: string): FakeHost | null {
    for (const host of byAlias.values()) if (url === host.base || url.startsWith(host.base + "/") || url.startsWith(host.base + "?")) return host;
    return null;
  }

  async function answer(host: FakeHost, method: string, path: string, query: URLSearchParams, init: RequestInit | undefined): Promise<Response> {
    const auth = new Headers(init?.headers).get("authorization");
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const route = method + " " + path;
    // A fixture's own answers first, in order.
    const scripted = host.seed.routes?.[route] as RouteAnswer[] | undefined;
    if (scripted?.length) {
      const index = host.routeCalls.get(route) ?? 0;
      host.routeCalls.set(route, index + 1);
      const scripted1 = scripted[Math.min(index, scripted.length - 1)];
      if (!scripted1.default) { await sleep(scripted1.delay_ms ?? 200); return json(scripted1.status ?? 200, scripted1.body); }
    }
    const open = ["GET /api/rendezvous", "GET /api/device/identity", "POST /api/device/pair"].includes(route);
    if (!open && host.refused && host.alias === "local") return json(401, { key: "unauthorized", detail: "unknown device" });
    if (!open && !auth) return json(401, { detail: "no token" });
    switch (true) {
      case route === "GET /api/rendezvous":
        return json(200, { kind: "node", fingerprint: host.fp, api: 3, version: "0.4.0" });
      case route === "GET /api/device/identity": {
        const nonce = query.get("nonce") ?? "";
        const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, host.keys.privateKey, utf8(IDENTITY_PREFIX + nonce) as Uint8Array<ArrayBuffer>);
        return json(200, { public_key: host.publicKey, signature: bytesToBase64url(new Uint8Array(signature)) });
      }
      case route === "POST /api/device/pair": {
        if (!host.secrets.has(body?.secret)) return json(403, { detail: "Ese código no vale: no existe, ya se usó o ha caducado. Pide uno nuevo en la máquina." });
        host.secrets.delete(body.secret);
        const device_id = "dev-" + Math.random().toString(36).slice(2, 8);
        host.devices.push({ device_id, name: body.name || "Sidevoice", kind: "code", created_at: now(), last_seen: now() });
        await sleep(400);
        // The mismatch toggle: something answered for the address, and the key it hands back is not the code's.
        return json(200, { device_id, token: "tok-" + device_id, node: { public_key: toggles.w2rMismatch ? spare.publicKey : host.publicKey, host: host.name } });
      }
      case route === "GET /api/host/agents": {
        if (toggles.w3ScanTimeout) { await sleep(2500); return json(504, { key: "scan-timeout", message: "agents.list timed out after 20 s" }); }
        await sleep(query.get("rescan") ? 700 : 250);
        if (query.get("rescan")) host.scannedAt = now();
        return json(200, { agents: host.agents, scanned_at: host.scannedAt });
      }
      case route.startsWith("POST /api/host/agents/"): {
        const [, , , , id, action] = path.split("/");
        const agent = host.agents.find((a) => a.id === id);
        if (!agent) return json(404, { key: "unknown-agent" });
        await sleep(host.seed.connect_ms ?? 800);
        if (action === "connect" && toggles.w3ConnectFails)
          return json(500, { key: "agent.connect-failed", message: agent.id === "claude" ? "claude mcp add: exit 1 (EACCES ~/.claude.json)" : "exit 1" });
        if (action === "connect") agent.registration = "connected";
        if (action === "disconnect") agent.registration = "not-connected";
        if (action === "dismiss") agent.dismissed = true;
        return json(200, { agent });
      }
      case route === "GET /api/device/devices":
        await sleep(250);
        return json(200, { devices: host.devices });
      case route.startsWith("DELETE /api/device/devices/"): {
        const id = decodeURIComponent(path.split("/").pop() ?? "");
        host.devices = host.devices.filter((d) => d.device_id !== id);
        await sleep(300);
        return json(200, { ok: true });
      }
      case route === "GET /api/presentation/integrations":
        await sleep(300);
        if (toggles.w4IntegrationsFail) return json(500, { detail: "integrations.json unreadable" });
        return json(200, listing(host));
      case route.startsWith("PUT /api/presentation/integrations/"): {
        const id = path.split("/").pop()!;
        await sleep(900);
        if (toggles.w4KeyRefused) return json(400, { detail: PROVIDERS[id].label + " rechazó la clave." });
        host.providers[id] = { configured: true, source: "stored", hint: String(body?.key ?? "").slice(-4) };
        return json(200, listing(host));
      }
      case route.startsWith("DELETE /api/presentation/integrations/"): {
        const id = path.split("/").pop()!;
        host.providers[id] = { configured: false, source: null, hint: null };
        return json(200, listing(host));
      }
      case route === "POST /api/models/check":
        await sleep(600);
        return toggles.w4KeyRefused ? json(400, { key: "provider_key_refused", provider: body?.place }) : json(200, { ok: true });
    }
    return json(404, { detail: "not in the prototype: " + route });
  }

  function listing(host: FakeHost) {
    return { providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, capabilities: p.capabilities,
      configured: host.providers[id].configured, source: host.providers[id].source, hint: host.providers[id].hint, environment: p.environment })) };
  }

  const fakes: FakeHosts = {
    byAlias,
    byBase,
    selfDevice: (alias) => "self-" + alias,
    code(alias, variant = "valid") {
      const host = byAlias.get(alias)!;
      const secret = Math.random().toString(36).slice(2, 12);
      host.secrets.add(secret);
      if (variant === "expired") return codeFor(host, { secret, exp: now() - 60 });
      if (variant === "loopback") return codeFor(host, { secret, urls: ["http://127.0.0.1:8768"], rv: null });
      if (variant === "plaintext") return codeFor(host, { secret, urls: ["http://192.168.1.40:8768"], rv: null });
      return codeFor(host, { secret });
    },
    install() {
      const real = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const host = byBase(url);
        if (!host) return real(input, init);
        const rest = url.slice(host.base.length);
        const [path, search = ""] = rest.split("?");
        const remote = !(host.alias === "local" && host.base === LOCAL_BASE);
        if (remote && (toggles.offline || !host.reachable || (toggles.w2rUnreachable && path === "/api/device/identity"))) {
          await sleep(1200);
          throw new TypeError("Failed to fetch");
        }
        if (remote && toggles.delayedHost) await sleep(3000);
        return answer(host, (init?.method ?? "GET").toUpperCase(), path || "/", new URLSearchParams(search), init);
      };
    },
  };
  return fakes;
}
