import { expect, test } from "vitest";
import { localHostLocator, normalizeLocalHostPairing } from "./desktop-host";

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
