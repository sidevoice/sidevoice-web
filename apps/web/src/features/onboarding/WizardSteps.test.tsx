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

/* The setup's basics in their order, This computer's path with no way to another machine but Back, and the first try started and stopped from the
 * footer alone. */

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

test("the first try is started and stopped from the footer alone, never a second Stop in the step", async () => {
  transcriptionStep();
  // Not tried: the step's try is the footer's, not offered in the block.
  expect(document.getElementById("wizard-try-again")).toBeNull();
  await act(async () => { fireEvent.click(document.getElementById("wizard-try")!); });
  expect(actions.tryVoiceSettings).toHaveBeenCalledWith("stt", expect.objectContaining({ keep: true }));
  expect(stops()).toHaveLength(1);
  expect(stops()[0]).toHaveAttribute("id", "wizard-try");
  expect(document.getElementById("wizard-try-again")).toBeNull();
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

test("an install that fails says what failed and opens I'll do it myself by itself, Retry still there; a retry hides both ways while it runs, a cancel brings them back", async () => {
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
  const toggle = () => setup.queryByRole("button", { name: "I’ll do it myself" });
  const command = () => [...document.querySelectorAll("#wizard .ui-snippet code")].map((code) => code.textContent);
  try {
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    await act(async () => { fireEvent.click(document.getElementById("wizard-prepare")!); });
    await act(async () => { settle.reject({ key: "install.network", step: "download" }); await Promise.resolve(); });
    // What failed, in its words and at which step, as the install's panel says it; the command open under it, unasked.
    const panel = document.querySelector("#wizard .local-install-panel")!;
    expect(panel).toHaveAttribute("data-phase", "failed");
    expect(within(panel as HTMLElement).getByRole("alert")).toHaveTextContent("Downloading Sidevoice");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(command()).toEqual(["npx sidevoice@latest install"]);
    expect(document.querySelector("#wizard .prepare-here-wait")).toHaveTextContent("Waiting for Sidevoice on this computer…");
    // The panel's Retry is the app's way again (no second Prepare beside it); it closes like any other.
    expect(document.getElementById("wizard-prepare")).toBeNull();
    expect(setup.getByRole("button", { name: "Retry setup" })).toBeInTheDocument();
    await act(async () => { fireEvent.click(toggle()!); });
    expect(command()).toEqual([]);
    await act(async () => { fireEvent.click(toggle()!); });
    await act(async () => { fireEvent.click(setup.getByRole("button", { name: "Retry setup" })); });
    expect(install).toHaveBeenCalledTimes(2);
    expect(toggle()).toBeNull();
    expect(command()).toEqual([]);
    // Cancelled: the app's Retry again, and the person's way as they left it (open).
    await act(async () => { settle.reject({ key: "install.cancelled", step: "download" }); await Promise.resolve(); });
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  } finally { act(() => localHostInstallController.clear()); }
}, WHOLE_APP_MS);

test("installed here but not running, preparing this computer offers what starts it: never the install, nor its command", async () => {
  const install = vi.fn(), start = vi.fn(async () => undefined), restart = vi.fn(async () => undefined), serviceInstall = vi.fn(async () => undefined);
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "stopped-by-person" })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install, start, restart, serviceInstall,
  } } } });
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "agents" }));
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "stopped-by-person", service: "launchd", reachable: false },
    voiceSettings: defaultVoiceSettings(), voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" } }));
  render(<App store={store} />);
  const setup = within(document.getElementById("wizard")!);
  expect(setup.getByRole("heading", { level: 2 })).toHaveTextContent("Prepare this computer");
  const action = () => document.getElementById("wizard-prepare-recover")!;
  const nothingElse = () => {
    expect(document.getElementById("wizard-prepare")).toBeNull();
    expect(document.querySelector("#wizard .ui-snippet")).toBeNull();
    expect(setup.queryByRole("button", { name: "I’ll do it myself" })).toBeNull();
  };
  // Stopped: Start.
  expect(setup.getByText("Stopped until the next sign-in")).toBeInTheDocument();
  expect(action()).toHaveTextContent("Start");
  nothingElse();
  await act(async () => { fireEvent.click(action()); });
  expect(start).toHaveBeenCalledOnce();
  // Failed: Retry is a restart (contract gap #12), said as an alert.
  act(() => store.patch({ localHostStatus: { state: "failed", service: "launchd", reachable: false, failure: { key: "start.failed" } } }));
  expect(setup.getByRole("alert")).toHaveTextContent(/^Could not start: /);
  expect(action()).toHaveTextContent("Retry");
  nothingElse();
  await act(async () => { fireEvent.click(action()); });
  expect(restart).toHaveBeenCalledOnce();
  // Its service not set up: Start sets it up, which starts it.
  act(() => store.patch({ localHostStatus: { state: "not-installed", service: "none", installed: false, reachable: false } }));
  expect(action()).toHaveTextContent("Start");
  await act(async () => { fireEvent.click(action()); });
  expect(serviceInstall).toHaveBeenCalledOnce();
  expect(install).not.toHaveBeenCalled();
}, WHOLE_APP_MS);
