import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "../../app/App";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { ONBOARDING_STORAGE_KEY } from "../../services/onboarding-state";
import type { SidevoiceActions } from "../../state/room-types";
import type { CatalogView } from "../../services/model-catalogs.js";
import { RELEASE } from "../whats-new/catalogue";
import { callArea, FLOW_RULES } from "./onboarding-flow";

vi.mock("../../services/room-session-controller.js", () => ({}));

/* The onboardingFlow variant, value by value (onboarding-flow.ts): a mandatory, b readiness-driven (the default), c
 * today's, d mandatory but skippable. The wizard's steps themselves are Onboarding.test.tsx's. */

const WHOLE_APP_MS = 15_000;

const models = (installed: boolean) => [{ id: "local", name: null, status: { stale: false }, models: [
  { id: "whisper-base", family: "whisper", capabilities: ["stt"], languages: ["es", "en"], voices: [], parametersM: 1, license: "MIT", installed, builds: [{ id: "whisper-base/int8", available: true, reasons: [] }] },
  { id: "kokoro-82m-v1.0", family: "kokoro", capabilities: ["tts"], languages: ["es"], voices: [{ id: "ef_dora", languages: ["es"] }], speed: { min: 0.5, max: 2 }, parametersM: 1, license: "MIT", installed, builds: [{ id: "kokoro/int8", available: true, reasons: [] }] },
] }] as unknown as CatalogView[];
const NUC = { fp: "fp-nuc", device_id: "d-1", urls: ["https://nuc.example"], rv: null, host: "NUC", paired_at: 1_700_000_000, revoked: false };

let actions: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true }));
  actions = {
    openPairing: vi.fn(), loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined), editVoice: vi.fn(), cancelVoiceTry: vi.fn(),
    loadHostAgents: vi.fn().mockResolvedValue(undefined), installVoiceModel: vi.fn().mockResolvedValue(undefined), cancelVoiceInstall: vi.fn(),
  };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
});
afterEach(() => { delete window.sidevoiceActions; vi.restoreAllMocks(); localStorage.removeItem("sidevoice.variants"); localStorage.removeItem(ONBOARDING_STORAGE_KEY); });

const flow = (value: string) => localStorage.setItem("sidevoice.variants", JSON.stringify({ onboardingFlow: value }));
function room({ installed = true, catalogue = "ready", pairedFirst = false }: { installed?: boolean; catalogue?: "ready" | "loading"; pairedFirst?: boolean } = {}) {
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, speechLanguage: "es", voiceSettings: defaultVoiceSettings(),
    voiceCatalogue: { state: catalogue, catalogs: catalogue === "ready" ? models(installed) : [], error: "" } }));
  if (pairedFirst) paired(store);
  render(<App store={store} />);
  return store;
}
const paired = (store: ReturnType<typeof createRoomStore>) => act(() => store.patch({ pairings: [NUC], machineLinks: { [NUC.fp]: { reach: "ok", via: "node" } } }));
const record = () => JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!);
/** Lets the setup's writes (one at a time, each a promise) land. */
const settle = () => act(async () => {});
const dialog = () => document.getElementById("wizard") as HTMLDialogElement;
const wizardOpen = () => dialog()?.hasAttribute("open") ?? false;
const wizard = () => within(dialog());
const title = () => wizard().getByRole("heading", { level: 2 });
const waiting = () => document.querySelector(".call-column--waiting")?.getAttribute("data-waiting") ?? null;
const stage = () => document.querySelector(".call-column:not(.call-column--waiting)") as HTMLElement;
const newConversation = () => document.querySelector(".sidebar-new");
/** Escape on the setup: the key, then the dialog's cancel. Whether either went through. */
function escape() {
  const key = fireEvent.keyDown(dialog(), { key: "Escape" });
  const cancel = fireEvent(dialog(), new Event("cancel", { cancelable: true }));
  return key || cancel;
}

test("the call area, flow by flow: what waits, whether the room is behind the setup, whether the conversations show", () => {
  const facts = { ready: true, open: false, done: false, noMachine: false, voice: "missing" as const };
  expect(callArea(FLOW_RULES.b, facts)).toEqual({ roomHidden: false, waiting: "voice", blocked: false });
  expect(callArea(FLOW_RULES.b, { ...facts, noMachine: true })).toEqual({ roomHidden: false, waiting: "machine", blocked: true });
  expect(callArea(FLOW_RULES.b, { ...facts, voice: "unknown" }).waiting).toBe("unknown");
  expect(callArea(FLOW_RULES.b, { ...facts, voice: "unknown", done: true }).waiting).toBeNull();
  expect(callArea(FLOW_RULES.b, { ...facts, voice: "ready" }).waiting).toBeNull();
  expect(callArea(FLOW_RULES.b, { ...facts, open: true }).roomHidden).toBe(true);
  expect(callArea(FLOW_RULES.a, facts)).toEqual({ roomHidden: true, waiting: null, blocked: false });
  expect(callArea(FLOW_RULES.c, facts)).toEqual({ roomHidden: false, waiting: "pending", blocked: true });
  expect(callArea(FLOW_RULES.c, { ...facts, done: true, noMachine: true }).waiting).toBe("machine");
  expect(callArea(FLOW_RULES.d, facts).roomHidden).toBe(true);
  expect(callArea(FLOW_RULES.d, { ...facts, done: true })).toEqual({ roomHidden: false, waiting: "voice", blocked: false });
});

test("a: no Later, Escape does nothing, and the app opened again resumes at the step it stood at", async () => {
  flow("a");
  const store = room();
  expect(title()).toHaveTextContent("Connect to your machine");
  expect(wizard().queryByRole("button", { name: "Do this later" })).toBeNull();
  expect(escape()).toBe(false);
  expect(wizardOpen()).toBe(true);
  expect(record().deferred_at ?? null).toBeNull();
  expect(document.querySelector(".room-shell")).toHaveAttribute("hidden");
  paired(store);
  expect(title()).toHaveTextContent("Set up transcription");
  await act(async () => { fireEvent.click(document.getElementById("wizard-stage-action")!); });
  expect(title()).toHaveTextContent("Set up voice");
  cleanup();
  room({ pairedFirst: true });
  expect(title()).toHaveTextContent("Set up voice");
  expect(document.querySelector(".room-shell")).toHaveAttribute("hidden");
}, WHOLE_APP_MS);

test("b: Later closes the setup for good, as set up on this release; no machine says so, with Continue setup", async () => {
  room();
  expect(title()).toHaveTextContent("Connect to your machine");
  await act(async () => { fireEvent.click(wizard().getByRole("button", { name: "Do this later" })); });
  expect(wizardOpen()).toBe(false);
  expect(record().deferred_at).toBeGreaterThan(0);
  expect(record().baseline_release).toBe(RELEASE);
  expect(record().completed_at ?? null).toBeNull();
  expect(document.querySelector(".room-shell")).not.toHaveAttribute("hidden");
  // No setup-pending card: no machine, then the voice, then the stage. Without a machine, no conversations or New.
  expect(waiting()).toBe("machine");
  expect(screen.queryByText("Setup is not finished")).toBeNull();
  expect(newConversation()).toBeNull();
  cleanup();
  room();
  expect(wizardOpen()).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Continue setup" }));
  expect(wizardOpen()).toBe(true);
  expect(title()).toHaveTextContent("Connect to your machine");
}, WHOLE_APP_MS);

test("b: a machine with models not ready shows the voice card; set up in Settings, the setup is done by itself", async () => {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, deferred_at: 5 }));
  const store = room({ installed: false });
  expect(waiting()).toBe("machine");
  paired(store);
  expect(waiting()).toBe("voice");
  expect(screen.getByRole("heading", { name: "Your voice isn’t ready yet" })).toBeInTheDocument();
  const card = within(document.querySelector(".voice-setup-card") as HTMLElement);
  expect(card.getAllByRole("button", { name: "Download" })).toHaveLength(2);
  expect(card.getAllByText("Not downloaded yet")).toHaveLength(2);
  expect(card.getByRole("status")).toHaveTextContent("Speech to text: Not downloaded yet. Text to speech: Not downloaded yet");
  expect(card.getByRole("button", { name: "Continue setup" })).toBeInTheDocument();
  // A machine answers: the conversations and New are there, whatever the voice.
  expect(newConversation()).toBeInTheDocument();
  expect(stage()).toHaveAttribute("hidden");
  expect(record().completed_at ?? null).toBeNull();
  // Downloaded from Settings: the stage, and the setup done — written once, with the release it was set up on.
  act(() => store.patch({ voiceCatalogue: { state: "ready", catalogs: models(true), error: "" } }));
  await settle();
  expect(waiting()).toBeNull();
  expect(stage()).not.toHaveAttribute("hidden");
  expect(record().completed_at).toBeGreaterThan(0);
  expect(record().baseline_release).toBe(RELEASE);
  expect(wizardOpen()).toBe(false);
});

test("b: while the catalogue is not read the call area shows nothing — no card flashing in, no stage", () => {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, deferred_at: 5 }));
  const store = room({ catalogue: "loading", pairedFirst: true });
  expect(waiting()).toBe("unknown");
  expect(document.querySelector(".voice-setup-card")).toBeNull();
  expect(stage()).toHaveAttribute("hidden");
  act(() => store.patch({ voiceCatalogue: { state: "ready", catalogs: models(true), error: "" } }));
  expect(waiting()).toBeNull();
});

test("b: an open setup is never closed under the person once it is done, and resumes past what is ready", async () => {
  const store = room();
  expect(title()).toHaveTextContent("Connect to your machine");
  paired(store);
  await settle();
  expect(record().completed_at).toBeGreaterThan(0);
  expect(wizardOpen()).toBe(true);
  // The models are on this device already: transcription and voice count as done.
  expect(title()).toHaveTextContent("When your turn ends");
});

test("c: Later leaves the setup-pending card in the call area, without conversations, until the setup is finished", async () => {
  flow("c");
  room({ pairedFirst: true });
  await act(async () => { fireEvent.click(wizard().getByRole("button", { name: "Do this later" })); });
  expect(wizardOpen()).toBe(false);
  expect(waiting()).toBe("pending");
  expect(screen.getByText("Setup is not finished")).toBeInTheDocument();
  expect(newConversation()).toBeNull();
  expect(record().baseline_release).toBe(0);
}, WHOLE_APP_MS);

test("d: each step passed without is kept, a reload goes on from there, and Ready says calmly what is not there yet", async () => {
  flow("d");
  room({ installed: false });
  expect(title()).toHaveTextContent("Connect to your machine");
  expect(wizard().queryByRole("button", { name: "Do this later" })).toBeNull();
  expect(escape()).toBe(false);
  expect(wizardOpen()).toBe(true);
  // Skip for now says first what it means; Go back stays.
  await act(async () => { fireEvent.click(wizard().getByRole("button", { name: "Skip for now" })); });
  const ask = within(document.getElementById("wizard-skip-machine")!);
  expect(ask.getByText("You’ll need a machine to call your agents. You can connect one from the call area.")).toBeInTheDocument();
  await act(async () => { fireEvent.click(ask.getByRole("button", { name: "Go back" })); });
  expect(document.getElementById("wizard-skip-machine")).toBeNull();
  expect(record().machine_skipped ?? false).toBe(false);
  await act(async () => { fireEvent.click(wizard().getByRole("button", { name: "Skip for now" })); });
  await act(async () => { fireEvent.click(within(document.getElementById("wizard-skip-machine")!).getByRole("button", { name: "Continue without a machine" })); });
  expect(record().machine_skipped).toBe(true);
  expect(title()).toHaveTextContent("Set up transcription");
  // Opened again: on from where it stood, not back at the machine.
  cleanup();
  room({ installed: false });
  expect(title()).toHaveTextContent("Set up transcription");
  await act(async () => { fireEvent.click(wizard().getByRole("button", { name: "Continue without transcription" })); });
  expect(record().stt_skipped).toBe(true);
  expect(title()).toHaveTextContent("Set up voice");
  await act(async () => { fireEvent.click(wizard().getByRole("button", { name: "Continue without a voice" })); });
  expect(record().tts_skipped).toBe(true);
  expect(title()).toHaveTextContent("When your turn ends");
  await act(async () => { fireEvent.click(document.getElementById("wizard-stage-action") ?? wizard().getByRole("button", { name: "Continue" })); });
  // Ready: completed on arrival, a calmer title, each missing row a neutral dash with what will offer it — never a check.
  expect(wizard().getByRole("heading", { level: 2 })).toHaveTextContent("Introduction complete");
  expect(record().completed_at).toBeGreaterThan(0);
  expect(record().baseline_release).toBe(RELEASE);
  const rows = [...document.querySelectorAll(".wizard-recap-row")] as HTMLElement[];
  const [mic, machine, stt, tts] = rows;
  expect(mic).toHaveTextContent("Allowed");
  expect(machine).toHaveTextContent("Not connected yet");
  expect(stt).toHaveTextContent("Not downloaded yet");
  expect(tts).toHaveTextContent("Not downloaded yet");
  for (const row of [machine, stt, tts]) {
    expect(row).toHaveAttribute("data-state", "missing");
    expect(row).toHaveTextContent("The call area will offer it");
    expect(row.querySelector(".wizard-recap-check")).toBeNull();
    expect(row.querySelector(".wizard-recap-dash")).toBeInTheDocument();
  }
  expect(Array.from(document.querySelectorAll("#wizard .wizard-recap button"))).toHaveLength(0);
  await act(async () => { fireEvent.click(wizard().getByRole("button", { name: /Enter Sidevoice/ })); });
  expect(wizardOpen()).toBe(false);
  expect(document.querySelector(".room-shell")).not.toHaveAttribute("hidden");
  expect(waiting()).toBe("machine");
  // Never again by itself.
  cleanup();
  room({ installed: false });
  expect(wizardOpen()).toBe(false);
}, WHOLE_APP_MS);

test("d: with nothing passed without, Ready keeps its celebration and every row its check", async () => {
  flow("d");
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "remote", turn_done: true,
    chosen: { stt: JSON.stringify({ catalog: "local", language: null, model: "whisper-base" }) } }));
  room({ pairedFirst: true });
  // Wherever it resumed, Ready is reached through the voice's Continue.
  if (title().textContent?.includes("Set up voice")) await act(async () => { fireEvent.click(document.getElementById("wizard-stage-action")!); });
  if (title().textContent?.includes("When your turn ends")) await act(async () => { fireEvent.click(document.getElementById("wizard-stage-action")!); });
  expect(wizard().getByRole("heading", { level: 2 })).toHaveTextContent("You’re all set — talk to your agents");
  for (const row of [...document.querySelectorAll(".wizard-recap-row")].slice(0, 3)) expect(row.querySelector(".wizard-recap-check")).toBeInTheDocument();
}, WHOLE_APP_MS);
