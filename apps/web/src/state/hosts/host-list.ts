/* The hosts a client talks to, as one list (ONBOARDING_AND_HOSTS.md §4.1, §5.2) and each row as it reads.
 *
 * The local host is projected by the app and never stored: the list is `[local] + stored pairings`, built before
 * the stored `in_use` is validated, so `in_use` may name the local fingerprint. A stored pairing with the local
 * fingerprint is dropped — the local entry wins. Pure: the clock comes in as `now`. */
import type { LocalHostState, LocalPairing } from "../../services/desktop-host";

export interface StoredPairing {
  fp: string; host?: string | null; urls: string[]; rv: { url: string; node: string } | null;
  device_id: string; token: string; public_key: string; paired_at?: number | null; revoked?: boolean;
}
export interface StoredPairings { inUse: string | null; list: StoredPairing[] }

export interface HostEntry {
  fp: string;
  name: string;
  local: boolean;
  pairing: LocalPairing | StoredPairing;
}

export interface HostList { entries: HostEntry[]; inUse: string | null; dropped: StoredPairing[] }

export function hostList(local: LocalPairing | null, stored: StoredPairings): HostList {
  const entries: HostEntry[] = [];
  const dropped: StoredPairing[] = [];
  if (local) entries.push({ fp: local.fp, name: local.host, local: true, pairing: local });
  for (const pairing of stored.list) {
    if (local && pairing.fp === local.fp) { dropped.push(pairing); continue; }
    entries.push({ fp: pairing.fp, name: pairing.host || "", local: false, pairing });
  }
  const inUse = entries.some((entry) => entry.fp === stored.inUse) ? stored.inUse : entries[0]?.fp ?? null;
  return { entries, inUse, dropped };
}

/** How a remote host is reached right now, as last measured. */
export interface RemoteReach { state: "checking" | "ok" | "unreachable"; via?: "room" | "direct"; since?: number }

export type Dot = "ok" | "busy" | "warn" | "fail" | "off";
export interface Phrase { key: string; params?: Record<string, string | number> }

export interface HostRowView {
  fp: string;
  name: string;
  local: boolean;
  inUse: boolean;
  dot: Dot;
  subtitle: Phrase;
  /** The cause under the subtitle, when there is one. */
  cause: Phrase | null;
  newAgent: boolean;
  /** Whether «Usar» makes sense: a host that cannot answer is not one to switch to. */
  usable: boolean;
}

/** A §4.2 failure in words: the cause key, with its parameter. */
export function failurePhrase(failure: { key: string; detail?: string } | null | undefined): Phrase | null {
  if (!failure) return null;
  return { key: "failure." + failure.key, params: { detail: failure.detail ?? "" } };
}

function hostOf(url: string | undefined): string {
  if (!url) return "";
  try { return new URL(url).host; } catch { return url; }
}

/** The local host's row line for each state (F6, §4.1 refused, §4.3 incompatible). */
export function localSubtitle(local: LocalHostState): { dot: Dot; subtitle: Phrase; cause: Phrase | null } {
  const cause = failurePhrase(local.failure);
  switch (local.state) {
    case "running": return { dot: "ok", subtitle: { key: "host.state.running" }, cause: null };
    case "installing": return { dot: "busy", subtitle: { key: "host.state.installing" }, cause: null };
    case "starting": return { dot: "busy", subtitle: { key: "host.state.starting" }, cause: null };
    case "not-installed": return { dot: "warn", subtitle: { key: "host.state.notInstalled" }, cause: null };
    case "stopped-by-person": return { dot: "off", subtitle: { key: "host.state.stopped" }, cause: null };
    case "backoff": return { dot: "warn", subtitle: { key: "host.state.backoff", params: { n: local.attempts ?? 1, of: local.max_attempts ?? 5 } }, cause };
    case "failed": return { dot: "fail", subtitle: cause ?? { key: "host.state.failed" }, cause: null };
    case "service-failed": return { dot: "fail", subtitle: { key: "host.state.serviceFailed" }, cause: local.failure ? { key: "service." + local.failure.key } : null };
    case "refused": return { dot: "fail", subtitle: { key: "host.state.refused" }, cause: null };
    case "incompatible":
      return { dot: "warn", subtitle: { key: local.incompatible === "core-newer" ? "host.state.coreNewer" : "host.state.coreOlder" }, cause: null };
    case "absent": return { dot: "off", subtitle: { key: "host.state.absent" }, cause: null };
  }
}

export function remoteSubtitle(pairing: StoredPairing, reach: RemoteReach | undefined, now: number): { dot: Dot; subtitle: Phrase } {
  if (pairing.revoked) return { dot: "fail", subtitle: { key: "host.remote.revoked" } };
  if (!reach || reach.state === "checking") return { dot: "busy", subtitle: { key: "host.remote.checking" } };
  if (reach.state === "unreachable") {
    const since = reach.since ? sinceWords(now / 1000 - reach.since) : null;
    return { dot: "fail", subtitle: since ? { key: "host.remote.silentSince", params: since } : { key: "host.remote.silent" } };
  }
  return reach.via === "room"
    ? { dot: "ok", subtitle: { key: "host.remote.viaRoom", params: { where: hostOf(pairing.rv?.url) } } }
    : { dot: "ok", subtitle: { key: "host.remote.direct", params: { where: hostOf(pairing.urls[0]) } } };
}

/** "3 h", "12 min", "2 días" — the amount and its unit key, for «No responde desde hace …». */
export function sinceWords(seconds: number): { amount: number; unit: string } {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return { amount: minutes, unit: "min" };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { amount: hours, unit: "h" };
  return { amount: Math.round(hours / 24), unit: "d" };
}

export interface RowFacts {
  local: LocalHostState | null;
  reach: Record<string, RemoteReach>;
  newAgents: Record<string, boolean>;
  now: number;
}

export function hostRows(list: HostList, facts: RowFacts): HostRowView[] {
  return list.entries.map((entry) => {
    const inUse = entry.fp === list.inUse;
    if (entry.local) {
      const view = localSubtitle(facts.local ?? { state: "starting" });
      return { fp: entry.fp, name: entry.name, local: true, inUse, ...view, newAgent: !!facts.newAgents[entry.fp], usable: facts.local?.state === "running" };
    }
    const view = remoteSubtitle(entry.pairing as StoredPairing, facts.reach[entry.fp], facts.now);
    return { fp: entry.fp, name: entry.name, local: false, inUse, ...view, cause: null, newAgent: !!facts.newAgents[entry.fp],
      usable: !(entry.pairing as StoredPairing).revoked };
  });
}

/** A local host that is not running is not "no machine": it is its row plus the room's banner (§5.6). */
export function localBanner(local: LocalHostState | null): Phrase | null {
  if (!local || ["running", "absent", "installing"].includes(local.state)) return null;
  const view = localSubtitle(local);
  return view.cause ?? view.subtitle;
}
