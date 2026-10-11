import { expect, test, vi } from "vitest";
import {
  base64ToBytes, bytesToBase64url, machineAddress, candidateBases, decodePairingCode, deviceName, fingerprintOf, firstProven,
  pairingSummary, proveIdentity, projectPairings, readPairingState, readPairings, redeemPairingCode, revokedPairing, secureBase, verifyIdentitySignature,
  withPairing, withoutPairing, writePairings, NO_WEBCRYPTO, PAIRINGS_KEY, type Pairing,
  privateHost, previewPairingCode, PAIRING_HTTP_PRIVATE, PAIRING_HTTP_ONLY, PAIRING_HTTP_BLOCKED,
} from "./device-pairing.js";

// jsdom's window has no WebCrypto of its own; node's is what the tests run on, handed in where it is used.
const subtle = globalThis.crypto.subtle;
const NOW = 1_790_000_000_000;

/** A node as far as pairing can tell: a P-256 key, the answers to identity and pair, and what it was asked. */
async function fakeNode(host = "macbook") {
  const keys = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const spki = new Uint8Array(await subtle.exportKey("spki", keys.publicKey));
  const public_key = Buffer.from(spki).toString("base64");
  const fp = Buffer.from(await subtle.digest("SHA-256", spki)).toString("base64url");
  const sign = async (nonce: string) => Buffer.from(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey,
    new TextEncoder().encode("sidevoice-node-identity:" + nonce))).toString("base64url");
  return { host, public_key, fp, sign, secrets: [] as unknown[], pair: 200 as number };
}
type Node = Awaited<ReturnType<typeof fakeNode>>;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
/** A network: each base answers as its node, anything else does not answer at all. */
function network(bases: Record<string, Node>, asked: string[] = []) {
  return (async (url: string, init?: RequestInit) => {
    asked.push((init?.method || "GET") + " " + url);
    const base = Object.keys(bases).find((prefix) => url.startsWith(prefix + "/api/"));
    if (base == null) throw new TypeError("Failed to fetch");
    const node = bases[base], path = url.slice(base.length);
    if (path.startsWith("/api/device/identity?nonce=")) {
      const nonce = decodeURIComponent(path.split("nonce=")[1]);
      return json(200, { fingerprint: node.fp, public_key: node.public_key, signature: await node.sign(nonce) });
    }
    if (path === "/api/device/pair") {
      node.secrets.push(JSON.parse(String(init?.body)));
      return node.pair === 403 ? json(403, { detail: "Unknown, used or expired pairing code." })
        : json(200, { device_id: "dev-1", token: "tok-1", node: { fingerprint: node.fp, public_key: node.public_key, host: node.host } });
    }
    return json(404, { detail: "no" });
  }) as unknown as typeof fetch;
}
function codeFor(payload: Record<string, unknown>) {
  return "SV1." + Buffer.from(JSON.stringify(payload)).toString("base64url");
}
const payload = (node: { fp: string }, extra: Record<string, unknown> = {}) => ({
  v: 1, fp: node.fp, host: "macbook", urls: ["http://127.0.0.1:8768"], rv: { url: "https://room.example", node: "c-1" },
  secret: "c2VjcmV0LXNlY3JldC0xNg", exp: NOW / 1000 + 600, ...extra,
});

// ----- the code -----
test("a code decodes to what the node put in it, however it was pasted", () => {
  const fp = "A".repeat(43), text = codeFor(payload({ fp }));
  const decoded = decodePairingCode(text, NOW);
  expect(decoded).toEqual({ v: 1, fp, host: "macbook", urls: ["http://127.0.0.1:8768"], rv: { url: "https://room.example", node: "c-1" },
    secret: "c2VjcmV0LXNlY3JldC0xNg", exp: NOW / 1000 + 600 });
  // Wrapped over lines by a terminal, or inside the sentence it was sent in.
  expect(decodePairingCode(text.slice(0, 20) + "\n  " + text.slice(20), NOW)).toEqual(decoded);
  expect(decodePairingCode("Tu código: " + text + " (caduca en 10 min)", NOW)).toEqual(decoded);
  // A node linked with no room, reachable at a public URL too.
  expect(decodePairingCode(codeFor(payload({ fp }, { rv: null, host: null, urls: ["http://127.0.0.1:8768", "https://mac.example/"] })), NOW))
    .toMatchObject({ rv: null, host: null, urls: ["http://127.0.0.1:8768", "https://mac.example"] });
});

test("a code that cannot be used says why, in one sentence the person can act on", () => {
  const fp = "A".repeat(43);
  const why = (code: string) => { try { decodePairingCode(code, NOW); return ""; } catch (error) { return (error as Error).message; } };
  expect(why("   ")).toMatch(/Pega el código/);
  expect(why("123-456")).toMatch(/empieza por «SV1\.»/);
  expect(why("SV1.!!!")).toMatch(/empieza por «SV1\.»/);
  expect(why("SV1.bm90IGpzb24")).toMatch(/incompleto o dañado/);                  // "not json"
  expect(why(codeFor(payload({ fp }, { v: 2 })))).toMatch(/otra versión/);
  expect(why(codeFor({ v: 1, fp, urls: [], rv: null, exp: NOW / 1000 + 60 }))).toMatch(/incompleto o dañado/);  // keys missing
  expect(why(codeFor(payload({ fp: "short" })))).toMatch(/incompleto o dañado/);
  expect(why(codeFor(payload({ fp }, { urls: ["ftp://mac"] })))).toMatch(/incompleto o dañado/);
  expect(why(codeFor(payload({ fp }, { urls: Array.from({ length: 9 }, (_, i) => `https://m${i}.example`) })))).toMatch(/incompleto o dañado/);  // more addresses than a node writes
  expect(why(codeFor(payload({ fp }, { rv: { url: "https://room.example" } })))).toMatch(/incompleto o dañado/);
  expect(why(codeFor(payload({ fp }, { urls: [], rv: null })))).toMatch(/dónde encontrar la máquina/);
  expect(why(codeFor(payload({ fp }, { exp: NOW / 1000 })))).toMatch(/caducó/);
});

test("a code's plain-http addresses off this machine are left out, and a code left with none is refused", () => {
  const fp = "A".repeat(43);
  const decode = (extra: Record<string, unknown>) => decodePairingCode(codeFor(payload({ fp }, extra)), NOW);
  for (const url of ["http://192.168.1.20:8768", "http://mac.lan", "http://node.voice.svc.cluster.local:8768"])
    expect(decode({ urls: ["http://127.0.0.1:8768", url, "https://mac.example"] }).urls, url).toEqual(["http://127.0.0.1:8768", "https://mac.example"]);
  expect(decode({ rv: { url: "http://room.example", node: "c-1" } }).rv).toBeNull();
  expect(() => decode({ urls: ["http://mac.lan:8768"], rv: { url: "http://room.example", node: "c-1" } })).toThrow(/solo lleva a la máquina por http/);
  expect(() => decode({ urls: ["http://mac.lan:8768"], rv: null })).toThrow(/solo lleva a la máquina por http/);
  // Loopback is this same machine: plain http stays.
  for (const url of ["http://127.0.0.1:8768", "http://localhost:8768", "http://[::1]:8768"]) expect(decode({ urls: [url], rv: null }).urls, url).toEqual([url]);
});

test("as it is pasted, a code says whose it is, until when, and whether it says where its machine is from here", () => {
  const fp = "A".repeat(43);
  const preview = (extra: Record<string, unknown>) => previewPairingCode(codeFor(payload({ fp }, extra)), NOW);
  expect(preview({ urls: ["http://127.0.0.1:8768", "https://mac.example:8765"], rv: null }))
    .toEqual({ host: "macbook", exp: NOW / 1000 + 600, reachable: true, plain: [] });
  // A room is a way there; loopback is this machine, not the one the code is for.
  expect(preview({}).reachable).toBe(true);
  expect(preview({ urls: ["http://127.0.0.1:8768"], rv: null, host: null })).toMatchObject({ host: null, reachable: false, plain: [] });
  // Its private addresses over plain http are offered to type (and agree to); a public one, or another network's name, is not.
  expect(preview({ urls: ["http://127.0.0.1:8768", "http://192.168.1.20:8765", "http://mac.lan:8765", "http://203.0.113.5:8765"], rv: null }))
    .toMatchObject({ reachable: false, plain: ["192.168.1.20:8765"] });
  // What cannot be used anywhere is said as when it is redeemed.
  const why = (code: string) => { try { previewPairingCode(code, NOW); return ""; } catch (error) { return (error as Error).message; } };
  expect(why("   ")).toMatch(/Pega el código/);
  expect(why("123-456")).toMatch(/empieza por «SV1\.»/);
  expect(why(codeFor(payload({ fp }, { v: 2 })))).toMatch(/otra versión/);
  expect(why(codeFor(payload({ fp }, { exp: NOW / 1000 })))).toMatch(/caducó/);
  expect(why(codeFor(payload({ fp }, { urls: [], rv: null })))).toBe("");
});

test("a secret or a token goes over https, or plain http to loopback only", () => {
  for (const base of ["https://room.example/nodes/c-1", "http://127.0.0.1:8768", "http://localhost:1", "http://[::1]:8768"])
    expect(secureBase(base), base).toBe(true);
  for (const base of ["http://10.0.0.5:8768", "http://127.0.0.1.attacker.net", "ws://room.example", "ftp://x", "", "nonsense"])
    expect(secureBase(base), base).toBe(false);
  // A relative base is on the page's origin.
  expect(secureBase("/nodes/c-1", "https://room.example")).toBe(true);
  expect(secureBase("", "http://localhost:5173")).toBe(true);
  expect(secureBase("/nodes/c-1", "http://room.example")).toBe(false);
  expect(secureBase("/nodes/c-1")).toBe(false);
});

// ----- bytes, fingerprint, signature -----
test("base64url round-trips any bytes, and standard base64 (a public key) reads too", () => {
  for (const length of [0, 1, 2, 3, 31, 32, 33, 91]) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    expect(bytesToBase64url(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
    expect([...base64ToBytes(bytesToBase64url(bytes))]).toEqual([...bytes]);
    expect([...base64ToBytes(Buffer.from(bytes).toString("base64"))]).toEqual([...bytes]);
  }
  expect(() => base64ToBytes("a")).toThrow();
  expect(() => base64ToBytes("ab$c")).toThrow();
});

test("a fingerprint is base64url, unpadded, of the SHA-256 of the key's DER", async () => {
  expect(await fingerprintOf(new TextEncoder().encode("abc"), subtle)).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
  const node = await fakeNode();
  expect(await fingerprintOf(base64ToBytes(node.public_key), subtle)).toBe(node.fp);
  expect(node.fp).toHaveLength(43);
});

test("an identity signature verifies with the node's key, and with nothing else", async () => {
  const node = await fakeNode(), other = await fakeNode();
  const signature = await node.sign("nonce-1");
  expect(await verifyIdentitySignature({ publicKey: node.public_key, nonce: "nonce-1", signature }, subtle)).toBe(true);
  expect(await verifyIdentitySignature({ publicKey: node.public_key, nonce: "nonce-2", signature }, subtle)).toBe(false);
  expect(await verifyIdentitySignature({ publicKey: other.public_key, nonce: "nonce-1", signature }, subtle)).toBe(false);
  expect(await verifyIdentitySignature({ publicKey: "not a key", nonce: "nonce-1", signature }, subtle)).toBe(false);
  expect(await verifyIdentitySignature({ publicKey: node.public_key, nonce: "nonce-1", signature: "AAAA" }, subtle)).toBe(false);
  // With none handed in, the page's own WebCrypto is the one used.
  expect(await verifyIdentitySignature({ publicKey: node.public_key, nonce: "nonce-1", signature })).toBe(true);
});

test("a page without WebCrypto (not https) cannot check anything, and says so rather than trusting", async () => {
  vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes });
  try {
    await expect(fingerprintOf(new Uint8Array(1))).rejects.toThrow(NO_WEBCRYPTO);
    await expect(verifyIdentitySignature({ publicKey: "k", nonce: "n", signature: "s" })).rejects.toThrow(NO_WEBCRYPTO);
    await expect(firstProven([{ base: "http://a", via: "direct" }], { fp: "f", public_key: "k" }, { get: network({}) })).rejects.toThrow(NO_WEBCRYPTO);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("an address proves it is the pinned node, or it is not used", async () => {
  const node = await fakeNode(), squatter = await fakeNode("squatter");
  const get = network({ "http://127.0.0.1:8768": node, "https://room.example/nodes/c-1": squatter });
  const pinned = { fp: node.fp, public_key: node.public_key };
  expect(await proveIdentity("http://127.0.0.1:8768", pinned, { get, subtle })).toMatchObject({ ok: true });
  expect(await proveIdentity("https://room.example/nodes/c-1", pinned, { get, subtle })).toEqual({ ok: false, reason: "impostor" });
  expect(await proveIdentity("http://gone:1", pinned, { get, subtle })).toEqual({ ok: false, reason: "unreachable" });
  // With only a code's fingerprint, the key offered must hash to it before its signature counts.
  expect(await proveIdentity("http://127.0.0.1:8768", { fp: node.fp }, { get, subtle })).toEqual({ ok: true, publicKey: node.public_key });
  expect(await proveIdentity("https://room.example/nodes/c-1", { fp: node.fp }, { get, subtle })).toEqual({ ok: false, reason: "impostor" });
  // An address that never answers costs its timeout, not the page.
  const hangs = (() => new Promise(() => {})) as unknown as typeof fetch;
  expect(await proveIdentity("http://slow:1", pinned, { get: hangs, subtle, timeoutMs: 5 })).toEqual({ ok: false, reason: "unreachable" });
});

// ----- where a pairing is reached -----
test("candidate addresses follow the contract's order: the target if it is that node or a room, each URL, then the node's room", () => {
  const pairing = { fp: "fp-1", urls: ["http://127.0.0.1:8768", "https://mac.example"], rv: { url: "https://room.example", node: "c/1" } };
  expect(candidateBases(pairing)).toEqual([
    { base: "http://127.0.0.1:8768", via: "direct" }, { base: "https://mac.example", via: "direct" }, { base: "https://room.example/nodes/c%2F1", via: "room" }]);
  // The target is that node: first.
  expect(candidateBases(pairing, { target: "https://node.example:8768", about: { kind: "node", fingerprint: "fp-1" } })[0]).toEqual({ base: "https://node.example:8768", via: "direct" });
  // Another node is not a candidate at all.
  expect(candidateBases(pairing, { target: "https://node.example:8768", about: { kind: "node", fingerprint: "fp-2" } })).toHaveLength(3);
  // Plain http off this machine is no candidate, whoever names it: the target, the pairing, the page's own origin.
  expect(candidateBases(pairing, { target: "http://10.0.0.5:8768", about: { kind: "node", fingerprint: "fp-1" } })).toHaveLength(3);
  expect(candidateBases({ ...pairing, urls: ["http://mac.lan:8768", ...pairing.urls], rv: { url: "http://room.lan", node: "c/1" } }).map((c) => c.base))
    .toEqual(["http://127.0.0.1:8768", "https://mac.example"]);
  expect(candidateBases(pairing, { target: "", about: { kind: "room" }, origin: "http://room.lan" }).map((c) => c.base))
    .toEqual(["http://127.0.0.1:8768", "https://mac.example", "https://room.example/nodes/c%2F1"]);
  // A room: its relay to this node, first; the same room named twice is asked once.
  expect(candidateBases(pairing, { target: "https://other-room.example", about: { kind: "room" } })[0]).toEqual({ base: "https://other-room.example/nodes/c%2F1", via: "room" });
  expect(candidateBases(pairing, { target: "", about: { kind: "room" }, origin: "https://room.example" }).map((c) => c.base))
    .toEqual(["/nodes/c%2F1", "http://127.0.0.1:8768", "https://mac.example"]);
  // A node linked with no room is reached directly or not at all, whatever the target is.
  expect(candidateBases({ ...pairing, rv: null }, { target: "https://room.example", about: { kind: "room" } }).map((c) => c.via)).toEqual(["direct", "direct"]);
});

test("the first candidate in order that proves itself wins, all of them asked at once", async () => {
  const node = await fakeNode();
  const asked: string[] = [];
  const get = network({ "http://127.0.0.1:8768": node, "https://room.example/nodes/c-1": node }, asked);
  const candidates = [{ base: "https://gone:1", via: "direct" as const }, { base: "http://127.0.0.1:8768", via: "direct" as const }, { base: "https://room.example/nodes/c-1", via: "room" as const }];
  expect(await firstProven(candidates, node, { get, subtle })).toMatchObject({ base: "http://127.0.0.1:8768", via: "direct" });
  expect(asked.filter((line) => line.includes("/identity")).length).toBe(3);
  expect(await firstProven([candidates[0]], node, { get, subtle })).toBeNull();
  // Order decides, not speed: a first address slower than the second still wins when it proves itself.
  const slow = (async (url: string, init?: RequestInit) => {
    if (url.startsWith("http://127.0.0.1:8768")) await new Promise((resolve) => setTimeout(resolve, 20));
    return get(url, init);
  }) as unknown as typeof fetch;
  expect(await firstProven(candidates.slice(1), node, { get: slow, subtle })).toMatchObject({ via: "direct" });
});

// ----- redeeming -----
test("redeeming: the secret goes only where the code's node proved itself, and the token is kept only for that key", async () => {
  const node = await fakeNode(), squatter = await fakeNode("squatter");
  // The loopback URL is somebody else's; the node is behind its room.
  const get = network({ "http://127.0.0.1:8768": squatter, "https://room.example/nodes/c-1": node });
  const { pairing, base } = await redeemPairingCode(codeFor(payload(node)), { name: "Mi portátil", get, subtle, now: NOW });
  expect(squatter.secrets).toEqual([]);
  expect(node.secrets).toEqual([{ secret: "c2VjcmV0LXNlY3JldC0xNg", name: "Mi portátil" }]);
  expect(base).toMatchObject({ base: "https://room.example/nodes/c-1", via: "room" });
  expect(pairing).toEqual({ fp: node.fp, public_key: node.public_key, host: "macbook", urls: ["http://127.0.0.1:8768"],
    rv: { url: "https://room.example", node: "c-1" }, device_id: "dev-1", token: "tok-1", paired_at: NOW / 1000 });
});

test("a typed address is https unless it says otherwise, and plain http only for this computer", () => {
  const why = (text: string) => { try { return machineAddress(text); } catch (error) { return (error as Error).message; } };
  expect(why("")).toBeNull();
  expect(why(" 192.168.1.20:8765 ")).toBe("https://192.168.1.20:8765");
  expect(why("https://mac.example/")).toBe("https://mac.example");
  expect(why("http://127.0.0.1:8768")).toBe("http://127.0.0.1:8768");
  expect(why("http://192.168.1.20:8765")).toBe("address-insecure");
  expect(why("not an address at all")).toBe("address-invalid");
});

test("redeeming at a typed address: proven there first, the secret goes there, and the pairing keeps it", async () => {
  const node = await fakeNode();
  const get = network({ "https://192.168.1.20:8765": node });
  // A code that only names this computer's loopback: from another device, only the typed address reaches the node.
  const { pairing, base } = await redeemPairingCode(codeFor(payload(node, { rv: null })), { address: "192.168.1.20:8765", get, subtle, now: NOW });
  expect(base).toMatchObject({ base: "https://192.168.1.20:8765", via: "direct" });
  expect(node.secrets).toHaveLength(1);
  expect(pairing.urls).toEqual(["https://192.168.1.20:8765", "http://127.0.0.1:8768"]);
});

test("redeeming follows no redirect: neither the proof nor the secret goes anywhere a redirect points", async () => {
  const node = await fakeNode(), seen: { url: string; redirect?: RequestRedirect }[] = [];
  const base = network({ "http://127.0.0.1:8768": node });
  const get = (async (url: string, init?: RequestInit) => { seen.push({ url, redirect: init?.redirect }); return base(url, init); }) as unknown as typeof fetch;
  await redeemPairingCode(codeFor(payload(node, { rv: null })), { get, subtle, now: NOW });
  expect(seen.map((request) => request.url.split("?")[0])).toEqual(["http://127.0.0.1:8768/api/device/identity", "http://127.0.0.1:8768/api/device/pair"]);
  expect(seen.map((request) => request.redirect)).toEqual(["error", "error"]);
});

test("redeeming fails with the sentence the person needs: used code, wrong machine, nobody there", async () => {
  const node = await fakeNode();
  node.pair = 403;
  const used = redeemPairingCode(codeFor(payload(node)), { get: network({ "http://127.0.0.1:8768": node }), subtle, now: NOW });
  await expect(used).rejects.toThrow("Unknown, used or expired pairing code.");
  // Nothing answers anywhere the code names.
  await expect(redeemPairingCode(codeFor(payload(node)), { get: network({}), subtle, now: NOW })).rejects.toThrow(/No se pudo llegar a «macbook»/);
  // An expired code never leaves the page.
  const asked: string[] = [];
  await expect(redeemPairingCode(codeFor(payload(node, { exp: NOW / 1000 - 1 })), { get: network({ "http://127.0.0.1:8768": node }, asked), subtle, now: NOW })).rejects.toThrow(/caducó/);
  expect(asked).toEqual([]);
});

test("a pair answer whose key is not the code's is not kept", async () => {
  const node = await fakeNode(), other = await fakeNode();
  const base = network({ "http://127.0.0.1:8768": node });
  // The identity is right, the pairing answer hands back another key (a relay rewriting it, say).
  const get = (async (url: string, init?: RequestInit) => url.endsWith("/api/device/pair")
    ? json(200, { device_id: "dev-1", token: "tok-1", node: { public_key: other.public_key, host: "macbook" } }) : base(url, init)) as unknown as typeof fetch;
  await expect(redeemPairingCode(codeFor(payload(node)), { get, subtle, now: NOW })).rejects.toThrow(/no es la del código/);
});

// ----- the pairings this device keeps -----
const pairing = (fp: string, extra: Partial<Pairing> = {}): Pairing => ({ fp, public_key: "pk-" + fp, host: fp + "-host", urls: [], rv: null,
  device_id: "d-" + fp, token: "t-" + fp, paired_at: 1, ...extra });

test("several pairings, all of them kept across reloads, newest first", () => {
  const saved: Record<string, string> = {};
  const storage = { getItem: (key: string) => saved[key] ?? null, setItem: (key: string, value: string) => { saved[key] = value; } };
  expect(readPairings(storage)).toEqual({ list: [] });
  let book = withPairing(readPairings(storage), pairing("a"));
  book = withPairing(book, pairing("b"));
  expect(book.list.map((p) => p.fp)).toEqual(["b", "a"]);
  // Pairing the same machine again replaces it, and a revoked one comes back to life that way.
  book = revokedPairing(book, "a");
  expect(book.list.find((p) => p.fp === "a")?.revoked).toBe(true);
  book = withPairing(book, pairing("a", { token: "t-new" }));
  expect(book.list.map((p) => [p.fp, p.token, !!p.revoked])).toEqual([["a", "t-new", false], ["b", "t-b", false]]);
  writePairings(storage, book);
  expect(readPairings(storage)).toEqual(book);
  // No machine is "the one in use": nothing of the kind is stored.
  expect(JSON.parse(saved[PAIRINGS_KEY])).not.toHaveProperty("in_use");
  book = withoutPairing(book, "b");
  expect(book.list.map((p) => p.fp)).toEqual(["a"]);
  expect(withoutPairing(book, "a")).toEqual({ list: [] });
  // What storage cannot give back is no pairing, and the interface never sees a token.
  saved[PAIRINGS_KEY] = JSON.stringify({ pairings: [{ fp: "x" }, pairing("y")] });
  expect(readPairings(storage)).toEqual({ list: [pairing("y")] });
  saved[PAIRINGS_KEY] = "{not json";
  expect(readPairings(storage)).toEqual({ list: [] });
  expect(readPairings(null)).toEqual({ list: [] });
  expect(JSON.stringify(pairingSummary(pairing("z")))).not.toMatch(/t-z|pk-z/);
});

test("the local host is projected first and its proxy credential never reaches page storage", () => {
  const saved: Record<string, string> = {
    [PAIRINGS_KEY]: JSON.stringify({ pairings: [pairing("remote-fp")] }),
  };
  const storage = { getItem: (key: string) => saved[key] ?? null, setItem: (key: string, value: string) => { saved[key] = value; } };
  const local = pairing("local-fp", { local: true, host: "Mac", token: "session-secret", urls: ["http://127.0.0.1:40000"], rv: null });
  const stored = readPairingState(storage);
  expect(stored.list.map((item) => item.fp)).toEqual(["remote-fp"]);
  const projected = projectPairings(stored, local);
  expect(projected.list.map((item) => item.fp)).toEqual(["local-fp", "remote-fp"]);
  writePairings(storage, projected);
  const persisted = JSON.parse(saved[PAIRINGS_KEY]);
  expect(persisted.pairings.map((item: Pairing) => item.fp)).toEqual(["remote-fp"]);
  expect(JSON.stringify(persisted)).not.toContain("session-secret");
});

test("a bridge-owned local host wins over a duplicate stored code pairing", () => {
  const duplicate = pairing("same-fp", { device_id: "old-code-device", token: "old-token" });
  const local = pairing("same-fp", { local: true, device_id: "native-local-device", token: "native-proxy-secret" });
  const projected = projectPairings({ list: [duplicate, pairing("remote-fp")] }, local);
  expect(projected.list.map((item) => item.device_id)).toEqual(["native-local-device", "d-remote-fp"]);
});

test("a device names itself after what it is, unless the person says otherwise", () => {
  // "{browser} on {system}"; a browser it can't tell is a Browser; nothing to tell, Sidevoice.
  expect(deviceName({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" })).toBe("Safari on iPhone");
  expect(deviceName({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", platform: "MacIntel" })).toBe("Chrome on Mac");
  expect(deviceName({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0" })).toBe("Edge on Windows");
  expect(deviceName({ userAgent: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0" })).toBe("Firefox on Android");
  expect(deviceName({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe("Browser on iPhone");
  expect(deviceName({ userAgent: "", userAgentData: { platform: "Windows" } })).toBe("Browser on Windows");
  expect(deviceName({})).toBe("Sidevoice");
});

// ----- plain http, on a private network, by consent -----
test("private-network hosts are told from public ones", () => {
  for (const host of ["10.0.0.5", "10.255.255.255", "172.16.0.1", "172.31.255.254", "192.168.1.20", "100.64.0.1", "100.127.255.255",
    "127.0.0.1", "localhost", "::1", "[::1]", "fd12:3456::1", "fc00::1", "mac-mini.local", "nuc.local."])
    expect(privateHost(host), host).toBe(true);
  for (const host of ["8.8.8.8", "172.15.0.1", "172.32.0.1", "192.169.1.1", "100.63.0.1", "100.128.0.1", "11.0.0.1", "300.1.1.1",
    "example.com", "local", "evil.local.example.com", "2001:db8::1", "fe80::1", ""])
    expect(privateHost(host), host).toBe(false);
});

test("plain http goes to a private address only for a pairing the person agreed to keep unencrypted", () => {
  expect(secureBase("http://192.168.1.20:8765")).toBe(false);
  expect(secureBase("http://192.168.1.20:8765", "", { insecure: true })).toBe(true);
  expect(secureBase("http://203.0.113.5:8765", "", { insecure: true })).toBe(false);
  const pairing = { fp: "x", urls: ["http://192.168.1.20:8765", "https://nuc.example"], rv: null };
  expect(candidateBases(pairing).map((c) => c.base)).toEqual(["https://nuc.example"]);
  expect(candidateBases({ ...pairing, insecure: true }).map((c) => c.base)).toEqual(["http://192.168.1.20:8765", "https://nuc.example"]);
});

test("a private machine answering only over http is asked about, then paired unencrypted with consent and marked so", async () => {
  const node = await fakeNode("nuc");
  const code = codeFor(payload(node, { urls: [], rv: null }));
  const get = network({ "http://192.168.1.20:8765": node });
  // Without consent: it says so, and nothing is sent.
  await expect(redeemPairingCode(code, { address: "192.168.1.20:8765", get, subtle, now: NOW, origin: "http://localhost:5173" }))
    .rejects.toThrow(PAIRING_HTTP_PRIVATE);
  expect(node.secrets).toEqual([]);
  // With it: paired over http, and the pairing says it is not encrypted.
  const { pairing, base } = await redeemPairingCode(code, { address: "192.168.1.20:8765", get, subtle, now: NOW, origin: "http://localhost:5173", insecure: true });
  expect(base.base).toBe("http://192.168.1.20:8765");
  expect(pairing.insecure).toBe(true);
  expect(pairingSummary(pairing).insecure).toBe(true);
});

test("a public machine answering only over http is refused, consent or not; an https page is told where it can work", async () => {
  const node = await fakeNode("vps");
  const code = codeFor(payload(node, { urls: [], rv: null }));
  const get = network({ "http://203.0.113.5:8765": node });
  await expect(redeemPairingCode(code, { address: "203.0.113.5:8765", get, subtle, now: NOW, origin: "http://localhost:5173" })).rejects.toThrow(PAIRING_HTTP_ONLY);
  await expect(redeemPairingCode(code, { address: "203.0.113.5:8765", get, subtle, now: NOW, origin: "http://localhost:5173", insecure: true })).rejects.toThrow();
  expect(node.secrets).toEqual([]);
  const local = await fakeNode("nuc");
  await expect(redeemPairingCode(codeFor(payload(local, { urls: [], rv: null })), { address: "192.168.1.20:8765", get: network({}), subtle, now: NOW, origin: "https://room.example" }))
    .rejects.toThrow(PAIRING_HTTP_BLOCKED);
});
