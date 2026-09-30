import { expect, test, vi } from "vitest";
import {
  base64ToBytes, bytesToBase64url, candidateBases, decodePairingCode, deviceName, fingerprintOf, firstProven, pairingInUse,
  pairingSummary, proveIdentity, readPairings, redeemPairingCode, revokedPairing, usingPairing, verifyIdentitySignature,
  withPairing, withoutPairing, writePairings, NO_WEBCRYPTO, PAIRINGS_KEY, type Pairing,
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
      return json(200, { fingerprint: node.fp, public_key: node.public_key, host: node.host, signature: await node.sign(nonce) });
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
  expect(why(codeFor(payload({ fp }, { rv: { url: "https://room.example" } })))).toMatch(/incompleto o dañado/);
  expect(why(codeFor(payload({ fp }, { urls: [], rv: null })))).toMatch(/dónde encontrar la máquina/);
  expect(why(codeFor(payload({ fp }, { exp: NOW / 1000 })))).toMatch(/caducó/);
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
  expect(candidateBases(pairing, { target: "http://10.0.0.5:8768", about: { kind: "node", fingerprint: "fp-1" } })[0]).toEqual({ base: "http://10.0.0.5:8768", via: "direct" });
  // Another node is not a candidate at all.
  expect(candidateBases(pairing, { target: "http://10.0.0.5:8768", about: { kind: "node", fingerprint: "fp-2" } })).toHaveLength(3);
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
  const candidates = [{ base: "http://gone:1", via: "direct" as const }, { base: "http://127.0.0.1:8768", via: "direct" as const }, { base: "https://room.example/nodes/c-1", via: "room" as const }];
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

test("several pairings, one in use, remembered across reloads", () => {
  const saved: Record<string, string> = {};
  const storage = { getItem: (key: string) => saved[key] ?? null, setItem: (key: string, value: string) => { saved[key] = value; } };
  expect(readPairings(storage)).toEqual({ inUse: null, list: [] });
  let book = withPairing(readPairings(storage), pairing("a"));
  book = withPairing(book, pairing("b"));
  expect(book.inUse).toBe("b");
  expect(book.list.map((p) => p.fp)).toEqual(["b", "a"]);
  // Paired during a call, the new one waits to be chosen.
  expect(withPairing(book, pairing("c"), { use: false }).inUse).toBe("b");
  // Pairing the same machine again replaces it, and a revoked one comes back to life that way.
  book = revokedPairing(book, "a");
  expect(book.list.find((p) => p.fp === "a")?.revoked).toBe(true);
  book = withPairing(book, pairing("a", { token: "t-new" }));
  expect(book.list.map((p) => [p.fp, p.token, !!p.revoked])).toEqual([["a", "t-new", false], ["b", "t-b", false]]);
  book = usingPairing(book, "b");
  expect(pairingInUse(book)?.fp).toBe("b");
  expect(usingPairing(book, "nobody")).toBe(book);
  writePairings(storage, book);
  expect(readPairings(storage)).toEqual(book);
  // Forgetting the one in use hands the use to the newest one left; forgetting the last leaves none.
  book = withoutPairing(book, "b");
  expect(book).toMatchObject({ inUse: "a" });
  expect(withoutPairing(book, "a")).toEqual({ inUse: null, list: [] });
  // What storage cannot give back is no pairing, and the interface never sees a token.
  saved[PAIRINGS_KEY] = JSON.stringify({ in_use: "x", pairings: [{ fp: "x" }, pairing("y")] });
  expect(readPairings(storage)).toEqual({ inUse: "y", list: [pairing("y")] });
  saved[PAIRINGS_KEY] = "{not json";
  expect(readPairings(storage)).toEqual({ inUse: null, list: [] });
  expect(readPairings(null)).toEqual({ inUse: null, list: [] });
  expect(JSON.stringify(pairingSummary(pairing("z")))).not.toMatch(/t-z|pk-z/);
});

test("a device names itself after what it is, unless the person says otherwise", () => {
  expect(deviceName({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe("Sidevoice en iPhone");
  expect(deviceName({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" })).toBe("Sidevoice en Mac");
  expect(deviceName({ userAgent: "Mozilla/5.0 (Linux; Android 14)" })).toBe("Sidevoice en Android");
  expect(deviceName({ userAgent: "", userAgentData: { platform: "Windows" } })).toBe("Sidevoice en Windows");
  expect(deviceName({})).toBe("Sidevoice");
});
