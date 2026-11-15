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

export interface LogSource {
  /** The latest `lines` events, oldest first, as the file has them. Rejects when the log cannot be read; a `signal` that
   *  aborts says nobody is waiting for it any more. */
  tail(lines: number, signal: AbortSignal): Promise<LogEvent[]>;
  /** Tells of events written from now on, oldest first, until stopped (the returned function). Absent: the viewer shows
   *  what it read and no more. */
  follow?(onEvents: (events: LogEvent[]) => void): () => void;
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
