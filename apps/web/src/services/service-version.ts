import pin from "../../public/service.pin.json";

/* The Sidevoice service's version, as the page judges it (sidevoice-desktop#67). This page speaks the service's contract,
 * in a browser and inside the app, so it declares the one minor it works with, in `public/service.pin.json` (shipped
 * with the build: the desktop app reads it from the web it bundles, and is not told it twice). A service of that minor
 * is up to date, whatever its patch; an older one is out of date; a newer minor may break the contract and brings
 * what this page cannot use yet, so it is warned about and never touched. */

/** The service minor this build works with ("0.20"). */
export const PINNED_MINOR: string = pin.minor;

/** Where one service stands against `PINNED_MINOR`; `unknown` says nothing of it (no badge). */
export type ServiceKind = "current" | "updating" | "waiting" | "behind" | "newer" | "unknown";
export interface ServiceInfo { version: string | null; kind: ServiceKind }

interface Parsed { core: [number, number, number]; pre: string[] }
const parse = (version: string | null | undefined): Parsed | null => {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?/.exec(version ?? "");
  return match ? { core: [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)], pre: match[4] ? match[4].split(".") : [] } : null;
};
const compareCore = (a: readonly number[], b: readonly number[]) => a[0] - b[0] || a[1] - b[1] || (a[2] ?? 0) - (b[2] ?? 0);
/** Prereleases as semver orders them, as the desktop app does: one is lower than its release; else identifier by
 *  identifier — numbers by value, below words, words alphabetically, a shorter list below a longer one it starts. */
function comparePre(a: string[], b: string[]) {
  if (!a.length || !b.length) return a.length === b.length ? 0 : a.length ? -1 : 1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    const numbers = [/^\d+$/.test(a[i]), /^\d+$/.test(b[i])];
    if (numbers[0] && numbers[1]) { const by = Number(a[i]) - Number(b[i]); if (by) return by; }
    else if (numbers[0] || numbers[1]) return numbers[0] ? -1 : 1;
    else if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}
const compareSemver = (a: Parsed, b: Parsed) => compareCore(a.core, b.core) || comparePre(a.pre, b.pre);

/** A remote machine's service against the pinned minor: newer, up to date, or out of date — an older minor, or, where this
 *  device knows the newest patch of the pinned minor (`latest`, from its own service), an older version of it, a
 *  prerelease of that patch included. Not saying its version, nothing. */
export function remoteKind(version: string | null | undefined, latest?: string | null): ServiceKind {
  const mine = parse(version), pinned = parse(PINNED_MINOR + ".0");
  if (!mine || !pinned) return "unknown";
  const minor = compareCore(mine.core.slice(0, 2), pinned.core.slice(0, 2));
  if (minor > 0) return "newer";
  if (minor < 0) return "behind";
  const newest = parse(latest);
  return newest && compareCore(newest.core.slice(0, 2), pinned.core.slice(0, 2)) === 0 && compareSemver(mine, newest) < 0 ? "behind" : "current";
}

/** This device's service as the app's bridge says it (`version().update`); a value this page does not know says nothing. */
export function localKind(update: string | null | undefined): ServiceKind {
  switch (update) {
    case "current": return "current";
    case "available": return "behind";
    case "updating": return "updating";
    case "waiting-call": return "waiting";
    case "newer-installed": return "newer";
    default: return "unknown";
  }
}

/* What each paired machine was last seen running, kept here so a machine that does not answer still says its version. */
const LAST_SEEN = "sidevoice.service-last-seen";
function readLastSeen(): Record<string, string> {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(LAST_SEEN) || "{}");
    return kept && typeof kept === "object" && !Array.isArray(kept) ? kept as Record<string, string> : {};
  } catch { return {}; }
}
/** The version `pairing` last said, if it ever did. */
export function lastSeenVersion(pairing: string | null | undefined): string | null {
  const version = pairing ? readLastSeen()[pairing] : null;
  return typeof version === "string" && parse(version) ? version : null;
}
export function rememberServiceVersion(pairing: string, version: string) {
  const kept = readLastSeen();
  if (kept[pairing] === version) return;
  try { localStorage.setItem(LAST_SEEN, JSON.stringify({ ...kept, [pairing]: version })); } catch { /* Not kept: the next answer says it. */ }
}

/* A notice that can be closed (a service newer than the page supports) stays closed for that version of that machine: a
 * list of "machine:version" in this page's storage, and in memory where storage is blocked. The badge stays. */
const DISMISSED = "sidevoice.service-notice-dismissed";
const CHANGED = "sidevoice-service-notice";
const noticeKey = (who: string, version: string | null) => who + ":" + version;
const closedHere = new Set<string>();
const storedNotices = (): string[] => {
  try { const kept: unknown = JSON.parse(localStorage.getItem(DISMISSED) ?? "[]"); return Array.isArray(kept) ? kept.filter((key) => typeof key === "string") : []; } catch { return []; }
};
/** The closed notices as one string, to subscribe to (`subscribeNotices`) and read with `isDismissed`. */
export const dismissedNotices = () => JSON.stringify([...new Set([...storedNotices(), ...closedHere])]);
export function isDismissed(raw: string, who: string, version: string | null) {
  try { const list: unknown = JSON.parse(raw); return Array.isArray(list) && list.includes(noticeKey(who, version)); } catch { return false; }
}
export function dismissNotice(who: string, version: string | null) {
  const key = noticeKey(who, version);
  closedHere.add(key);
  try { localStorage.setItem(DISMISSED, JSON.stringify([...new Set([...storedNotices(), key])])); } catch { /* Closed in memory only. */ }
  window.dispatchEvent(new Event(CHANGED));
}
export function subscribeNotices(changed: () => void) {
  window.addEventListener("storage", changed);
  window.addEventListener(CHANGED, changed);
  return () => { window.removeEventListener("storage", changed); window.removeEventListener(CHANGED, changed); };
}
