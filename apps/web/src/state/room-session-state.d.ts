import type { ChatMessage, ConversationView, IntegrationListing, IntegrationsView, JoinStatusView, MachineView, StageView, PairingPromptView, ParticipantView, KaraokeRange } from './room-types';
import type { PairingSummary } from '../services/device-pairing.js';
export interface AudioDevices {
 inputs: {id: string; label: string}[]; outputs: {id: string; label: string}[];
 inputId: string; outputId: string; available: boolean; outputAvailable: boolean; busy: boolean;
}
export type NodeReach = '' | 'ok' | 'unpaired' | 'revoked' | 'offline' | 'away';
export interface SessionFacts {
 ws: unknown; stream: unknown; sessionId: string | null; roomRevision: number; roomInfo: Record<string, unknown> | null;
 connecting: boolean; reconnecting: boolean; switching: boolean; switchingSession: boolean; switchingTranscription: boolean;
 roomBinding: {thread_id: string; title?: string; binding_id?: string} | null; viewedThread: string | null;
 people: unknown[]; history: ChatMessage[]; roomSeen: Record<string, number>; replayMarks: Record<string, string>; inputReceipts: Record<string, string>;
 userLive: boolean; botLive: boolean; activeSpeech: Record<string, unknown> | null; previewJob: unknown;
 userTurn: {thread: string; key: string; text?: string} | null; pendingPhase: '' | 'listening' | 'transcribing'; pendingUserText: string;
 cancelledInput: boolean; textSending: boolean; micEnabled: boolean;
 voicePreferences: Record<string, unknown> | null; enginePreferences: Record<string, unknown> | null;
 sttRuntime: Record<string, unknown> | null; engineReady: boolean; outputHealth: 'ok' | 'recovering' | 'failed'; echoFacts: unknown;
 joinStep: string | null; joinFailure: string; joinProgress: number | null; joinDetail: string; joinSubject: string;
 screenLock: {state: string; note: string}; deviceNote: string; holding: boolean; userQuietAt: number;
 audioDevices: AudioDevices; liveNote: string;
 harness: Record<string, boolean>; turns: Record<string, {session: string; thread: string; status?: string; settled?: boolean; harnessEnded?: boolean; readyAt?: number}>;
 now: number; karaokeState: (KaraokeRange & {segment: string}) | null; bootError: string | null;
 /** The machines this device is paired with (never their tokens), the one in use, and the clock they were read at. */
 pairings: PairingSummary[]; pairingInUse: string | null; machinesAt: number;
 /** How the node base in use is reached, the machine (fingerprint) it belongs to, and with none, why. */
 rendezvous: '' | 'room' | 'node'; node: string | null; nodeReach: NodeReach;
 /** The pairing dialog, and the sentence it opens with when the page opened it. */
 pairingOpen: boolean; pairingNote: string;
 /** The machine's integrations as listed for this device (never a key), or null until read; and why they were not. */
 integrations: IntegrationListing | null; integrationsError: string;
 /** What is typed in each integration's row and not stored yet, what the machine said about it, the row to open. */
 integrationDrafts: Record<string, string>; integrationChecks: Record<string, {note: string; status: 'checking' | 'verified' | 'refused'}>;
 integrationFocus: string | null;
 integrationsStatus: 'idle' | 'loading' | 'ready' | 'failed';
 modelCatalog: Record<string, unknown> | null; voiceLanguages: {id: string; label: string; voices?: [string, string][]; sample?: string}[];
 speechLanguage: string; inApp: boolean;
 deviceCapabilities: {runs: 'page' | 'native'; has: string[]; os?: string; arch?: string; memory_mb?: number | null} | null;
 deviceOffers: Record<string, unknown>[] | null; installedBuilds: {model: string; engine: string}[];
 remoteModels: Record<string, {models?: {id: string; label?: string; description?: string}[]; voices?: {id: string; label?: string; languages?: string[]}[]; error?: string}>;
 stageDraft: {stt?: Record<string, unknown>; tts?: Record<string, unknown>} | null;
 previewNote: string; prepareNote: string; gpuSetAside: boolean;
 /** Per stage, the model selection in flight or just over (#124 §6), and what its last check measured (#90). */
 stageChecks: Partial<Record<'stt' | 'tts', Record<string, unknown> | null>>; stageDiagnostics: Partial<Record<'stt' | 'tts', Record<string, unknown> | null>>;
 pageFacts: {adapter: {vendor: string; architecture: string; device: string; description: string} | null; crossOriginIsolated: boolean; threads: number | null; cores: number | null} | null;
}
export interface SessionStatus {
 speaker: 'user' | 'room' | 'nobody'; conversation: 'idle' | 'working' | 'speaking';
 tab: 'out' | 'listening' | 'transcribing' | 'reconnecting' | 'switching';
 selected: string | null; viewed: string | null; harness: boolean | null; working: boolean; bed: boolean;
}
export interface SessionSnapshot {
 facts: SessionFacts; session: SessionStatus; conversation: ConversationView; participants: ParticipantView[];
 join: JoinStatusView | null; engine: {text: string; title: string; output: string}; echo: {state: string; note: string}; live: string;
 audioDevices: AudioDevices;
 mic: {enabled: boolean; label: string; title: string; pressed: boolean; disabled: boolean; holding: boolean};
 call: {joined: boolean; busy: boolean; label: string}; title: string;
 enginePanel: {id: string; label: string; value: string; state: 'ok' | 'warn' | 'fail'; note: string}[];
 capabilityPanel: {id: string; label: string; value: string; state: 'ok' | 'warn' | 'fail'; note: string}[];
 screenLock: {state: string; note: string}; deviceNote: string;
 bootError: string | null; stages: {stt: StageView; tts: StageView} | null; voiceTools: {previewing: string | null; previewNote: string; prepareNote: string; gpuSetAside: boolean}; machines: MachineView[]; pairing: PairingPromptView;
 integrations: IntegrationsView;
}
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
export const NO_MACHINE: string;
export const UNPAIRED: string;
export function machinesView(s: SessionFacts): MachineView[];
export function keyedProvider(s: SessionFacts, id: string): 'ready' | 'missing' | 'absent';
export function reachNote(s: SessionFacts): string;
export function joinView(s: SessionFacts): JoinStatusView | null;
export function sinceText(seconds: number | null | undefined, now: number): string;
/** What a stage is chosen from, as stage-settings.js reads it. */
export function stageContext(s: SessionFacts): Record<string, unknown> & { keyed(id: string): 'ready' | 'missing' | 'absent' };
export function stagesView(s: SessionFacts): {stt: StageView; tts: StageView} | null;
