import type { CallCardView } from './room-session-state.js';
import type { ParticipantView } from './room-types';

export const SURFACE_PAGE_CHARS: number;
export const SURFACE_SENTENCE_WINDOW: number;
export const SURFACE_OTHERS: number;
export const STILL_PX: number;
export const FACE_PX: number;
export function stillId(threadId: string, px: number): string;
export function wordBoundaries(text: string, locale?: string): number[];
export type CallState = 'offline' | 'listening' | 'transcribing' | 'speaking' | 'working' | 'holding' | 'idle';
/** The one precedence: offline > the person's turn > speaking > working > holding > idle. */
export function callState(facts: { offline: boolean; turn: 'listening' | 'transcribing' | null; speaking: boolean; working: boolean; holding: boolean }): CallState;

/** The page of the reply the voice is on: its text (an ellipsis ends it where more follows) and how many of its UTF-16
 *  code units are lit, rounded down to the start of a word (never ahead of the voice). */
export interface SpokenPage { text: string; lit: number; more: boolean }
export function spokenPage(text: string, spoken: number, max?: number, locale?: string): SpokenPage | null;

/** A creature's still as the snapshot refers to it: the host already holds its PNG under `id` (CallSurfaceBridge.still).
 *  `k` is how much of the still the body takes (1 by default), for the host to enlarge it where the slot overflows
 *  (HANDOVER §3). */
export interface SurfaceStillRef { id: string; k: number }

/** What the publisher keeps by the clock: the throttled page, the said text for its three seconds, and the stills
 *  already handed to the host, by id. */
export interface SurfaceLive { page: SpokenPage | null; said: string | null; stills: Record<string, SurfaceStillRef> }

export interface SurfaceWords {
  /** The one line saying what the call is doing, with no time in it. */
  state: string;
  /** What a surface that cannot vouch for the call any more says; always carried, whatever the state. */
  offline: string;
  mute: string; unmute: string;
  /** The pill's word and the accessible name of the same button. */
  skip: string; skipName: string;
  cancelSend: string; hangUp: string;
  /** The audio output's accessible name, with `{route}` left in it for the host to fill. */
  route: string; speaker: string;
  conversations: string; switchConversation: string; openApp: string;
}

export interface CallSurface {
  /** Of the CALL's conversation, never the one being browsed. */
  pendingCancellable: boolean;
  /** The call's conversation's reach; null with none. */
  reach: ParticipantView['reach'] | null;
  /** The model exactly as the connector reports it; effort as reported, not shown. */
  model: string | null; effort: string | null; machine: string | null;
  /** Epoch ms the working phase began (the room's busy clock), while the call shows as working; null otherwise or when unknown. */
  workingSince: number | null;
  /** How many conversations there are, the current one included. */
  conversationCount: number;
  /** Up to three other conversations. */
  others: { threadId: string; title: string; reach: ParticipantView['reach']; unread: number; still: SurfaceStillRef | null }[];
  /** The call's conversation's still (240 px); null until the host holds it. */
  still: SurfaceStillRef | null;
  page: SpokenPage | null;
  said: string | null;
  words: SurfaceWords;
}

export function callSurfaceView(card: CallCardView, participants: ParticipantView[], live: SurfaceLive | null | undefined, say: (key: string, params?: Record<string, unknown>) => string, call: { pendingCancellable: boolean; workingSince?: number | null; busySince?: number | null }, previous?: CallSurface | null): CallSurface;
