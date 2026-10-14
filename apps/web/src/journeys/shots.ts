import type { CatalogView } from "../services/model-catalogs.js";
import { defaultVoiceSettings } from "../services/voice-settings.js";
import { emptyOnboardingRecord, type OnboardingRecord, type OnboardingStep } from "../services/onboarding-state";
import type { PairingSummary } from "../services/device-pairing.js";
import type { UpdateMode, UpdaterStatus } from "../features/updates/useUpdates";
import type { TrialProgress } from "../state/room-types";

/* Every screen the storyboard shows (journeys.html): each a state of the real app, seeded — the room's facts, the
 * setup's record and step, and what to press once it is drawn (Settings open at a section, the transcript, a pairing
 * code entered) — with its caption. Grouped by journey; each shown on a phone and a desktop, light and dark. */

export interface Shot {
  id: string;
  caption: string;
  /** The room's facts, over the base (a device set up, paired with the NUC, in a call with three conversations). */
  facts?: Record<string, unknown>;
  /** The setup open at this step (its record as given, or the base's). */
  setup?: { step: OnboardingStep; record?: Partial<OnboardingRecord> };
  /** The desktop app's bridge, for this computer's machine (absent: a browser): its status, and `install` where the app
   *  installs Sidevoice itself — `true`, an install that runs on; `"fails"`, one that fails at its download. */
  desktop?: Record<string, unknown>;
  /** What is pressed once the page is drawn. */
  after?: (doc: Document) => void | Promise<void>;
  /** Actions the runtime would bind that do something in this shot (the rest do nothing): a try that listens, say. */
  actions?: Record<string, (...args: never[]) => unknown>;
  /** The setup's record over the base's (a device set up on this release). */
  record?: Partial<OnboardingRecord>;
  /** The variants this shot shows (VARIANTS). */
  variants?: Record<string, string>;
  /** The desktop app's updater (a release's), where it has one: its status and its mode. */
  updater?: { status: UpdaterStatus; mode?: UpdateMode };
  /** A pairing code's redemption, for the pairing shots: its refusal, in the controller's words; the addresses the code
   *  lists (its https one when absent); and an address typed in the machine's address. */
  pairRefusal?: string;
  pairUrls?: string[];
  pairAddress?: string;
  views?: ("phone" | "desktop")[];
}

export interface Journey {
  id: string;
  title: string;
  note: string;
  shots: Shot[];
}

const build = (id: string, installed = true) => ({ id, backend: "sherpa-onnx", precision: "int8", accelerator: "cpu", downloadBytes: 148e6, memoryMb: 300, available: true, reasons: [], installed });
const local = (id: string, family: string, task: string, installed = true, extra: Record<string, unknown> = {}) =>
  ({ id, family, capabilities: [task], parametersM: 74, license: "MIT", languages: ["es", "en"], voices: [], installed, builds: [build(id + "/int8", installed)], recommendedBuild: id + "/int8", ...extra });

export const CATALOGS = [
  { id: "local", name: null, status: { stale: false }, models: [
    local("whisper-base", "whisper", "stt"), local("whisper-small", "whisper", "stt", false),
    local("kokoro-82m-v1.0", "kokoro", "tts", true, { voices: [{ id: "ef_dora", languages: ["es"], gender: "female" }], speed: { min: 0.5, max: 2 } }),
    local("smart-turn-v3", "smart-turn", "end-of-turn"),
  ] },
  { id: "elevenlabs", name: "ElevenLabs", status: { stale: false }, models: [{ id: "scribe_v2", capabilities: ["stt"], languages: [], voices: [] }, { id: "eleven_flash_v2_5", capabilities: ["tts"], languages: [], voices: [] }] },
  { id: "openai", name: "OpenAI", status: { stale: false, reason: { code: "credential-missing", params: {} } }, models: [] },
] as unknown as CatalogView[];

const NUC: PairingSummary = { fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], rv: null, device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false };
const WORKSTATION: PairingSummary = { fp: "fp-ws", host: "Workstation", urls: [], rv: { url: "https://room.example", node: "ws-1" }, device_id: "d-ws", paired_at: 1_700_000_000, revoked: false };
const LAPTOP: PairingSummary = { fp: "fp-old", host: "Old laptop", urls: ["https://laptop.example"], rv: null, device_id: "d-old", paired_at: 1_690_000_000, revoked: false };
const THIS: PairingSummary = { fp: "fp-local", host: "MacBook", urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local", paired_at: 1_700_000_000, revoked: false, local: true };

const person = (thread_id: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ thread_id, title, available: true, reach: { state: "listening" }, node: "fp-nuc", machine: { host: "NUC", id: "connector-nuc" }, harness: "claude-code", engine: { model: "claude-opus-5-5", effort: "high" }, ...extra });
/** A machine's coding agents as its connector lists them: Claude Code connected, Codex to connect. */
const agentsListing = () => ({ status: "ready", error: null, busy: {}, actionErrors: {}, value: { scanned_at: Date.now(), custom: null, agents: [
  { id: "claude-code", label: "Claude Code", present: true, version: "2.4.1", registration: "connected", connect: "auto", instructions: null },
  { id: "codex", label: "Codex", present: true, version: "0.157.0", registration: "not-connected", connect: "auto", actionable: false, instructions: { command: "codex mcp add sidevoice -- sidevoice mcp", file: null, snippet: null } },
] } });
const REPLY = "I ran the tests: two fail in the settings pane, both about the Save button that no longer exists. Shall I update them?";
/** A reply longer than a page of the stage's bubble, to see its pages follow the voice. */
const LONG_REPLY = "I went through the settings pane: every toggle saves again, and the one for automatic updates had lost its listener " +
  "in yesterday's refactor, so I put it back and added a test that flips it and reloads. The whole suite passes. Shall I open the pull request?";

/** A device set up, paired with the NUC, in a call on "sidevoice-web" with two other conversations. */
export const BASE_FACTS: Record<string, unknown> = {
  machinesReady: true, pairings: [NUC], callNode: NUC.fp, machineLinks: { [NUC.fp]: { reach: "ok", via: "node" } },
  ws: {}, sessionId: "s1", roomBinding: { thread_id: "t-web", title: "sidevoice-web", binding_id: "b1" },
  people: [person("t-web", "sidevoice-web"), person("t-release", "release", { harness: "codex", engine: { model: "gpt-6-astra", effort: "medium" } }),
    person("t-notes", "notes", { harness: "cursor", reach: { state: "holding" } })],
  harness: {},
  hostAgents: { "fp-nuc": agentsListing(), "fp-local": agentsListing(), "fp-ws": agentsListing() },
  history: [
    { segment: "h-1", thread: "fp-nuc|t-web", role: "user", text: "Can you run the tests and tell me what fails?", name: "", time: Date.now() - 60_000, session: "s1", seq: 1 },
    { segment: "h-2", thread: "fp-nuc|t-web", role: "assistant", text: REPLY, name: "sidevoice-web", time: Date.now() - 30_000, session: "s1", seq: 2, audio: "played" },
  ],
  voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "smart-turn" },
  voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" },
  providerKeys: { elevenlabs: true, openai: false },
  localHostStatus: { state: "absent" },
  speechLanguage: "en",
};

const DONE: Partial<OnboardingRecord> = { basics_done: true, choice: "remote", agents_done: true, turn_done: true, completed_at: 1 };
const openSettings = (section: string) => (doc: Document) => {
  (doc.defaultView as unknown as { __journeyStore: { patch(facts: unknown): void } }).__journeyStore.patch({ settingsSection: section, settingsLevel: "page" });
  // Modal, as the runtime opens it: above the room's header; on a phone at the section's page, as an opening asked for.
  const dialog = doc.getElementById("language-settings") as HTMLDialogElement | null;
  if (dialog && !dialog.open) dialog.showModal();
};
const press = (id: string) => (doc: Document) => { doc.getElementById(id)?.click(); };
/** What `id` opens, opened (a disclosure: DisclosureButton). */
const disclose = (id: string) => (doc: Document) => { doc.querySelector<HTMLElement>(`[aria-controls="${id}"][aria-expanded="false"]`)?.click(); };
const running = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.4.0", api: 1 }, calls: 0 };
const localBridge = (status: Record<string, unknown>) => ({ state: status, pairingCode: true });
const stopped = { ...running, state: "stopped-by-person", reachable: false, installed: false, service: "none" };
/** No machine yet, and the pairing dialog open. */
const PAIRING = { pairings: [], callNode: null, machineLinks: {}, pairingOpen: true };
/** The catalogues with the model `id` not on this device yet. */
const absent = (id: string) => ({ voiceCatalogue: { state: "ready", error: "", catalogs: CATALOGS.map((catalog) => ({ ...catalog, models: catalog.models.map((model) => model.id !== id ? model
  : { ...model, installed: false, builds: model.builds?.map((entry) => ({ ...entry, installed: false })) }) })) } });
const never = () => new Promise(() => {});
/** The voice steps' tries, as the runtime's actions would run them: listening (the level up) or playing (half the
 *  sentence heard) until the shot ends, or done — what was heard, how quick. */
const TRIES = {
  listening: { tryVoiceSettings: (_task: string, progress: TrialProgress) => { progress.onListening?.(); progress.onLevel?.(0.5); return never(); } },
  playing: { tryVoiceSettings: (_task: string, progress: TrialProgress) => { progress.onListening?.(); progress.onProgress?.({ from: 0, to: 24 }); return never(); } },
  heard: { tryVoiceSettings: async (task: string) => task === "stt"
    ? { text: "Hello, can you hear me?", timings: { ready_ms: 300, recognition_ms: 420 } } : { timings: { ready_ms: 300, first_sound_ms: 320 } } },
};
/** The end of turn's try: listening until the shot ends, or a turn whose end it decided 0.9 s into the silence. */
const TURN_TRIES = {
  listening: { tryTurnSettings: (progress: TrialProgress) => { progress.onTurnStep?.({ step: "listening", again: false }); progress.onLevel?.(0.5); return never(); } },
  heard: { tryTurnSettings: (progress: TrialProgress) => {
    progress.onTurnStep?.({ step: "heard", text: "Can you look at the failing test? I think it's the reconnect one.", endpoint_silence_ms: 900 });
    // Decided, the try is stopped (cancelVoiceTry): it ends cancelled, with the turn it heard.
    return new Promise((_, reject) => setTimeout(() => reject({ code: "trial-cancelled" }), 0));
  } },
};

export const JOURNEYS: Journey[] = [
  { id: "first-run", title: "First run", note: "The setup, step by step, on a device that has none yet.", shots: [
    { id: "w0", caption: "The basics: appearance (System), the interface's language and the one you speak (Automatic).", setup: { step: "W0", record: {} } },
    { id: "w1", caption: "Where you use your agents: this computer preselected in the desktop app; another machine.", setup: { step: "W1", record: { basics_done: true } }, desktop: localBridge({ state: "absent" }) },
    { id: "w2", caption: "Prepare this computer: the app installs Sidevoice here (its progress in place); under it, I'll do it myself, closed.", setup: { step: "W2", record: { basics_done: true, choice: "agents" } },
      desktop: { ...localBridge({ state: "absent" }), install: true } },
    { id: "w2-manual", caption: "I'll do it myself, opened: the command to run here (or an agent runs it); on by itself once this computer answers.", setup: { step: "W2", record: { basics_done: true, choice: "agents" } },
      desktop: { ...localBridge({ state: "absent" }), install: true }, after: disclose("wizard-prepare-manual") },
    { id: "w2-failed", caption: "The app's install failed: what failed and Retry, and I'll do it myself opened by itself.", setup: { step: "W2", record: { basics_done: true, choice: "agents" } },
      desktop: { ...localBridge({ state: "absent" }), install: "fails" }, after: press("wizard-prepare") },
    { id: "w2-command", caption: "Where the app does not install Sidevoice: the command alone, shown as it is.", setup: { step: "W2", record: { basics_done: true, choice: "agents" } }, desktop: localBridge({ state: "absent" }) },
    { id: "w2-stopped", caption: "Prepare this computer, installed but stopped: Start, not the command.", setup: { step: "W2", record: { basics_done: true, choice: "agents" } },
      desktop: localBridge(stopped), facts: { localHostStatus: stopped, localHostAvailable: true } },
    { id: "w3", caption: "Ready here: the agents on this computer, Connect or Disconnect each.", setup: { step: "W3", record: { basics_done: true, choice: "agents" } }, desktop: localBridge(running),
      facts: { pairings: [THIS], callNode: null, machineLinks: { [THIS.fp]: { reach: "ok", via: "node" } }, localHostStatus: running, localHostAvailable: true } },
    { id: "w2r", caption: "Another machine: how to prepare it, then its one-time code.", setup: { step: "W2r", record: { basics_done: true, choice: "remote" } }, facts: { pairings: [], callNode: null, machineLinks: {} } },
    { id: "w4", caption: "Transcription, its model not downloaded yet: the try's block already there, its button and the footer's waiting for the model, saying why.", setup: { step: "W4", record: { basics_done: true, choice: "remote" } },
      facts: { voiceSettings: { ...defaultVoiceSettings(), stt: { catalog: "local", model: "whisper-small", language: null } } } },
    { id: "w4-ready", caption: "Transcription, its model ready: Try it in the try's block and in the footer — recommended, not required.", setup: { step: "W4", record: { basics_done: true, choice: "remote" } } },
    { id: "w4-listening", caption: "Transcription, listening: the level moving, the take's bar filling; the footer's Stop is the one.", setup: { step: "W4", record: { basics_done: true, choice: "remote" } },
      actions: TRIES.listening, after: press("wizard-try") },
    { id: "w4-heard", caption: "Transcription, tried: what was heard and how quick, Speak again in the block; Continue.", setup: { step: "W4", record: { basics_done: true, choice: "remote" } },
      actions: TRIES.heard, after: press("wizard-try") },
    { id: "w4v-absent", caption: "Voice, its model not downloaded yet: the try's block already there, waiting for the model, saying why.", setup: { step: "W4v", record: { basics_done: true, choice: "remote" } },
      facts: absent("kokoro-82m-v1.0") },
    { id: "w4v", caption: "Voice: a sentence to hear, editable; Try it in the try's block and in the footer.", setup: { step: "W4v", record: { basics_done: true, choice: "remote" } } },
    { id: "w4v-playing", caption: "Voice, playing: the sentence lit as it is heard; the footer's Stop is the one.", setup: { step: "W4v", record: { basics_done: true, choice: "remote" } },
      actions: TRIES.playing, after: press("wizard-try") },
    { id: "w4v-heard", caption: "Voice, tried: how quick its first sound was, Play again in the block; Continue.", setup: { step: "W4v", record: { basics_done: true, choice: "remote" } },
      actions: TRIES.heard, after: press("wizard-try") },
    { id: "w5-absent", caption: "When your turn ends, Smart's model not downloaded yet: the try's block already there, waiting for it, saying why.", setup: { step: "W5", record: { basics_done: true, choice: "remote" } },
      facts: absent("smart-turn-v3") },
    { id: "w5", caption: "When your turn ends: Smart (recommended) or Silence, patience with its timings; Try it in the try's block and in the footer.", setup: { step: "W5", record: { basics_done: true, choice: "remote" } } },
    { id: "w5-listening", caption: "When your turn ends, listening: talk as you would to the agent; the footer's Stop is the one.", setup: { step: "W5", record: { basics_done: true, choice: "remote" } },
      actions: TURN_TRIES.listening, after: press("wizard-try") },
    { id: "w5-heard", caption: "When your turn ends, tried: when it decided you had finished; Continue.", setup: { step: "W5", record: { basics_done: true, choice: "remote" } },
      actions: TURN_TRIES.heard, after: press("wizard-try") },
    { id: "w6", caption: "Ready: into the room.", setup: { step: "W6", record: { basics_done: true, choice: "remote", turn_done: true } } },
  ] },
  { id: "pairing", title: "Pairing a machine", note: "The code pasted in this device; what it says when the code cannot be used.", shots: [
    { id: "pair-open", caption: "Pairing: paste the code the machine gave.", facts: PAIRING },
    { id: "pair-expired", caption: "The code expired or was used: run pair-device again.", facts: PAIRING, pairRefusal: "The code expired" },
    { id: "pair-unreachable", caption: "The code's addresses did not answer: its address is asked for.", facts: PAIRING, pairRefusal: "unreachable" },
    { id: "pair-insecure", caption: "Plain http written to a public address: said under the address, nothing sent.", facts: PAIRING, pairRefusal: "address-insecure", pairAddress: "http://203.0.113.5:8768" },
    { id: "pair-http-private", caption: "Only plain http answers on a private network: what that exposes, and Connect without encryption.", facts: PAIRING, pairRefusal: "pairing-http-private", pairUrls: ["http://192.168.1.20:8768"] },
    { id: "pair-http-only", caption: "Only plain http answers at a public address: refused.", facts: PAIRING, pairRefusal: "pairing-http-only", pairAddress: "203.0.113.5:8768" },
    { id: "pair-http-blocked", caption: "Only plain http answers, and this page is https: pair from the desktop app.", facts: PAIRING, pairRefusal: "pairing-http-blocked", pairUrls: ["http://192.168.1.20:8768"] },
  ] },
  { id: "room", title: "The room", note: "The call with a conversation on the stage, and around it.", shots: [
    { id: "no-machine", caption: "No machine yet: connect one.", facts: { pairings: [], callNode: null, machineLinks: {} } },
    { id: "no-conversation", caption: "In the room, no conversation on the stage: choose one.", facts: { roomBinding: null, people: [] } },
    { id: "conversations", caption: "A conversation on the stage; the others beside it (a phone: from the header).", facts: {} },
    { id: "speaking", caption: "The agent speaking: its words as they are said.", facts: { botLive: true, karaokeState: { segment: "h-2", from: 0, to: 58 }, history: [
      ...(BASE_FACTS.history as unknown[]).slice(0, 1), { ...(BASE_FACTS.history as Record<string, unknown>[])[1], audio: "playing" }] } },
    { id: "speaking-long", caption: "A long reply: three lines at a time, its pages following the voice, the end of the page before fading above.",
      facts: { botLive: true, karaokeState: { segment: "h-3", from: 160, to: 200 }, history: [...(BASE_FACTS.history as unknown[]),
        { segment: "h-3", thread: "fp-nuc|t-web", role: "assistant", text: LONG_REPLY, name: "sidevoice-web", time: Date.now() - 5_000, session: "s1", seq: 3, audio: "playing" }] } },
    { id: "working", caption: "The agent working.", facts: { harness: { "fp-nuc|t-web": true } } },
    { id: "listening", caption: "You speaking: your turn, as it is heard.", facts: { userLive: true, userTurn: { id: "u", segment: "u", thread: "fp-nuc|t-web" }, pendingPhase: "listening" } },
    { id: "transcript", caption: "The transcript open.", after: press("transcript-toggle") },
  ] },
  { id: "settings", title: "Settings", note: "Each section, applied as it changes (no Save).", shots: [
    { id: "s-general", caption: "General: language and appearance.", after: openSettings("general") },
    { id: "s-transcription", caption: "Transcription: source and model, the model prepared in place.", after: openSettings("transcription") },
    { id: "s-voice", caption: "Voice.", after: openSettings("voice") },
    { id: "s-call", caption: "Call: end of turn and patience (with their timings), the thinking sound, the screen.", after: openSettings("call") },
    { id: "s-providers-none", caption: "Providers: none connected.", facts: { providerKeys: { elevenlabs: false, openai: false } }, after: openSettings("providers") },
    { id: "s-providers", caption: "Providers: one connected, one to connect.", after: openSettings("providers") },
    { id: "s-providers-error", caption: "Providers: a key the provider refused, in its words.", facts: { voiceCatalogue: { state: "ready", error: "", catalogs: CATALOGS.map((c) => c.id === "elevenlabs" ? { ...c, status: { stale: false, reason: { code: "credential-rejected" }, detail: "invalid_api_key" } } : c) } }, after: openSettings("providers") },
    { id: "s-this-computer-prepare", caption: "This device, not prepared yet: the setup's two ways, the app's Prepare and I'll do it myself.", desktop: { ...localBridge({ state: "absent" }), install: true },
      facts: { localHostAvailable: true, inApp: true }, after: openSettings("this-computer") },
    { id: "s-machine-local", caption: "Machines: this computer, running — its service, agents, devices.", desktop: localBridge(running),
      facts: { pairings: [THIS, NUC], machineLinks: { [THIS.fp]: { reach: "ok", via: "node" }, [NUC.fp]: { reach: "ok", via: "node" } }, localHostStatus: running, localHostAvailable: true }, after: openSettings("machines") },
    { id: "s-machine-stopped", caption: "Machines: this computer, stopped — Start brings it back.", desktop: localBridge(stopped),
      facts: { pairings: [THIS, NUC], localHostStatus: stopped, localHostAvailable: true }, after: openSettings("machines") },
    { id: "s-machine-remote", caption: "Machines: a remote machine, connected.", facts: { pairings: [NUC, WORKSTATION, LAPTOP], machineLinks: { [NUC.fp]: { reach: "ok", via: "node" } } }, after: openSettings("machines") },
    { id: "s-machine-offline", caption: "Machines: a remote machine that does not answer.", facts: { pairings: [LAPTOP, NUC], callNode: null, machineLinks: { [LAPTOP.fp]: { reach: "away", via: "" }, [NUC.fp]: { reach: "ok", via: "node" } } }, after: openSettings("machines") },
    { id: "s-machine-revoked", caption: "Machines: a machine that no longer knows this device.", facts: { pairings: [{ ...NUC, revoked: true }], callNode: null, machineLinks: { [NUC.fp]: { reach: "revoked", via: "" } } }, after: openSettings("machines") },
    { id: "s-advanced", caption: "Advanced: memory when idle, the downloaded models, reset, the build.", facts: { modelsRemovable: true }, after: openSettings("advanced") },
  ] },
  { id: "updates", title: "Updates and what's new", note: "What wants updating, said over the room without moving it; what a release added, shown once, never the setup again.", shots: [
    { id: "u-web", caption: "A new version of the page while in a call: Reload loads it at once, in the call or not.", facts: { webUpdate: "b2" } },
    { id: "u-several", caption: "Several at once: the notice says the most pressing, the desktop app's Restart to update; its × shows the next, the page's Reload. This computer's service is Settings › Updates' to say.", facts: { webUpdate: "b2", pairings: [THIS, NUC], localHostStatus: running, localHostAvailable: true },
      updater: { status: { state: "ready", version: "0.5.0" } }, desktop: { ...localBridge(running), version: { bridge: 1, bundled: { version: "0.5.0" }, installed: { version: "0.4.0" }, core_api: 1, update: "available" } } },
    { id: "u-app-manual", caption: "The desktop app's update in manual mode, downloading: the room says nothing until it is ready (its progress is in Settings › Updates), then Restart to update.",
      updater: { status: { state: "downloading", version: "0.5.0", progress: 0.4 }, mode: "manual" } },
    { id: "whats-new", caption: "What's new for someone set up on an earlier release: only what needs them, marked new where it is set up.", record: { baseline_release: 0 },
      facts: { ws: null, voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "silence" } } },
  ] },
];
