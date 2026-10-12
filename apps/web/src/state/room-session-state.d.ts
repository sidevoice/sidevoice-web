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
 joinStep: string | null; joinFailure: string; joinProgress: number | null; joinDetail: string; joinSubject: string;
 screenLock: {state: string; note: string}; holding: boolean; userQuietAt: number; liveNote: string;
 harness: Record<string, boolean>; turns: Record<string, {session: string; thread: string; status?: string; settled?: boolean; harnessEnded?: boolean; readyAt?: number}>;
 /** The reply being said, and where the voice is in it: the part of `segment`'s text sounding now (`from`, `to`;
  *  both the end of what was heard between its chunks). */
 now: number; karaokeState: (KaraokeRange & {segment: string}) | null; bootError: string | null;
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
 voiceCatalogue: {state: 'idle' | 'loading' | 'ready' | 'failed'; catalogs: import('../services/model-catalogs.js').CatalogView[]; error: string};
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
 voiceInstall: {task: 'stt' | 'tts'; model: string; state: 'running' | 'failed'; fraction: number | null; error: string} | null;
 /** Call model B (VARIANTS `call-model`): the voice switch — on, turning on, and why it last turned itself off (with a
  *  failure's words) —, the idle warning, the agents' mute and what set it, the conversation a "Hear it" is asking (by
  *  its key), and the conversation a move to another machine is taking the session to. */
 voiceOn: boolean; voiceStarting: boolean; voiceOffReason: VoiceOffReason | null; voiceOffDetail: string; voiceIdleWarning: boolean;
 agentsMuted: boolean; agentsMutedBy: 'person' | 'output-lost' | null;
 hearing: {thread: string; state: 'asking' | 'no-answer'} | null; movingTo: string | null;
 /** The floating call card (briefs/FLOATING-CARD-SPEC.md). The call model this page runs, as the runtime read it once
  *  (`call` is A, `voice-switch` B; FC2). */
 callModel: CallModel;
 /** The first setup is finished and its wizard is not open (the onboarding provider says it; FC1). */
 setupDone: boolean;
 /** Call model A: the minute before a call nobody uses ends itself, and why the last call ended without the person
  *  ending it (FC6, FC7); cleared as a call starts. */
 callIdleWarning: boolean; callEnded: CallEnded | null;
 /** The theme and the interface language the page wears now (its root's `data-theme` and `lang`; FC12). */
 pageTheme: 'light' | 'dark'; pageLanguage: string;
}
/** Call model A or B (VARIANTS `call-model`), as the card is told it. */
export type CallModel = 'call' | 'voice-switch';
/** Why a call (A) ended without the person ending it: nobody used it, its conversation's machine went away (`detail`:
 *  the conversation's title), or the room or the machine refused it (`detail`: the room's words). */
export interface CallEnded { reason: 'idle' | 'offline' | 'failed'; detail: string }
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
 callCard: CallCardView;
 enginePanel: {id: string; label: string; value: string; state: 'ok' | 'warn' | 'fail'; note: string}[];
 capabilityPanel: {id: string; label: string; value: string; state: 'ok' | 'warn' | 'fail'; note: string}[];
 screenLock: {state: string; note: string};
 bootError: string | null; machines: MachineView[]; pairing: PairingPromptView;
}
/** One device to choose, as the card lists it. `system` is the system's own choice, `number` a device the system lists
 *  without a name (its place, from 1), `missing` the chosen one, no longer connected: the card words those itself. */
export interface AudioDeviceOption { id: string; label: string; system?: boolean; number?: number; missing?: boolean }
/** The voice's microphones and speakers, the chosen ones, and whether each can be chosen now; `busy` while a choice is
 *  on its way (its host's). */
export interface AudioDevices {
 inputs: AudioDeviceOption[]; outputs: AudioDeviceOption[];
 inputId: string; outputId: string; available: boolean; outputAvailable: boolean; busy: boolean;
}
/** What the agent is doing, for today's card: its mark shows it, and only it. */
export type AgentState = 'idle' | 'working' | 'speaking';
/** Why call model B's microphone cannot be used (`voiceMicCode`). */
export type MicCode = 'noConversation' | 'cantHear' | 'connecting';
/** The desktop card's snapshot as the room projects it (`callCardView`, the store's `callCard`): the whole of
 *  call-controls/host.ts CallSnapshot but what its host stamps (FLOATING-CARD-SPEC FC0). */
export interface CallCardView {
 ready: boolean;
 /** In the call (A), or the room open (B). */
 joined: boolean;
 /** Reconnecting or switching conversation (`busyReason` says which). */
 busy: boolean;
 micEnabled: boolean;
 /** The microphone cannot be used: A as its button says, B with a reason (`micReason`). */
 micDisabled: boolean;
 /** The conversation the call is on. */
 title: string;
 agent: AgentState;
 /** You are speaking (the room hears a turn open). */
 youTalking: boolean;
 /** Something is playing that "skip" would stop (FC3). */
 canSkip: boolean;
 /** The conversation the call is on, by its key (its seed: the stage's bicho); null with none. */
 conversation: string | null;
 participants: ParticipantView[];
 devices: AudioDevices | null;
 /* Call model B, the voice switch (contract gap #38, G9). */
 voiceOn: boolean;
 /** The agents are muted: they answer in writing. */
 agentsMuted: boolean;
 /** How many conversations want to talk (a mark, and reachable). */
 wantToTalk: number;
 /** Why the voice last turned itself off, and a failure's words. */
 voiceOffReason: VoiceOffReason | null; voiceOffDetail: string;
 /* The floating card (briefs/FLOATING-CARD-SPEC.md). */
 /** FC1: the first setup is finished, its wizard closed. */
 setupDone: boolean;
 /** FC2: call model A or B: the card follows it, and so does its host's `run()`. */
 callModel: CallModel;
 /** FC4: what the conversation's avatar acts out, as the stage's would for it; and the person's turn to it, open. */
 mood: import('../features/avatar/avatar-spec').AvatarMood;
 turn: 'listening' | 'transcribing' | null;
 /** FC6: the minute before the call (A) or the voice (B) ends itself for want of the person. */
 idleWarning: boolean;
 /** FC7: why the call (A) ended by itself; B says it in `voiceOffReason`. */
 ended: CallEnded | null;
 /** FC10: why B's microphone cannot be used. */
 micReason: MicCode | null;
 /** FC11: what `busy` is, and the title of the conversation a switch goes to. */
 busyReason: 'reconnecting' | 'switching' | null;
 switchingTo: string | null;
 /** FC12: the room's theme and language, resolved. */
 theme: 'light' | 'dark'; language: string;
 /** FC13: the microphone gives no sound though it is not muted (another app holds it). */
 micSilent: boolean;
}
export function callCardView(s: SessionFacts, participants?: ParticipantView[]): CallCardView;
/** The conversation hears the person right now. */
export function canHear(row: Pick<ParticipantView, 'available' | 'reach'>): boolean;
export interface StageFacts {
 /** The page is in the call. */
 inCall: boolean;
 /** The conversation on the stage is the one the microphone talks to. */
 isTarget: boolean;
 canHear: boolean;
 /** How the room reaches it; null while the room has not listed it yet. */
 reach: ParticipantView['reach'] | null;
 /** Its reply is sounding. */
 speaking: boolean;
 /** The person's turn to it is open: they are talking, or it is being transcribed (ConversationView.pendingPhase). */
 personSpeaking: boolean;
 working: boolean;
}
export function stageMood(facts: StageFacts): import('../features/avatar/avatar-spec').AvatarMood;
export interface VoiceSwitchStageFacts {
 voiceOn: boolean;
 reach: ParticipantView['reach'] | null;
 canHear: boolean;
 /** Its reply is sounding. */
 speaking: boolean;
 /** The person's turn to it is open. */
 personSpeaking: boolean;
 /** Its agent works (any voice state: the room says so for every conversation). */
 working: boolean;
}
export function voiceSwitchStageMood(facts: VoiceSwitchStageFacts): import('../features/avatar/avatar-spec').AvatarMood;
export function voiceMicCode(s: SessionFacts, rows: ParticipantView[]): MicCode | null;
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
