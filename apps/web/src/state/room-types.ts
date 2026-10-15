import type { DeviceVoiceSettings } from '../services/voice-settings.js';
import type { TurnStep } from '../services/voice-trial.js';
import type { VoiceTake } from '@sidevoice/voice';
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
  epoch?: number;
  heard_chars?: number | null;
  hearing?: "heard" | "partial" | "not_heard" | null;
  hearing_unconfirmed?: boolean;
  globally_heard?: boolean | null;
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
  /** Core's aggregate across devices, independent of whether text was opened. */
  unheard?: number;
  reach: "listening" | "holding" | "offline";
  /** Honest activity support: unsupported and unknown are different messages. */
  activityNote?: string | null;
  detail?: string;
  working: boolean;
  /** The paired machine this conversation runs on, as this device names it; `machineId` is its fingerprint. */
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
  /** Renamed on this device (an alias): `host` is that name, `machineHost` the machine's own. */
  alias?: boolean;
  machineHost?: string | null;
  /** Stable UI row identity. The local row remains stable while its native pairing is unavailable. */
  id: string;
  /** The pairing fingerprint, when this row currently has a usable pairing. */
  pairingId?: string;
  host: string;
  revoked: boolean;
  /** Where this device reaches it: directly, through the room, or not at all. Every paired machine is live at once. */
  reach: "direct" | "room" | "away" | "offline" | "checking" | "revoked";
  state: "connected" | "checking" | "offline" | "revoked" | "failed";
  /** Whether this row is the app-owned local host, which is projected from the desktop bridge. */
  local?: boolean;
  localStatus?: import("../services/desktop-host").LocalHostStatusName | string;
}

/** A host's view of one supported coding agent. Instructions always come from that host's connector. */
export interface DetectedAgent {
  id: string;
  label: string;
  present: boolean;
  version: string | null;
  /** `foreign`: the agent's MCP configuration already has an entry named "sidevoice" that Sidevoice did not add (made by
   *  hand or by another tool) — never touched. `outdated`: Sidevoice's own entry, from an older version — Connect updates it.
   *  `invalid`: the agent's MCP configuration file cannot be read (broken JSON/TOML): nothing is changed until it is fixed. */
  registration: "connected" | "not-connected" | "foreign" | "outdated" | "invalid" | "unknown";
  connect: "auto" | "manual";
  dismissed?: boolean;
  actionable?: boolean;
  /** How to add Sidevoice by hand (the connector's older form of manual.connect). */
  instructions?: AgentManualStep | null;
  /** What the connector can do itself for this agent: add Sidevoice (`connect`, its CLI found — or Cursor, whose file
   *  it edits), rewrite an entry an older Sidevoice made (`update`), take it out (`disconnect`). */
  can?: { connect?: boolean; update?: boolean; disconnect?: boolean };
  /** How to do each by hand, as the connector writes it for this harness: connecting; updating an entry an older
   *  Sidevoice made (remove it, then add ours); disconnecting; and replacing another "sidevoice" entry (remove it, then
   *  connect) — in order. */
  manual?: { connect?: AgentManualStep[]; update?: AgentManualStep[]; disconnect?: AgentManualStep[]; replace?: AgentManualStep[] } | null;
  /** How to take Sidevoice out of the agent by hand (the connector's, as `instructions` is for adding it). */
  removal?: { command?: string; snippet?: string; file?: string | null } | null;
}

/** One step done by hand: a command to run, or a snippet for a file. */
export interface AgentManualStep { command?: string; snippet?: string; file?: string | null }

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
  /** A failure's raw text, for its Details (error-message.ts). */
  details?: string;
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
  setSpeechOutput?(output: "on" | "agents_muted" | "voice_off"): void;
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
  /** A sign of the person: the desktop card's Keep on the idle warning (its `keep-alive`, FLOATING-CARD-SPEC FC6),
   *  which keeps the call on. */
  keepVoiceOn?(): void;
  /** A conversation by its key (machine and thread, ParticipantView.threadId): looked at, and the call goes to it — on
   *  another machine the call moves there. */
  selectParticipant(threadId: string): void;
  closeParticipant(threadId: string): Promise<void>;
  /** Forget this pairing here, and ask the machine (best effort) to revoke this device's token. */
  forgetMachine(id: string): Promise<void>;
  /** Redeem a pairing code under this device's name. Rejects with the sentence to show. */
  /** Redeems a machine's pairing code; `address` is where the person says the machine is (host:port or a URL). */
  /** `insecure`: the person agreed to pair over plain http with a machine on a private network (device-pairing.js). */
  pairDevice(code: string, name: string, address?: string, options?: { insecure?: boolean }): Promise<{ host: string | null }>;
  openPairing(): void;
  closePairing(): void;
  /** Tries the voice settings being edited, outside any call: the words heard (`stt`), or `text` said (`tts`). Settings
   *  that work become this device's (`keep`). Resolves with the words heard and how long each phase took (voice-trial.js's
   *  TrialTimings); rejects with a sentence and the failure's `code`. What it tells while it runs: TrialProgress. */
  tryVoiceSettings?(task: "stt" | "tts", options?: { text?: string; language?: string | null; keep?: boolean } & TrialProgress): Promise<{ text?: string; timings?: TrialTimings | null }>;
  /** Tries the end of turn being edited (Smart or Silence, with its patience), outside any call: it listens, telling each
   *  step of the person's turns (TrialProgress `onTurnStep`) and the microphone's level, until `cancelVoiceTry`, 30 s
   *  with no speech or a failure of the voice; it never resolves, and rejects with a sentence and why it ended
   *  (`trial-cancelled`, `trial-silence`, the voice's code). A change of the end of turn while it runs restarts it with
   *  the change; Smart without its model ready stops it. */
  tryTurnSettings?(progress?: Pick<TrialProgress, "onLevel" | "onTurnStep" | "onTake">): Promise<void>;
  /** Installs on this device the model the slot names, its progress in `voiceInstall`. */
  installVoiceModel?(task: "stt" | "tts" | "end-of-turn"): Promise<void>;
  /** Cancels that install: nothing of it is kept. */
  cancelVoiceInstall?(): void;
  uninstallVoiceModel?(model: string): Promise<void>;
  /** Delete downloaded models not used for `days` (null: never), now and whenever the catalogues are read again. */
  setDeleteUnusedModels?(days: number | null): Promise<void>;
  /** Stops the try in progress, which then rejects `trial-cancelled`. */
  cancelVoiceTry?(): void;
  /** Stop on a try that records (transcription): its take ends with what was said and is transcribed. */
  finishVoiceTry?(): void;
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
  /** Renames a device in a machine's list (this computer's, or a paired machine's): the machine keeps the name. */
  renameLocalHostDevice?(id: string, name: string): Promise<void>;
  renameMachineDevice?(fp: string, id: string, name: string): Promise<void>;
  /** A machine's name on this device only (null: back to the machine's own). */
  renameMachine?(fp: string, name: string | null): void;
  /** Asks a paired machine for its Sidevoice's version (remoteHostStatus), where it says. */
  loadMachineInfo?(fp: string): Promise<void>;
  /** This device's name as machines list it: kept for pairing, and sent to each machine it is paired with. Resolves with
   *  how many machines could not be told. */
  setDeviceName?(name: string): Promise<number>;
}

/** What a voice try tells while it runs, for whatever shows it. Transcription: `onListening` once the voice hears the
 *  microphone (its models loaded, the microphone open), and `onLevel`, the microphone's level from 0 to 1, many times a
 *  second. The voice: `onProgress` from its first sound on, the part of the sentence sounding now, in offsets into that
 *  text as JavaScript indexes it; between parts `from` and `to` meet at the end of what was heard, and the first sound
 *  is `{from: 0, to: 0}`. The end of turn: `onTurnStep`, each step of the person's turns as the voice tells it
 *  (voice-trial.js TurnStep), and `onLevel`. A try that records the person (transcription, the end of turn): `onTake`,
 *  once the try stops: what the microphone gave the voice, kept in memory by whoever shows it and nowhere else. */
export interface TrialProgress {
  onListening?(): void;
  onLevel?(level: number): void;
  /** Transcription's: the take has ended (Stop, its longest, or the voice's end of the turn) and what was said is being
   *  transcribed; false again when a turn of it came to nothing and it listens on. */
  onTranscribing?(transcribing: boolean): void;
  onProgress?(range: KaraokeRange): void;
  onTurnStep?(step: TurnStep): void;
  onTake?(take: VoiceTake): void;
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
