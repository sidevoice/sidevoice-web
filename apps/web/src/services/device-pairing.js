/* This device's half of pairing with a node (the node's half: sidevoice-core `server/devices.py`).
 *
 * A node accepts this page only with a device token it minted when the person paired it: the node issues a
 * one-time code, the person pastes it here, the page redeems it and keeps the token. Before a token goes
 * anywhere the address has to prove it is the node that was paired — a signature with the key pinned at
 * pairing — so that an address which is not the node, and cannot reach it, never gets the token.
 *
 * A secret or a token goes only over https, loopback http, or private-network http after the person's explicit consent.
 *
 * No DOM and no clock of its own: storage, fetch, WebCrypto and the time are handed in, so each step can be
 * tested alone. Only `export function|async function|const`: the controller's node tests inline this file. */
import { patiently } from './rendezvous.js';
import { clampDeviceName } from './device-name-rules.js';
import { describeBrowser, host, reachOfOrigin } from '../host/index.ts';
export const PAIRING_CODE_PREFIX = 'SV1.';
export const IDENTITY_PREFIX = 'sidevoice-node-identity:';
/** How long an address that proved itself is trusted without asking again. */
export const VERIFIED_FOR_MS = 5 * 60 * 1000;
/** How long one address may take to prove itself before the next one is preferred. */
export const IDENTITY_TIMEOUT_MS = 4000;
export const NO_WEBCRYPTO = 'Este navegador no puede comprobar la identidad de la máquina: abre la página por https (o en este mismo equipo).';
const DAMAGED = 'El código está incompleto o dañado. Cópialo entero otra vez.';
/** A node lists its own address and a few public ones; every address in a code gets probed, up to this many. */
const MAX_CODE_URLS = 8;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// ----- bytes and text -----
/** base64url without padding, the form every identifier and signature of the contract travels in. */
export function bytesToBase64url(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const table = ALPHABET + '-_';
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        out += table[(n >> 18) & 63] + table[(n >> 12) & 63];
        if (i + 1 < bytes.length) out += table[(n >> 6) & 63];
        if (i + 2 < bytes.length) out += table[n & 63];
    }
    return out;
}
/** Either base64 (a public key: standard, padded) or base64url (everything else). Throws on anything else. */
export function base64ToBytes(text) {
    const clean = String(text ?? '').replace(/=+$/, '');
    if (!/^[A-Za-z0-9+/_-]*$/.test(clean) || clean.length % 4 === 1) throw Error('not base64');
    const bytes = new Uint8Array(Math.floor(clean.length * 3 / 4));
    let bits = 0, value = 0, at = 0;
    for (const char of clean) {
        const index = char === '-' || char === '+' ? 62 : char === '_' || char === '/' ? 63 : ALPHABET.indexOf(char);
        value = ((value << 6) | index) & 0xffffff; bits += 6;
        if (bits >= 8) { bits -= 8; bytes[at++] = (value >> bits) & 255; }
    }
    return bytes;
}
export function utf8(text) { return new TextEncoder().encode(text); }
function webCrypto(subtle) {
    const found = subtle ?? globalThis.crypto?.subtle;
    if (!found) throw Object.assign(Error(NO_WEBCRYPTO), { code: 'no-webcrypto' });
    return found;
}
/** Why a code was not redeemed: its stable `code` (what the pairing screen says it by) and a sentence for the log. */
export function pairingError(message, code = message) { const error = Error(message); error.pairing = true; error.code = code; return error; }
function httpUrl(value) {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin + url.pathname.replace(/\/+$/, '') : null;
    } catch { return null; }
}
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
/** Whether a pairing secret or a device token may be sent to `base`: https anywhere, plain http only to loopback —
 *  or, for a pairing the person agreed to keep unencrypted (`insecure`), to a private-network address. A relative base
 *  is on `origin`, the page's own, and is judged by it. */
export function secureBase(base, origin = '', { insecure = false } = {}) {
    try {
        const url = new URL(base, origin || undefined);
        return url.protocol === 'https:' || (url.protocol === 'http:' && (LOOPBACK.has(url.hostname) || (insecure && privateHost(url.hostname))));
    } catch { return false; }
}
/** A host only a private network reaches: 10/8, 172.16/12, 192.168/16, 100.64/10 (carrier-grade NAT, Tailscale),
 *  loopback, IPv6 unique-local (fc00::/7) and loopback, and *.local names. Anything else is public. */
export function privateHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (LOOPBACK.has(host) || LOOPBACK.has('[' + host + ']') || host === '::1') return true;
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.local\.?$/.test(host)) return true;
    const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])];
        if (v4.slice(1).some(part => Number(part) > 255)) return false;
        return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
    }
    return host.includes(':') && /^f[cd][0-9a-f]{0,2}:/.test(host);
}
/** The address a person typed for a machine (`192.168.1.20:8768`, `https://mac.example`), as a base: https unless
 *  it says otherwise, and only one a pairing secret may travel to (`secureBase`). Empty is null: the code's own
 *  addresses are used. */
export const ADDRESS_INVALID = 'address-invalid';
export const ADDRESS_INSECURE = 'address-insecure';
/** The machine at the address typed answers, but only over plain http: pairing never goes there (its secret would
 *  travel unencrypted), and the person is told so rather than that it is unreachable. */
export const PAIRING_HTTP_ONLY = 'pairing-http-only';
/** The same, at a private-network address: pairing may go there unencrypted, once the person agrees (`insecure`). */
export const PAIRING_HTTP_PRIVATE = 'pairing-http-private';
/** HTTPS did not answer at a private address, and this page (served over https) may not ask over plain http at all: only
 *  the desktop app or a page served over http could pair with a machine that answers only without encryption. */
export const PAIRING_HTTP_BLOCKED = 'pairing-http-blocked';
const DEFAULT_CORE_PORT = '10829';
/** An explicitly written port must survive a protocol change, including https://host:443 (which URL normalizes away). */
function writtenPort(address) {
    const raw = String(address || '').trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    const authority = raw.split(/[/?#]/, 1)[0];
    return authority.match(/^(?:\[[^\]]+\]|[^:]+):(\d{1,5})$/)?.[1] || null;
}
/** An older code still carries its actual Core port in its loopback URL. */
function codeHttpPort(code) {
    const urls = readPairingCode(code).urls.map(url => new URL(url));
    const direct = urls.find(url => url.protocol === 'http:' && privateHost(url.hostname) && !LOOPBACK.has(url.hostname));
    const loopback = urls.find(url => url.protocol === 'http:' && LOOPBACK.has(url.hostname));
    // URL removes :80 from HTTP URLs; an empty port on an advertised HTTP URL means port 80.
    return direct ? direct.port || '80' : loopback ? loopback.port || '80' : DEFAULT_CORE_PORT;
}
/** The port the machine's Core listens on, as its pairing advertises it: from Core's own addresses (plain http on
 *  loopback or a private network; an https one is a proxy's, not Core's). URL drops :80 from an http URL, so an empty
 *  port there is 80, as in codeHttpPort. Null when none is advertised or the addresses disagree. */
export function listeningPort(urls) {
    const ports = new Set();
    for (const text of urls || []) {
        try {
            const url = new URL(text);
            if (url.protocol === 'http:' && privateHost(url.hostname)) ports.add(url.port || '80');
        } catch { /* Not an address. */ }
    }
    return ports.size === 1 ? Number([...ports][0]) : null;
}
function plainAddress(written, address, code) {
    const url = new URL(written);
    url.protocol = 'http:';
    const port = writtenPort(address) || (privateHost(url.hostname) ? codeHttpPort(code) : null);
    if (port) url.port = port;
    return url.origin + url.pathname.replace(/\/+$/, '');
}
/** Plain http:// written to a private-network address is that address without encryption, asked for on purpose: no
 *  https attempt first, and reached only once the person agrees (`insecure`; until then PAIRING_HTTP_PRIVATE), never
 *  from a page served over https (PAIRING_HTTP_BLOCKED). Written to any other address, it is refused (ADDRESS_INSECURE). */
export function machineAddress(text, { insecure = false, origin = '', reach } = {}) {
    const raw = String(text ?? '').trim();
    if (!raw) return null;
    const base = httpUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw);
    if (!base) throw pairingError(ADDRESS_INVALID);
    if (secureBase(base)) return base;
    if (!secureBase(base, '', { insecure: true })) throw pairingError(ADDRESS_INSECURE);
    if (plainHttpBlocked(origin, reach)) throw pairingError(PAIRING_HTTP_BLOCKED);
    if (!insecure) throw pairingError(PAIRING_HTTP_PRIVATE);
    return base;
}
/** Whether this page may not ask another machine anything over plain http: served over https, it may not (mixed
 *  content). `origin` is the page's; the one it runs on when not given. */
function plainHttpBlocked(origin, reach) {
    // What the host's transport reports; for a page judged against an origin it is given (a test, a relative base), that origin's.
    return !(reach ?? (origin ? reachOfOrigin(origin) : host().reach)).plainHttpPrivate;
}
const PLAINTEXT = 'Este código solo lleva a la máquina por http sin cifrar, y el emparejamiento solo viaja por https (o dentro de este mismo equipo). Configura la máquina con una dirección https y pide un código nuevo.';

// ----- the code -----
/** A pasted code's payload, checked for its shape only: whether the addresses it names can be used from here, and
 *  whether it is still valid, are for its readers to judge. The code may arrive wrapped over lines or inside the
 *  sentence it was sent in: the `SV1.` token is found either way.
 *
 *  Read as every reader of the protocol is (sidevoice-core#112): a field this version does not know is ignored, and
 *  an address it cannot use — one that is not http(s), or an entry of a shape it does not know — is left out rather than making the whole code unusable; what is left is for `decodePairingCode` to
 *  judge, through its own "no address" sentence when nothing is. `v` stays the one deliberate gate: a code of another
 *  version is a breaking change, said as such. What the code cannot be redeemed without (`fp`, `secret`, `exp`) still
 *  has to be there, in its shape: the fingerprint is what the machine is checked against. */
function readPairingCode(code) {
    const raw = String(code ?? ''), compact = raw.replace(/\s+/g, '');
    if (!compact) throw pairingError('Pega el código que te dio la máquina.', 'code-empty');
    const text = /^SV1\.[A-Za-z0-9_-]+$/.test(compact) ? compact : raw.match(/SV1\.[A-Za-z0-9_-]+/)?.[0];
    if (!text) throw pairingError('Eso no es un código de emparejamiento de Sidevoice: empieza por «SV1.».', 'code-invalid');
    let payload;
    try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(text.slice(PAIRING_CODE_PREFIX.length)))); }
    catch { throw pairingError(DAMAGED, 'code-damaged'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw pairingError(DAMAGED, 'code-damaged');
    if (payload.v !== 1) throw pairingError('Este código es de otra versión de Sidevoice. Actualiza la aplicación o pide un código nuevo.', 'code-version');
    const { fp, host, urls, secret, exp } = payload;
    if (typeof fp !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(fp) ||
        typeof secret !== 'string' || !/^[A-Za-z0-9_-]+$/.test(secret) || typeof exp !== 'number' || !Number.isFinite(exp))
        throw pairingError(DAMAGED, 'code-damaged');
    const urlList = (Array.isArray(urls) ? urls : []).map(httpUrl).filter(url => url !== null);
    return { fp, host: typeof host === 'string' ? host : null, urls: urlList, secret, exp };
}
const EXPIRED = 'Este código ya caducó: duran 10 minutos. Pide uno nuevo.';
/** What a pasted code says, or why it cannot be used, in one sentence the person can act on. */
export function decodePairingCode(code, now = Date.now(), { address = null } = {}) {
    const { fp, host, urls: urlList, secret, exp } = readPairingCode(code);
    if (!urlList.length && !address) throw pairingError('El código no dice dónde encontrar la máquina. Pide uno nuevo.', 'code-no-address');
    // An address the secret may not travel to is left out (a node may list a cluster address for others); a code
    // left with none cannot be used from here.
    // A node lists its own address and a few public ones, and each one is probed: past MAX_CODE_URLS the rest are not.
    const secureUrls = urlList.filter(url => secureBase(url)).slice(0, MAX_CODE_URLS);
    if (!secureUrls.length && !address) throw pairingError(PLAINTEXT, 'code-plaintext');
    if (exp * 1000 <= now) throw pairingError(EXPIRED, 'code-expired');
    return { v: 1, fp, host: host || null, urls: secureUrls, secret, exp };
}
/** What a code says as it is pasted, before anything is sent anywhere: whose it is (`host`), until when (`exp`, in
 *  seconds), whether it tells another device where its machine is (`reachable`: an https address other than loopback),
 *  and the private-network addresses it lists over plain http, as host:port (`plain`) — which pairing
 *  reaches only typed, and only once the person agrees (`insecure`). Throws as `decodePairingCode` does for a code that
 *  cannot be used wherever its machine is. */
export function previewPairingCode(code, now = Date.now()) {
    const { host, urls, exp } = readPairingCode(code);
    if (exp * 1000 <= now) throw pairingError(EXPIRED, 'code-expired');
    const away = urls.map(url => new URL(url)).filter(url => !LOOPBACK.has(url.hostname));
    return {
        host: host || null, exp,
        reachable: away.some(url => url.protocol === 'https:'),
        plain: away.filter(url => url.protocol === 'http:' && privateHost(url.hostname)).map(url => url.host),
    };
}

// ----- the node's identity -----
/** The fingerprint of a SubjectPublicKeyInfo: base64url of its SHA-256, 43 characters. */
export async function fingerprintOf(spki, subtle) {
    return bytesToBase64url(new Uint8Array(await webCrypto(subtle).digest('SHA-256', spki)));
}
/** A nonce for one identity question: 32 random bytes, base64url. */
export function newNonce(random = bytes => globalThis.crypto.getRandomValues(bytes)) {
    return bytesToBase64url(random(new Uint8Array(32)));
}
/** Whether `signature` (P1363, base64url) is `publicKey`'s (SPKI, base64) over "sidevoice-node-identity:" + nonce.
 *  Anything malformed is simply not a proof; a browser without WebCrypto is an error, because nothing can be. */
export async function verifyIdentitySignature({ publicKey, nonce, signature }, subtle) {
    const crypto = webCrypto(subtle);
    try {
        const key = await crypto.importKey('spki', base64ToBytes(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        return await crypto.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, base64ToBytes(signature), utf8(IDENTITY_PREFIX + nonce));
    } catch { return false; }
}
/** Ask `base` to prove it is the node `expected` names. A pairing pins its `public_key`; a code only knows the
 *  fingerprint, so the key the answer offers must hash to it first. `{ok, publicKey}` or `{ok: false, reason}`:
 *  `unreachable` (no answer, or not one of ours) or `impostor` (it answered, and is not that node). */
export async function proveIdentity(base, expected, { get = globalThis.fetch, subtle, nonce = newNonce(), timeoutMs = IDENTITY_TIMEOUT_MS } = {}) {
    const crypto = webCrypto(subtle);
    let answer;
    try {
        const response = await patiently(get(base + '/api/device/identity?nonce=' + encodeURIComponent(nonce), { headers: { accept: 'application/json' }, cache: 'no-store', redirect: 'error' }), timeoutMs);
        if (!response.ok) return { ok: false, reason: 'unreachable' };
        answer = await response.json();
    } catch { return { ok: false, reason: 'unreachable' }; }
    if (!answer || typeof answer.public_key !== 'string' || typeof answer.signature !== 'string') return { ok: false, reason: 'unreachable' };
    let publicKey = expected.public_key || null;
    if (!publicKey) {
        try { if (await fingerprintOf(base64ToBytes(answer.public_key), crypto) === expected.fp) publicKey = answer.public_key; }
        catch { /* not a key */ }
        if (!publicKey) return { ok: false, reason: 'impostor' };
    }
    return await verifyIdentitySignature({ publicKey, nonce, signature: answer.signature }, crypto)
        ? { ok: true, publicKey } : { ok: false, reason: 'impostor' };
}
/** Where a pairing (or a code) can be reached, in the contract's order: the target this page was pointed at when
 *  it is that node, then each direct URL. Each says how: `direct`. `about` is the target's own `/api/rendezvous` answer, `null` if it gave none.
 *  An address a secret or a token may not go to (`secureBase`) is no candidate, wherever it came from. */
export function candidateBases(pairing, { target = '', about = null, origin = '' } = {}) {
    const list = [], seen = new Set();
    // A pairing kept unencrypted by the person's choice reaches its own private addresses over plain http; no other does.
    const insecure = pairing.insecure === true;
    const add = (base, via) => {
        const key = /^https?:\/\//.test(base) ? base : origin + base;
        if (seen.has(key) || !secureBase(base, origin, { insecure })) return;
        seen.add(key); list.push({ base, via });
    };
    // A server of a kind this version does not know is that node when it says its fingerprint: it proves it all the same.
    if ((about?.kind === 'node' || about?.kind === 'unknown') && about.fingerprint && about.fingerprint === pairing.fp) add(target, 'direct');
    for (const url of pairing.urls || []) add(url, 'direct');
    return list;
}
/** The first candidate, in order, that proves it is the node. All are asked at once — the order decides which
 *  wins, not which is asked first — so a dead address costs the time of the slowest one ahead of the winner,
 *  never the sum. `started` lets a caller begin some of them before the list is complete. */
export async function firstProven(candidates, expected, deps = {}, started = new Map()) {
    const ask = candidate => {
        if (!started.has(candidate.base)) started.set(candidate.base, proveIdentity(candidate.base, expected, deps).catch(error => ({ ok: false, reason: 'error', error })));
        return started.get(candidate.base);
    };
    candidates.forEach(ask);
    let failure = null;
    for (const candidate of candidates) {
        const proof = await ask(candidate);
        if (proof.ok) return { ...candidate, publicKey: proof.publicKey };
        failure ??= proof.error || null;
    }
    // A browser that cannot check a signature at all says so, instead of blaming the machine.
    if (failure?.message === NO_WEBCRYPTO) throw failure;
    return null;
}

// ----- redeeming a code -----
/** Pair this device with the node a code names, at the address the person typed if any: find an address that proves it is that node, hand it the
 *  one-time secret there and nowhere else, and keep the token only if the key it returns is the code's. */
export async function redeemPairingCode(code, { name = '', address = '', target = '', about = null, origin = '', reach, get = globalThis.fetch, subtle, now = Date.now(), insecure = false } = {}) {
    // The address the person typed comes first, and is kept with the pairing: it is where they know the machine is.
    // It is trusted no more than the code's own: the machine there proves it is the code's before the secret goes.
    // Agreed to (`insecure`), a private address is reached over plain http instead, and the pairing says so for good.
    // Written with http:// to a private address, it is that already (machineAddress).
    const written = machineAddress(address, { insecure, origin, reach });
    const plain = insecure && written && privateHost(new URL(written).hostname) ? plainAddress(written, address, code) : null;
    const typed = plain ?? written;
    const decoded = decodePairingCode(code, now, { address: typed });
    const payload = { ...(typed ? { ...decoded, urls: [typed, ...decoded.urls.filter(url => url !== typed)] } : decoded), ...(plain ? { insecure: true } : {}) };
    const crypto = webCrypto(subtle);
    const place = await firstProven(candidateBases(payload, { target, about, origin }), { fp: payload.fp }, { get, subtle: crypto });
    const called = payload.host ? '«' + payload.host + '»' : 'la máquina';
    if (!place && written && !plain) {
        const privateAddress = privateHost(new URL(written).hostname);
        // Over https, this page may not ask over plain http at all (mixed content): say what would work.
        if (privateAddress && plainHttpBlocked(origin, reach)) throw pairingError(PAIRING_HTTP_BLOCKED);
        if (await answersPlainHttp(written, plainAddress(written, address, code), get)) throw pairingError(privateAddress ? PAIRING_HTTP_PRIVATE : PAIRING_HTTP_ONLY);
    }
    if (!place) throw pairingError('No se pudo llegar a ' + called + ' por ningún camino. Comprueba que está encendida y vuelve a intentarlo.', 'unreachable');
    let response, answer = null;
    try {
        // Never redirected: a 307 would hand the secret, in the body, to wherever it pointed.
        response = await get(place.base + '/api/device/pair', { method: 'POST', headers: { 'Content-Type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ secret: payload.secret, name: clampDeviceName(name || '') || deviceName() }), cache: 'no-store', redirect: 'error' });
    } catch { throw pairingError('No se pudo llegar a ' + called + ' para emparejar. Vuelve a intentarlo.', 'unreachable'); }
    try { answer = await response.json(); } catch { /* no body */ }
    if (response.status === 403) throw pairingError(answer?.detail || 'Ese código ya no vale: se usó o caducó. Pide uno nuevo.', 'code-spent');
    const node = answer?.node;
    if (!response.ok || typeof answer?.token !== 'string' || typeof answer?.device_id !== 'string' || typeof node?.public_key !== 'string')
        throw pairingError(answer?.detail || 'La máquina no aceptó el emparejamiento. Vuelve a intentarlo.', 'pair-refused');
    let fp = null;
    try { fp = await fingerprintOf(base64ToBytes(node.public_key), crypto); } catch { /* not a key */ }
    if (fp !== payload.fp) throw pairingError('La máquina que respondió no es la del código. No se ha guardado nada.', 'identity-mismatch');
    return {
        pairing: { fp, public_key: node.public_key, host: node.host || payload.host, urls: payload.urls,
            device_id: answer.device_id, token: answer.token, paired_at: Math.floor(now / 1000), ...(payload.insecure ? { insecure: true } : {}) },
        base: place,
    };
}
/** Whether the machine at `base` (https, as typed) answers at the same place over plain http — asked only to say why
 *  it could not be reached; nothing is sent there. A page on https may not ask (mixed content): then it is not known. */
async function answersPlainHttp(base, plainBase, get) {
    try {
        const url = new URL(base);
        if (url.protocol !== 'https:') return false;
        const response = await patiently(get(new URL(plainBase).origin + '/api/device/identity?nonce=probe', { headers: { accept: 'application/json' }, cache: 'no-store', redirect: 'error' }), 4000);
        return !!response;
    } catch { return false; }
}

/** What this device calls itself when it pairs, unless the person says otherwise. */
export function deviceName(nav) {
    const { app, system } = describeBrowser(nav);
    return system ? (app || 'Browser') + ' on ' + system : 'Sidevoice';
}

// ----- the pairing book: what is done to the machines this device is paired with (where they are kept: host/browser-storage.ts, or the app) -----
/** The desktop's verified local pairing wins over a stale code pairing with the same fingerprint, and comes first. */
export function projectPairings(stored, localPairing) {
    const fp = localPairing?.local ? localPairing.fp : null;
    const remote = (stored?.list || []).filter(p => !p.local && p.fp !== fp);
    return { list: localPairing?.local ? [localPairing, ...remote] : remote };
}
/** A new pairing replaces any older one with the same node. */
export function withPairing(pairings, pairing) {
    return { list: [pairing, ...pairings.list.filter(p => p.fp !== pairing.fp)] };
}
export function withoutPairing(pairings, fp) {
    return { list: pairings.list.filter(p => p.fp !== fp) };
}
/** The node said this token is no longer one of its devices: kept, saying so, until the person pairs again or forgets it. */
export function revokedPairing(pairings, fp) {
    return { ...pairings, list: pairings.list.map(p => p.fp === fp ? { ...p, revoked: true } : p) };
}
/** A pairing as the interface may see it: everything but the token. */
export function pairingSummary(p) {
    return { fp: p.fp, host: p.host || null, urls: [...(p.urls || [])], device_id: p.device_id,
        paired_at: typeof p.paired_at === 'number' ? p.paired_at : null, revoked: !!p.revoked, local: !!p.local, insecure: p.insecure === true };
}
