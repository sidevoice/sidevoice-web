import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "../../app/App";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { ONBOARDING_STORAGE_KEY } from "../../services/onboarding-state";
import type { SidevoiceActions } from "../../state/room-types";
import type { CatalogView } from "../../services/model-catalogs.js";
import { RELEASE } from "../whats-new/catalogue";
import { callArea } from "./onboarding-flow";

vi.mock("../../services/room-session-controller.js", () => ({}));

/* The first-run setup as the app has it: mandatory but skippable (onboarding-flow.ts). The wizard's steps themselves are
 * Onboarding.test.tsx's. */

const WHOLE_APP_MS = 15_000;

const models = (installed: boolean) => [{ id: "local", name: null, status: { stale: false }, models: [
  { id: "whisper-base", family: "whisper", capabilities: ["stt"], languages: ["es", "en"], voices: [], parametersM: 1, license: "MIT", installed, builds: [{ id: "whisper-base/int8", available: true, reasons: [] }] },
  { id: "kokoro-82m-v1.0", family: "kokoro", capabilities: ["tts"], languages: ["es"], voices: [{ id: "ef_dora", languages: ["es"] }], speed: { min: 0.5, max: 2 }, parametersM: 1, license: "MIT", installed, builds: [{ id: "kokoro/int8", available: true, reasons: [] }] },
] }] as unknown as CatalogView[];
const NUC = { fp: "fp-nuc", device_id: "d-1", urls: ["https://nuc.example"], host: "NUC", paired_at: 1_700_000_000, revoked: false };

let actions: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true }));
  actions = {
    openPairing: vi.fn(), loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined), editVoice: vi.fn(), cancelVoiceTry: vi.fn(),
    loadHostAgents: vi.fn().mockResolvedValue(undefined), installVoiceModel: vi.fn().mockResolvedValue(undefined), cancelVoiceInstall: vi.fn(),
  };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
});
afterEach(() => { delete window.sidevoiceActions; vi.restoreAllMocks(); localStorage.removeItem(ONBOARDING_STORAGE_KEY); });

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
const finished = { basics_done: true, choice: "remote", completed_at: 1, baseline_release: RELEASE };
/** Escape on the setup: the key, then the dialog's cancel. Whether either went through. */
function escape() {
  const key = fireEvent.keyDown(dialog(), { key: "Escape" });
  const cancel = fireEvent(dialog(), new Event("cancel", { cancelable: true }));
  return key || cancel;
}

test("the call area: what waits, whether the room is behind the setup, whether the conversations show", () => {
  const facts = { ready: true, done: false, noMachine: false, voice: "missing" as const };
  // Behind the setup until it is done, whatever is missing.
  expect(callArea(facts)).toEqual({ roomHidden: true, waiting: "voice", blocked: false });
  expect(callArea({ ...facts, ready: false }).roomHidden).toBe(true);
  expect(callArea({ ...facts, done: true })).toEqual({ roomHidden: false, waiting: "voice", blocked: false });
  expect(callArea({ ...facts, done: true, noMachine: true })).toEqual({ roomHidden: false, waiting: "machine", blocked: true });
  expect(callArea({ ...facts, voice: "unknown" }).waiting).toBe("unknown");
  expect(callArea({ ...facts, voice: "unknown", done: true }).waiting).toBeNull();
  expect(callArea({ ...facts, done: true, voice: "ready" }).waiting).toBeNull();
});

test("Escape does nothing, the room waits behind the setup, and the app opened again resumes at the step it stood at", async () => {
  const store = room();
  expect(title()).toHaveTextContent("Connect to your machine");
  expect(wizard().queryByRole("button", { name: "Do this later" })).toBeNull();
  expect(escape()).toBe(false);
  expect(wizardOpen()).toBe(true);
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

test("a finished setup with models not ready shows the voice card until they are", async () => {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(finished));
  const store = room({ installed: false });
  expect(wizardOpen()).toBe(false);
  expect(waiting()).toBe("machine");
  expect(newConversation()).toBeNull();
  paired(store);
  expect(waiting()).toBe("voice");
  expect(screen.getByRole("heading", { name: "Your voice isn’t ready yet" })).toBeInTheDocument();
  const card = within(document.querySelector(".voice-setup-card") as HTMLElement);
  expect(card.getAllByRole("button", { name: "Download" })).toHaveLength(2);
  expect(card.getAllByText("Not downloaded yet")).toHaveLength(2);
  expect(card.getByRole("status")).toHaveTextContent("Speech to text: Not downloaded yet. Text to speech: Not downloaded yet");
  expect(card.queryByRole("button", { name: "Continue setup" })).toBeNull();
  // A machine answers: the conversations and New are there, whatever the voice.
  expect(newConversation()).toBeInTheDocument();
  expect(stage()).toHaveAttribute("hidden");
  act(() => store.patch({ voiceCatalogue: { state: "ready", catalogs: models(true), error: "" } }));
  expect(waiting()).toBeNull();
  expect(stage()).not.toHaveAttribute("hidden");
});

test("while the catalogue is not read the call area shows nothing — no card flashing in, no stage", () => {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ ...finished, completed_at: null }));
  const store = room({ catalogue: "loading", pairedFirst: true });
  expect(waiting()).toBe("unknown");
  expect(document.querySelector(".voice-setup-card")).toBeNull();
  expect(stage()).toHaveAttribute("hidden");
  act(() => store.patch({ voiceCatalogue: { state: "ready", catalogs: models(true), error: "" } }));
  expect(waiting()).toBeNull();
});

test("each step passed without is kept, a reload goes on from there, and Ready says calmly what is not there yet", async () => {
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
  await act(async () => { fireEvent.click(within(document.getElementById("wizard-skip-machine")!).getByRole("button", { name: "Got it" })); });
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
  const [, mic, machine, stt, tts] = rows;
  expect(mic).toHaveTextContent("Nothing to allow here");
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

test("with nothing passed without, Ready keeps its celebration and every row its check", async () => {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "remote", turn_done: true,
    chosen: { stt: JSON.stringify({ catalog: "local", language: null, model: "whisper-base" }) } }));
  room({ pairedFirst: true });
  // Wherever it resumed, Ready is reached through the voice's Continue.
  if (title().textContent?.includes("Set up voice")) await act(async () => { fireEvent.click(document.getElementById("wizard-stage-action")!); });
  if (title().textContent?.includes("When your turn ends")) await act(async () => { fireEvent.click(document.getElementById("wizard-stage-action")!); });
  expect(wizard().getByRole("heading", { level: 2 })).toHaveTextContent("You’re all set — talk to your agents");
  for (const row of [...document.querySelectorAll(".wizard-recap-row")].slice(0, 3)) expect(row.querySelector(".wizard-recap-check")).toBeInTheDocument();
}, WHOLE_APP_MS);
