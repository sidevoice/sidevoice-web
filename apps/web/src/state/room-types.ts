export interface KaraokeRange {
  from: number;
  to: number;
  mode?: "word" | "chunk" | "segment";
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
  /** The room can play this reply again for this browser right now (#100). */
  replayable?: boolean;
  delivery?: string;
  audio?: string;
  audioNote?: string;
  /** How the room got this message when it did not hear it happen: `buffered`, or `truncated`. */
  offline?: string | null;
  offlineNote?: string;
  /** Said under input the room never handed to the conversation, and never will. */
  deliveryNote?: string;
  /** The room's own word for this row: `pending`, `sending`, `read`, `not_sent`… */
  status?: string;
  audio_reason?: string | null;
  /** Said on a reply the room is repeating because this browser never heard it through (#52). */
  replayNote?: string;
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
  /** How that harness is reached, when the room says it (Cursor: its editor card, its CLI under persist, or
   *  listening only); null against a room that does not. */
  route?: string | null;
}

/** One machine this device is paired with, as its row reads. A pairing the machine revoked is still a row:
 *  it stays, saying so, until the person pairs again or forgets it. */
export interface MachineView {
  /** The machine's fingerprint: what identifies it to this device. */
  id: string;
  host: string;
  /** The one this page talks to: its conversations and its call. */
  inUse: boolean;
  revoked: boolean;
  /** Where this device reaches it: directly, through the room, not at all, or — not in use — not asked. */
  reach: "direct" | "room" | "away" | "offline" | "checking" | "idle" | "revoked";
  reachLabel: string;
  state: "connected" | "offline" | "revoked";
  pairedLabel: string;
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

export interface SelectOption {
  value: string;
  label: string;
}

export interface LanguageModelView {
  language: string;
  label: string;
  model: string;
  actualModel: string;
  modelDescription?: string;
  modelOptions: ({value: string; label: string; options?: undefined} | {value?: undefined; label: string; options: {value: string; label: string}[]})[];
  voice: string;
  voiceOptions: SelectOption[];
  speed: number | null;
  speedMin: number;
  speedMax: number;
  inheritedSpeed: number;
}

export interface SidevoiceActions {
  cancelInput(): Promise<void>;
  skipReply(): Promise<void>;
  replayReply(historyId: string | null): Promise<void>;
  toggleMic(): void;
  selectAudioDevice(kind: "input" | "output", id: string): Promise<void>;
  toggleCall(): Promise<void>;
  selectParticipant(threadId: string): void;
  closeParticipant(threadId: string): Promise<void>;
  updateLanguageModel(language: string, model: string): void;
  updateLanguageVoice(language: string, voice: string): void;
  updateLanguageSpeed(language: string, speed: number | null): void;
  previewVoice(language: string): Promise<void>;
  /** Talk to this paired machine from now on, on this device. In a call it hangs up and joins that machine's. */
  chooseMachine(id: string): void;
  /** Forget this pairing here, and ask the machine (best effort) to revoke this device's token. */
  forgetMachine(id: string): Promise<void>;
  /** Redeem a pairing code under this device's name. Rejects with the sentence to show. */
  pairDevice(code: string, name: string): Promise<{ host: string | null }>;
  openPairing(): void;
  closePairing(): void;
}
