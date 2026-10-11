import type { CatalogView } from "../services/model-catalogs.js";
import { defaultVoiceSettings } from "../services/voice-settings.js";
import { emptyOnboardingRecord, type OnboardingRecord, type OnboardingStep } from "../services/onboarding-state";
import type { PairingSummary } from "../services/device-pairing.js";

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
  /** The desktop app's bridge, for this computer's machine (absent: a browser). */
  desktop?: Record<string, unknown>;
  /** What is pressed once the page is drawn. */
  after?: (doc: Document) => void | Promise<void>;
  /** The setup's record over the base's (a device set up on this release). */
  record?: Partial<OnboardingRecord>;
  /** The variants this shot shows (VARIANTS). */
  variants?: Record<string, string>;
  /** The desktop app's updater's answer, where it offers one. */
  updater?: { available: boolean; version?: string; required?: boolean };
  /** A pairing code's redemption, for the pairing shots: its refusal, in the controller's words; the addresses the code
   *  lists (its https one when absent); and an address typed through "Use a different address". */
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

const build = (id: string, installed = true) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 148e6, memoryMb: 300, available: true, reasons: [], installed });
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
  ({ thread_id, title, available: true, reach: { state: "listening" }, machine: { host: "NUC", id: "fp-nuc" }, harness: "claude-code", engine: { model: "claude-opus-5-5", effort: "high" }, ...extra });
/** A machine's coding agents as its connector lists them: Claude Code connected, Codex to connect. */
const agentsListing = () => ({ status: "ready", error: null, busy: {}, actionErrors: {}, value: { scanned_at: Date.now(), custom: null, agents: [
  { id: "claude-code", label: "Claude Code", present: true, version: "2.4.1", registration: "connected", connect: "auto", instructions: null },
  { id: "codex", label: "Codex", present: true, version: "0.157.0", registration: "not-connected", connect: "auto", actionable: false, instructions: { command: "codex mcp add sidevoice -- sidevoice mcp", file: null, snippet: null } },
] } });
const REPLY = "I ran the tests: two fail in the settings pane, both about the Save button that no longer exists. Shall I update them?";

/** A device set up, paired with the NUC, in a call on "sidevoice-web" with two other conversations. */
export const BASE_FACTS: Record<string, unknown> = {
  machinesReady: true, pairings: [NUC], pairingInUse: NUC.fp, node: NUC.fp, nodeReach: "ok",
  ws: {}, sessionId: "s1", roomBinding: { thread_id: "t-web", title: "sidevoice-web", binding_id: "b1" },
  people: [person("t-web", "sidevoice-web"), person("t-release", "release", { harness: "codex", engine: { model: "gpt-6-astra", effort: "medium" } }),
    person("t-notes", "notes", { harness: "cursor", reach: { state: "holding" } })],
  harness: {},
  hostAgents: { "fp-nuc": agentsListing(), "fp-local": agentsListing(), "fp-ws": agentsListing() },
  history: [
    { segment: "h-1", thread: "t-web", role: "user", text: "Can you run the tests and tell me what fails?", name: "", time: Date.now() - 60_000, session: "s1", seq: 1 },
    { segment: "h-2", thread: "t-web", role: "assistant", text: REPLY, name: "sidevoice-web", time: Date.now() - 30_000, session: "s1", seq: 2, audio: "played" },
  ],
  voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "smart-turn" },
  voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" },
  providerKeys: { elevenlabs: true, openai: false },
  localHostStatus: { state: "absent" },
  speechLanguage: "en",
};

const DONE: Partial<OnboardingRecord> = { basics_done: true, choice: "remote", agents_done: true, turn_done: true, completed_at: 1 };
const openSettings = (section: string) => (doc: Document) => {
  (doc.defaultView as unknown as { __journeyStore: { patch(facts: unknown): void } }).__journeyStore.patch({ settingsSection: section });
  // Modal, as the runtime opens it: above the room's header.
  const dialog = doc.getElementById("language-settings") as HTMLDialogElement | null;
  if (dialog && !dialog.open) dialog.showModal();
};
const press = (id: string) => (doc: Document) => { doc.getElementById(id)?.click(); };
const running = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.4.0", api: 1 }, calls: 0 };
const localBridge = (status: Record<string, unknown>) => ({ state: status, pairingCode: true });
/** No machine yet, and the pairing dialog open. */
const PAIRING = { pairings: [], pairingInUse: null, node: null, pairingOpen: true };

export const JOURNEYS: Journey[] = [
  { id: "first-run", title: "First run", note: "The setup, step by step, on a device that has none yet.", shots: [
    { id: "w0", caption: "The basics: appearance (System), the interface's language and the one you speak (Automatic).", setup: { step: "W0", record: {} } },
    { id: "w1", caption: "Where you use your agents: this computer preselected in the desktop app; another machine.", setup: { step: "W1", record: { basics_done: true } }, desktop: localBridge({ state: "absent" }) },
    { id: "w2", caption: "Prepare this computer: one button, its progress in place.", setup: { step: "W2", record: { basics_done: true, choice: "agents" } }, desktop: localBridge({ state: "absent" }) },
    { id: "w3", caption: "Ready here: the agents on this computer, Connect or Disconnect each.", setup: { step: "W3", record: { basics_done: true, choice: "agents" } }, desktop: localBridge(running),
      facts: { pairings: [THIS], pairingInUse: THIS.fp, node: THIS.fp, localHostStatus: running, localHostAvailable: true } },
    { id: "w2r", caption: "Another machine: how to prepare it, then its one-time code.", setup: { step: "W2r", record: { basics_done: true, choice: "remote" } }, facts: { pairings: [], pairingInUse: null, node: null, nodeReach: "" } },
    { id: "w4", caption: "Transcription: a model not downloaded yet — Continue waits for it; trying is recommended.", setup: { step: "W4", record: { basics_done: true, choice: "remote" } },
      facts: { voiceSettings: { ...defaultVoiceSettings(), stt: { catalog: "local", model: "whisper-small", language: null } } } },
    { id: "w4v", caption: "Voice: a sentence to hear, editable; Listen is optional.", setup: { step: "W4v", record: { basics_done: true, choice: "remote" } } },
    { id: "w5", caption: "When your turn ends: Smart (recommended) or Silence, patience with its timings.", setup: { step: "W5", record: { basics_done: true, choice: "remote" } } },
    { id: "w6", caption: "Ready: into the room.", setup: { step: "W6", record: { basics_done: true, choice: "remote", turn_done: true } } },
  ] },
  { id: "pairing", title: "Pairing a machine", note: "The code pasted in this device; what it says when the code cannot be used. The layout is the pair-machine variant.", shots: [
    { id: "pair-open", caption: "Pairing: paste the code the machine gave (code, the default).", facts: PAIRING },
    { id: "pair-open-steps", caption: "Variant steps: what to run on the machine, then this device, as two numbered steps.", facts: PAIRING, variants: { "pair-machine": "steps" } },
    { id: "pair-open-split", caption: "Variant split: the machine's column beside the form from 720px.", facts: PAIRING, variants: { "pair-machine": "split" } },
    { id: "pair-expired", caption: "The code expired or was used: run pair-device again.", facts: PAIRING, pairRefusal: "The code expired" },
    { id: "pair-unreachable", caption: "The code's addresses did not answer: its address is asked for.", facts: PAIRING, pairRefusal: "unreachable" },
    { id: "pair-insecure", caption: "Plain http written to another machine: said under the address, nothing sent.", facts: PAIRING, pairRefusal: "address-insecure", pairAddress: "http://192.168.1.20:8765" },
    { id: "pair-http-private", caption: "Only plain http answers on a private network: what that exposes, and Connect without encryption.", facts: PAIRING, pairRefusal: "pairing-http-private", pairUrls: ["http://192.168.1.20:8765"] },
    { id: "pair-http-private-split", caption: "The same in split: the button the form column's width.", facts: PAIRING, pairRefusal: "pairing-http-private", pairUrls: ["http://192.168.1.20:8765"], variants: { "pair-machine": "split" } },
    { id: "pair-http-only", caption: "Only plain http answers at a public address: refused.", facts: PAIRING, pairRefusal: "pairing-http-only", pairAddress: "203.0.113.5:8765" },
    { id: "pair-http-blocked", caption: "Only plain http answers, and this page is https: pair from the desktop app.", facts: PAIRING, pairRefusal: "pairing-http-blocked", pairUrls: ["http://192.168.1.20:8765"] },
  ] },
  { id: "room", title: "The room", note: "The call with a conversation on the stage, and around it.", shots: [
    { id: "no-machine", caption: "No machine yet: connect one.", facts: { pairings: [], pairingInUse: null, node: null, nodeReach: "" } },
    { id: "no-conversation", caption: "In the room, no conversation on the stage: choose one.", facts: { roomBinding: null, people: [] } },
    { id: "conversations", caption: "A conversation on the stage; the others beside it (a phone: from the header).", facts: {} },
    { id: "speaking", caption: "The agent speaking: its words as they are said.", facts: { botLive: true, karaokeState: { segment: "h-2", from: 0, to: 58 }, history: [
      ...(BASE_FACTS.history as unknown[]).slice(0, 1), { ...(BASE_FACTS.history as Record<string, unknown>[])[1], audio: "playing" }] } },
    { id: "working", caption: "The agent working.", facts: { harness: { "t-web": true } } },
    { id: "listening", caption: "You speaking: your turn, as it is heard.", facts: { userLive: true, userTurn: { id: "u", segment: "u", thread: "t-web" }, pendingPhase: "listening" } },
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
    { id: "s-machine-local", caption: "Machines: this computer, running — its service, agents, devices.", desktop: localBridge(running),
      facts: { pairings: [THIS, NUC], pairingInUse: THIS.fp, node: THIS.fp, localHostStatus: running, localHostAvailable: true }, after: openSettings("machines") },
    { id: "s-machine-stopped", caption: "Machines: this computer, stopped — Start brings it back.", desktop: localBridge({ ...running, state: "stopped-by-person", reachable: false, installed: false, service: "none" }),
      facts: { pairings: [THIS, NUC], pairingInUse: NUC.fp, localHostStatus: { ...running, state: "stopped-by-person", reachable: false, installed: false, service: "none" }, localHostAvailable: true }, after: openSettings("machines") },
    { id: "s-machine-remote", caption: "Machines: a remote machine, connected.", facts: { pairings: [NUC, WORKSTATION, LAPTOP], remoteHostStatus: { "fp-nuc": { state: "connected", checkedAt: 1 } } }, after: openSettings("machines") },
    { id: "s-machine-offline", caption: "Machines: a remote machine that does not answer.", facts: { pairings: [LAPTOP, NUC], pairingInUse: LAPTOP.fp, node: LAPTOP.fp, nodeReach: "away" }, after: openSettings("machines") },
    { id: "s-machine-insecure", caption: "Machines: a machine reached without encryption, as agreed when pairing.", facts: { pairings: [{ ...NUC, insecure: true, urls: ["http://192.168.1.20:8765"] }, LAPTOP], remoteHostStatus: { "fp-nuc": { state: "connected", checkedAt: 1 } } }, after: openSettings("machines") },
    { id: "s-machine-revoked", caption: "Machines: a machine that no longer knows this device.", facts: { pairings: [{ ...NUC, revoked: true }], pairingInUse: NUC.fp, nodeReach: "revoked" }, after: openSettings("machines") },
    { id: "s-advanced", caption: "Advanced: memory when idle, the downloaded models, reset, the build.", facts: { modelsRemovable: true }, after: openSettings("advanced") },
  ] },
  { id: "updates", title: "Updates and what's new", note: "What wants updating, behind one quiet entry; what a release added, shown once, never the setup again.", shots: [
    { id: "u-web", caption: "A new version of the page while in a call: Reload waits for the call to end.", facts: { webUpdate: "b2" } },
    { id: "u-several", caption: "Several at once: the desktop app, the page, this computer's machine; one entry with their count.", facts: { webUpdate: "b2", pairings: [THIS, NUC], localHostStatus: running, localHostAvailable: true },
      updater: { available: true, version: "0.5.0" }, desktop: { ...localBridge(running), version: { bridge: 1, bundled: { version: "0.5.0" }, installed: { version: "0.4.0" }, core_api: 1, update: "available" } } },
    { id: "u-phone-panel", caption: "On a phone, variant B: in the dropped panel, a dot on the chevron.", facts: { webUpdate: "b2" }, variants: { "updates-entry": "panel" }, views: ["phone"] },
    { id: "whats-new", caption: "What's new for someone set up on an earlier release: only what needs them, with Set up.", record: { baseline_release: 0 },
      // Out of a call: what's new never shows during one.
      facts: { ws: null, voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "silence" } } },
    { id: "whats-new-panel", caption: "What's new, variant B: a section of the updates' list.", record: { baseline_release: 0 }, variants: { "whats-new": "panel" } },
  ] },
];
