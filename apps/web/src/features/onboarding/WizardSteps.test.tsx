import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, within } from "@testing-library/react";
import { App } from "../../app/App";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { ONBOARDING_STORAGE_KEY } from "../../services/onboarding-state";
import { localHostInstallController } from "../../services/local-host-install";
import type { SidevoiceActions } from "../../state/room-types";
import type { CatalogView } from "../../services/model-catalogs.js";

vi.mock("../../services/room-session-controller.js", () => ({}));

/** The whole App rendered: past vitest's five seconds on a busy machine (see Onboarding.test.tsx). */
const WHOLE_APP_MS = 15_000;

/* The setup's basics in their order, This computer's path with no way to another machine but Back, and a try stopped from one place only: the footer's when it offers the first try
 * (model-step-footer try-first), the block's when the try is the block's own (in-card). */

const CATALOGS = [{ id: "local", name: null, status: { stale: false }, models: [
  { id: "whisper-base", family: "whisper", capabilities: ["stt"], languages: ["es", "en"], voices: [], parametersM: 1, license: "MIT", installed: true, builds: [{ id: "whisper-base/int8", available: true, reasons: [] }] },
  { id: "kokoro-82m-v1.0", family: "kokoro", capabilities: ["tts"], languages: ["es"], voices: [{ id: "ef_dora", languages: ["es"] }], speed: { min: 0.5, max: 2 }, parametersM: 1, license: "MIT", installed: true, builds: [{ id: "kokoro/int8", available: true, reasons: [] }] },
] }] as unknown as CatalogView[];
const NUC = { fp: "fp-nuc", device_id: "d-1", urls: ["https://nuc.example"], rv: null, host: "NUC", paired_at: 1_700_000_000, revoked: false };

let actions: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true }));
  actions = {
    openPairing: vi.fn(), loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined), editVoice: vi.fn(),
    // A try that runs until the test is over.
    tryVoiceSettings: vi.fn(() => new Promise(() => {})), cancelVoiceTry: vi.fn(), loadHostAgents: vi.fn().mockResolvedValue(undefined),
    installVoiceModel: vi.fn().mockResolvedValue(undefined), cancelVoiceInstall: vi.fn(),
  };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
});
afterEach(() => { delete window.sidevoiceActions; delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop; vi.restoreAllMocks(); localStorage.removeItem("sidevoice.variants"); localStorage.removeItem(ONBOARDING_STORAGE_KEY); });

/** The setup at its transcription step, its machine answering. */
function transcriptionStep() {
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, speechLanguage: "es", voiceSettings: defaultVoiceSettings(), voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" } }));
  render(<App store={store} />);
  act(() => store.patch({ pairings: [NUC], machineLinks: { [NUC.fp]: { reach: "ok", via: "node" } } }));
  expect(within(document.getElementById("wizard")!).getByRole("heading", { level: 2 })).toHaveTextContent("Set up transcription");
}
// Settings is drawn under the setup with the same slots: the setup's are the ones in #wizard.
const stops = () => within(document.getElementById("wizard")!).queryAllByRole("button", { name: "Stop" });

test("the basics: appearance, this device's name, then the interface's language and the one spoken", () => {
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, voiceSettings: defaultVoiceSettings() }));
  render(<App store={store} />);
  expect([...document.querySelectorAll("#wizard .wizard-basics .ui-row-label")].map((label) => label.textContent))
    .toEqual(["Appearance", "This device’s name", "Interface language", "The language you speak"]);
});

test("try-first: the first try is started and stopped from the footer alone, never a second Stop in the step", async () => {
  transcriptionStep();
  // Not tried: the step's try is the footer's, not offered in the block.
  expect(document.getElementById("wizard-try-again")).toBeNull();
  await act(async () => { fireEvent.click(document.getElementById("wizard-try")!); });
  expect(actions.tryVoiceSettings).toHaveBeenCalledWith("stt", expect.objectContaining({ keep: true }));
  expect(stops()).toHaveLength(1);
  expect(stops()[0]).toHaveAttribute("id", "wizard-try");
  expect(document.getElementById("wizard-try-again")).toBeNull();
}, WHOLE_APP_MS);

test("in-card: the block's try is offered from the start, and it is the one Stop while it runs", async () => {
  localStorage.setItem("sidevoice.variants", JSON.stringify({ "model-step-footer": "in-card" }));
  transcriptionStep();
  expect(document.getElementById("wizard-try")).toBeNull();
  expect(document.getElementById("wizard-try-again")).toHaveTextContent("Try it: speak");
  await act(async () => { fireEvent.click(document.getElementById("wizard-try-again")!); });
  expect(stops()).toHaveLength(1);
  expect(stops()[0]).toHaveAttribute("id", "wizard-try-again");
}, WHOLE_APP_MS);

test("preparing this computer, the setup offers no other machine in any state of the install: Back is the way there", async () => {
  let settle!: { resolve(status: unknown): void; reject(error: unknown): void };
  const install = vi.fn(() => Object.assign(new Promise((resolve, reject) => { settle = { resolve, reject }; }), { job: "prep-job" }));
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "absent" })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install,
  } } } });
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "agents" }));
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" }, voiceSettings: defaultVoiceSettings(), voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" } }));
  render(<App store={store} />);
  const setup = within(document.getElementById("wizard")!);
  expect(setup.getByRole("heading", { level: 2 })).toHaveTextContent("Prepare this computer");
  const noOtherMachine = (phase: string) => {
    expect(localHostInstallController.getSnapshot().phase).toBe(phase);
    expect(setup.queryByRole("button", { name: "Connect to another machine" })).toBeNull();
    expect(setup.queryByRole("button", { name: /another machine/i })).toBeNull();
  };
  try {
    noOtherMachine("idle");
    await act(async () => { fireEvent.click(document.getElementById("wizard-prepare")!); });
    noOtherMachine("installing");
    await act(async () => { settle.reject({ key: "install.unknown", step: "download" }); await Promise.resolve(); });
    noOtherMachine("failed");
    await act(async () => { fireEvent.click(setup.getByRole("button", { name: "Retry setup" })); });
    await act(async () => { settle.reject({ key: "install.cancelled", step: "download" }); await Promise.resolve(); });
    noOtherMachine("cancelled");
    await act(async () => { fireEvent.click(setup.getByRole("button", { name: "Retry setup" })); });
    await act(async () => { settle.resolve({ state: "starting", installed: true, reachable: false }); await Promise.resolve(); });
    noOtherMachine("succeeded");
    expect(setup.getByText("Preparing this computer")).toBeInTheDocument();
  } finally { act(() => localHostInstallController.clear()); }
}, WHOLE_APP_MS);
