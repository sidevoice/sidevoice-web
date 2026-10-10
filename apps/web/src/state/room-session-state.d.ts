import type { ChatMessage, ConversationView, JoinStatusView, MachineView, PairingPromptView, ParticipantView, KaraokeRange } from './room-types';
import type { PairingSummary } from '../services/device-pairing.js';
export type NodeReach = '' | 'ok' | 'unpaired' | 'revoked' | 'offline' | 'away';
/** Where the call's voice is, as it reports it. */
export interface VoiceState {
 listening: 'idle' | 'muted' | 'listening' | 'speaking'; recognising: number; playback: 'idle' | 'synthesizing' | 'playing';
}
export interface SessionFacts {
 ws: unknown; sessionId: string | null; roomRevision: number; roomInfo: Record<string, unknown> | null;
 connecting: boolean; reconnecting: boolean; reconnectShown: boolean; switching: boolean;
 roomBinding: {thread_id: string; title?: string; binding_id?: string} | null; viewedThread: string | null;
 people: unknown[]; history: ChatMessage[]; roomSeen: Record<string, number>; inputReceipts: Record<string, string>;
 userLive: boolean; botLive: boolean;
 /** The person's turn being said: the voice's id for it, the bubble's segment, and the conversation it goes to. */
 userTurn: {id: string; segment: string; thread: string | null} | null; pendingPhase: '' | 'listening' | 'transcribing'; pendingUserText: string;
 cancelledInput: boolean; textSending: boolean; micEnabled: boolean;
 voiceState: VoiceState | null;
 joinStep: string | null; joinFailure: string; joinProgress: number | null; joinDetail: string; joinSubject: string;
 screenLock: {state: string; note: string}; holding: boolean; userQuietAt: number; liveNote: string;
 harness: Record<string, boolean>; turns: Record<string, {session: string; thread: string; status?: string; settled?: boolean; harnessEnded?: boolean; readyAt?: number}>;
 /** The reply being said, and where the voice is in it: the part of `segment`'s text sounding now (`from`, `to`;
  *  both the end of what was heard between its chunks). */
 now: number; karaokeState: (KaraokeRange & {segment: string}) | null; bootError: string | null;
 /** The machines this device is paired with (never their tokens), the one in use, and the clock they were read at. */
 pairings: PairingSummary[]; pairingInUse: string | null; machinesAt: number; machinesReady: boolean;
 localHostAvailable: boolean; localHostSelected: boolean; localHostStatus: import('../services/desktop-host').LocalHostStatus;
 remoteHostStatus: Record<string, {state: 'checking' | 'connected' | 'offline'; checkedAt: number}>;
 /** How the node base in use is reached, the machine (fingerprint) it belongs to, and with none, why. */
 rendezvous: '' | 'room' | 'node'; node: string | null; nodeReach: NodeReach;
 /** The pairing dialog, and the sentence it opens with when the page opened it. */
 pairingOpen: boolean; pairingNote: string;
 /** The language this device speaks in a call, and whether this page runs inside the desktop app. */
 speechLanguage: string; inApp: boolean;
 /** The voice settings this device keeps, the ones the settings pane is editing, the engine's catalogues, and whether a
  *  key is kept for each remote provider. */
 voiceSettings: import('../services/voice-settings.js').DeviceVoiceSettings | null; voiceDraft: import('../services/voice-settings.js').DeviceVoiceSettings | null;
 voiceCatalogue: {state: 'idle' | 'loading' | 'ready' | 'failed'; catalogs: import('../services/model-catalogs.js').CatalogView[]; error: string};
 providerKeys: Record<string, boolean | null>;
 /** Whether this browser refuses the page any storage (site data blocked): found once at start. */
 storageBlocked: boolean;
}
export interface SessionStatus {
 speaker: 'user' | 'room' | 'nobody'; conversation: 'idle' | 'working' | 'speaking';
 tab: 'out' | 'listening' | 'transcribing' | 'reconnecting' | 'switching';
 selected: string | null; viewed: string | null; harness: boolean | null; working: boolean;
}
export interface SessionSnapshot {
 facts: SessionFacts; session: SessionStatus; conversation: ConversationView; participants: ParticipantView[];
 join: JoinStatusView | null; live: string;
 mic: {enabled: boolean; label: string; title: string; pressed: boolean; disabled: boolean; holding: boolean};
 call: {joined: boolean; busy: boolean; label: string}; title: string;
 callCard: CallCardView;
 enginePanel: {id: string; label: string; value: string; state: 'ok' | 'warn' | 'fail'; note: string}[];
 capabilityPanel: {id: string; label: string; value: string; state: 'ok' | 'warn' | 'fail'; note: string}[];
 screenLock: {state: string; note: string};
 bootError: string | null; machines: MachineView[]; pairing: PairingPromptView;
}
export interface CallCardView {
 agent: 'idle' | 'working' | 'speaking'; youTalking: boolean; canSkip: boolean; conversation: string | null; title: string;
}
export function callCardView(s: SessionFacts): CallCardView;
export interface SessionStore {
 facts: SessionFacts;
 getState(): SessionSnapshot; getInitialState(): SessionSnapshot;
 subscribe(listener: (state: SessionSnapshot, previous: SessionSnapshot) => void): () => void;
 patch(facts: Partial<SessionFacts>): void;
 batch<T>(fn: () => T): T;
}
export function createRoomSessionStore(seed?: Partial<SessionFacts>): SessionStore;
export function receiptView(status: string): {symbol: string; label: string};
export function shortModel(name: string | null | undefined): string;
export function speechSegment(reply: {history_id?: string; session_id?: string; utterance_id?: string}): string;
export function recordReply(s: SessionFacts, reply: {session_id?: string; thread_id?: string; revision?: number; reply_revision?: number}): SessionFacts['turns'];
export function recordReceipt(s: SessionFacts, id: string, status: string, at: number): SessionFacts['turns'];
export const NO_MACHINE: string;
export const RECONNECT_GRACE_MS: number;
export const UNPAIRED: string;
export function machinesView(s: SessionFacts): MachineView[];
export function reachNote(s: SessionFacts): string;
export function joinView(s: SessionFacts): JoinStatusView | null;
export function sinceText(seconds: number | null | undefined, now: number): string;
