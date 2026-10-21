import { describe, expect, onTestFinished, test } from "vitest";
import { desktopBuild, desktopDataBridge, desktopDebugBridge, desktopResetBridge, localHostLocator, normalizeLocalHostPairing } from "./desktop-host";

const pairing = normalizeLocalHostPairing({
  fp: "fp-local", public_key: "key", device_id: "local-device", token: "session-secret",
  urls: ["http://127.0.0.1:43127"], local: true,
});

test.each(["not-installed", "stopped-by-person", "service-failed"] as const)(
  "a verified reachable local core remains routable when its service state is %s",
  (state) => {
    expect(localHostLocator(pairing, { state, reachable: true })).toEqual({ base: "http://127.0.0.1:43127", via: "direct" });
  },
);

test("an unreachable native report cannot retain a local locator even if a stale pairing is supplied", () => {
  expect(localHostLocator(pairing, { state: "running", reachable: false })).toBeNull();
});

test("native pairings are selected on Windows and Linux without the macOS reset capability", () => {
  const pairings = { read: async () => ({ pairings: [], pendingRevokes: [] }), write: async () => {} };
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { data: { pairings } } } });
  onTestFinished(() => { Reflect.deleteProperty(window, "__sidevoiceDesktop"); });
  expect(desktopDataBridge()?.pairings).toBe(pairings);
  expect(desktopResetBridge()).toBeNull();
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: {
    data: { pairings, deleteAll: async () => ({}), resetReport: async () => null },
  } } });
  expect(desktopResetBridge()).not.toBeNull();
});

describe("desktopBuild", () => {
  const withHost = (host: Record<string, unknown> | undefined) => {
    Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: host && { host } });
    onTestFinished(() => { Reflect.deleteProperty(window, "__sidevoiceDesktop"); });
  };

  test.each(["release", "nightly", "dev"] as const)("reads a %s build as the app says it", (channel) => {
    withHost({ build: { channel, version: "0.5.0", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" } });
    expect(desktopBuild()).toEqual({ channel, version: "0.5.0", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" });
  });

  test("a build without commit or date has them null", () => {
    withHost({ build: { channel: "dev", version: "0.5.0-dev" } });
    expect(desktopBuild()).toEqual({ channel: "dev", version: "0.5.0-dev", commit: null, date: null });
  });

  test("outside the app, or with an app too old to say its build, there is none", () => {
    withHost(undefined);
    expect(desktopBuild()).toBeNull();
    withHost({ localHost: {} });
    expect(desktopBuild()).toBeNull();
  });

  // A newer app's channel (sidevoice-core#112) is a build all the same, of a channel this version does not know.
  test.each([{ channel: "beta", version: "0.5.0" }, { version: "0.5.0" }, { channel: 7, version: "0.5.0", arch: "arm64" }])("an unknown channel is an unknown one: %j", (build) => {
    withHost({ build });
    expect(desktopBuild()).toEqual({ channel: "unknown", version: "0.5.0", commit: null, date: null });
  });

  test("extra fields are ignored, and a field of a shape it does not know is none", () => {
    withHost({ build: { channel: "release", version: "0.5.0", commit: 42, date: { at: "x" }, signed: true } });
    expect(desktopBuild()).toEqual({ channel: "release", version: "0.5.0", commit: null, date: null });
  });

  test("a build that is not an object is no build", () => {
    withHost({ build: "nightly" });
    expect(desktopBuild()).toBeNull();
  });
});

describe("desktopDebugBridge", () => {
  const withHost = (host: Record<string, unknown> | undefined) => {
    Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: host && { host } });
    onTestFinished(() => { Reflect.deleteProperty(window, "__sidevoiceDesktop"); });
  };

  test("is the app's own object, so its getters stay live", () => {
    let inspectable = false;
    const debug = { available: ["inspectable"], get inspectable() { return inspectable; }, compositingBorders: false, repaintCounters: false, set: async () => {} };
    withHost({ debug });
    const bridge = desktopDebugBridge();
    expect(bridge).toBe(debug);
    inspectable = true;
    expect(desktopDebugBridge()?.inspectable).toBe(true);
  });

  test("a platform with no switches still has the seam: an empty list", () => {
    withHost({ debug: { available: [], inspectable: false, compositingBorders: false, repaintCounters: false, set: async () => {} } });
    expect(desktopDebugBridge()?.available).toEqual([]);
  });

  test.each([
    ["none (a release, a browser)", undefined],
    ["not an object", "inspectable"],
    ["no list of switches", { inspectable: false, set: async () => {} }],
    ["a list that is not a list", { available: "inspectable", set: async () => {} }],
    ["no set", { available: ["inspectable"], inspectable: false }],
    ["set that is not a function", { available: ["inspectable"], set: true }],
    ["the seam before this one, with setInspectable", { inspectable: false, setInspectable: async () => {} }],
  ])("is none for %s", (_, debug) => {
    withHost({ debug });
    expect(desktopDebugBridge()).toBeNull();
  });

  test("is none outside the app", () => {
    withHost(undefined);
    expect(desktopDebugBridge()).toBeNull();
  });
});
