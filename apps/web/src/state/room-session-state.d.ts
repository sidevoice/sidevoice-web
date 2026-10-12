import type { ChatMessage, ConversationView, HostAgentsState, JoinStatusView, MachineView, PairingPromptView, ParticipantView, KaraokeRange, SettingsAgentRequest } from './room-types';
import type { PairingSummary } from '../services/device-pairing.js';
/** How a paired machine is reached now: proved at an address ('ok'), being looked for, or why not. */
export type NodeReach = 'ok' | 'checking' | 'revoked' | 'offline' | 'away';
export interface MachineLink { reach: NodeReach; via: '' | 'room' | 'node' }
/** Where the call's voice is, as it reports it. */
export interface VoiceState {
 listening: 'idle' | 'muted' | 'listening' | 'speaking'; recognising: number; playback: 'idle' | 'synthesizing' | 'playing';
 /** Whether the microphone gives audio (@sidevoice/voice 0.3.1): `muted` while its device gives none — another app or the
  *  system holds it — which is not the person's own mute. */
 microphone?: 'live' | 'muted';
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
 /** A join that failed: its sentence, and what was raw about it, for its Details (error-message.ts). */
 joinStep: string | null; joinFailure: string; joinFailureDetails: string; joinProgress: number | null; joinDetail: string; joinSubject: string;
 screenLock: {state: string; note: string}; holding: boolean; userQuietAt: number; liveNote: string;
 harness: Record<string, boolean>; turns: Record<string, {session: string; thread: string; status?: string; settled?: boolean; harnessEnded?: boolean; readyAt?: number}>;
 /** The reply being said, and where the voice is in it: the part of `segment`'s text sounding now (`from`, `to`;
  *  both the end of what was heard between its chunks). */
 now: number; karaokeState: (KaraokeRange & {segment: string}) | null;
 /** The room's error above the stage, as people read it (error-message.ts). */
 bootError: import('../components/ui/ErrorText').ErrorMessage | null;
 /** The machines this device is paired with (never their tokens), and the clock they were read at. */
 pairings: PairingSummary[]; machinesAt: number; machinesReady: boolean;
 /** Per-fingerprint host agent listings. A late response remains attached to its host. */
 hostAgents: Record<string, HostAgentsState>; settingsAgentRequest: SettingsAgentRequest | null;
  /** The section Settings shows. */
  settingsSection: string;
  /** On a phone, whether Settings shows the list of its sections or a section's page (`settingsSection`, and within
   *  Machines the machine `machinesView` names): the list at each opening, unless what opens it asks for a page. A
   *  desktop shows its sections beside the page and reads `settingsSection` alone. */
  settingsLevel: 'list' | 'page';
  /** What failed while Settings was open (applying a choice, opening it), as people read it; null when nothing did. */
  settingsError: import('../components/ui/ErrorText').ErrorMessage | null;
  /** When a setting was last kept (there is no Save: each applies as it changes), for a moment's "Saved". */
  settingsSavedAt: number;
  /** The interface language this device keeps; '' is Automatic (the system's, followed as it is). */
  uiLanguage: string;
  /** A control in Settings to bring into view and point at, by its id (what's new's Set up); cleared once done. */
  settingsFocus: string | null;
  /** The voice's microphones and speakers, and which are chosen (null: the voice offers no choice, or not yet). */
  audioDevices: { inputs: { id: string; label: string }[]; outputs: { id: string; label: string }[]; input: string | null; output: string | null; outputSelectable: boolean } | null;
  /** A chosen device that went away (the default in use since), to say once; cleared when said. */
  audioLost: { input?: string; output?: string } | null;
  /** A newer build of this page the room serves, held while a call is on (the updates' list says so). */
  webUpdate: string | null;
  /** The machine whose page Settings → Machines shows (MachineNav); null is the first on a desktop, and the list of them
   *  on a phone. */
  machinesView: { machine: string | null };
 localHostAvailable: boolean; localHostStatus: import('../services/desktop-host').LocalHostStatus;
 /** Each paired machine's reach, and — where the machine says (core GET /api/host/status: a contract gap) — its
  *  Sidevoice version. */
 remoteHostStatus: Record<string, {state: 'checking' | 'connected' | 'offline'; checkedAt: number; version?: string | null}>;
 /** How each paired machine is reached, by fingerprint (every one of them is live), and the machine the call is with. */
 machineLinks: Record<string, MachineLink>; callNode: string | null;
 /** The pairing dialog, and the sentence it opens with when the page opened it. */
 pairingOpen: boolean; pairingNote: string;
 /** The language this device speaks in a call, and whether this page runs inside the desktop app. */
 speechLanguage: string; inApp: boolean;
 /** The preview's own: the stage avatar held in a mood (and with something unheard) by the playground's card, null to
  *  let the room drive it. Nothing in the app sets it. */
 avatarPreview: { mood: import('../features/avatar/avatar-spec').AvatarMood; unread?: boolean } | null;
 /** The voice settings this device keeps, the ones the settings pane is editing, the engine's catalogues, and whether a
  *  key is kept for each remote provider. */
 voiceSettings: import('../services/voice-settings.js').DeviceVoiceSettings | null; voiceDraft: import('../services/voice-settings.js').DeviceVoiceSettings | null;
 voiceCatalogue: {state: 'idle' | 'loading' | 'ready' | 'failed'; catalogs: import('../services/model-catalogs.js').CatalogView[]; error: string; details?: string};
 /** Whether this device's engine can take a model off it (`uninstallVoiceModel`). */
 modelsRemovable: boolean;
 /** How long a downloaded model not used is kept, in days; null: forever (model-housekeeping.js). */
 deleteUnusedDays: number | null;
 /** This device's name as the person set it (General, the setup), for its own row in machines' lists; null until set. */
 deviceName: string | null;
 providerKeys: Record<string, boolean | null>;
 /** Whether this browser refuses the page any storage (site data blocked): found once at start. */
 storageBlocked: boolean;
 /** A model of this device being installed for a voice slot: how far it has got, or why it failed. */
 voiceInstall: {task: 'stt' | 'tts'; model: string; state: 'running' | 'failed'; fraction: number | null; error: string; details?: string} | null;
 /** Call model B (VARIANTS `call-model`): the voice switch — on, turning on, and why it last turned itself off (with a
  *  failure's words) —, the idle warning, the agents' mute and what set it, the conversation a "Hear it" is asking (by
  *  its key), and the conversation a move to another machine is taking the session to. */
 voiceOn: boolean; voiceStarting: boolean; voiceOffReason: VoiceOffReason | null; voiceOffDetail: string; voiceOffDetails: string; voiceIdleWarning: boolean;
 agentsMuted: boolean; agentsMutedBy: 'person' | 'output-lost' | null;
 hearing: {thread: string; state: 'asking' | 'no-answer'} | null; movingTo: string | null;
}
/** Why the voice turned itself off (call model B). */
export type VoiceOffReason = 'idle' | 'micLost' | 'micBlocked' | 'micUnavailable' | 'failed' | 'reloaded';
export const VOICE_OFF_REASONS: VoiceOffReason[];
export const HEAR_WAIT_MS: number;
export const HEAR_NO_ANSWER_MS: number;
export function voiceOffReasonFor(code: string): VoiceOffReason;
/** This session's speech as the room is told it (contract gap #32). */
export function speechOf(s: Pick<SessionFacts, 'voiceOn' | 'agentsMuted'>): {on: true; reason?: undefined} | {on: false; reason: 'voice_off' | 'agents_muted'};
export function wantToTalk(rows: Pick<ParticipantView, 'mark' | 'available'>[]): number;
export function audioReasonKey(r: Pick<ChatMessage, 'role' | 'audio' | 'audio_reason'>): 'agentsMuted' | 'voiceOff' | null;
export function participantsView(s: SessionFacts): ParticipantView[];
export function conversationView(s: SessionFacts): ConversationView;
export function initialSessionFacts(): SessionFacts;
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
 callCard: CallCardSnapshotView;
 enginePanel: {id: string; label: string; value: string; state: 'ok' | 'warn' | 'fail'; note: string}[];
 capabilityPanel: {id: string; label: string; value: string; state: 'ok' | 'warn' | 'fail'; note: string}[];
 screenLock: {state: string; note: string};
 bootError: import('../components/ui/ErrorText').ErrorMessage | null; machines: MachineView[]; pairing: PairingPromptView;
}
export interface CallCardView {
 agent: 'idle' | 'working' | 'speaking'; youTalking: boolean; canSkip: boolean; conversation: string | null; title: string;
}
/** The card's view in the store, call model B's facts on top (contract gap #38, G9). */
export interface CallCardSnapshotView extends CallCardView {
 voiceOn: boolean; agentsMuted: boolean; wantToTalk: number; voiceOffReason: VoiceOffReason | null;
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
export function speechSegment(reply: {history_id?: string; session_id?: string; utterance_id?: string}): string;
export function recordReply(s: SessionFacts, reply: {session_id?: string; thread_id?: string; revision?: number; reply_revision?: number}): SessionFacts['turns'];
export function recordReceipt(s: SessionFacts, id: string, status: string, at: number): SessionFacts['turns'];
export const NO_MACHINE: string;
export const RECONNECT_GRACE_MS: number;
export const UNPAIRED: string;
export function machinesView(s: SessionFacts): MachineView[];
/** A conversation as the page knows it: the machine (fingerprint) and the room's thread, as one key. */
export function conversationKey(node: string | null | undefined, thread: string | null | undefined): string | null;
export function conversationOf(key: string | null | undefined): { node: string; thread: string } | null;
export function personKey(person: { node?: string | null; thread_id?: string | null } | null | undefined): string | null;
export function selectedThread(s: SessionFacts): string | null;
export function reachNote(s: SessionFacts): string;
export function joinView(s: SessionFacts): JoinStatusView | null;
export function sinceText(seconds: number | null | undefined, now: number): string;
