import { busySince, workingDeadline, type SessionStore } from "../state/room-session-state.js";

/* The runtime's part in Working's wait (WORKING_SHOWN_AFTER_MS): on every transition of the room's store it records since
 * when each conversation has been busy without a break (`workingSince`), and when the next one is due to show, it gives
 * the store that moment as its clock fact (`now`). The store derives the rest (room-session-state.js `working`). */

const same = (a: Record<string, number>, b: Record<string, number> | undefined) => {
  const keys = Object.keys(a);
  return !!b && keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};

/** Follows `store` until the returned function stops it. */
export function followWorking(store: SessionStore): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let due: number | null = null;
  const reconcile = () => {
    const facts = store.getState().facts;
    const since = busySince(facts, Date.now());
    // The patch publishes again, and that pass schedules.
    if (!same(since, facts.workingSince)) { store.patch({ workingSince: since }); return; }
    const deadline = workingDeadline(facts);
    if (deadline === due) return;
    if (timer) clearTimeout(timer);
    timer = null;
    due = deadline;
    if (deadline !== null) timer = setTimeout(() => {
      timer = null;
      due = null;
      store.patch({ now: Math.max(Date.now(), deadline, store.getState().facts.now) });
    }, Math.max(0, deadline - Date.now()));
  };
  const stop = store.subscribe(reconcile);
  reconcile();
  return () => { stop(); if (timer) clearTimeout(timer); };
}
