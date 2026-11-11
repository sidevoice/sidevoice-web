import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installApp, removeApp } from "../host/testing";
import type { LocalHostVersion } from "../host";
import { getReport, POLL_BUSY_MS, POLL_IDLE_MS, refresh, resetLocalService, subscribe } from "./local-service";
import { host } from "../host";

/* This device's service as the app's bridge reports it (`version()`), kept fresh for whoever shows it: every 2 s while it
 * updates or waits for a call, every minute otherwise, again on focus, and never when nobody listens. */

const report = (update: LocalHostVersion["update"], more: Partial<LocalHostVersion> = {}): LocalHostVersion => ({ bridge: 3, bundled: {}, installed: null, core_api: 1, update, ...more });

function bridge(answers: (LocalHostVersion | Error)[]) {
  const version = vi.fn(async () => { const next = answers.length > 1 ? answers.shift()! : answers[0]; if (next instanceof Error) throw next; return next; });
  installApp({ localHost: { state: async () => ({ state: "running" }), subscribe: () => () => {}, pairing: async () => null, version } });
  return version;
}
const flush = () => vi.advanceTimersByTimeAsync(0);
const ticks = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); removeApp(); resetLocalService(); });

test("asked as soon as someone listens, then every minute while the service is current; nobody listening, nothing asked", async () => {
  const version = bridge([report("current")]);
  await ticks(10 * POLL_IDLE_MS);
  expect(version).not.toHaveBeenCalled();
  const stop = subscribe(() => {});
  await flush();
  expect(version).toHaveBeenCalledTimes(1);
  expect(getReport(host().localHost)?.update).toBe("current");
  await ticks(POLL_IDLE_MS - 1);
  expect(version).toHaveBeenCalledTimes(1);
  await ticks(1);
  expect(version).toHaveBeenCalledTimes(2);
  await ticks(3 * POLL_IDLE_MS);
  expect(version).toHaveBeenCalledTimes(5);
  stop();
  await ticks(10 * POLL_IDLE_MS);
  expect(version).toHaveBeenCalledTimes(5);
});

test("every 2 s while it updates or waits for a call to end — its progress moving —, and every minute again once it is current", async () => {
  const version = bridge([report("updating", { progress: 0.1 }), report("updating", { progress: 0.6 }), report("waiting-call"), report("current", { latest: "0.20.3" })]);
  const heard = vi.fn();
  const stop = subscribe(heard);
  await flush();
  expect(getReport(host().localHost)).toMatchObject({ update: "updating", progress: 0.1 });
  await ticks(POLL_BUSY_MS);
  expect(getReport(host().localHost)).toMatchObject({ update: "updating", progress: 0.6 });
  await ticks(POLL_BUSY_MS);
  expect(getReport(host().localHost)?.update).toBe("waiting-call");
  await ticks(POLL_BUSY_MS);
  expect(getReport(host().localHost)).toMatchObject({ update: "current", latest: "0.20.3" });
  expect(version).toHaveBeenCalledTimes(4);
  expect(heard).toHaveBeenCalledTimes(4);
  // Current: not every 2 s any more.
  await ticks(POLL_BUSY_MS * 5);
  expect(version).toHaveBeenCalledTimes(4);
  await ticks(POLL_IDLE_MS);
  expect(version).toHaveBeenCalledTimes(5);
  stop();
});

test("asked again when the window is focused or shown, not when it is hidden", async () => {
  const version = bridge([report("current")]);
  const stop = subscribe(() => {});
  await flush();
  window.dispatchEvent(new Event("focus"));
  await flush();
  expect(version).toHaveBeenCalledTimes(2);
  const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  await flush();
  expect(version).toHaveBeenCalledTimes(2);
  hidden.mockReturnValue("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  await flush();
  expect(version).toHaveBeenCalledTimes(3);
  stop();
  window.dispatchEvent(new Event("focus"));
  await flush();
  expect(version).toHaveBeenCalledTimes(3);
  hidden.mockRestore();
});

test("one question at a time: a change while it is out is followed by one more, not a second at once", async () => {
  let answer!: (value: LocalHostVersion) => void;
  const version = vi.fn(() => new Promise<LocalHostVersion>((resolve) => { answer = resolve; }));
  installApp({ localHost: { state: async () => ({ state: "running" }), subscribe: () => () => {}, pairing: async () => null, version } });
  const stop = subscribe(() => {});
  await flush();
  void refresh(); void refresh();
  await flush();
  expect(version).toHaveBeenCalledTimes(1);
  answer(report("available"));
  await flush();
  // The one more, for what changed meanwhile.
  expect(version).toHaveBeenCalledTimes(2);
  answer(report("updating", { progress: 0 }));
  await flush();
  expect(getReport(host().localHost)?.update).toBe("updating");
  expect(version).toHaveBeenCalledTimes(2);
  stop();
});

test("a failed question is no report, and it is asked again in a minute; a report that is not one is none", async () => {
  const version = bridge([new Error("no bridge"), report("current")]);
  const stop = subscribe(() => {});
  await flush();
  expect(getReport(host().localHost)).toBeNull();
  await ticks(POLL_IDLE_MS);
  expect(version).toHaveBeenCalledTimes(2);
  expect(getReport(host().localHost)?.update).toBe("current");
  stop();
  resetLocalService();
  installApp({ localHost: { state: async () => ({ state: "running" }), subscribe: () => () => {}, pairing: async () => null, version: async () => "soon" as never } });
  const again = subscribe(() => {});
  await flush();
  expect(getReport(host().localHost)).toBeNull();
  again();
});

test("an app with no version() (a browser, an older app) has no report and is never polled", async () => {
  installApp({ localHost: { state: async () => ({ state: "running" }), subscribe: () => () => {}, pairing: async () => null } });
  const heard = vi.fn();
  const stop = subscribe(heard);
  await ticks(5 * POLL_IDLE_MS);
  expect(getReport(host().localHost)).toBeNull();
  stop();
  removeApp();
  const none = subscribe(() => {});
  await ticks(5 * POLL_IDLE_MS);
  expect(getReport(null)).toBeNull();
  none();
});

test("a report belongs to the bridge that gave it: another bridge starts with none", async () => {
  bridge([report("current")]);
  const stop = subscribe(() => {});
  await flush();
  const first = host().localHost;
  expect(getReport(first)?.update).toBe("current");
  expect(getReport(null)).toBeNull();
  expect(getReport({ ...first! })).toBeNull();
  stop();
});
