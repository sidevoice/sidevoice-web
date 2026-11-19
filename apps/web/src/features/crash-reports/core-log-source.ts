import { asPage, LogUnreadable, readerSource, type LogRead } from "./log-reader";
import { LogCursorExpired, type LogSource } from "./log-sources";

/* A machine's core log: `GET /api/logs?limit=&after=&wait=` with the pairing's bearer (core `rust/server/logs.rs`). The
 * answer's `detail` is a sentence in the person's language, so what a refusal is, is its status: 400 request invalid, 401 the
 * device is unpaired, 403 origin refused, 410 `logs.cursor_expired`, 429 too many reads, 503 `logs.unreadable`. */

/** Seconds a follow's read holds: under the core's 25 s clamp. */
const CORE_WAIT_SECONDS = 20;

/** The page's request to the machine, made with its pairing (the room controller's `hostFetch`): the path and query only. */
export type MachineFetch = (path: string, signal: AbortSignal) => Promise<Response>;

export function coreLogPath({ after, limit, wait }: LogRead): string {
  const query = new URLSearchParams();
  if (limit !== undefined) query.set("limit", String(limit));
  if (after !== undefined) query.set("after", after);
  if (wait !== undefined) query.set("wait", String(wait));
  return "/api/logs?" + query.toString();
}

export function coreLogSource(request: MachineFetch): LogSource {
  return readerSource({
    piece: "core",
    wait: CORE_WAIT_SECONDS,
    async read(options, signal) {
      let response: Response;
      try {
        response = await request(coreLogPath(options), signal);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") throw error;
        throw new LogUnreadable("unreachable");
      }
      if (response.status === 410) throw new LogCursorExpired();
      if (!response.ok) throw new LogUnreadable(String(response.status));
      try {
        return asPage(await response.json());
      } catch (error) {
        throw error instanceof LogUnreadable ? error : new LogUnreadable("not json");
      }
    },
  });
}
