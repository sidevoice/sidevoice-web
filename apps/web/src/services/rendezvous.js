/* Where this page talks to, and nothing else (docs/RENDEZVOUS.md, "Web client contract").
 *
 * Two addresses. The *target* is the one the page was pointed at: a room, or a node directly. Pairing,
 * the machines list and telemetry are the room's and go there. The *node base* is where the
 * conversations and the call live: the node itself, or the room's relay to the node this page chose.
 * Every `/api/presentation…` request and the call socket go to the node base.
 *
 * Addresses are prefixes. `''` is the page's own origin, so a page served by its target keeps every
 * path relative, exactly as it was before the split; `/nodes/<id>` is a node behind that same room; an
 * absolute URL is a target on another origin (a desktop shell). No DOM, storage or clock in here: the
 * controller decides when to ask, and these say what the answer means. */

/** The target: what a desktop shell set in `window.__SIDEVOICE_TARGET__`, else the page's own origin.
 *  Never the page's address: a `?target=` in a link would send this page's microphone, its typed text
 *  and any key entered in its settings to whatever server the link named. A value that is not an
 *  http(s) address is not a target; the result never ends in `/`. */
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
/** A conversation, a call, a setting the node applies: everything under `/api/presentation`. */
export function isNodePath(path) {
    return /^\/api\/presentation(?:[/?]|$)/.test(path);
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
/** Which node, among the ones the room lists: a reconnecting call's own while the room still lists it
 *  (a machine that drops for a moment is waited for, not swapped), else the one this device chose last
 *  if it is connected, else the first connected — which, when there is one, is the only one. */
export function pickNode(nodes, { remembered = null, keep = null } = {}) {
    if (keep != null && nodes.some(node => node.id === keep))
        return keep;
    const connected = nodes.filter(node => node.connected);
    return (connected.find(node => node.id === remembered) ?? connected[0])?.id ?? null;
}
/** What the target's `GET /api/rendezvous` answer means for this page. `null` stands for a 404: a room
 *  from before this version, whose own `/api/presentation` is the node. A room with no connected
 *  machine has no node base at all, and says so with `base: null`. */
export function locateNode(answer, target, choice = {}) {
    if (answer?.kind === 'node')
        return { kind: 'node', nodes: [], node: typeof answer.id === 'string' ? answer.id : null, base: target, build: null };
    if (answer?.kind !== 'room')
        return { kind: 'legacy', nodes: [], node: null, base: target, build: null };
    const nodes = (Array.isArray(answer.nodes) ? answer.nodes : []).filter(node => node && typeof node.id === 'string' && node.id);
    const node = pickNode(nodes, choice);
    return { kind: 'room', nodes, node, base: node == null ? null : target + '/nodes/' + encodeURIComponent(node),
        build: typeof answer.web_build === 'string' ? answer.web_build : null };
}
/** Ask the target what it is. `null` when it could not answer — unreachable, or failing — which is
 *  not an answer: the page keeps what it had rather than forget a node over one lost request. */
export async function askRendezvous(target, choice = {}, get = globalThis.fetch) {
    let response;
    try {
        response = await get(target + '/api/rendezvous', { headers: { accept: 'application/json' }, cache: 'no-store' });
    }
    catch {
        return null;
    }
    if (response.status === 404)
        return locateNode(null, target, choice);
    if (!response.ok)
        return null;
    try {
        return locateNode(await response.json(), target, choice);
    }
    catch {
        return null;
    }
}
