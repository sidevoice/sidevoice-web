import type { CallCardView } from './room-session-state.js';
import type { ConversationView, ParticipantView } from './room-types';

export const SURFACE_PAGE_CHARS: number;
export const SURFACE_OTHERS: number;

/** The page of the reply the voice is on: its text (an ellipsis ends it where more follows) and how many of its
 *  characters are lit. */
export interface SpokenPage { text: string; lit: number; more: boolean }
export function spokenPage(text: string, spoken: number, max?: number): SpokenPage | null;

/** A conversation's creature as a PNG (base64, no prefix), `px` square (3x the slot it fills); `k` is how much of the
 *  still the body takes (1 by default), for the host to enlarge it where the slot overflows (HANDOVER §3). */
export interface SurfaceStill { png: string; px: number; k: number }

/** What the publisher keeps by the clock: the throttled page, the said text for its three seconds, the drawn stills. */
export interface SurfaceLive { page: SpokenPage | null; said: string | null; stills: Record<string, SurfaceStill> }

export interface SurfaceWords {
  /** The line saying what the call is doing. */
  state: string;
  mute: string; unmute: string;
  /** The pill's word and the accessible name of the same button. */
  skip: string; skipName: string;
  cancelSend: string; hangUp: string;
  /** The audio output's accessible name, with `{route}` left in it for the host to fill. */
  route: string; speaker: string;
  conversations: string; switchConversation: string; openApp: string;
}

export interface CallSurface {
  pendingCancellable: boolean;
  /** The current conversation's reach; null with none. */
  reach: ParticipantView['reach'] | null;
  /** As the harness reports them; null when it does not. */
  model: string | null; effort: string | null; machine: string | null;
  others: { total: number; items: { threadId: string; title: string; reach: ParticipantView['reach']; unread: number }[] };
  page: SpokenPage | null;
  said: string | null;
  words: SurfaceWords;
  stills: Record<string, SurfaceStill>;
}

export function callSurfaceView(card: CallCardView, conversation: ConversationView, participants: ParticipantView[], live: SurfaceLive | null | undefined, say: (key: string, params?: Record<string, unknown>) => string): CallSurface;
