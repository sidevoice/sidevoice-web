/* What selecting a model does, per stage: one action, the same for every place.
 *
 *   consent (only for a download) → running (download, load, check) → slow? (the person decides) → done
 *                                          └──────────── failed (step, reason) ───────────┘
 *
 * The stage in use is never touched until a check passed: a failure, a cancel or "elegir otro" let the candidate go
 * (`discard`) and the previous model stays active and loaded. Only a passed check (and, when it was slow, the
 * person's "usar igualmente") calls `activate`, which hands the candidate over (in a call, the call has to take it),
 * and only once that went through stores the choice and unloads the previous model; an activation that fails throws
 * (its `reason`, a refusal) having changed nothing, and the candidate is let go. Activation says when it reaches its
 * commit point (`commit()`): from there it is finished, and a cancel no longer applies. A newer selection of the same stage replaces one in flight.
 *
 * The how is injected — `consent(task, stage)` says what a download costs (null when there is none),
 * `verify(task, stage, {onProgress, signal})` is load-and-verify.js's, `activate` and `discard` are the
 * controller's — and what the pane shows is published as one record per stage. */
export function createStageSelection({ publish, consent, verify, activate, discard }) {
    const runs = {};
    let serial = 0;

    function cancel(task) {
        const run = runs[task];
        // Past the commit point the change has happened (a call took the new session): it is finished, not undone.
        if (!run || run.committed) return;
        delete runs[task];
        run.controller.abort();
        run.decide?.(false);
        publish(task, null);
    }

    /* Select `stage` for `task`: checked, and in effect only if it passes. `recheck` checks what is already in use
     * — for its numbers (Diagnóstico) — and changes nothing either way. */
    async function select(task, stage, { recheck = false } = {}) {
        cancel(task);
        const run = { id: ++serial, controller: new AbortController(), decide: null };
        runs[task] = run;
        const live = () => runs[task] === run;
        const decision = () => new Promise((resolve) => { run.decide = resolve; });
        let result = null;
        try {
            const needed = recheck ? null : await consent(task, stage);
            if (!live()) return false;
            if (needed) {
                publish(task, { phase: 'consent', stage, size: needed.size || 0 });
                if (!await decision()) { if (live()) publish(task, null); return false; }
                if (!live()) return false;
            }
            publish(task, { phase: 'running', stage, progress: { step: needed ? 'download' : 'load' }, recheck });
            result = await verify(task, stage, { signal: run.controller.signal,
                onProgress: (progress) => { if (live()) publish(task, { phase: 'running', stage, progress, recheck }); } });
            if (!live() || result.cancelled) {
                discard(task, stage, result);
                // Cancelled from elsewhere (the desktop app's own cancel): over, and not a failure (N03).
                if (live()) { delete runs[task]; publish(task, null); }
                return false;
            }
            if (!result.ok) {
                discard(task, stage, result);
                publish(task, { phase: 'failed', stage, step: result.step, reason: result.reason, result, recheck });
                return false;
            }
            if (recheck) {
                discard(task, stage, result);
                publish(task, { phase: 'done', stage, result, recheck });
                return true;
            }
            if (result.slow) {
                publish(task, { phase: 'slow', stage, result });
                if (!await decision() || !live()) { discard(task, stage, result); if (live()) { delete runs[task]; publish(task, null); } return false; }
            }
            // Taking effect is part of the selection: a call that refuses the change leaves everything as it was, and
            // only an activation that went through is done.
            publish(task, { phase: 'running', stage, progress: { step: 'apply' } });
            await activate(task, stage, result, { signal: run.controller.signal, commit: () => { run.committed = true; } });
            if (live()) publish(task, { phase: 'done', stage, result });
            return live();
        } catch (error) {
            if (result?.ok) discard(task, stage, result);
            if (live()) publish(task, { phase: 'failed', stage, step: 'apply', reason: error?.reason || { key: 'apply_failed', message: String(error?.message || error) }, result, recheck });
            return false;
        } finally {
            if (runs[task] === run) delete runs[task];
        }
    }

    return {
        select,
        /** The person's answer to the question in front of them: download (consent), or use it although slow. */
        decide(task, yes) { runs[task]?.decide?.(!!yes); },
        /** Stop whatever this stage's selection is doing; nothing changes. */
        cancel,
        /** Forget what the pane says about the last selection (a finished or failed one). */
        dismiss(task) { if (!runs[task]) publish(task, null); },
        busy(task) { return !!runs[task]; },
    };
}
