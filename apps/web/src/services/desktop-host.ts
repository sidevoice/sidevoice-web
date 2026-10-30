import type { Pairing } from "./device-pairing.js";
import type { LocalHostPairing, LocalHostStatus } from "../host";

/** Where nightly builds are published, to update one by hand. */
export const DESKTOP_NIGHTLY_URL = "https://github.com/sidevoice/sidevoice-desktop/releases/tag/nightly";

/** The desktop app has already verified this host over its Unix socket. Its URL points at the per-launch proxy. */
export function normalizeLocalHostPairing(value: unknown): Pairing | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as LocalHostPairing;
  const fp = candidate.fp || candidate.node?.fingerprint;
  const publicKey = candidate.public_key || candidate.node?.public_key;
  if (typeof fp !== "string" || !fp || typeof publicKey !== "string" || !publicKey ||
      typeof candidate.device_id !== "string" || !candidate.device_id || typeof candidate.token !== "string" || !candidate.token ||
      !Array.isArray(candidate.urls) || typeof candidate.urls[0] !== "string" || !candidate.urls[0]) return null;
  return {
    fp, public_key: publicKey, device_id: candidate.device_id, token: candidate.token,
    urls: candidate.urls.filter((url): url is string => typeof url === "string"),
    host: candidate.host || candidate.node?.host || null, paired_at: 0, local: true,
  };
}

/** Native already proved the local identity over the peer-checked socket; the per-launch proxy is the locator. */
export function localHostLocator(pairing: Pairing | null, status: LocalHostStatus) {
  if (!pairing?.local || status.reachable !== true || typeof pairing.urls[0] !== "string" || !pairing.urls[0]) return null;
  return { base: pairing.urls[0], via: "direct" as const };
}
