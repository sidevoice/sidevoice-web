/* Every model or engine download this device has in flight, wherever it was started from — a model selected in
 * Configuración (#124 §6), or a call that connects with a model not on disk yet — and whichever engine fetches it:
 * this page's (transformers.js, into the browser's cache) or the desktop app's (the bridge's `install`, which
 * reports its own speed). The room shows them while they run and briefly after (DownloadsIndicator); each one
 * carries the way to cancel it, which is its starter's. Pure apart from the clock and the timer it is given. */

/** A load's progress events (transformers.js's per file, or the native worker's one per job) as bytes: done and
 *  total across the files, `expected` (the catalogue's size) being the total until the files say more. */
export function byteCounter(expected = 0) {
    const files = new Map();
    return (event) => {
        if (!['progress', 'download', 'initiate', 'done'].includes(event?.status)) return null;
        const name = String(event.job || event.file || event.name || '');
        const file = files.get(name) || {};
        if (Number.isFinite(event.loaded)) file.loaded = event.loaded;
        if (Number.isFinite(event.total) && event.total > 0) file.total = event.total;
        if (event.status === 'done' && file.total) file.loaded = file.total;
        files.set(name, file);
        const done = [...files.values()].reduce((sum, each) => sum + (each.loaded || 0), 0);
        const total = Math.max(expected || 0, [...files.values()].reduce((sum, each) => sum + (each.total || 0), 0));
        return { done, total: total || null, bytes_per_s: Number.isFinite(event.bytes_per_s) ? event.bytes_per_s : null };
    };
}

/** The registry. `publish(items)` gets every change; an item that ended stays `keepMs`, then goes. */
export function createDownloads({ publish, now = () => Date.now(), keepMs = 8000, schedule = (fn, ms) => setTimeout(fn, ms) }) {
    const items = new Map();
    const emit = () => publish([...items.values()].map(({ cancel: _cancel, sample: _sample, ...item }) => ({ ...item })));

    /** A download begins (or begins again): what it is, how big it is expected to be, and how to stop it. */
    function start({ id, label, task, kind, total = null, cancel = null }) {
        items.set(id, { id, label, task, kind, state: 'running', done: 0, total: total || null, bytes_per_s: null, eta_s: null, error: '',
            started: now(), ended: null, cancel, sample: null });
        emit();
    }
    /** Bytes so far. The speed is the engine's when it measures it (the desktop app does), else measured here over
     *  the last second or so, smoothed so one slow chunk does not swing the time left. */
    function update(id, { done, total, bytes_per_s } = {}) {
        const item = items.get(id);
        if (!item || item.state !== 'running') return;
        const at = now();
        if (Number.isFinite(done)) {
            if (Number.isFinite(bytes_per_s)) item.bytes_per_s = Math.max(0, bytes_per_s);
            else if (!item.sample) item.sample = { at, done };
            else if (at - item.sample.at >= 750) {
                const rate = Math.max(0, (done - item.sample.done) * 1000 / (at - item.sample.at));
                item.bytes_per_s = item.bytes_per_s == null ? rate : Math.round(item.bytes_per_s * 0.6 + rate * 0.4);
                item.sample = { at, done };
            }
            item.done = done;
        }
        if (Number.isFinite(total) && total > 0) item.total = total;
        item.eta_s = item.total && item.bytes_per_s > 0 ? Math.max(0, Math.round((item.total - item.done) / item.bytes_per_s)) : null;
        emit();
    }
    /** It ended: 'done', 'failed' (with why) or 'cancelled'. Only a running download ends. */
    function end(id, state, error = '') {
        const item = items.get(id);
        if (!item || item.state !== 'running') return;
        Object.assign(item, { state, error, ended: now(), eta_s: null, cancel: null });
        if (state === 'done' && item.total) item.done = item.total;
        emit();
        schedule(() => { if (items.get(id) === item) { items.delete(id); emit(); } }, keepMs);
    }
    /** The person stops it: its starter is asked to, and it is said cancelled at once. */
    function cancel(id) {
        const item = items.get(id);
        if (!item || item.state !== 'running') return false;
        const stop = item.cancel;
        end(id, 'cancelled');
        try { stop?.(); } catch { /* the starter's own business */ }
        return true;
    }
    const running = (id) => items.get(id)?.state === 'running';
    return { start, update, end, cancel, running };
}
