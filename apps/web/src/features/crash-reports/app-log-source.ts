import type { AppLogBridge } from "../../host";
import { asPage, LogUnreadable, readerSource } from "./log-reader";
import { LogCursorExpired, type LogSource } from "./log-sources";

/* The app's own log (the desktop's `app_log_read`, behind `host().appLog`). It holds a read to a few seconds. Refusals are
 * `{key, message}`: `log.cursor_expired`, `log.unreadable`, `log.request_invalid`. */

/** Seconds a follow's read holds: the app clamps it to 5. */
const APP_WAIT_SECONDS = 5;

export function appLogSource(bridge: AppLogBridge): LogSource {
  return readerSource({
    piece: "app",
    wait: APP_WAIT_SECONDS,
    async read(options, signal) {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      // The bridge cannot be cancelled: an abort ends the wait for it, and its answer is dropped.
      const aborted = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
      try {
        return asPage(await Promise.race([bridge.read(options), aborted]));
      } catch (error) {
        if (error instanceof LogUnreadable || (error as Error)?.name === "AbortError") throw error;
        const key = (error as { key?: unknown } | null)?.key;
        if (key === "log.cursor_expired") throw new LogCursorExpired();
        throw new LogUnreadable(typeof key === "string" ? key : "failed");
      }
    },
  });
}
