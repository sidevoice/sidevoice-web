/* Where this page talks to, and nothing else (docs/RENDEZVOUS.md, "Web client contract"; docs/DEVICE_PAIRING.md).
 *
 * Two addresses. The *target* is the one the page was pointed at: a room, or a node directly. Telemetry is the
 * target's. The *node base* is where the conversations and the call live: the node this device is paired with,
 * reached directly or through a room's relay — whichever address proved it is that node (device-pairing.js).
 * Every `/api/presentation…` and `/api/device…` request and the call socket go to the node base.
 *
 * Addresses are prefixes. `''` is the page's own origin, so a page served by its target keeps every path
 * relative; `/nodes/<id>` is a node behind that same room; an absolute URL is anywhere else. No DOM, storage
 * or clock in here: the controller decides when to ask, and these say what the answer means. */

/** The target: what a desktop shell (or a standalone deployment's `target.js`) set in
 *  `window.__SIDEVOICE_TARGET__`, else the page's own origin. Never the page's address: a `?target=` in a link
 *  would send this page's microphone, its typed text and any key entered in its settings to whatever server
 *  the link named. A value that is not an http(s) address is not a target; the result never ends in `/`. */
export function resolveTarget({ injected, origin } = {}) {
    for (const candidate of [injected]) {
        if (typeof candidate !== 'string' || !candidate.trim())
            continue;
        let url;
        try {
            url = new URL(candidate.trim(), origin || undefined);
        }
        catch {
            continue;
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            continue;
        const base = url.origin + url.pathname.replace(/\/+$/, '');
        return base === origin ? '' : base;
    }
    return '';
}
/** This page's target, read where the contract says a shell puts it. */
export function pageTarget() {
    return resolveTarget({ injected: globalThis.window?.__SIDEVOICE_TARGET__, origin: globalThis.location?.origin });
}
/** A conversation, a call, a setting the node applies, this device's own pairing, the model catalogue it serves:
 *  everything the node owns, and every one of them with this device's token. */
export function isNodePath(path) {
    return /^\/api\/(?:presentation|device|models)(?:[/?]|$)/.test(path);
}
/** The address of one request. `null` when it belongs to a node and this page has none to ask. */
export function routeUrl(path, target, nodeBase) {
    if (!isNodePath(path))
        return target + path;
    return nodeBase == null ? null : nodeBase + path;
}
/** The call socket's address on a node base: the same scheme as the page, or the target's own. */
export function callSocketUrl(nodeBase, location) {
    const path = nodeBase + '/api/presentation/ws';
    if (/^https?:\/\//.test(path))
        return path.replace(/^http/, 'ws');
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + path;
}
/** What a `GET /api/rendezvous` answer says the server is: a node (and which, by its fingerprint), a room (and
 *  the web build it serves), or — anything else, a 404, a static server's page — neither. */
export function describeTarget(answer) {
    if (answer?.kind === 'node')
        return { kind: 'node', id: typeof answer.id === 'string' ? answer.id : null,
            fingerprint: typeof answer.fingerprint === 'string' ? answer.fingerprint : null, build: null };
    if (answer?.kind === 'room')
        return { kind: 'room', id: null, fingerprint: null, build: typeof answer.web_build === 'string' ? answer.web_build : null };
    return null;
}
/** A question to a server that does not answer is no answer, after a while: an address that swallows packets
 *  would otherwise hold the page's search for its machine for as long as the network gives up. */
export function patiently(promise, ms = 4000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('timeout')), ms); })])
        .finally(() => clearTimeout(timer));
}
/** Ask the target what it is. `null` when it is neither a node nor a room, or could not answer. */
export async function askTarget(target, get = globalThis.fetch, timeoutMs = 4000) {
    try {
        const response = await patiently(get(target + '/api/rendezvous', { headers: { accept: 'application/json' }, cache: 'no-store' }), timeoutMs);
        return response.ok ? describeTarget(await response.json()) : null;
    }
    catch {
        return null;
    }
}
/** Whether a room says the node `id` is connected to it now. A room lists nodes to nobody: it answers only
 *  for the ids a page already knows (from its pairing). `null` is no answer. */
export async function askRoomNode(room, id, get = globalThis.fetch, timeoutMs = 4000) {
    try {
        const response = await patiently(get(room + '/api/rendezvous?nodes=' + encodeURIComponent(id), { headers: { accept: 'application/json' }, cache: 'no-store' }), timeoutMs);
        if (!response.ok)
            return null;
        const answer = await response.json();
        const nodes = Array.isArray(answer) ? answer : Array.isArray(answer?.nodes) ? answer.nodes : [];
        const node = nodes.find(entry => entry?.id === id);
        return node ? !!node.connected : null;
    }
    catch {
        return null;
    }
}
