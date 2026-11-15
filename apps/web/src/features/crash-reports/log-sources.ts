import type { LogEvent } from "./log-model";

/* Where the viewer gets log lines from. Logs live on the machine that wrote them and are kept nowhere else: the app does
 * not cache them, so a machine that is not connected has none to show.
 *
 * No log is readable from the page yet: the app's own log has a bridge that opens its folder (`host().localHost.revealLog`)
 * and none that reads it, and no machine's core serves its log lines. Until they do, no source is installed and every tab says
 * so. The seam is this file: whatever reads a log is a `LogSource`, given by `installLogSources`; the viewer asks for a place
 * and draws what it is given. */

/** A place whose logs there are: the device the app runs on (the app's own log, and its connector's and core's when it
 *  hosts them), or a paired machine by its row's id. */
export type LogPlace = { kind: "device" } | { kind: "machine"; id: string };

/** Where a read ended: opaque to the viewer, which only hands it back. A source gives one with every batch of lines it
 *  delivers, and it means "right after the last line of this batch". */
export type LogCursor = string;

/** Lines, oldest first, as the file has them, and the cursor right after the last of them. */
export interface LogBatch {
  lines: LogEvent[];
  cursor: LogCursor;
}

/** What a source's `follow` reports (`onError`) when its cursor is no longer in the log. */
export class LogCursorExpired extends Error {
  constructor() { super("The cursor is no longer in the log"); this.name = "LogCursorExpired"; }
}

/* The contract of a source (for whoever implements one: the app's own log, a machine's core):
 *
 * - `tail` reads the latest `limit` lines and says where it stopped. An empty log answers `{ lines: [], cursor }` with the
 *   cursor of its start. It rejects when the log cannot be read; a `signal` that aborts says nobody is waiting any more.
 * - `follow({ sinceCursor })` delivers every line written AFTER that cursor, in order, whenever it was written: what came
 *   between the `tail` and the `follow` is delivered first (catch-up), then what is written from then on. Not "from now": a
 *   source that starts at the moment of the call drops the lines of that gap. Each batch carries its own cursor, the one to
 *   come back with. No line is delivered twice (a cursor never goes back), and `LogEvent.id` is unique within the place.
 * - The viewer follows once per tab, after its `tail`, and calls the returned function when it leaves.
 * - `onError`: the follow broke (the link to a machine dropped, the process went away). The follow is over; nothing more will
 *   be delivered by it. The viewer keeps what it holds and follows again from the last cursor it received, a few times, before
 *   it says the log stopped. A cursor the log no longer holds (rotated away) is a `LogCursorExpired`: the lines after it can
 *   no longer be told, so the viewer reads the log again from its tail instead.
 * - `onEnd`: the log ended for good (not an error: nothing is written any more). No retry.
 * A source without `follow` shows what `tail` read and no more. */
export interface LogSource {
  tail(options: { limit: number }, signal: AbortSignal): Promise<LogBatch>;
  follow?(options: { sinceCursor: LogCursor }, onLines: (batch: LogBatch) => void, onError?: (error: unknown) => void, onEnd?: () => void): () => void;
}

export interface LogSources {
  /** The source for `place`, or null where there is none (not readable from here). */
  open(place: LogPlace): LogSource | null;
}

const NONE: LogSources = { open: () => null };
let installed: LogSources = NONE;
let version = 0;
const listeners = new Set<() => void>();
const changed = () => { version++; for (const listener of listeners) listener(); };

/** Makes `sources` what the viewer reads from; returns how to take it away again. */
export function installLogSources(sources: LogSources): () => void {
  installed = sources;
  changed();
  return () => { if (installed === sources) { installed = NONE; changed(); } };
}

/** Changes with every install or removal, for whatever must read the source again. */
export const logSourcesVersion = () => version;

export const logSourceFor = (place: LogPlace): LogSource | null => installed.open(place);

/** Be told when the sources change (an app that offers its log late); returns the unsubscription. */
export function onLogSources(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const placeKey = (place: LogPlace) => place.kind === "device" ? "device" : "machine:" + place.id;
