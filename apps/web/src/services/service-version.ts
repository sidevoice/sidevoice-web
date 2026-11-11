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

type Triple = [number, number, number];
const triple = (version: string | null | undefined): Triple | null => {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version ?? "");
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
};
const compare = (a: readonly number[], b: readonly number[]) => a[0] - b[0] || a[1] - b[1] || (a[2] ?? 0) - (b[2] ?? 0);

/** A remote machine's service against the pinned minor: newer, up to date, or out of date — an older minor, or, where this
 *  device knows the newest patch of the pinned minor (`latest`, from its own service), an older patch of it. Not saying its
 *  version, nothing. */
export function remoteKind(version: string | null | undefined, latest?: string | null): ServiceKind {
  const mine = triple(version), pinned = triple(PINNED_MINOR + ".0");
  if (!mine || !pinned) return "unknown";
  const minor = compare(mine.slice(0, 2), pinned.slice(0, 2));
  if (minor > 0) return "newer";
  if (minor < 0) return "behind";
  const newest = triple(latest);
  return newest && compare(newest.slice(0, 2), pinned.slice(0, 2)) === 0 && mine[2] < newest[2] ? "behind" : "current";
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
  return typeof version === "string" && triple(version) ? version : null;
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
