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

/** One provider as the machine lists it (#64) to any paired device: whether it has a key, where it came from and
 *  its last four characters, never the key. */
export interface IntegrationProvider {
  id: string;
  label: string;
  capabilities: ("transcription" | "voice")[];
  configured: boolean;
  source?: "stored" | "environment" | null;
  hint?: string | null;
  environment?: string;
}

export interface IntegrationListing {
  providers: IntegrationProvider[];
}

export interface IntegrationRowView {
  id: string;
  label: string;
  /** What the provider can do for the machine, in words: "Transcripción", "Voz". */
  uses: string;
  configured: boolean;
  placeholder: string;
  /** News about the key — checking, verified, refused, from the environment — or ''. */
  note: string;
  status: "" | "checking" | "verified" | "refused";
  canClear: boolean;
  draft: string;
  focused: boolean;
}

export interface IntegrationsView {
  error: string;
  status: "idle" | "loading" | "ready" | "failed";
  rows: IntegrationRowView[];
}

export interface SelectOption {
  value: string;
  label: string;
}

export type StageTask = "stt" | "tts";

/** A place a stage can be put (#124 D7–D8): this device, or a provider the machine lists. 'missing' is a provider
 *  without a key (greyed out, with Configurar); 'unknown' one whose listing is not in yet, kept as it was chosen. */
export interface StagePlaceView {
  id: string;
  label: string;
  state: "ready" | "missing" | "unknown";
}

export interface StageChoiceView {
  value: string;
  label: string;
  /** A remote voice listed under "other languages". */
  other?: boolean;
}

/** One option of a model's family (or of a provider), as the schema renderer draws it. */
export type StageOptionView =
  | { id: string; kind: "language"; label: string; value: string; choices: StageChoiceView[] }
  | { id: string; kind: "text"; label: string; value: string; max: number }
  | { id: string; kind: "range"; label: string; value: number; min: number; max: number; step: number }
  | { id: string; kind: "voice"; label: string; perLanguage: true; loading: boolean; rows: { language: string; label: string; value: string; choices: StageChoiceView[] }[] }
  | { id: string; kind: "voice"; label: string; perLanguage: false; value: string; choices: StageChoiceView[] };

export interface StageView {
  task: StageTask;
  places: StagePlaceView[];
  place: string;
  /** False while the choice depends on a machine listing that is not in: the saved choice stays. */
  editable: boolean;
  integrations: "idle" | "loading" | "ready" | "failed";
  models: { id: string; label: string; description?: string; detail: string }[];
  modelsLoading: boolean;
  modelsError: string;
  model: string;
  options: StageOptionView[];
  /** The build this device runs the model on, automatic by default (D9); null off this device. */
  advanced: { value: string; choices: StageChoiceView[]; reason: string } | null;
  /** Where the work happens: in this page, in the desktop app, or at a provider. */
  where: "page" | "app" | "provider";
  /** Nothing chosen, and this device runs nothing for the stage: a place has to be chosen. */
  unconfigured?: boolean;
  /** The model being selected — asked, downloading, loading, checked — or the outcome of the last one (#124 §6). */
  check: StageCheckView | null;
  /** Where and on what this stage's model runs, and what its last check measured (#90). */
  diagnostics: { rows: { label: string; value: string }[]; checked: boolean; busy: boolean } | null;
}

/** One model selection as its pane says it: a download to consent to (its size), the step it is at, why it failed
 *  (the step and its cause, with the model still in use), a slow one to decide on, or the numbers it took effect with. */
export type StageCheckView = { model: string; previous: string; recheck: boolean } & (
  | { phase: "consent"; size: string }
  | { phase: "running"; step: string; amount: string; fraction: number | null }
  | { phase: "failed"; step: string; cause: string }
  | { phase: "slow"; latency: string; comfort: string; rows: { label: string; value: string }[] }
  | { phase: "done"; rows: { label: string; value: string }[] }
);

/** The room's downloads (#124 §6): a row per download and what the indicator says while any runs. */
export interface DownloadsView {
  rows: { id: string; label: string; task: string; state: "running" | "done" | "failed" | "cancelled"; status: string;
    fraction: number | null; amount: string; speed: string; left: string; error: string; cancellable: boolean }[];
  running: number;
  fraction: number | null;
  failed: boolean;
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
  /** Put a stage somewhere else: this device, or a provider. */
  chooseStagePlace(task: StageTask, place: string): void;
  chooseStageModel(task: StageTask, model: string): void;
  /** One option's value; a per-language option names the language. */
  setStageOption(task: StageTask, id: string, value: unknown, language?: string): void;
  /** Avanzado: 'auto' or 'engine/accelerator'. */
  chooseStageBuild(task: StageTask, value: string): void;
  /** The person's answer to the selection's question: download it (consent), or use it although it is slow. */
  decideStage(task: StageTask, yes: boolean): void;
  /** Stop a selection in flight; the model in use stays. */
  cancelStage(task: StageTask): void;
  /** Check the model in use again, for its numbers (Diagnóstico). */
  recheckStage(task: StageTask): void;
  /** Copy a stage's diagnostics as text. Resolves with whether it was copied. */
  copyDiagnostics(task: StageTask): Promise<boolean>;
  /** Stop one download, whoever started it: the page's, or the desktop app's through the bridge. */
  cancelDownload(id: string): void;
  previewVoice(language: string): Promise<void>;
  /** Load this device's chosen voice model ahead of the first reply. */
  prepareVoice(): Promise<void>;
  /** Ask the machine for its integrations again, after a failed read. */
  retryIntegrations(): Promise<void>;
  /** Try this page's GPU again after a model failed to load on it. */
  retryGpu(): Promise<void>;
  /** Talk to this paired machine from now on, on this device. In a call it hangs up and joins that machine's. */
  chooseMachine(id: string): void;
  /** Forget this pairing here, and ask the machine (best effort) to revoke this device's token. */
  forgetMachine(id: string): Promise<void>;
  /** Redeem a pairing code under this device's name. Rejects with the sentence to show. */
  pairDevice(code: string, name: string): Promise<{ host: string | null }>;
  openPairing(): void;
  closePairing(): void;
  /** What is typed in an integration's key field; a pause checks it with the provider. */
  typeIntegrationKey(id: string, value: string): void;
  /** Check the typed key now (the field was left, or Enter). Stored only if the provider takes it. */
  checkIntegrationKey(id: string): Promise<void>;
  /** Remove the key this machine stored for a provider. One from its environment stays. */
  clearIntegrationKey(id: string): Promise<void>;
  /** Open Integraciones at that provider's row: what a pane's "Configurar" does. */
  openIntegration(id: string): void;
}
