import type { ChatMessage, ConversationView, HostAgentsState, JoinStatusView, MachineView, PairingPromptView, ParticipantView, KaraokeRange, SettingsAgentRequest } from './room-types';
import type { PairingSummary } from '../services/device-pairing.js';
/** How a paired machine is reached now: proved at an address ('ok'), being looked for, or why not. */
export type NodeReach = 'ok' | 'checking' | 'revoked' | 'offline' | 'away';
export interface MachineLink { reach: NodeReach; via: '' | 'node' }
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
 roomBinding: {thread_id: string; title?: string; binding_id?: string} | null; viewedThread: string | null; /* NO_VIEW: no conversation on screen */
 people: unknown[]; history: ChatMessage[]; roomSeen: Record<string, number>; inputReceipts: Record<string, string>;
 userLive: boolean; botLive: boolean;
 /** The person's turn being said: the voice's id for it, the bubble's segment, and the conversation it goes to. */
 userTurn: {id: string; segment: string; thread: string | null} | null; pendingPhase: '' | 'listening' | 'transcribing'; pendingUserText: string;
 cancelledInput: boolean; textSending: boolean; micEnabled: boolean; speechOutput: 'on' | 'agents_muted' | 'voice_off';
 voiceState: VoiceState | null;
 /** A join that failed: its sentence, and what was raw about it, for its Details (error-message.ts). */
 joinStep: string | null; joinFailure: string; joinFailureDetails: string; joinProgress: number | null; joinDetail: string; joinSubject: string;
 screenLock: {state: string; note: string}; holding: boolean; userQuietAt: number;
 harness: Record<string, boolean>; turns: Record<string, {session: string; thread: string; status?: string; settled?: boolean; harnessEnded?: boolean; readyAt?: number}>;
 /** The reply being said, and where the voice is in it: the part of `segment`'s text sounding now (`from`, `to`;
  *  both the end of what was heard between its chunks). */
 now: number; karaokeState: (KaraokeRange & {segment: string}) | null;
 /** Since when each conversation (by its key) has been busy without a break; Working shows WORKING_SHOWN_AFTER_MS later. */
 workingSince: Record<string, number>;
 /** What the room says of each conversation's figure, as one value: its mood, whether it is held still, and when something last
  *  happened with it (wall-clock). Relayed to the card, which acts out exactly that (conversation-avatars.ts). `restRelayed`: this store only receives it. */
 figures: Record<string, { mood: import('../features/avatar/avatar-spec').AvatarMood; still: boolean; restStart: number }>; restRelayed: boolean;
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
 /** `update`: the machine's Sidevoice is older than the latest, and the command that updates it there where it names one
  *  (contract gap #57). */
 remoteHostStatus: Record<string, {state: 'checking' | 'connected' | 'offline'; checkedAt: number; version?: string | null; update?: {latest: string; command: string | null} | null}>;
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
 /** The conversation a move to another machine is taking the call to. */
 movingTo: string | null;
 /** The floating call card (briefs/FLOATING-CARD-SPEC.md). The first setup is finished and its wizard is not open (the onboarding provider says it; FC1). */
 setupDone: boolean;
 /** The minute before a call nobody uses ends itself, and why the last call ended without the person
  *  ending it (FC6, FC7); cleared as a call starts. */
 callIdleWarning: boolean; callEnded: CallEnded | null;
 /** The theme and the interface language the page wears now (its root's `data-theme` and `lang`; FC12). */
 pageTheme: 'light' | 'dark'; pageLanguage: string;
}
/** Why a call ended without the person ending it: nobody used it, its conversation's machine went away (`detail`:
 *  the conversation's title), or the room or the machine refused it (`detail`: the room's words). */
export interface CallEnded { reason: 'idle' | 'offline' | 'failed'; detail: string }
/** `next`, with `previous` itself wherever the two hold the same data (the store's projections keep what did not change). */
export function keepEqual<T>(previous: unknown, next: T): T;
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
 join: JoinStatusView | null;
 mic: {enabled: boolean; label: string; title: string; pressed: boolean; disabled: boolean; holding: boolean};
 call: {joined: boolean; busy: boolean; label: string}; title: string;
 callCard: CallCardView;
 enginePanel: {id: string; label: string; value: string; state: 'ok' | 'warn' | 'fail'; note: string}[];
 screenLock: {state: string; note: string};
 bootError: import('../components/ui/ErrorText').ErrorMessage | null; machines: MachineView[]; pairing: PairingPromptView;
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
/** The desktop card's snapshot as the room projects it (`callCardView`, the store's `callCard`): the whole of
 *  call-controls/host.ts CallSnapshot but what its host stamps (FLOATING-CARD-SPEC FC0). */
export interface CallCardView {
 ready: boolean;
 /** In the call. */
 joined: boolean;
 /** Reconnecting or switching conversation (`busyReason` says which). */
 busy: boolean;
 micEnabled: boolean;
 /** The microphone cannot be used, as its button says. */
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
 /* The floating card (briefs/FLOATING-CARD-SPEC.md). */
 /** FC1: the first setup is finished, its wizard closed. */
 setupDone: boolean;
 /** FC4: what the conversation's avatar acts out, as the stage's would for it; and the person's turn to it, open. */
 mood: import('../features/avatar/avatar-spec').AvatarMood;
 turn: 'listening' | 'transcribing' | null;
 /** FC6: the minute before the call ends itself for want of the person. */
 idleWarning: boolean;
 /** FC7: why the call ended by itself. */
 ended: CallEnded | null;
 /** FC11: what `busy` is, and the title of the conversation a switch goes to. */
 busyReason: 'reconnecting' | 'switching' | null;
 switchingTo: string | null;
 /** FC12: the room's theme and language, resolved. */
 theme: 'light' | 'dark'; language: string;
 /** FC13: the microphone gives no sound though it is not muted (another app holds it). */
 micSilent: boolean;
 /** The facts the floating card's formats draw the call from, with the room's own components (cardFacts). */
 facts: CardFacts;
}
/** The facts a card's store is patched with: plain data, the socket only as whether there is one (sidevoice-web#229). */
export type CardFacts = Partial<Omit<SessionFacts, 'ws'>> & { ws: boolean; viewedThread: null; history: ChatMessage[] };
export const CARD_HISTORY: number;
export function cardFacts(s: SessionFacts): CardFacts;
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
 /** Its harness says it is busy, and has been for a while (ParticipantView.working). */
 working: boolean;
}
export function stageMood(facts: StageFacts): import('../features/avatar/avatar-spec').AvatarMood;
export interface SessionStore {
 facts: SessionFacts;
 getState(): SessionSnapshot; getInitialState(): SessionSnapshot;
 subscribe(listener: (state: SessionSnapshot, previous: SessionSnapshot) => void): () => void;
 patch(facts: Partial<SessionFacts>): void;
 batch<T>(fn: () => T): T;
}
export function createRoomSessionStore(seed?: Partial<SessionFacts>): SessionStore;
export function receiptView(status: string): {symbol: string; label: string};
export function audioNote(row: {audio?: string; audio_reason?: string; heard_chars?: number | null; hearing?: "heard" | "partial" | "not_heard" | null; interrupted?: boolean}, ahead?: number): string;
/** A conversation's title as every surface shows it: one line, unquoted, without a part naming its harness or model. */
export function displayTitle(title: string | null | undefined, person?: { harness?: string | null; engine?: { model?: string | null } | null } | null): string;
export function speechSegment(reply: {history_id?: string; session_id?: string; utterance_id?: string}): string;
export function recordReply(s: SessionFacts, reply: {session_id?: string; thread_id?: string; revision?: number; reply_revision?: number}): SessionFacts['turns'];
export function recordReceipt(s: SessionFacts, id: string, status: string, at: number): SessionFacts['turns'];
/** The translator every projection speaks through (state/room-store.ts gives it). */
export function speakWith(translate: (key: import('../i18n/translator').MessageKey, params?: Record<string, string | number>) => string): void;
/** No machine this device can talk to, in one sentence. */
export function noMachine(): string;
export const RECONNECT_GRACE_MS: number;
/** How long a conversation works without a break before it shows as working. */
export const WORKING_SHOWN_AFTER_MS: number;
/** Whether the conversation is working on what this browser said, as soon as that is known. */
export function busy(s: SessionFacts, thread?: string | null): boolean;
/** Whether the conversation shows as working: busy without a break for WORKING_SHOWN_AFTER_MS, by the clock fact. */
export function working(s: SessionFacts, thread?: string | null): boolean;
/** Since when each conversation has been busy without a break, as known at `at`. */
export function busySince(s: SessionFacts, at: number): Record<string, number>;
/** When the next conversation busy for a while is due to show as working; null when none is waiting. */
export function workingDeadline(s: SessionFacts): number | null;
export function machinesView(s: SessionFacts): MachineView[];
/** A conversation as the page knows it: the machine (fingerprint) and the room's thread, as one key. */
export function conversationKey(node: string | null | undefined, thread: string | null | undefined): string | null;
export function conversationOf(key: string | null | undefined): { node: string; thread: string } | null;
export function personKey(person: { node?: string | null; thread_id?: string | null } | null | undefined): string | null;
export function selectedThread(s: SessionFacts): string | null;
/** The conversation in focus, the only one that may sound: the one on screen, or, minimised, the call card's. */
export function focusedThread(s: SessionFacts, hidden?: boolean): string | null;
export function reachNote(s: SessionFacts): string;
export function unreached(s: SessionFacts, fp: string, refused?: boolean): string;
export function joinView(s: SessionFacts): JoinStatusView | null;
