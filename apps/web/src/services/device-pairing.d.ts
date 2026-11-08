/** What a pairing code says, once decoded and checked. */
export interface PairingCodePayload {
  v: 1;
  fp: string;
  host: string | null;
  urls: string[];
  secret: string;
  exp: number;
}
/** One pairing as this device keeps it once its code is redeemed (sidevoice-core `server/devices.py`). */
export interface Pairing {
  fp: string;
  public_key: string;
  host: string | null;
  urls: string[];
  device_id: string;
  token: string;
  /** Seconds since the epoch. */
  paired_at: number;
  /** The node said the token is no longer one of its devices. */
  revoked?: boolean;
  /** Projected from the desktop bridge; the credential is app-owned and must never be persisted in page storage. */
  local?: true;
  /** The person agreed to reach this machine without encryption (plain http, private addresses only). */
  insecure?: true;
}
/** A pairing as the interface may see it: no token. */
export type PairingSummary = Omit<Pairing, "token" | "public_key" | "paired_at" | "revoked" | "insecure"> & { paired_at: number | null; revoked: boolean; local?: boolean; insecure?: boolean;
  /** Renamed on this device: `host` is the person's name for it, `machine_host` the machine's own. */
  alias?: boolean; machine_host?: string | null };
export interface Pairings {
  list: Pairing[];
}
export interface CandidateBase {
  base: string;
  via: "direct";
}
/** What the target's `GET /api/rendezvous` said it is. */
export interface TargetAbout {
  /** `unknown`: a kind this version does not know yet (rendezvous.js `describeTarget`). */
  kind: "node" | "unknown";
  fingerprint?: string | null;
}
export interface IdentityDeps {
  get?: typeof fetch;
  subtle?: SubtleCrypto;
  nonce?: string;
  timeoutMs?: number;
}

export const PAIRING_CODE_PREFIX: string;
export const IDENTITY_PREFIX: string;
export const VERIFIED_FOR_MS: number;
export const IDENTITY_TIMEOUT_MS: number;
export const NO_WEBCRYPTO: string;

/** Whether a pairing secret or a device token may be sent to `base`: https anywhere, plain http only to loopback. */
export function secureBase(base: string, origin?: string, options?: { insecure?: boolean }): boolean;
export function privateHost(hostname: string): boolean;
export function listeningPort(urls: string[] | undefined): number | null;
export function bytesToBase64url(input: Uint8Array | ArrayBuffer): string;
export function base64ToBytes(text: string): Uint8Array;
export function utf8(text: string): Uint8Array;
export function pairingError(message: string, code?: string): Error & { pairing: true; code: string };
export const ADDRESS_INVALID: "address-invalid";
export const ADDRESS_INSECURE: "address-insecure";
export const PAIRING_HTTP_ONLY: "pairing-http-only";
export const PAIRING_HTTP_PRIVATE: "pairing-http-private";
export const PAIRING_HTTP_BLOCKED: "pairing-http-blocked";
/** A typed address as a base (device-pairing.js): https unless it says otherwise; http:// to a private-network address
 *  only once agreed to (`insecure`), and never from a host whose transport cannot send plain http (`reach`; the host's by
 *  default, or the page's `origin` judged as a browser does). */
export function machineAddress(text: string, options?: { insecure?: boolean; origin?: string; reach?: { plainHttpPrivate: boolean } }): string | null;
export function decodePairingCode(code: string, now?: number, options?: { address?: string | null }): PairingCodePayload;
/** What a code says as it is pasted (device-pairing.js): whose, until when, whether another device can tell where its
 *  machine is, and its private-network addresses over plain http as host:port. */
export interface PairingCodePreview {
  host: string | null;
  /** Seconds since the epoch. */
  exp: number;
  reachable: boolean;
  plain: string[];
}
export function previewPairingCode(code: string, now?: number): PairingCodePreview;
export function fingerprintOf(spki: Uint8Array | ArrayBuffer, subtle?: SubtleCrypto): Promise<string>;
export function newNonce(random?: (bytes: Uint8Array) => Uint8Array): string;
export function verifyIdentitySignature(proof: { publicKey: string; nonce: string; signature: string }, subtle?: SubtleCrypto): Promise<boolean>;
export function proveIdentity(base: string, expected: { fp: string; public_key?: string | null }, deps?: IdentityDeps):
  Promise<{ ok: true; publicKey: string } | { ok: false; reason: "unreachable" | "impostor" }>;
export function candidateBases(pairing: { fp: string; urls: string[]; insecure?: boolean },
  context?: { target?: string; about?: TargetAbout | null; origin?: string }): CandidateBase[];
export function firstProven(candidates: CandidateBase[], expected: { fp: string; public_key?: string | null }, deps?: IdentityDeps,
  started?: Map<string, Promise<unknown>>): Promise<(CandidateBase & { publicKey: string }) | null>;
export function redeemPairingCode(code: string, options?: { name?: string; address?: string; target?: string; about?: TargetAbout | null; origin?: string; reach?: { plainHttpPrivate: boolean };
  get?: typeof fetch; subtle?: SubtleCrypto; now?: number ; insecure?: boolean }): Promise<{ pairing: Pairing; base: CandidateBase & { publicKey: string } }>;
export function projectPairings(stored: Pairings, localPairing: Pairing | null): Pairings;
export function withPairing(pairings: Pairings, pairing: Pairing): Pairings;
export function withoutPairing(pairings: Pairings, fp: string): Pairings;
export function revokedPairing(pairings: Pairings, fp: string): Pairings;
export function pairingSummary(pairing: Pairing): PairingSummary;
