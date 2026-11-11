import { afterEach, expect, test, vi } from "vitest";
import pin from "../../public/service.pin.json";
import { dismissedNotices, dismissNotice, isDismissed, lastSeenVersion, localKind, PINNED_MINOR, rememberServiceVersion, remoteKind, subscribeNotices } from "./service-version";

afterEach(() => { localStorage.clear(); });

/* The page pins the service minor (sidevoice-desktop#67): one file, public/service.pin.json, that the build ships and the
 * desktop app reads from the web it bundles. These are the judgements the page makes against it. */
test("the pinned minor is the file's, a major.minor the desktop app can read", () => {
  expect(PINNED_MINOR).toBe(pin.minor);
  expect(PINNED_MINOR).toMatch(/^\d+\.\d+$/);
});

test("a remote machine of the pinned minor is up to date whatever its patch; an older minor is out of date, a newer one newer", () => {
  const [major, minor] = PINNED_MINOR.split(".").map(Number);
  expect(remoteKind(`${major}.${minor}.0`)).toBe("current");
  expect(remoteKind(`${major}.${minor}.9`)).toBe("current");
  expect(remoteKind(`${major}.${minor - 1}.9`)).toBe("behind");
  expect(remoteKind(`${major}.${minor + 1}.0`)).toBe("newer");
  expect(remoteKind(`${major + 1}.0.0`)).toBe("newer");
  // A pre-release or build tag does not change its minor.
  expect(remoteKind(`${major}.${minor}.1-nightly.4`)).toBe("current");
});

test("the newest patch of the pinned minor, where known, makes an older patch of it out of date; a patch of another minor says nothing of it", () => {
  const [major, minor] = PINNED_MINOR.split(".").map(Number);
  const at = (patch: number) => `${major}.${minor}.${patch}`;
  expect(remoteKind(at(1), at(2))).toBe("behind");
  expect(remoteKind(at(2), at(2))).toBe("current");
  expect(remoteKind(at(3), at(2))).toBe("current");
  expect(remoteKind(at(1), null)).toBe("current");
  expect(remoteKind(at(1), undefined)).toBe("current");
  expect(remoteKind(at(1), `${major}.${minor + 1}.5`)).toBe("current");
  expect(remoteKind(at(1), "not a version")).toBe("current");
  // An older minor is out of date either way; a newer one never is by a patch.
  expect(remoteKind(`${major}.${minor - 1}.0`, at(2))).toBe("behind");
  expect(remoteKind(`${major}.${minor + 1}.0`, at(2))).toBe("newer");
});

test("a machine that says no version, or one that is not a version, says nothing of where it stands", () => {
  for (const version of [null, undefined, "", "latest", "v1"]) expect(remoteKind(version as never)).toBe("unknown");
});

test("this device's service is as the app's bridge says; what it does not know says nothing", () => {
  expect(["current", "available", "updating", "waiting-call", "newer-installed"].map(localKind)).toEqual(["current", "behind", "updating", "waiting", "newer"]);
  for (const update of ["incompatible", "unknown", "from-a-newer-app", "", null, undefined]) expect(localKind(update as never)).toBe("unknown");
});

test("the version a machine last said is kept per pairing, to say again when it does not answer; what is not a version is not", () => {
  expect(lastSeenVersion("fp-a")).toBeNull();
  rememberServiceVersion("fp-a", "0.19.2");
  rememberServiceVersion("fp-b", "0.20.1");
  expect([lastSeenVersion("fp-a"), lastSeenVersion("fp-b"), lastSeenVersion("fp-c"), lastSeenVersion(null), lastSeenVersion(undefined)]).toEqual(["0.19.2", "0.20.1", null, null, null]);
  rememberServiceVersion("fp-a", "0.20.0");
  expect(lastSeenVersion("fp-a")).toBe("0.20.0");
  expect(JSON.parse(localStorage.getItem("sidevoice.service-last-seen")!)).toEqual({ "fp-a": "0.20.0", "fp-b": "0.20.1" });
  // Whatever else was stored there (damaged, by hand) is none, and is replaced by the next answer.
  localStorage.setItem("sidevoice.service-last-seen", "{not json");
  expect(lastSeenVersion("fp-a")).toBeNull();
  rememberServiceVersion("fp-a", "0.20.2");
  expect(lastSeenVersion("fp-a")).toBe("0.20.2");
  localStorage.setItem("sidevoice.service-last-seen", JSON.stringify({ "fp-a": "soon", "fp-b": 4 }));
  expect([lastSeenVersion("fp-a"), lastSeenVersion("fp-b")]).toEqual([null, null]);
});

test("a closed notice stays closed for that machine and that version only, and everything listening hears it", () => {
  const heard = vi.fn();
  const stop = subscribeNotices(heard);
  expect(isDismissed(dismissedNotices(), "fp-a", "0.21.0")).toBe(false);
  dismissNotice("fp-a", "0.21.0");
  expect(heard).toHaveBeenCalledTimes(1);
  const now = dismissedNotices();
  expect([isDismissed(now, "fp-a", "0.21.0"), isDismissed(now, "fp-a", "0.21.1"), isDismissed(now, "fp-b", "0.21.0")]).toEqual([true, false, false]);
  expect(JSON.parse(localStorage.getItem("sidevoice.service-notice-dismissed")!)).toEqual(["fp-a:0.21.0"]);
  // Closing twice keeps one; another adds.
  dismissNotice("fp-a", "0.21.0");
  dismissNotice("local", "0.22.0");
  expect(JSON.parse(localStorage.getItem("sidevoice.service-notice-dismissed")!)).toEqual(["fp-a:0.21.0", "local:0.22.0"]);
  stop();
  dismissNotice("fp-c", "0.21.0");
  expect(heard).toHaveBeenCalledTimes(3);
});

test("where storage is blocked a notice is closed for this page's life only; what is stored that is not a list is none", () => {
  const blocked = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  dismissNotice("fp-z", "0.30.0");
  expect(isDismissed(dismissedNotices(), "fp-z", "0.30.0")).toBe(true);
  blocked.mockRestore();
  localStorage.setItem("sidevoice.service-notice-dismissed", JSON.stringify({ not: "a list" }));
  expect(isDismissed(dismissedNotices(), "fp-y", "0.30.0")).toBe(false);
  expect(isDismissed("{broken", "fp-y", "0.30.0")).toBe(false);
});
