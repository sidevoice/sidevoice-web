/* For tests and the dev harness: an app, injected. The page reads the global an app injects, so whatever stands in for an
 * app goes through here and not through the global's name: the name, and the shape of what is injected, are native.ts's
 * and this file's alone. */
const INJECTED = "__sidevoiceDesktop";

type Members = Record<string, unknown>;

/** The members the app standing in now offers, as a copy; none when no app does. */
export function installedMembers(): Members {
  return { ...((window as unknown as Record<string, { host?: Members } | undefined>)[INJECTED]?.host ?? {}) };
}

/** Stands an app in for the page, offering `members` and only those. */
export function installApp(members: Members): void {
  Object.defineProperty(window, INJECTED, { configurable: true, writable: true, value: { host: members } });
}

/** The page is a browser's again. */
export function removeApp(): void {
  Reflect.deleteProperty(window, INJECTED);
}
