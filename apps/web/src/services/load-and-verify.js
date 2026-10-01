/* Select = load and verify (#124 §6, D11–D12): one model checked before it takes effect, wherever it runs.
 *
 * On this device the model is loaded in a worker of its own — the page's Worker, or the desktop app's native
 * engine behind the same protocol (native-worker.js) — so the one in use keeps working meanwhile: downloaded if it
 * is not on disk yet (progress in bytes), loaded on its accelerator, then checked twice, the first pass warming it
 * up and the second measured (a transcription's turn-final latency; a voice's time to first audio and how fast it
 * generates against real time). The clips, phrases and thresholds are sidevoice-core's (model-check.js). A
 * provider's model is checked by the machine that holds its key (`POST /api/models/check`), with the same data.
 *
 * The answer is never an exception: `{ok, step, reason, passes, …}`. A failure names the step it happened at
 * (download, load, check; key and host for a provider) and its reason as a refusal (`{key, message, …}`); a
 * success carries the worker, loaded, for the caller to put in place of the one in use — and a failure has
 * already let it go. Whether to ask about a slow model, and what to store, is stage-selection.js's. */
import {clip,phrase,transcriptProblem,audioProblem,slow,wavSamples,failure} from '../../../../packages/browser-audio/model-check.js';
import {byteCounter} from './downloads.js';

// What the desktop app answers when a cancel stopped its install, or an unload its load: a cancel, never a failure.
const CANCELLED = new Set(['install_cancelled', 'load_cancelled']);

const PASSES = 2;
const now = () => globalThis.performance?.now?.() ?? Date.now();
const cancelled = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' });

/* One request on a worker of the protocol, its answer awaited: `ready` for a load, `result` for a transcription,
 * every `audio` until `done` for a voice. An `error` rejects with the step it names and its refusal. */
function ask(worker, message, { onProgress, onAudio, signal } = {}) {
    return new Promise((resolve, reject) => {
        const end = (settle, value) => { signal?.removeEventListener('abort', abort); worker.onmessage = null; worker.onerror = null; settle(value); };
        const abort = () => end(reject, cancelled());
        if (signal?.aborted) return reject(cancelled());
        signal?.addEventListener('abort', abort);
        worker.onmessage = ({ data }) => {
            if (data?.id !== message.id) return;
            if (data.type === 'progress') onProgress?.(data.progress || {});
            else if (data.type === 'audio') onAudio?.(data);
            else if (data.type === 'error') end(reject, Object.assign(new Error(data.error), { step: data.step, reason: data.reason }));
            else if (data.type === 'ready' || data.type === 'result' || data.type === 'done') end(resolve, data);
        };
        worker.onerror = (event) => end(reject, new Error(event?.message || 'The engine stopped.'));
        worker.postMessage(message);
    });
}

/* Download progress across the files a load fetches, in bytes (downloads.js's counter, which also carries the
 * desktop app's own speed). The step is the download while a file is still arriving, the load after. */
function tracker(expected, onProgress, download) {
    const files = new Map(), bytes = byteCounter(expected);
    const state = { step: download ? 'download' : 'load', loadFrom: null };
    return {
        state,
        progress(event) {
            const name = String(event.job || event.file || event.name || '');
            if (event.status === 'loading') { state.step = 'load'; state.loadFrom = now(); onProgress({ step: 'load' }); return; }
            const counted = bytes(event);
            if (!counted) return;
            if (event.status === 'done') {
                files.set(name, true);
                if ([...files.values()].every(Boolean)) {
                    state.step = 'load'; state.loadFrom = now();
                    onProgress(download ? { step: 'load', ...counted } : { step: 'load' });
                }
                return;
            }
            files.set(name, false);
            // A model already on disk is read from the cache with the same events: that is its load, not a download.
            if (download) onProgress({ step: 'download', ...counted });
        },
        // A failure while a file is still arriving is the download's; after, the load's.
        failedStep() { return download && [...files.values()].some((finished) => !finished) ? 'download' : 'load'; },
    };
}

/** Check a model this device runs. `build` is `{model, engine, accelerator, native, fallback?}` as the engines are
 *  asked for it; `open(native)` makes the worker it is checked in; `fetchClip(url)` the clip's bytes. `language`
 *  is what it is checked in (English when there is no clip for it); a voice is checked with `voice` and `speed`.
 *  `download` says whether one is ahead (false: the model is on disk already), `expected` its size in bytes. */
export async function verifyDevice({ task, build, open, fetchClip, language, voice, speed = 1, expected = 0, download = true, onProgress = () => {}, signal }) {
    const passes = [];
    let worker = null, loaded = false, step = download ? 'download' : 'load', load_ms = null, runtime = null;
    const progress = tracker(expected, (value) => onProgress(value), download);
    const fail = (stepName, error) => {
        worker?.terminate();
        if (error?.name === 'AbortError' || CANCELLED.has(error?.reason?.key)) return { ok: false, cancelled: true, step: stepName, passes, loaded, load_ms };
        // A refusal the engine handed on wins over the words of its message.
        return { ok: false, step: stepName, reason: failure(stepName, error?.reason || error), passes, loaded, load_ms };
    };
    try {
        worker = open(build.native);
        const started = now();
        // A page voice may fall back to WASM when WebGPU fails to load it: the worker does that on the load itself.
        const ready = await ask(worker, { id: 1, type: 'load', model: build.model, engine: build.engine, accelerator: build.accelerator, native: build.native, ...(build.fallback ? { fallback: build.fallback } : {}) },
            { onProgress: (event) => progress.progress(event), signal });
        loaded = true;
        runtime = ready.runtime || { model: build.model, engine: build.engine, accelerator: ready.accelerator || build.accelerator };
        const reported = Number(ready.runtime?.load_ms ?? ready.load_ms);
        load_ms = Math.round(build.native && Number.isFinite(reported) ? reported : now() - (progress.state.loadFrom ?? started));
    } catch (error) {
        step = error?.step === 'download' || error?.step === 'load' ? error.step : progress.failedStep();
        return fail(step, error);
    }
    step = 'check';
    onProgress({ step: 'check', pass: 1, passes: PASSES });
    try {
        if (task === 'stt') {
            const { url, text, language: spoken } = clip(language);
            const samples = wavSamples(await fetchClip(url));
            for (let pass = 1; pass <= PASSES; pass++) {
                onProgress({ step: 'check', pass, passes: PASSES });
                const audio = samples.slice();
                const started = now();
                const answer = await ask(worker, { id: 1 + pass, type: 'transcribe', audio: audio.buffer, model: build.model, engine: build.engine, accelerator: build.accelerator, native: build.native, language: spoken }, { signal });
                const heard = String(answer.result?.text ?? '');
                passes.push({ latency_ms: Math.round(now() - started), text: heard });
                const problem = transcriptProblem(text, heard);
                if (problem) return { ...fail('check', problem), language: spoken };
            }
            const latency = passes.at(-1).latency_ms;
            return { ok: true, step: 'done', worker, runtime, loaded, load_ms, passes, latency_ms: latency, slow: slow(latency), language: spoken };
        }
        const { text, language: spoken } = phrase(language);
        for (let pass = 1; pass <= PASSES; pass++) {
            onProgress({ step: 'check', pass, passes: PASSES });
            const chunks = [];
            let first = null, rate = 24000;
            const started = now();
            await ask(worker, { id: 1 + pass, type: 'speak', text, voice, speed, model: build.model, engine: build.engine, accelerator: build.accelerator, native: build.native, fallback: build.fallback },
                { signal, onAudio: (data) => { first ??= now(); rate = data.sampleRate || rate; chunks.push(data.samples); } });
            const total = now() - started, count = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const audio = new Float32Array(count);
            let offset = 0;
            for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.length; }
            const seconds = count / rate;
            passes.push({ first_audio_ms: Math.round((first ?? now()) - started), total_ms: Math.round(total), audio_seconds: Math.round(seconds * 100) / 100,
                realtime: total ? Math.round(seconds * 100000 / total) / 100 : null });
            const problem = audioProblem(audio, rate);
            if (problem) return { ...fail('check', problem), language: spoken };
        }
        return { ok: true, step: 'done', worker, runtime, loaded, load_ms, passes, latency_ms: passes.at(-1).first_audio_ms, slow: false, language: spoken };
    } catch (error) {
        return fail('check', error);
    }
}

/** Check a provider's model on the machine that holds its key. `request(path, options)` is the page's fetch to that
 *  machine (its token, its route). The machine answers `{ok, step, reason, …}`; a request it refuses, or one that
 *  never reaches it, is a failure too — never thrown. */
export async function verifyProvider({ task, stage, language, request, signal }) {
    let answer;
    try {
        answer = await request('/api/models/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
            body: JSON.stringify({ stage: task, place: stage.place, model: stage.model, options: stage.options || {}, language }) });
    } catch (error) {
        if (error?.name === 'AbortError') return { ok: false, cancelled: true, step: 'host', passes: [] };
        return { ok: false, step: 'host', reason: { key: 'host_unreachable', message: 'The machine could not be reached.', detail: String(error?.message || error) }, passes: [] };
    }
    let body = null;
    try { body = await answer.json(); } catch { body = null; }
    if (!answer.ok || !body || typeof body !== 'object') {
        const detail = body?.detail;
        const reason = detail && typeof detail === 'object' ? detail : { key: 'host_unreachable', message: typeof detail === 'string' ? detail : `The machine answered ${answer.status}.` };
        // Too many checks is the machine's budget speaking (sidevoice-core#25): the check failed, the machine answered.
        return { ok: false, step: answer.status === 429 ? 'check' : 'host', reason, passes: [] };
    }
    return { passes: [], ...body };
}
