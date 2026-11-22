import { useSyncExternalStore } from "react";

/* A service of the person's own — the connector or the core, on this device or on a paired machine — that failed and was
 * restarted: what the room tells them once, as the app's ordinary error notice, until they put it away. It is a record of
 * something past (the service is up again), so nothing retires it but the person's ×.
 *
 * Where these come from is not decided here: `reportServiceFailure` is the one way in, for whatever learns of one (the crash
 * records a machine keeps for its paired apps). Nothing calls it yet. */

export type ServicePiece = "connector" | "core";

export interface ServiceFailure {
  /** Stable for the failure (a crash record's id): reporting it twice shows it once. */
  id: string;
  piece: ServicePiece;
  /** The machine's row (its `id`); null: this device's own. */
  machine: string | null;
  /** The stable error code (`connector.process_exited`, `core.panic`). */
  code: string;
  /** When it happened, in ms since the epoch. */
  at: number;
  /** The piece's version. */
  version: string;
  /** How the process ended, where it is known. */
  exit?: { code: number };
}

let failures: readonly ServiceFailure[] = [];
const listeners = new Set<() => void>();
const changed = () => { for (const listener of listeners) listener(); };

/** A failure learnt of: newest first, once per id. */
export function reportServiceFailure(failure: ServiceFailure) {
  if (failures.some((known) => known.id === failure.id)) return;
  failures = [failure, ...failures];
  changed();
}

/** The failures as strips: those of one piece on one place with the same code are one strip with how many they were (a service
 *  that fails in a loop is one line, not a wall of them), the newest first. */
export interface FailureGroup {
  /** The newest of them: what the strip says and its details. */
  latest: ServiceFailure;
  count: number;
  /** Every failure of the group, to put them all away with its ×. */
  ids: string[];
}

/** The most strips the room shows at once; the rest are there under them, and come up as these are put away. */
export const MAX_FAILURE_STRIPS = 3;

export function groupFailures(failures: readonly ServiceFailure[]): FailureGroup[] {
  const groups = new Map<string, FailureGroup>();
  for (const failure of failures) {
    const key = `${failure.machine ?? ""}\u0000${failure.piece}\u0000${failure.code}`;
    const group = groups.get(key);
    if (group) { group.count++; group.ids.push(failure.id); }
    else groups.set(key, { latest: failure, count: 1, ids: [failure.id] });
  }
  return [...groups.values()];
}

/** The person put it away. */
export function dismissServiceFailure(id: string) {
  const next = failures.filter((failure) => failure.id !== id);
  if (next.length === failures.length) return;
  failures = next;
  changed();
}

export function resetServiceFailures() {
  failures = [];
  changed();
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useServiceFailures(): readonly ServiceFailure[] {
  return useSyncExternalStore(subscribe, () => failures, () => failures);
}
