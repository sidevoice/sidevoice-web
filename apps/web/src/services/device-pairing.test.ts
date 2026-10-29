import { expect, test, vi } from "vitest";
import {
  base64ToBytes, bytesToBase64url, machineAddress, candidateBases, decodePairingCode, deviceName, fingerprintOf, firstProven,
  pairingSummary, proveIdentity, projectPairings, readPairingState, readPairings, redeemPairingCode, revokedPairing, secureBase, verifyIdentitySignature,
  withPairing, withoutPairing, writePairings, NO_WEBCRYPTO, PAIRINGS_KEY, type Pairing,
  listeningPort, privateHost, previewPairingCode, PAIRING_HTTP_PRIVATE, PAIRING_HTTP_ONLY, PAIRING_HTTP_BLOCKED,
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
  v: 1, fp: node.fp, host: "macbook", urls: ["http://127.0.0.1:8768"],
  secret: "c2VjcmV0LXNlY3JldC0xNg", exp: NOW / 1000 + 600, ...extra,
});

// ----- the code -----
test("a code decodes to what the node put in it, however it was pasted", () => {
  const fp = "A".repeat(43), text = codeFor(payload({ fp }));
  const decoded = decodePairingCode(text, NOW);
  expect(decoded).toEqual({ v: 1, fp, host: "macbook", urls: ["http://127.0.0.1:8768"],
    secret: "c2VjcmV0LXNlY3JldC0xNg", exp: NOW / 1000 + 600 });
  // Wrapped over lines by a terminal, or inside the sentence it was sent in.
  expect(decodePairingCode(text.slice(0, 20) + "\n  " + text.slice(20), NOW)).toEqual(decoded);
  expect(decodePairingCode("Tu código: " + text + " (caduca en 10 min)", NOW)).toEqual(decoded);
  // Reachable at a public URL too.
  expect(decodePairingCode(codeFor(payload({ fp }, { host: null, urls: ["http://127.0.0.1:8768", "https://mac.example/"] })), NOW))
    .toMatchObject({ host: null, urls: ["http://127.0.0.1:8768", "https://mac.example"] });
});

test("a code that cannot be used says why, in one sentence the person can act on", () => {
  const fp = "A".repeat(43);
  const why = (code: string) => { try { decodePairingCode(code, NOW); return ""; } catch (error) { return (error as Error).message; } };
  expect(why("   ")).toMatch(/Pega el código/);
  expect(why("123-456")).toMatch(/empieza por «SV1\.»/);
  expect(why("SV1.!!!")).toMatch(/empieza por «SV1\.»/);
  expect(why("SV1.bm90IGpzb24")).toMatch(/incompleto o dañado/);                  // "not json"
  expect(why(codeFor(payload({ fp }, { v: 2 })))).toMatch(/otra versión/);
  expect(why(codeFor({ v: 1, fp, urls: [], exp: NOW / 1000 + 60 }))).toMatch(/incompleto o dañado/);  // keys missing
  expect(why(codeFor(payload({ fp: "short" })))).toMatch(/incompleto o dañado/);
  expect(why(codeFor(payload({ fp }, { secret: 42 })))).toMatch(/incompleto o dañado/);
  expect(why(codeFor(payload({ fp }, { exp: "soon" })))).toMatch(/incompleto o dañado/);
  expect(why(codeFor(payload({ fp }, { urls: [] })))).toMatch(/dónde encontrar la máquina/);
  expect(why(codeFor(payload({ fp }, { exp: NOW / 1000 })))).toMatch(/caducó/);
});

// ----- a code from another version of the node (sidevoice-core#112) -----
test("a code from a newer node is read: fields this version does not know are ignored, optional ones may be missing", () => {
  const fp = "A".repeat(43);
  const decode = (code: Record<string, unknown>) => decodePairingCode(codeFor(code), NOW);
  const newer = { ...payload({ fp }), caps: ["relay-v2"], issued_by: { kind: "node", build: "9.9.9" } };
  expect(decode(newer)).toEqual({ v: 1, fp, host: "macbook", urls: ["http://127.0.0.1:8768"],
    secret: "c2VjcmV0LXNlY3JldC0xNg", exp: NOW / 1000 + 600 });
  // No name is none, not a damaged code; no addresses is a code that says nowhere to go.
  const { host: _host, ...noName } = payload({ fp });
  expect(decode(noName)).toMatchObject({ host: null, urls: ["http://127.0.0.1:8768"] });
  const { urls: _urls, ...noUrls } = payload({ fp });
  expect(() => decode(noUrls)).toThrow(/dónde encontrar la máquina/);
  // A name of a shape this version does not know is no name.
  expect(decode(payload({ fp }, { host: { short: "mac" } })).host).toBeNull();
});

test("an address in a code that cannot be used is left out, and the code keeps the ones that can", () => {
  const fp = "A".repeat(43);
  const decode = (extra: Record<string, unknown>) => decodePairingCode(codeFor(payload({ fp }, extra)), NOW);
  // Not http(s), not a URL, not a string: skipped, the usable address kept in its place in the list.
  expect(decode({ urls: ["ftp://mac", "https://mac.example/", 42, null, { url: "https://x" }, "nonsense"] }).urls).toEqual(["https://mac.example"]);
  // More addresses than a node writes: the first ones are probed, not the code refused.
  const many = Array.from({ length: 12 }, (_, i) => `https://m${i}.example`);
  expect(decode({ urls: many }).urls).toEqual(many.slice(0, 8));
  // Counted among the usable ones: the plain-http addresses left out do not use up the list.
  expect(decode({ urls: [...Array.from({ length: 8 }, (_, i) => `http://10.0.0.${i + 1}:8768`), "https://mac.example"] }).urls).toEqual(["https://mac.example"]);
  // Previewed the same way.
  expect(previewPairingCode(codeFor(payload({ fp }, { urls: ["ftp://mac", "https://mac.example"] })), NOW))
    .toMatchObject({ reachable: true, plain: [] });
  expect(previewPairingCode(codeFor(payload({ fp }, { urls: many })), NOW)).toMatchObject({ reachable: true });
});

test("a code none of whose addresses can be used says it does not say where the machine is", () => {
  const fp = "A".repeat(43);
  const why = (extra: Record<string, unknown>) => { try { decodePairingCode(codeFor(payload({ fp }, extra)), NOW); return ""; } catch (error) { return (error as Error & { code: string }).code; } };
  for (const extra of [{ urls: ["ftp://mac", "nonsense", 42] }, { urls: "https://mac.example" }])
    expect(why(extra), JSON.stringify(extra)).toBe("code-no-address");
  // As before: a typed address is where it is.
  expect(decodePairingCode(codeFor(payload({ fp }, { urls: ["ftp://mac"] })), NOW, { address: "https://mac.example" })).toMatchObject({ urls: [] });
});

test("a code of another version is still refused: `v` is the one deliberate breaking change", () => {
  const fp = "A".repeat(43);
  const why = (code: Record<string, unknown>) => { try { decodePairingCode(codeFor(code), NOW); return ""; } catch (error) { return (error as Error & { code: string }).code; } };
  for (const v of [2, 0, "1", null, 1.5]) expect(why(payload({ fp }, { v })), String(v)).toBe("code-version");
  const { v: _v, ...unversioned } = payload({ fp });
  expect(why(unversioned)).toBe("code-version");
  // Whatever else it carries, a newer field included.
  expect(why(payload({ fp }, { v: 2, caps: ["relay-v2"] }))).toBe("code-version");
  expect(() => previewPairingCode(codeFor(payload({ fp }, { v: 2 })), NOW)).toThrow(/otra versión/);
});

test("a code with one unusable address and one usable pairs through the usable one, and nothing goes to the other", async () => {
  const node = await fakeNode(), asked: string[] = [];
  const get = network({ "https://mac.example": node }, asked);
  const code = codeFor(payload(node, { urls: ["ftp://mac.example", "https://mac.example", "mailto:x@y"], caps: ["relay-v2"] }));
  const { pairing, base } = await redeemPairingCode(code, { get, subtle, now: NOW });
  expect(base).toMatchObject({ base: "https://mac.example", via: "direct" });
  expect(pairing).toMatchObject({ fp: node.fp, urls: ["https://mac.example"], token: "tok-1" });
  expect(node.secrets).toHaveLength(1);
  expect(asked.every((url) => / https:\/\/mac\.example\/api\//.test(url))).toBe(true);
});

test("a code's plain-http addresses off this machine are left out, and a code left with none is refused", () => {
  const fp = "A".repeat(43);
  const decode = (extra: Record<string, unknown>) => decodePairingCode(codeFor(payload({ fp }, extra)), NOW);
  for (const url of ["http://192.168.1.20:8768", "http://mac.lan", "http://node.voice.svc.cluster.local:8768"])
    expect(decode({ urls: ["http://127.0.0.1:8768", url, "https://mac.example"] }).urls, url).toEqual(["http://127.0.0.1:8768", "https://mac.example"]);
  expect(() => decode({ urls: ["http://mac.lan:8768"] })).toThrow(/solo lleva a la máquina por http/);
  // Loopback is this same machine: plain http stays.
  for (const url of ["http://127.0.0.1:8768", "http://localhost:8768", "http://[::1]:8768"]) expect(decode({ urls: [url] }).urls, url).toEqual([url]);
});

test("as it is pasted, a code says whose it is, until when, and whether it says where its machine is from here", () => {
  const fp = "A".repeat(43);
  const preview = (extra: Record<string, unknown>) => previewPairingCode(codeFor(payload({ fp }, extra)), NOW);
  expect(preview({ urls: ["http://127.0.0.1:8768", "https://mac.example:8768"] }))
    .toEqual({ host: "macbook", exp: NOW / 1000 + 600, reachable: true, plain: [] });
  expect(preview({ urls: ["http://127.0.0.1:8768"], host: null })).toMatchObject({ host: null, reachable: false, plain: [] });
  // Its private addresses over plain http are offered to type (and agree to); a public one, or another network's name, is not.
  expect(preview({ urls: ["http://127.0.0.1:8768", "http://192.168.1.20:8768", "http://mac.lan:8768", "http://203.0.113.5:8768"] }))
    .toMatchObject({ reachable: false, plain: ["192.168.1.20:8768"] });
  // What cannot be used anywhere is said as when it is redeemed.
  const why = (code: string) => { try { previewPairingCode(code, NOW); return ""; } catch (error) { return (error as Error).message; } };
  expect(why("   ")).toMatch(/Pega el código/);
  expect(why("123-456")).toMatch(/empieza por «SV1\.»/);
  expect(why(codeFor(payload({ fp }, { v: 2 })))).toMatch(/otra versión/);
  expect(why(codeFor(payload({ fp }, { exp: NOW / 1000 })))).toMatch(/caducó/);
  expect(why(codeFor(payload({ fp }, { urls: [] })))).toBe("");
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
test("candidate addresses follow the contract's order: the target if it is that node, then each URL", () => {
  const pairing = { fp: "fp-1", urls: ["http://127.0.0.1:8768", "https://mac.example"] };
  expect(candidateBases(pairing)).toEqual([
    { base: "http://127.0.0.1:8768", via: "direct" }, { base: "https://mac.example", via: "direct" }]);
  // The target is that node: first.
  expect(candidateBases(pairing, { target: "https://node.example:8768", about: { kind: "node", fingerprint: "fp-1" } })[0]).toEqual({ base: "https://node.example:8768", via: "direct" });
  // Another node is not a candidate at all.
  expect(candidateBases(pairing, { target: "https://node.example:8768", about: { kind: "node", fingerprint: "fp-2" } })).toHaveLength(2);
  // A server of a kind this version does not know (core#112) that says it is this node: first too, to prove itself;
  // one that says nothing of a fingerprint, or another's, is not a candidate.
  expect(candidateBases(pairing, { target: "https://node.example:8768", about: { kind: "unknown", fingerprint: "fp-1" } })[0]).toEqual({ base: "https://node.example:8768", via: "direct" });
  for (const fingerprint of [null, "fp-2"])
    expect(candidateBases(pairing, { target: "https://node.example:8768", about: { kind: "unknown", fingerprint } })).toHaveLength(2);
  // Plain http off this machine is no candidate, whoever names it: the target, the pairing, the page's own origin.
  expect(candidateBases(pairing, { target: "http://10.0.0.5:8768", about: { kind: "node", fingerprint: "fp-1" } })).toHaveLength(2);
  expect(candidateBases({ ...pairing, urls: ["http://mac.lan:8768", ...pairing.urls] }).map((c) => c.base))
    .toEqual(["http://127.0.0.1:8768", "https://mac.example"]);
});

test("the first candidate in order that proves itself wins, all of them asked at once", async () => {
  const node = await fakeNode();
  const asked: string[] = [];
  const get = network({ "http://127.0.0.1:8768": node, "https://mac.example": node }, asked);
  const candidates = [{ base: "https://gone:1", via: "direct" as const }, { base: "http://127.0.0.1:8768", via: "direct" as const }, { base: "https://mac.example", via: "direct" as const }];
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
  // The loopback URL is somebody else's; the node is at its other address.
  const get = network({ "http://127.0.0.1:8768": squatter, "https://mac.example": node });
  const { pairing, base } = await redeemPairingCode(codeFor(payload(node, { urls: ["http://127.0.0.1:8768", "https://mac.example"] })), { name: "Mi portátil", get, subtle, now: NOW });
  expect(squatter.secrets).toEqual([]);
  expect(node.secrets).toEqual([{ secret: "c2VjcmV0LXNlY3JldC0xNg", name: "Mi portátil" }]);
  expect(base).toMatchObject({ base: "https://mac.example", via: "direct" });
  expect(pairing).toEqual({ fp: node.fp, public_key: node.public_key, host: "macbook", urls: ["http://127.0.0.1:8768", "https://mac.example"],
    device_id: "dev-1", token: "tok-1", paired_at: NOW / 1000 });
});

test("a typed address is https unless it says otherwise; plain http as is to this computer, to a private network only by consent", () => {
  const why = (text: string, options: { insecure?: boolean; origin?: string } = {}) => {
    try { return machineAddress(text, { origin: "http://localhost:5173", ...options }); } catch (error) { return (error as Error).message; }
  };
  expect(why("")).toBeNull();
  expect(why(" 192.168.1.20:8768 ")).toBe("https://192.168.1.20:8768");
  expect(why("https://mac.example/")).toBe("https://mac.example");
  expect(why("http://127.0.0.1:8768")).toBe("http://127.0.0.1:8768");
  // http:// to a private-network address: asked about, with no https attempt; agreed to, it is that address.
  for (const text of ["http://192.168.1.20:8768", "http://10.0.0.5:8768", "http://nuc.local:8768"]) {
    expect(why(text), text).toBe(PAIRING_HTTP_PRIVATE);
    expect(why(text, { insecure: true }), text).toBe(text);
  }
  // A page served over https cannot ask over plain http at all, consent or not.
  expect(why("http://192.168.1.20:8768", { origin: "https://room.example" })).toBe(PAIRING_HTTP_BLOCKED);
  expect(why("http://192.168.1.20:8768", { origin: "https://room.example", insecure: true })).toBe(PAIRING_HTTP_BLOCKED);
  // http:// to a public address or a name: refused, consent or not.
  for (const text of ["http://203.0.113.5:8768", "http://mac.example", "http://nuc:8768"]) {
    expect(why(text), text).toBe("address-insecure");
    expect(why(text, { insecure: true }), text).toBe("address-insecure");
  }
  expect(why("not an address at all")).toBe("address-invalid");
});

test("redeeming at a typed address: proven there first, the secret goes there, and the pairing keeps it", async () => {
  const node = await fakeNode();
  const get = network({ "https://192.168.1.20:8768": node });
  // A code that only names this computer's loopback: from another device, only the typed address reaches the node.
  const { pairing, base } = await redeemPairingCode(codeFor(payload(node)), { address: "192.168.1.20:8768", get, subtle, now: NOW });
  expect(base).toMatchObject({ base: "https://192.168.1.20:8768", via: "direct" });
  expect(node.secrets).toHaveLength(1);
  expect(pairing.urls).toEqual(["https://192.168.1.20:8768", "http://127.0.0.1:8768"]);
});

test("redeeming follows no redirect: neither the proof nor the secret goes anywhere a redirect points", async () => {
  const node = await fakeNode(), seen: { url: string; redirect?: RequestRedirect }[] = [];
  const base = network({ "http://127.0.0.1:8768": node });
  const get = (async (url: string, init?: RequestInit) => { seen.push({ url, redirect: init?.redirect }); return base(url, init); }) as unknown as typeof fetch;
  await redeemPairingCode(codeFor(payload(node)), { get, subtle, now: NOW });
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
const pairing = (fp: string, extra: Partial<Pairing> = {}): Pairing => ({ fp, public_key: "pk-" + fp, host: fp + "-host", urls: [],
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
  const local = pairing("local-fp", { local: true, host: "Mac", token: "session-secret", urls: ["http://127.0.0.1:40000"] });
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
  expect(secureBase("http://192.168.1.20:8768")).toBe(false);
  expect(secureBase("http://192.168.1.20:8768", "", { insecure: true })).toBe(true);
  expect(secureBase("http://203.0.113.5:8768", "", { insecure: true })).toBe(false);
  const pairing = { fp: "x", urls: ["http://192.168.1.20:8768", "https://nuc.example"] };
  expect(candidateBases(pairing).map((c) => c.base)).toEqual(["https://nuc.example"]);
  expect(candidateBases({ ...pairing, insecure: true }).map((c) => c.base)).toEqual(["http://192.168.1.20:8768", "https://nuc.example"]);
});

test("a private machine answering only over http is asked about, then paired unencrypted with consent and marked so", async () => {
  const node = await fakeNode("nuc");
  const code = codeFor(payload(node, { urls: [] }));
  const get = network({ "http://192.168.1.20:8768": node });
  // Without consent: it says so, and nothing is sent.
  await expect(redeemPairingCode(code, { address: "192.168.1.20:8768", get, subtle, now: NOW, origin: "http://localhost:5173" }))
    .rejects.toThrow(PAIRING_HTTP_PRIVATE);
  expect(node.secrets).toEqual([]);
  // With it: paired over http, and the pairing says it is not encrypted.
  const { pairing, base } = await redeemPairingCode(code, { address: "192.168.1.20:8768", get, subtle, now: NOW, origin: "http://localhost:5173", insecure: true });
  expect(base.base).toBe("http://192.168.1.20:8768");
  expect(pairing.insecure).toBe(true);
  expect(pairingSummary(pairing).insecure).toBe(true);
});

test("a bare private address uses the code's Core port for http while https keeps port 443", async () => {
  const node = await fakeNode("nuc"), asked: string[] = [];
  const code = codeFor(payload(node, { urls: ["http://127.0.0.1:45678"] }));
  const get = network({ "http://192.168.1.20:45678": node }, asked);
  await expect(redeemPairingCode(code, { address: "192.168.1.20", get, subtle, now: NOW, origin: "http://localhost:5173" }))
    .rejects.toThrow(PAIRING_HTTP_PRIVATE);
  expect(asked.some(request => request.includes("https://192.168.1.20/api/device/identity"))).toBe(true);
  expect(node.secrets).toEqual([]);
  const result = await redeemPairingCode(code, { address: "192.168.1.20", get, subtle, now: NOW, origin: "http://localhost:5173", insecure: true });
  expect(result.base.base).toBe("http://192.168.1.20:45678");
  expect(node.secrets).toHaveLength(1);
});

test("a code for Core on HTTP's default port keeps port 80 after URL normalization", async () => {
  const node = await fakeNode("nuc");
  const code = codeFor(payload(node, { urls: ["http://127.0.0.1:80"] }));
  const result = await redeemPairingCode(code, { address: "192.168.1.20", get: network({ "http://192.168.1.20": node }),
    subtle, now: NOW, origin: "http://localhost:5173", insecure: true });
  expect(result.base.base).toBe("http://192.168.1.20");
});

test("an explicit port survives private http consent, including an explicit https port 443", async () => {
  const node = await fakeNode("nuc");
  const code = codeFor(payload(node, { urls: ["http://127.0.0.1:45678"] }));
  for (const address of ["192.168.1.20:9000", "https://192.168.1.20:9000", "http://192.168.1.20:9000"]) {
    const result = await redeemPairingCode(code, { address, get: network({ "http://192.168.1.20:9000": node }), subtle, now: NOW,
      origin: "http://localhost:5173", insecure: true });
    expect(result.base.base).toBe("http://192.168.1.20:9000");
  }
  const result = await redeemPairingCode(code, { address: "https://192.168.1.20:443", get: network({ "http://192.168.1.20:443": node }),
    subtle, now: NOW, origin: "http://localhost:5173", insecure: true });
  expect(result.base.base).toBe("http://192.168.1.20:443");
});

test("a public machine answering only over http is refused, consent or not; an https page is told where it can work", async () => {
  const node = await fakeNode("vps");
  const code = codeFor(payload(node, { urls: [] }));
  const get = network({ "http://203.0.113.5:8768": node });
  await expect(redeemPairingCode(code, { address: "203.0.113.5:8768", get, subtle, now: NOW, origin: "http://localhost:5173" })).rejects.toThrow(PAIRING_HTTP_ONLY);
  await expect(redeemPairingCode(code, { address: "203.0.113.5:8768", get, subtle, now: NOW, origin: "http://localhost:5173", insecure: true })).rejects.toThrow();
  expect(node.secrets).toEqual([]);
  const local = await fakeNode("nuc");
  await expect(redeemPairingCode(codeFor(payload(local, { urls: [] })), { address: "192.168.1.20:8768", get: network({}), subtle, now: NOW, origin: "https://room.example" }))
    .rejects.toThrow(PAIRING_HTTP_BLOCKED);
});

test("an http:// address on a private network is never tried over https: asked about with nothing sent, then paired unencrypted", async () => {
  const node = await fakeNode("nuc"), asked: string[] = [];
  const code = codeFor(payload(node, { urls: [] }));
  const get = network({ "http://192.168.1.20:8768": node, "https://192.168.1.20:8768": node }, asked);
  await expect(redeemPairingCode(code, { address: "http://192.168.1.20:8768", get, subtle, now: NOW, origin: "http://localhost:5173" }))
    .rejects.toThrow(PAIRING_HTTP_PRIVATE);
  expect(asked).toEqual([]);
  const { pairing, base } = await redeemPairingCode(code, { address: "http://192.168.1.20:8768", get, subtle, now: NOW, origin: "http://localhost:5173", insecure: true });
  expect(base.base).toBe("http://192.168.1.20:8768");
  expect(asked.every((request) => request.includes(" http://192.168.1.20:8768/"))).toBe(true);
  expect(pairing).toMatchObject({ urls: ["http://192.168.1.20:8768"], insecure: true });
  expect(node.secrets).toHaveLength(1);
  // Written to a public address, nothing is asked anywhere.
  await expect(redeemPairingCode(code, { address: "http://203.0.113.5:8768", get, subtle, now: NOW, origin: "http://localhost:5173", insecure: true }))
    .rejects.toThrow("address-insecure");
});

test("the Core port is the one Core's own addresses advertise, not a proxy's, and none when they disagree", () => {
  // A proxy's https port is not Core's; the loopback and LAN addresses are.
  expect(listeningPort(["https://proxy.example:8443", "http://127.0.0.1:10829"])).toBe(10829);
  expect(listeningPort(["http://127.0.0.1:10829", "http://192.168.1.20:10829"])).toBe(10829);
  expect(listeningPort(["http://127.0.0.1:10829", "http://192.168.1.20:9000"])).toBeNull();
  expect(listeningPort(["https://proxy.example:8443"])).toBeNull();
  expect(listeningPort([])).toBeNull();
  expect(listeningPort(undefined)).toBeNull();
});

test("an explicit default port survives: URL drops :80 from an http address, and that is port 80", () => {
  expect(new URL("http://127.0.0.1:80").port).toBe("");
  expect(listeningPort(["http://127.0.0.1:80"])).toBe(80);
  expect(listeningPort(["http://192.168.1.20"])).toBe(80);
  expect(listeningPort(["https://192.168.1.20:443"])).toBeNull();
});
