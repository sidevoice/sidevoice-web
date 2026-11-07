/* What this page has told its machine and not yet heard acknowledged: a turn of the person's, or what became of a reply.
 * Each entry is one idempotent message, named by its id (the `client_msg_id` the machine acknowledges), so sending it
 * again costs nothing; it is let go only once the machine has taken it. The copy in memory is the one read and kept in
 * order; IndexedDB keeps it across a reload, and where there is none (a private window, a test) memory alone does.
 * Nothing expires with time — what a person said is never lost to a clock — so the bound is a count: past `limit`
 * the oldest entry goes. Entries belong to one `scope` (a tab): another tab's are never read, and what tabs that
 * never came back left stored is let go, oldest first, once the store holds more than `limit` of theirs. */
/* A bound on what one tab keeps, large enough that a person never reaches it: past it a new message is refused (`add`
 * answers null, and the page says so), never an older one let go, since a later message must not be delivered when an
 * earlier one was silently dropped. */
export const OUTBOX_LIMIT = 2000;
const DATABASE = 'sidevoice-outbox', STORE = 'messages';

/* `orderStore` (a localStorage-like `getItem`/`setItem`) keeps the highest `order` given, so a new entry has its final place
 * at once and is stored as soon as the database is open, without waiting to read what an earlier load kept. */
export function createOutbox({ scope = 'page', indexedDB = globalThis.indexedDB, now = () => Date.now(), limit = OUTBOX_LIMIT, orderStore = null } = {}) {
    const orderKey = 'sidevoice.outbox-order.' + scope;
    const readOrder = () => { try { return Number(orderStore?.getItem(orderKey)) || 0; } catch { return 0; } };
    const keepOrder = (value) => { try { orderStore?.setItem(orderKey, String(value)); } catch { /* the read of the store sets it right */ } };
    const entries = new Map(), forgotten = new Set();
    const orderTrusted = readOrder() > 0;
    let db = null, loading = true, order = readOrder();
    // What is stored: the entry's own fields, never whatever its sender keeps on it in memory.
    const record = (entry) => ({ id: entry.id, scope, kind: entry.kind, session_id: entry.session_id, node: entry.node, payload: entry.payload, created: entry.created, order: entry.order });
    // `order` alone ranks: it only grows, also across reloads (the stored maximum is read back), so a clock that moved back never reorders.
    const sorted = () => [...entries.values()].sort((a, b) => a.order - b.order);
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
    function add({ id, kind, session_id = null, node = null, payload }) {
        if (!entries.has(id) && entries.size >= limit) return null;
        const entry = { id, kind, session_id, node, payload, created: now(), order: ++order };
        keepOrder(order);
        entries.set(id, entry);
        write((store) => store.put(record(entry)));
        return entry;
    }
    function open() {
        return new Promise((resolve) => {
            const done = () => { loading = false; forgotten.clear(); resolve(); };
            let request = null;
            try { request = indexedDB?.open(DATABASE, 1) || null; } catch { request = null; }
            if (!request) { done(); return; }
            request.onupgradeneeded = () => { try { request.result.createObjectStore(STORE, { keyPath: 'id' }); } catch { /* already there */ } };
            request.onerror = () => done();
            request.onsuccess = () => {
                // `db` is set only once the stored maximum of `order` is known (below): an entry added before that stays in memory, so
                // none is ever stored under an order that restarted at 1 and sorts before an older stored one after a crash.
                const opened = request.result;
                // With the order kept apart, an entry added meanwhile is final and may be stored now.
                // Only where the counter has a value: without one (first use, or cleared) the order is only known after the read.
                if (orderTrusted) db = opened;
                let read;
                try { read = opened.transaction(STORE, 'readonly').objectStore(STORE).getAll(); } catch { db = opened; done(); return; }
                read.onerror = () => { db = opened; done(); };
                read.onsuccess = () => {
                    db = opened;
                    const others = [], earlier = new Set(entries.keys());
                    let storedMax = 0;
                    for (const stored of read.result || []) {
                        if (stored?.scope === scope) storedMax = Math.max(storedMax, stored.order || 0);
                        if (stored?.id == null) continue;
                        if (stored.scope !== scope) { others.push(stored); continue; }
                        if (forgotten.has(stored.id)) { write((store) => store.delete(stored.id)); continue; }
                        if (entries.has(stored.id)) continue;
                        entries.set(stored.id, { ...stored });
                        order = Math.max(order, stored.order || 0);
                    }
                    // What was said while the store was still loading came after everything it kept: it keeps its place behind it.
                    const early = [...entries.values()].filter((entry) => earlier.has(entry.id)).sort((a, b) => a.order - b.order);
                    // Only where the kept order fell behind what is stored (it was cleared): those take their place behind it.
                    const behind = early.filter((entry) => entry.order <= storedMax);
                    for (const entry of behind) entry.order = ++order;
                    if (behind.length) keepOrder(order);
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
        list() { return sorted(); },
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
