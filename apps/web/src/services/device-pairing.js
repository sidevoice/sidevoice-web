/* This device's half of pairing with a node (docs/DEVICE_PAIRING.md).
 *
 * A node accepts this page only with a device token it minted when the person paired it: the node issues a
 * one-time code, the person pastes it here, the page redeems it and keeps the token. Before a token goes
 * anywhere the address has to prove it is the node that was paired — a signature with the key pinned at
 * pairing — because a relay, or whoever sits on a URL, could otherwise collect it.
 *
 * No DOM and no clock of its own: storage, fetch, WebCrypto and the time are handed in, so each step can be
 * tested alone. Only `export function|async function|const`: the controller's node tests inline this file. */
import { patiently } from './rendezvous.js';
export const PAIRING_CODE_PREFIX = 'SV1.';
export const PAIRINGS_KEY = 'sidevoice.pairings';
export const IDENTITY_PREFIX = 'sidevoice-node-identity:';
/** How long an address that proved itself is trusted without asking again. */
export const VERIFIED_FOR_MS = 5 * 60 * 1000;
/** How long one address may take to prove itself before the next one is preferred. */
export const IDENTITY_TIMEOUT_MS = 4000;
export const NO_WEBCRYPTO = 'Este navegador no puede comprobar la identidad de la máquina: abre la página por https (o en este mismo equipo).';
const DAMAGED = 'El código está incompleto o dañado. Cópialo entero otra vez.';
/** A node lists its own address and a few public ones; every address in a code gets probed. */
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
    if (!found) throw Error(NO_WEBCRYPTO);
    return found;
}
export function pairingError(message) { const error = Error(message); error.pairing = true; return error; }
function httpUrl(value) {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin + url.pathname.replace(/\/+$/, '') : null;
    } catch { return null; }
}

// ----- the code -----
/** What a pasted code says, or why it cannot be used, in one sentence the person can act on. The code may
 *  arrive wrapped over lines or inside the sentence it was sent in: the `SV1.` token is found either way. */
export function decodePairingCode(code, now = Date.now()) {
    const raw = String(code ?? ''), compact = raw.replace(/\s+/g, '');
    if (!compact) throw pairingError('Pega el código que te dio la máquina.');
    const text = /^SV1\.[A-Za-z0-9_-]+$/.test(compact) ? compact : raw.match(/SV1\.[A-Za-z0-9_-]+/)?.[0];
    if (!text) throw pairingError('Eso no es un código de emparejamiento de Sidevoice: empieza por «SV1.».');
    let payload;
    try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(text.slice(PAIRING_CODE_PREFIX.length)))); }
    catch { throw pairingError(DAMAGED); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw pairingError(DAMAGED);
    if (payload.v !== 1) throw pairingError('Este código es de otra versión de Sidevoice. Actualiza la aplicación o pide un código nuevo.');
    const { fp, host, urls, rv, secret, exp } = payload;
    const urlList = Array.isArray(urls) ? urls.map(httpUrl) : null;
    const room = rv === null ? null : rv && typeof rv === 'object' && typeof rv.node === 'string' && rv.node ? { url: httpUrl(rv.url), node: rv.node } : undefined;
    if (typeof fp !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(fp) || !(host === null || typeof host === 'string') ||
        !urlList || urlList.includes(null) || room === undefined || (room && !room.url) ||
        typeof secret !== 'string' || !/^[A-Za-z0-9_-]+$/.test(secret) || typeof exp !== 'number' || !Number.isFinite(exp))
        throw pairingError(DAMAGED);
    if (!urlList.length && !room) throw pairingError('El código no dice dónde encontrar la máquina. Pide uno nuevo.');
    // A node lists its own address and a few public ones; a code naming more is not one a node wrote, and each
    // address is probed.
    if (urlList.length > MAX_CODE_URLS) throw pairingError(DAMAGED);
    if (exp * 1000 <= now) throw pairingError('Este código ya caducó: duran 10 minutos. Pide uno nuevo.');
    return { v: 1, fp, host: host || null, urls: urlList, rv: room, secret, exp };
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
        const response = await patiently(get(base + '/api/device/identity?nonce=' + encodeURIComponent(nonce), { headers: { accept: 'application/json' }, cache: 'no-store' }), timeoutMs);
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
 *  it is that node, or a room (then its relay to the node); each direct URL; then the node's own room. Each
 *  says how: `direct` or `room`. `about` is the target's own `/api/rendezvous` answer, `null` if it gave none. */
export function candidateBases(pairing, { target = '', about = null, origin = '' } = {}) {
    const list = [], seen = new Set();
    const add = (base, via) => {
        const key = /^https?:\/\//.test(base) ? base : origin + base;
        if (seen.has(key)) return;
        seen.add(key); list.push({ base, via });
    };
    const relay = room => room + '/nodes/' + encodeURIComponent(pairing.rv.node);
    if (about?.kind === 'node' && about.fingerprint === pairing.fp) add(target, 'direct');
    if (about?.kind === 'room' && pairing.rv) add(relay(target), 'room');
    for (const url of pairing.urls || []) add(url, 'direct');
    if (pairing.rv) add(relay(pairing.rv.url), 'room');
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
/** Pair this device with the node a code names: find an address that proves it is that node, hand it the
 *  one-time secret there and nowhere else, and keep the token only if the key it returns is the code's. */
export async function redeemPairingCode(code, { name = '', target = '', about = null, origin = '', get = globalThis.fetch, subtle, now = Date.now() } = {}) {
    const payload = decodePairingCode(code, now);
    const crypto = webCrypto(subtle);
    const place = await firstProven(candidateBases(payload, { target, about, origin }), { fp: payload.fp }, { get, subtle: crypto });
    const called = payload.host ? '«' + payload.host + '»' : 'la máquina';
    if (!place) throw pairingError('No se pudo llegar a ' + called + ': ni directamente ni a través de la sala. Comprueba que está encendida y vuelve a intentarlo.');
    let response, answer = null;
    try {
        response = await get(place.base + '/api/device/pair', { method: 'POST', headers: { 'Content-Type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ secret: payload.secret, name: String(name || '').trim().slice(0, 60) || deviceName() }), cache: 'no-store' });
    } catch { throw pairingError('No se pudo llegar a ' + called + ' para emparejar. Vuelve a intentarlo.'); }
    try { answer = await response.json(); } catch { /* no body */ }
    if (response.status === 403) throw pairingError(answer?.detail || 'Ese código ya no vale: se usó o caducó. Pide uno nuevo.');
    const node = answer?.node;
    if (!response.ok || typeof answer?.token !== 'string' || typeof answer?.device_id !== 'string' || typeof node?.public_key !== 'string')
        throw pairingError(answer?.detail || 'La máquina no aceptó el emparejamiento. Vuelve a intentarlo.');
    let fp = null;
    try { fp = await fingerprintOf(base64ToBytes(node.public_key), crypto); } catch { /* not a key */ }
    if (fp !== payload.fp) throw pairingError('La máquina que respondió no es la del código. No se ha guardado nada.');
    return {
        pairing: { fp, public_key: node.public_key, host: node.host || payload.host, urls: payload.urls, rv: payload.rv,
            device_id: answer.device_id, token: answer.token, paired_at: Math.floor(now / 1000) },
        base: place,
    };
}
/** What this device calls itself when it pairs, unless the person says otherwise. */
export function deviceName(nav = globalThis.navigator) {
    const text = String(nav?.userAgent || '') + ' ' + String(nav?.userAgentData?.platform || nav?.platform || '');
    const where = /iPhone/.test(text) ? 'iPhone' : /iPad/.test(text) ? 'iPad' : /Android/.test(text) ? 'Android'
        : /Mac/.test(text) ? 'Mac' : /Win/.test(text) ? 'Windows' : /CrOS/.test(text) ? 'ChromeOS' : /Linux/.test(text) ? 'Linux' : '';
    return where ? 'Sidevoice en ' + where : 'Sidevoice';
}

// ----- the pairings this device keeps -----
function validPairing(p) {
    return !!p && typeof p === 'object' && typeof p.fp === 'string' && typeof p.token === 'string' && typeof p.public_key === 'string' &&
        typeof p.device_id === 'string' && Array.isArray(p.urls) && (p.rv === null || (p.rv && typeof p.rv.url === 'string' && typeof p.rv.node === 'string'));
}
/** Several pairings, one in use: `{inUse, list}`, newest first. What storage cannot give back is no pairing. */
export function readPairings(storage) {
    try {
        const stored = JSON.parse(storage?.getItem(PAIRINGS_KEY) || 'null');
        const list = Array.isArray(stored?.pairings) ? stored.pairings.filter(validPairing) : [];
        const inUse = list.some(p => p.fp === stored.in_use) ? stored.in_use : list[0]?.fp ?? null;
        return { inUse, list };
    } catch { return { inUse: null, list: [] }; }
}
export function writePairings(storage, pairings) {
    try { storage.setItem(PAIRINGS_KEY, JSON.stringify({ in_use: pairings.inUse, pairings: pairings.list })); return true; }
    catch { return false; }
}
/** A new pairing replaces any older one with the same node, and becomes the one in use unless told not to. */
export function withPairing(pairings, pairing, { use = true } = {}) {
    const list = [pairing, ...pairings.list.filter(p => p.fp !== pairing.fp)];
    return { inUse: use || !pairings.inUse ? pairing.fp : pairings.inUse, list };
}
/** Forgetting the one in use hands the use to the newest one left, if any. */
export function withoutPairing(pairings, fp) {
    const list = pairings.list.filter(p => p.fp !== fp);
    return { inUse: pairings.inUse === fp || !list.some(p => p.fp === pairings.inUse) ? list[0]?.fp ?? null : pairings.inUse, list };
}
export function usingPairing(pairings, fp) {
    return pairings.list.some(p => p.fp === fp) ? { ...pairings, inUse: fp } : pairings;
}
/** The node said this token is no longer one of its devices: kept, saying so, until the person pairs again or forgets it. */
export function revokedPairing(pairings, fp) {
    return { ...pairings, list: pairings.list.map(p => p.fp === fp ? { ...p, revoked: true } : p) };
}
export function pairingInUse(pairings) {
    return pairings.list.find(p => p.fp === pairings.inUse) || null;
}
/** A pairing as the interface may see it: everything but the token. */
export function pairingSummary(p) {
    return { fp: p.fp, host: p.host || null, urls: [...(p.urls || [])], rv: p.rv ? { ...p.rv } : null, device_id: p.device_id,
        paired_at: typeof p.paired_at === 'number' ? p.paired_at : null, revoked: !!p.revoked };
}
