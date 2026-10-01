/** Where the node that issued a code (or that this device paired with) links to a room. */
export interface PairingRoom {
  url: string;
  /** The node's id in that room: `/nodes/<node>/…`. */
  node: string;
}
/** What a pairing code says, once decoded and checked. */
export interface PairingCodePayload {
  v: 1;
  fp: string;
  host: string | null;
  urls: string[];
  rv: PairingRoom | null;
  secret: string;
  exp: number;
}
/** One pairing as this device keeps it (docs/DEVICE_PAIRING.md, "Redeeming it"). */
export interface Pairing {
  fp: string;
  public_key: string;
  host: string | null;
  urls: string[];
  rv: PairingRoom | null;
  device_id: string;
  token: string;
  /** Seconds since the epoch. */
  paired_at: number;
  /** The node said the token is no longer one of its devices. */
  revoked?: boolean;
}
/** A pairing as the interface may see it: no token. */
export type PairingSummary = Omit<Pairing, "token" | "public_key" | "paired_at" | "revoked"> & { paired_at: number | null; revoked: boolean };
export interface Pairings {
  inUse: string | null;
  list: Pairing[];
}
export interface CandidateBase {
  base: string;
  via: "direct" | "room";
}
/** What the target's `GET /api/rendezvous` said it is. */
export interface TargetAbout {
  kind: "node" | "room";
  fingerprint?: string | null;
}
export interface IdentityDeps {
  get?: typeof fetch;
  subtle?: SubtleCrypto;
  nonce?: string;
  timeoutMs?: number;
}

export const PAIRING_CODE_PREFIX: string;
export const PAIRINGS_KEY: string;
export const IDENTITY_PREFIX: string;
export const VERIFIED_FOR_MS: number;
export const IDENTITY_TIMEOUT_MS: number;
export const NO_WEBCRYPTO: string;

/** Whether a pairing secret or a device token may be sent to `base`: https anywhere, plain http only to loopback. */
export function secureBase(base: string, origin?: string): boolean;
export function bytesToBase64url(input: Uint8Array | ArrayBuffer): string;
export function base64ToBytes(text: string): Uint8Array;
export function utf8(text: string): Uint8Array;
export function pairingError(message: string): Error & { pairing: true };
export function decodePairingCode(code: string, now?: number): PairingCodePayload;
export function fingerprintOf(spki: Uint8Array | ArrayBuffer, subtle?: SubtleCrypto): Promise<string>;
export function newNonce(random?: (bytes: Uint8Array) => Uint8Array): string;
export function verifyIdentitySignature(proof: { publicKey: string; nonce: string; signature: string }, subtle?: SubtleCrypto): Promise<boolean>;
export function proveIdentity(base: string, expected: { fp: string; public_key?: string | null }, deps?: IdentityDeps):
  Promise<{ ok: true; publicKey: string } | { ok: false; reason: "unreachable" | "impostor" }>;
export function candidateBases(pairing: { fp: string; urls: string[]; rv: PairingRoom | null },
  context?: { target?: string; about?: TargetAbout | null; origin?: string }): CandidateBase[];
export function firstProven(candidates: CandidateBase[], expected: { fp: string; public_key?: string | null }, deps?: IdentityDeps,
  started?: Map<string, Promise<unknown>>): Promise<(CandidateBase & { publicKey: string }) | null>;
export function redeemPairingCode(code: string, options?: { name?: string; target?: string; about?: TargetAbout | null; origin?: string;
  get?: typeof fetch; subtle?: SubtleCrypto; now?: number }): Promise<{ pairing: Pairing; base: CandidateBase & { publicKey: string } }>;
export function deviceName(nav?: { userAgent?: string; platform?: string; userAgentData?: { platform?: string } }): string;
export function readPairings(storage: Pick<Storage, "getItem"> | null | undefined): Pairings;
export function writePairings(storage: Pick<Storage, "setItem">, pairings: Pairings): boolean;
export function withPairing(pairings: Pairings, pairing: Pairing, options?: { use?: boolean }): Pairings;
export function withoutPairing(pairings: Pairings, fp: string): Pairings;
export function usingPairing(pairings: Pairings, fp: string): Pairings;
export function revokedPairing(pairings: Pairings, fp: string): Pairings;
export function pairingInUse(pairings: Pairings): Pairing | null;
export function pairingSummary(pairing: Pairing): PairingSummary;
