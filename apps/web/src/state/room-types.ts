import type { DeviceVoiceSettings } from '../services/voice-settings.js';
/** The part of a reply sounding now, as offsets into its text; `from` and `to` are the same between its chunks. */
export interface KaraokeRange {
  from: number;
  to: number;
}

export interface ChatMessage {
  segment: string | null;
  thread?: string | null;
  session?: string | null;
  role: "user" | "assistant";
  text: string;
  name: string;
  time: number;
  seq?: number;
  draft?: boolean;
  cancellable?: boolean;
  interrupted?: boolean;
  /** The room can play this reply again for this browser right now. */
  replayable?: boolean;
  delivery?: string;
  audio?: string;
  audioNote?: string;
  /** Said while the call had no room, and taken when it came back. */
  offline?: string | boolean | null;
  /** Said under input the room never handed to the conversation, and never will. */
  deliveryNote?: string;
  /** The room's own word for this row: `pending`, `sending`, `read`, `not_sent`… */
  status?: string;
  audio_reason?: string | null;
  karaoke?: KaraokeRange | null;
  playback?: "pending" | "playing" | "complete";
}

export interface ConversationView {
  messages: ChatMessage[];
  pendingText: string;
  pendingCancellable: boolean;
  /** While a turn is open the bubble shows bars instead of text: listening, then transcribing. */
  pendingPhase?: "" | "listening" | "transcribing";
  /** The conversation is working on this browser's last turn: the three dots say so. */
  working?: boolean;
}

export interface ParticipantView {
  threadId: string;
  title: string;
  selected: boolean;
  available: boolean;
  switching: boolean;
  unread: number;
  reach: "listening" | "holding" | "offline";
  stateLabel: string;
  /** Honest activity support: unsupported and unknown are different messages. */
  activityNote?: string | null;
  detail?: string;
  /** The line under the title: unread, and a reach that is not normal — never "listening" or "thinking",
   *  the dot says both. */
  subtitle: string;
  working: boolean;
  /** The machine this conversation runs on, by the name it gave when it paired; null when unknown. */
  machine?: string | null;
  machineId?: string | null;
  /** The harness the conversation runs in ("claude", "codex"), shown as its icon; null when unknown. */
  harness?: string | null;
  /** The agent's model ("claude-opus-5-5") and its thinking effort ("xhigh"), exactly as the harness reports them; null when not. */
  model?: string | null;
  effort?: string | null;
  /** How that harness is reached, when the room says it (Cursor: its editor card, its CLI under persist, or
   *  listening only); null against a room that does not. */
  route?: string | null;
}

/** One machine this device is paired with, as its row reads. A pairing the machine revoked is still a row:
 *  it stays, saying so, until the person pairs again or forgets it. */
export interface MachineView {
  /** Stable UI row identity. The local row remains stable while its native pairing is unavailable. */
  id: string;
  /** The pairing fingerprint, when this row currently has a usable pairing. */
  pairingId?: string;
  host: string;
  /** The one this page talks to: its conversations and its call. */
  inUse: boolean;
  revoked: boolean;
  /** Where this device reaches it: directly, through the room, not at all, or — not in use — not asked. */
  reach: "direct" | "room" | "away" | "offline" | "checking" | "idle" | "revoked";
  state: "connected" | "checking" | "offline" | "revoked" | "failed";
  /** Whether this row is the app-owned local host, which is projected from the desktop bridge. */
  local?: boolean;
  /** Whether this row has a pairing that may be selected for routing. */
  selectable?: boolean;
  localStatus?: import("../services/desktop-host").LocalHostStatusName | string;
  pairedLabel: string;
}

/** A host's view of one supported coding agent. Instructions always come from that host's connector. */
export interface DetectedAgent {
  id: string;
  label: string;
  present: boolean;
  version: string | null;
  registration: "connected" | "not-connected" | "foreign" | "unknown";
  connect: "auto" | "manual";
  dismissed?: boolean;
  actionable?: boolean;
  instructions?: { command?: string; snippet?: string; file?: string | null } | null;
}

export interface HostAgentsListing {
  agents: DetectedAgent[];
  scanned_at: string | number;
  custom?: { command: string; snippet: string; version?: string | null } | null;
}

export interface HostAgentError {
  key: string;
  params?: Record<string, string | number>;
}

export interface HostAgentsState {
  status: "idle" | "loading" | "ready" | "failed";
  value: HostAgentsListing | null;
  error: HostAgentError | null;
  busy: Record<string, "connect" | "disconnect" | "dismiss">;
  actionErrors: Record<string, { key: string; params?: Record<string, string | number> }>;
}

export interface SettingsAgentRequest {
  fp: string | null;
  id: number;
}

export interface HostDeviceView {
  device_id: string;
  name?: string | null;
  kind?: "code" | "local" | string;
  current?: boolean;
  created_at?: string | number | null;
  last_seen_at?: string | number | null;
}

/** The step a join (or a reconnection) is on, already written the way the person reads it. */
export interface JoinStatusView {
  step: string | null;
  text: string;
  progress: number | null;
  failed: boolean;
  /** A standing note rather than a step (no machine to talk to): no progress dot, and no alert. */
  note?: boolean;
}

/** The dialog that pairs this device with a machine, and the sentence it opens with when the page opened it. */
export interface PairingPromptView {
  open: boolean;
  note: string;
}

export interface SidevoiceActions {
  cancelInput(): Promise<void>;
  /** Stops the reply sounding now on this device; the reply stays written and what is queued after it plays on. */
  skipReply(): void;
  /** Changes the voice settings the settings pane is editing; Save keeps them. */
  editVoice(patch: { stt?: Partial<DeviceVoiceSettings["stt"]> & { build?: string | null }; tts?: Partial<DeviceVoiceSettings["tts"]> & { build?: string | null }; patience?: DeviceVoiceSettings["patience"]; end_of_turn?: DeviceVoiceSettings["end_of_turn"]; idle_unload_minutes?: number; turn_model?: string }): void;
  /** Keeps `key` for a remote provider with the voice, or removes it with null. Rejects `{code}` or with the sentence. */
  saveProviderKey(provider: string, key: string | null): Promise<void>;
  /** A key tried with the provider and kept only when it takes it; a refusal throws its `code` and `detail`. */
  connectProviderKey?(provider: string, key: string): Promise<void>;
  interfaceLanguage?(): string;
  reloadToUpdate?(): void;
  setAudioDevices?(choice: { input?: string | null; output?: string | null }): Promise<unknown>;
  refreshAudioDevices?(): Promise<void>;
  setInterfaceLanguage?(value: string): void;
  /** Asks a provider again about its key, and reads the catalogues with what it said. */
  testProviderKey?(provider: string): Promise<void>;
  /** Reads the engine's catalogues, and which providers have a key, again. */
  loadVoiceCatalogue(): Promise<void>;
  replayReply(historyId: string | null): Promise<void>;
  toggleMic(): void;
  toggleCall(): Promise<void>;
  selectParticipant(threadId: string): void;
  closeParticipant(threadId: string): Promise<void>;
  /** Talk to this paired machine from now on, on this device. In a call it hangs up and joins that machine's. */
  chooseMachine(id: string): void;
  /** Forget this pairing here, and ask the machine (best effort) to revoke this device's token. */
  forgetMachine(id: string): Promise<void>;
  /** Redeem a pairing code under this device's name. Rejects with the sentence to show. */
  /** Redeems a machine's pairing code; `address` is where the person says the machine is (host:port or a URL). */
  pairDevice(code: string, name: string, address?: string): Promise<{ host: string | null }>;
  openPairing(): void;
  closePairing(): void;
  /** Tries the voice settings being edited, outside any call: the words heard (`stt`), or `text` said (`tts`). Settings
   *  that work become this device's. Rejects with a sentence and the failure's `code`. */
  /** A try's result, with how long each phase took (voice-trial.js's TrialTimings). */
  tryVoiceSettings?(task: "stt" | "tts", options?: { text?: string; language?: string | null; keep?: boolean }): Promise<{ text?: string; timings?: TrialTimings | null }>;
  /** Installs on this device the model the slot names, its progress in `voiceInstall`. */
  installVoiceModel?(task: "stt" | "tts" | "end-of-turn"): Promise<void>;
  /** Cancels that install: nothing of it is kept. */
  cancelVoiceInstall?(): void;
  uninstallVoiceModel?(model: string): Promise<void>;
  /** Stops the try in progress, which then rejects `trial-cancelled`. */
  cancelVoiceTry?(): void;
  /** Read a paired machine's host-owned coding agent state. */
  loadHostAgents?(fp: string, options?: { rescan?: boolean; watch?: string }): Promise<void>;
  /** Connect, disconnect, or dismiss an agent on the identified machine. */
  hostAgentAction?(fp: string, id: string, action: "connect" | "disconnect" | "dismiss"): Promise<void>;
  /** Open Settings → Machines at that machine's agents (all machines when null). */
  openAgentSettings?(fp: string | null): void;
  /** Shows a section of Settings: general, transcription, voice, providers, machines, advanced. */
  showSettingsSection?(section: string): void;
  /** List or revoke another device on the desktop-owned local host. */
  localHostDevices?(): Promise<HostDeviceView[]>;
  revokeLocalHostDevice?(id: string): Promise<void>;
  machineDevices?(fp: string): Promise<HostDeviceView[]>;
  revokeMachineDevice?(fp: string, id: string): Promise<void>;
}

/** How long a voice try's phases took, in ms (null where the voice did not say): transcription's readiness, the
 *  speech, the pause waited for and the recognition; the voice's readiness and its first sound. */
export interface TrialTimings {
  ready_ms: number | null;
  audio_ms?: number | null;
  endpoint_silence_ms?: number | null;
  recognition_ms?: number | null;
  first_sound_ms?: number | null;
}
