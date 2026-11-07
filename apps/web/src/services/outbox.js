/* What this page has told its machine and not yet heard acknowledged: a turn of the person's, or what became of a reply.
 * Each entry is one idempotent message, named by its id (the `client_msg_id` the machine acknowledges), so sending it
 * again costs nothing; it is let go only once the machine has taken it. The copy in memory is the one read and kept in
 * order; IndexedDB keeps it across a reload, and where there is none (a private window, a test) memory alone does.
 * Nothing expires with time — what a person said is never lost to a clock — so the bound is a count: past `limit`
 * the oldest entry goes. Entries belong to one `scope` (a tab): another tab's are never read, and what tabs that
 * never came back left stored is let go, oldest first, once the store holds more than `limit` of theirs. */
export const OUTBOX_LIMIT = 200;
const DATABASE = 'sidevoice-outbox', STORE = 'messages';

export function createOutbox({ scope = 'page', indexedDB = globalThis.indexedDB, now = () => Date.now(), limit = OUTBOX_LIMIT } = {}) {
    const entries = new Map(), forgotten = new Set();
    let db = null, loading = true, order = 0;
    // What is stored: the entry's own fields, never whatever its sender keeps on it in memory.
    const record = (entry) => ({ id: entry.id, scope, kind: entry.kind, session_id: entry.session_id, node: entry.node, payload: entry.payload, created: entry.created, order: entry.order });
    const sorted = () => [...entries.values()].sort((a, b) => a.created - b.created || a.order - b.order);
    function write(change) {
        if (!db) return;
        try { change(db.transaction(STORE, 'readwrite').objectStore(STORE)); } catch { /* memory still holds it */ }
    }
    function remove(id) {
        const had = entries.delete(id);
        // Taken before the stored copies were read: the stored one must not come back.
        if (loading) forgotten.add(id);
        write((store) => store.delete(id));
        return had;
    }
    function prune() {
        const kept = sorted();
        for (const entry of kept.slice(0, Math.max(0, kept.length - limit))) remove(entry.id);
    }
    function add({ id, kind, session_id = null, node = null, payload }) {
        const entry = { id, kind, session_id, node, payload, created: now(), order: ++order };
        entries.set(id, entry);
        write((store) => store.put(record(entry)));
        prune();
        return entry;
    }
    function open() {
        return new Promise((resolve) => {
            const done = () => { loading = false; forgotten.clear(); prune(); resolve(); };
            let request = null;
            try { request = indexedDB?.open(DATABASE, 1) || null; } catch { request = null; }
            if (!request) { done(); return; }
            request.onupgradeneeded = () => { try { request.result.createObjectStore(STORE, { keyPath: 'id' }); } catch { /* already there */ } };
            request.onerror = () => done();
            request.onsuccess = () => {
                db = request.result;
                let read;
                try { read = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(); } catch { done(); return; }
                read.onerror = () => done();
                read.onsuccess = () => {
                    const others = [], earlier = new Set(entries.keys());
                    for (const stored of read.result || []) {
                        if (stored?.id == null) continue;
                        if (stored.scope !== scope) { others.push(stored); continue; }
                        if (forgotten.has(stored.id)) { write((store) => store.delete(stored.id)); continue; }
                        if (entries.has(stored.id)) continue;
                        entries.set(stored.id, { ...stored });
                        order = Math.max(order, stored.order || 0);
                    }
                    // What was said while the store was still loading came after everything it kept: it keeps its place behind it.
                    const early = [...entries.values()].filter((entry) => earlier.has(entry.id)).sort((a, b) => a.created - b.created || a.order - b.order);
                    for (const entry of early) entry.order = ++order;
                    others.sort((a, b) => a.created - b.created || a.order - b.order);
                    for (const stored of others.slice(0, Math.max(0, others.length - limit))) write((store) => store.delete(stored.id));
                    // What was added before the database opened is stored now.
                    for (const entry of entries.values()) write((store) => store.put(record(entry)));
                    done();
                };
            };
        });
    }
    const ready = open();
    return {
        /** Settles once the entries stored by an earlier load of this tab are in memory (at once without IndexedDB). */
        ready,
        add,
        remove,
        get: (id) => entries.get(id) || null,
        /** Every entry, oldest first. */
        list() { prune(); return sorted(); },
        /** Lets go every entry `which` names (all of them without it). */
        clear(which = () => true) { for (const entry of sorted()) if (which(entry)) remove(entry.id); },
        get size() { return entries.size; },
    };
}

/* How long a message waits for its acknowledgement on an open socket before the page says it again, by how many times it
 * has gone on that socket: 5 s, 10 s, 20 s, 40 s, then every minute for as long as it takes. A new socket starts the
 * count again and sends at once. Saying it again is safe (the machine takes each `client_msg_id` once), and what is said
 * again goes in the order it was kept, from the oldest unacknowledged entry on: nothing newer is ever said before it. */
export const RESEND_BACKOFF_MS = [5000, 10000, 20000, 40000, 60000];
export function resendDelay(sent) {
    return RESEND_BACKOFF_MS[Math.min(Math.max(1, sent | 0), RESEND_BACKOFF_MS.length) - 1];
}
