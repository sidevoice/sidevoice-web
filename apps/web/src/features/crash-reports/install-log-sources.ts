import { host } from "../../host";
import type { MachineView } from "../../state/room-types";
import { appLogSource } from "./app-log-source";
import { coreLogSource } from "./core-log-source";
import { installLogSources, type LogPlace, type LogSource, type LogSources } from "./log-sources";

/* What this page can read of the logs, by place:
 *   - this device: the app's own log, where the app serves it (`host().appLog`); a browser has none.
 *   - a paired machine: its core's log, over the pairing (`GET /api/logs`), from any device.
 * The connector's log is no source here (task #4): it would join as a third piece, a source that answers `piece: "connector"`
 * for a place, beside these two. */

export function webLogSources(machines: () => readonly MachineView[]): LogSources {
  return {
    open(place: LogPlace): LogSource | null {
      if (place.kind === "device") {
        const bridge = host().appLog;
        return bridge ? appLogSource(bridge) : null;
      }
      const fp = machines().find((machine) => machine.id === place.id)?.pairingId;
      if (!fp) return null;
      return coreLogSource((path, signal) => {
        const fetchHost = window.sidevoiceActions?.hostFetch;
        if (!fetchHost) return Promise.reject(new Error("unreachable"));
        return fetchHost(fp, path, { signal, cache: "no-store", headers: { accept: "application/json" } });
      });
    },
  };
}

/** Makes the page's logs what the viewer reads; returns how to take them away. */
export const installWebLogSources = (machines: () => readonly MachineView[]) => installLogSources(webLogSources(machines));
