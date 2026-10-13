import { describe, expect, onTestFinished, test } from "vitest";
import { desktopBuild, localHostLocator, normalizeLocalHostPairing } from "./desktop-host";

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

  test.each([{ channel: "beta", version: "0.5.0" }, { version: "0.5.0" }, "nightly"])("an unknown channel is no build: %j", (build) => {
    withHost({ build });
    expect(desktopBuild()).toBeNull();
  });
});
