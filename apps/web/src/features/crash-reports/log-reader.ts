import type { LogEvent, LogPiece } from "./log-model";
import { LogCursorExpired, type LogBatch, type LogSource } from "./log-sources";

/* One `LogSource` over the page read both the core and the app serve (logs-api-contract.md): `read({after, limit, wait})`
 * answers `{lines: [{id, text}], cursor, more}`. What differs between the two is how a read is made and how it refuses, which
 * the caller gives as `read`; the tail and the follow are the same here. */

/** What a read asks for: no `after` is the tail. `wait` is in seconds. */
export interface LogRead { after?: string; limit?: number; wait?: number }

/** The page as it is served, validated. */
export interface LogPage { lines: { id: string; text: string }[]; cursor: string; more: boolean }

/** A log that cannot be read (the machine refused, the answer is not a page): not a cursor that expired. */
export class LogUnreadable extends Error {
  constructor(readonly reason: string) { super("The log cannot be read: " + reason); this.name = "LogUnreadable"; }
}

/** The most lines a read may ask for (the contract's bound). */
export const MAX_PAGE_LINES = 1000;
/** The follow asks at most four times a second (the contract's obligation; the core rate-limits a device that asks more). */
export const MIN_FOLLOW_INTERVAL_MS = 250;

export function asPage(value: unknown): LogPage {
  const page = value as Partial<LogPage> | null;
  if (!page || typeof page !== "object" || typeof page.cursor !== "string" || !Array.isArray(page.lines)) throw new LogUnreadable("not a page");
  for (const line of page.lines) if (!line || typeof line.id !== "string" || typeof line.text !== "string") throw new LogUnreadable("not a line");
  return { lines: page.lines, cursor: page.cursor, more: page.more === true };
}

const batchOf = (page: LogPage, piece: LogPiece): LogBatch => ({
  lines: page.lines.map((line): LogEvent => ({ id: line.id, piece, text: line.text })),
  cursor: page.cursor,
});

export interface ReaderOptions {
  /** One read; rejects `LogCursorExpired` for a cursor the log no longer holds, anything else for a failure. A `signal` that aborts rejects. */
  read(options: LogRead, signal: AbortSignal): Promise<LogPage>;
  /** Who wrote what this source reads. */
  piece: LogPiece;
  /** Seconds a follow's read holds for a line (the server clamps it). */
  wait: number;
  /** Test seam: the clock and the pause. */
  sleep?(ms: number, signal: AbortSignal): Promise<void>;
  now?(): number;
}

const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  if (signal.aborted) return resolve();
  const timer = setTimeout(done, ms);
  function done() { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); }
  signal.addEventListener("abort", done);
});

export function readerSource({ read, piece, wait, sleep = pause, now = Date.now }: ReaderOptions): LogSource {
  return {
    async tail({ limit }, signal) {
      return batchOf(await read({ limit: Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_PAGE_LINES) }, signal), piece);
    },
    follow({ sinceCursor }, onLines, onError) {
      const controller = new AbortController();
      const { signal } = controller;
      void (async () => {
        let cursor = sinceCursor;
        try {
          while (!signal.aborted) {
            const began = now();
            const page = await read({ after: cursor, limit: MAX_PAGE_LINES, wait }, signal);
            if (signal.aborted) return;
            cursor = page.cursor;
            if (page.lines.length) onLines(batchOf(page, piece));
            const left = MIN_FOLLOW_INTERVAL_MS - (now() - began);
            if (left > 0) await sleep(left, signal);
          }
        } catch (error) {
          if (!signal.aborted) onError?.(error);
        }
      })();
      return () => controller.abort();
    },
  };
}

export { LogCursorExpired };
