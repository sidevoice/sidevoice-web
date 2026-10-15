import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../../app/App";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { ONBOARDING_STORAGE_KEY, trialKey } from "../../services/onboarding-state";
import { localHostInstallController } from "../../services/local-host-install";
import type { SidevoiceActions, TrialProgress } from "../../state/room-types";
import type { CatalogView } from "../../services/model-catalogs.js";
import { chooseOption, selectedValue } from "../../test/select";

vi.mock("../../services/room-session-controller.js", () => ({}));

/** The whole App rendered and taken through several steps: about a second on its own, and several times that with the
 *  rest of the suite on a busy machine — past vitest's five seconds (2026-10-11, load 25 on 8 cores). Only the tests
 *  seen to run that close get it. */
const WHOLE_APP_MS = 15_000;

/* The first-run setup over the real room, in a browser: the basics, then (no agents here) pairing another machine, this
 * device's transcription and voice (trying them is suggested, not required; the actions stand in for the voice), when a
 * turn ends, and it enters only once its completion is stored. */

const CATALOGS = [{ id: "local", name: null, status: { stale: false }, models: [
  { id: "whisper-base", family: "whisper", capabilities: ["stt"], languages: ["es", "en"], voices: [], parametersM: 1, license: "MIT", installed: true, builds: [{ id: "whisper-base/int8", available: true, reasons: [] }] },
  { id: "moonshine-tiny", family: "moonshine", capabilities: ["stt"], languages: ["en"], voices: [], parametersM: 1, license: "MIT", installed: true, builds: [{ id: "moonshine/int8", available: true, reasons: [] }] },
  { id: "kokoro-82m-v1.0", family: "kokoro", capabilities: ["tts"], languages: ["es"], voices: [{ id: "ef_dora", languages: ["es"] }], speed: { min: 0.5, max: 2 }, parametersM: 1, license: "MIT", installed: true, builds: [{ id: "kokoro/int8", available: true, reasons: [] }] },
] }] as unknown as CatalogView[];
const NUC = { fp: "fp-nuc", device_id: "d-1", urls: ["https://nuc.example"], rv: null, host: "NUC", paired_at: 1_700_000_000, revoked: false };

let actions: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  // Past the basics, unless a test is about them.
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true }));
  actions = {
    openPairing: vi.fn(), loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined), editVoice: vi.fn(),
    tryVoiceSettings: vi.fn().mockResolvedValue({ text: "hola, ¿me oyes?", timings: { ready_ms: 900, recognition_ms: 420 } }), cancelVoiceTry: vi.fn(), loadHostAgents: vi.fn().mockResolvedValue(undefined),
    installVoiceModel: vi.fn().mockResolvedValue(undefined), cancelVoiceInstall: vi.fn(), cleanupSetupTrials: vi.fn().mockResolvedValue(undefined),
  };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
});
// A desktop app a test stood in for goes with it: the next test is in a browser unless it says otherwise.
afterEach(() => { delete window.sidevoiceActions; delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop; vi.restoreAllMocks(); localStorage.removeItem("sidevoice.variants"); });

function room() {
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, speechLanguage: "es", voiceSettings: defaultVoiceSettings(), voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" } }));
  render(<App store={store} />);
  return store;
}
// Asked of the setup alone: Settings is drawn under it, and a role query over the whole page costs a third of a second
// each under jsdom — enough, a few times over, to run a test past its time on a busy machine.
const wizard = () => within(document.getElementById("wizard")!);
const title = () => wizard().getByRole("heading", { level: 2 });
const stageAction = () => document.getElementById("wizard-stage-action") as HTMLButtonElement;
const tryButton = () => document.getElementById("wizard-try") as HTMLButtonElement;
// Settings is drawn under the setup with the same slots: the setup's are the ones in #wizard.
// The try, last in the slot, in its own block after the slot's settings (outside the model's card).
const tryBlock = (task: "stt" | "tts") => document.querySelector("#wizard #" + task + "-try-block")!;
/** Preparing this computer's "I'll do it myself", in the setup (`absent`: may be missing). */
function manualToggle(absent: true): HTMLElement | null;
function manualToggle(): HTMLElement;
function manualToggle(absent?: true) {
  return absent ? wizard().queryByRole("button", { name: "I’ll do it myself" }) : wizard().getByRole("button", { name: "I’ll do it myself" });
}
const paired = (store: ReturnType<typeof createRoomStore>) => act(() => store.patch({ pairings: [NUC], machineLinks: { [NUC.fp]: { reach: "ok", via: "node" } } }));

test("a browser starts by pairing another machine, shown how to prepare it, and moves on once it answers", () => {
  const store = room();
  expect(title()).toHaveTextContent("Connect to your machine");
  // How to get a code starts folded, as everywhere; unfolded, each command a Snippet: monospace, with its copy button.
  const how = screen.getByRole("button", { name: "How do I get a code?" });
  expect(how).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(how);
  expect([...document.querySelectorAll("#wizard .ui-snippet code")].map((code) => code.textContent)).toEqual(["npx sidevoice@latest install", "npx sidevoice@latest pair-device"]);
  expect(screen.getByRole("button", { name: "Copy setup command" })).toHaveClass("ui-copy-button");
  // The room, its settings and its call bar stay out of reach behind the setup.
  expect(document.querySelector(".room-shell")).toHaveAttribute("hidden");
  // The code is entered right here, not in another dialog on top.
  expect(document.getElementById("wizard-pairing-code")).toBeInTheDocument();
  expect(actions.openPairing).not.toHaveBeenCalled();
  // Connect is the step's own action, in its footer.
  expect(document.querySelector("#wizard .wizard-actions button[type=submit][form=wizard-pairing-form]")).toHaveTextContent("Connect");
  // Paired is not answering: the setup waits for the machine's link to say so.
  act(() => store.patch({ pairings: [NUC], machineLinks: { [NUC.fp]: { reach: "checking", via: "" } } }));
  expect(title()).toHaveTextContent("Connect to your machine");
  paired(store);
  expect(title()).toHaveTextContent("Set up transcription");
});

test("the basics come first: appearance, the interface's language and the one the person speaks, Automatic by default", async () => {
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  actions.interfaceLanguage = vi.fn(() => "");
  actions.setInterfaceLanguage = vi.fn();
  room();
  expect(title()).toHaveTextContent("The basics");
  expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  expect(selectedValue("wizard-ui-language")).toBe("");
  expect(document.getElementById("wizard-ui-language")).toHaveTextContent("Automatic");
  expect(selectedValue("wizard-speech-language")).toBe("");
  chooseOption("wizard-ui-language", "es");
  expect(actions.setInterfaceLanguage).toHaveBeenCalledWith("es");
  chooseOption("wizard-speech-language", "en");
  expect(actions.editVoice).toHaveBeenCalledWith({ stt: { language: "en" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continue" })); });
  expect(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!).basics_done).toBe(true);
  expect(title()).toHaveTextContent("Connect to your machine");
});

test("transcription and voice are this device's: trying them is recommended, and Continue does not wait for it", async () => {
  const store = room();
  paired(store);
  expect(title()).toHaveTextContent("Set up transcription");
  // Source first, then the model, as in Settings → Voice.
  expect(selectedValue("stt-source")).toBe("local");
  expect(tryButton()).toHaveTextContent("Try it");
  // The try has its own block, last and outside the model's card: its hint there, and its own button first, beside the
  // level, as well as the footer's.
  expect(document.querySelector("#wizard #stt-model-card")).not.toContainElement(tryBlock("stt") as HTMLElement);
  expect(tryBlock("stt").querySelector(".model-try-hint")).toHaveTextContent("Recommended: try it before you go on.");
  // One steady layout: the microphone's level on the first row from the start, the hint in the area under it.
  expect(tryBlock("stt").querySelector(".stt-try-head .voice-wave")).toBeInTheDocument();
  expect(tryBlock("stt").querySelector(".stt-try-area .model-try-hint")).toBeInTheDocument();
  expect(tryBlock("stt").querySelector(".stt-try-head #wizard-card-try")).toHaveTextContent(/^Try it: speak$/);
  await act(async () => { fireEvent.click(tryButton()); });
  expect(actions.tryVoiceSettings).toHaveBeenCalledWith("stt", expect.objectContaining({ keep: true }));
  expect(tryBlock("stt").querySelector("#stt-heard")).toHaveTextContent("hola, ¿me oyes?");
  // Tried: Continue is the main action now, and how quick it was is said in a line, in the block.
  expect(stageAction()).toHaveTextContent(/^Continue$/);
  expect(stageAction()).toHaveClass("ui-button--primary");
  expect(tryBlock("stt").querySelector("#stt-timing")).toHaveTextContent("Transcribed in 0.4 s");
  expect(tryBlock("stt").querySelector("#stt-timing")).not.toHaveTextContent("smaller model");
  // Trying it again is the block's: its button says so.
  expect(tryBlock("stt").querySelector("#wizard-card-try")).toHaveTextContent("Speak again");
  expect(tryBlock("stt").querySelector(".model-try-hint")).toBeNull();
  // Again beside the level, and what was heard with its time in the area where the hint was.
  expect(tryBlock("stt").querySelector(".stt-try-head #wizard-card-try")).toBeInTheDocument();
  expect(tryBlock("stt").querySelector(".stt-try-head .voice-wave")).toBeInTheDocument();
  expect(tryBlock("stt").querySelector(".stt-try-area #stt-heard")).toBeInTheDocument();
  expect(tryBlock("stt").querySelector(".stt-try-area #stt-timing")).toBeInTheDocument();
  await act(async () => { fireEvent.click(stageAction()); });

  expect(title()).toHaveTextContent("Set up voice");
  // Not tried: going on without it is offered all the same.
  expect(stageAction()).toHaveTextContent("Continue without trying");
  expect(stageAction()).not.toHaveAttribute("aria-disabled");
  await act(async () => { fireEvent.click(stageAction()); });

  expect(title()).toHaveTextContent("When your turn ends");
  expect(document.getElementById("voice-end-of-turn")).toBeInTheDocument();
  await act(async () => { fireEvent.click(stageAction()); });

  expect(title()).toHaveTextContent("You’re all set — talk to your agents");
  // What was set up, read from what the steps wrote, and what to tell an agent.
  expect(document.querySelector(".wizard-recap-list")).toHaveTextContent("Transcription");
  expect(document.querySelector(".wizard-ready .ui-quote blockquote")).toHaveTextContent("voice_connect");
  expect(wizard().getByRole("button", { name: "Copy the message for your agent" })).toHaveClass("ui-copy-button");
  actions.cleanupSetupTrials.mockReturnValueOnce(new Promise(() => {}));
  await act(async () => { fireEvent.click(wizard().getByRole("button", { name: "Enter Sidevoice" })); });
  const kept = JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!);
  expect(kept.completed_at).toBeGreaterThan(0);
  expect(actions.cleanupSetupTrials).toHaveBeenCalledOnce();
  expect(kept.trials.tts).toBeUndefined();
  expect(document.querySelector(".room-shell")).not.toHaveAttribute("hidden");
}, WHOLE_APP_MS);

test("a failed try says why and keeps the step; a completion that is not stored keeps Ready, with Retry", async () => {
  const store = room();
  paired(store);
  actions.tryVoiceSettings.mockRejectedValueOnce(Object.assign(new Error("Nothing was heard in time."), { code: "trial-silence" }));
  await act(async () => { fireEvent.click(tryButton()); });
  expect(wizard().getByRole("alert")).toHaveTextContent("Nothing was heard in time.");
  expect(tryBlock("stt")).toContainElement(wizard().getByRole("alert"));
  expect(title()).toHaveTextContent("Set up transcription");
  await act(async () => { fireEvent.click(stageAction()); });
  await act(async () => { fireEvent.click(stageAction()); });
  await act(async () => { fireEvent.click(stageAction()); });

  const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation((key) => { if (key === ONBOARDING_STORAGE_KEY) throw new DOMException("blocked", "SecurityError"); });
  await act(async () => { fireEvent.click(wizard().getByRole("button", { name: "Enter Sidevoice" })); });
  expect(title()).toHaveTextContent("You’re all set — talk to your agents");
  expect(wizard().getByRole("alert")).toHaveTextContent("Setup progress was not saved");
  expect(document.querySelector(".room-shell")).toHaveAttribute("hidden");
  setItem.mockRestore();
  await act(async () => { fireEvent.click(wizard().getByRole("button", { name: "Retry" })); });
  expect(document.querySelector(".room-shell")).not.toHaveAttribute("hidden");
}, WHOLE_APP_MS);

/** A try that runs until the test ends it, and what the page asked it to tell as it goes. */
function pendingTry() {
  const running: { told: TrialProgress; finish(result: unknown): void } = { told: {}, finish: () => {} };
  actions.tryVoiceSettings.mockImplementation((_task: string, options: TrialProgress) => {
    running.told = options;
    return new Promise((resolve) => { running.finish = resolve; });
  });
  return running;
}

test("the voice's try is all in its block — its sentence shown and editable before it, lit while it speaks, then how quick and Play again", async () => {
  const store = room();
  paired(store);
  await act(async () => { fireEvent.click(stageAction()); });
  expect(title()).toHaveTextContent("Set up voice");
  // Before the try: the sentence, editable, and the level's bars; the block's own button and the footer's start it.
  expect(tryBlock("tts").querySelector("button.tts-try-said")).toHaveTextContent("Hi! This is how Sidevoice will read your agent's replies.");
  expect(tryBlock("tts").querySelector(".stt-try-head .voice-wave canvas")).toBeInTheDocument();
  expect(tryBlock("tts").querySelector("#wizard-sample")).toBeNull();
  const running = pendingTry();
  await act(async () => { fireEvent.click(tryButton()); });
  expect(actions.tryVoiceSettings).toHaveBeenCalledWith("tts", expect.objectContaining({ text: "Hi! This is how Sidevoice will read your agent's replies.", keep: true }));
  expect(tryBlock("tts")).toHaveTextContent("Getting ready…");
  // Playing: the sentence lit as heard, not editable; the footer's is the one Stop.
  act(() => { running.told.onProgress!({ from: 0, to: 0 }); running.told.onProgress!({ from: 3, to: 3 }); });
  expect(tryBlock("tts").querySelector(".model-try-said")).toHaveTextContent(/^Hi!$/);
  expect(tryBlock("tts").querySelector("#tts-sentence, button.tts-try-said")).toBeNull();
  expect(tryBlock("tts").querySelector("#wizard-card-try")).toHaveAttribute("aria-busy", "true");
  expect(tryBlock("tts").querySelector("#wizard-card-try")).toHaveTextContent(/^Try it: listen$/);
  await act(async () => { running.finish({ timings: { ready_ms: 600, first_sound_ms: 320 } }); });
  expect(tryBlock("tts").querySelector(".tts-try-area #tts-timing")).toHaveTextContent(/^First sound in 0\.3 s$/);
  expect(tryBlock("tts").querySelector(".stt-try-head #wizard-card-try")).toHaveTextContent(/^Play again$/);
  expect(stageAction()).toHaveTextContent(/^Continue$/);
  // The sentence edited there (its pencil: the one played stays lit) is what Play again says next.
  fireEvent.click(within(tryBlock("tts") as HTMLElement).getByRole("button", { name: "Edit the sentence" }));
  fireEvent.change(tryBlock("tts").querySelector("#tts-sentence")!, { target: { value: "Hola, qué tal." } });
  const again = pendingTry();
  await act(async () => { fireEvent.click(tryBlock("tts").querySelector("#wizard-card-try")!); });
  expect(actions.tryVoiceSettings).toHaveBeenLastCalledWith("tts", expect.objectContaining({ text: "Hola, qué tal.", keep: true }));
  await act(async () => { again.finish({ timings: { ready_ms: 600, first_sound_ms: 320 } }); });
  // No sentence: the block's button waits for one, in the words the footer uses before a try.
  fireEvent.change(tryBlock("tts").querySelector("#tts-sentence")!, { target: { value: "  " } });
  expect(tryBlock("tts").querySelector("#wizard-card-try")).toHaveAttribute("aria-disabled", "true");
  expect(tryBlock("tts").querySelector("#wizard-card-try")).toHaveAccessibleDescription("Write a sentence to try the voice.");
});


test("put off, the setup leaves one action that resumes it where it stands", async () => {
  const store = room();
  paired(store);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Do this later" })); });
  expect(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!).deferred_at).toBeGreaterThan(0);
  expect(screen.getByRole("heading", { name: "Setup is not finished" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Continue setup" }));
  // Paired already: it does not ask for the machine again.
  expect(title()).toHaveTextContent("Set up transcription");
});

test("a model not on this device is downloaded first, in its block as in Settings; the try and Continue wait for it, saying why", async () => {
  const store = room();
  const absent = CATALOGS.map((catalog) => ({ ...catalog, models: catalog.models.map((model) => model.id === "whisper-base"
    ? { ...model, installed: false, recommendedBuild: "whisper-base/int8", builds: [{ id: "whisper-base/int8", available: true, reasons: [], installed: false, downloadBytes: 148e6 }] } : model) }));
  act(() => store.patch({ voiceCatalogue: { state: "ready", catalogs: absent as unknown as CatalogView[], error: "" } }));
  paired(store);
  expect(title()).toHaveTextContent("Set up transcription");
  expect(document.getElementById("stt-model-card")).toHaveTextContent(/Not downloaded\s*148 MB/);
  expect(tryButton()).toHaveAttribute("aria-disabled", "true");
  // Waiting for its model: only Try it, blocked, with why in the footer's row; no Continue without trying yet.
  expect(document.getElementById("wizard-stage-action")).toBeNull();
  expect(tryButton()).toHaveAccessibleDescription("The transcription model isn't ready yet.");
  expect(document.getElementById("wizard-stage-reason")).toHaveTextContent("The transcription model isn't ready yet.");
  expect(document.getElementById("stt-language")).toBeNull();
  fireEvent.click(document.querySelector("#wizard #stt-model-download")!);
  expect(actions.installVoiceModel).toHaveBeenCalledWith("stt", { setup: true });
  act(() => store.patch({ voiceInstall: { task: "stt", model: "whisper-base", state: "running", fraction: 0.5, error: "" } }));
  expect(document.getElementById("stt-model-card")).toHaveTextContent("Downloading… 50%");
  fireEvent.click(document.getElementById("stt-model-cancel")!);
  expect(actions.cancelVoiceInstall).toHaveBeenCalled();
  act(() => store.patch({ voiceInstall: null, voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" } }));
  expect(tryButton()).not.toBeDisabled();
  expect(stageAction()).not.toHaveAttribute("aria-disabled");
  expect(document.getElementById("stt-language")).toBeInTheDocument();
});

test("preparing this computer never offers Prepare again: the install, then waiting for it to answer, then its agents", async () => {
  let finish!: (status: unknown) => void;
  const install = vi.fn(() => Object.assign(new Promise((resolve) => { finish = resolve; }), { job: "prep-job" }));
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "absent" })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install,
  } } } });
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "agents" }));
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" }, voiceSettings: defaultVoiceSettings(), voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" } }));
  render(<App store={store} />);
  expect(title()).toHaveTextContent("Prepare this computer");
  expect(manualToggle()).toHaveAttribute("aria-expanded", "false");
  await act(async () => { fireEvent.click(document.getElementById("wizard-prepare")!); });
  // Installing: one install at a time, so neither way while it runs.
  expect(document.getElementById("wizard-prepare")).toBeNull();
  expect(manualToggle(true)).toBeNull();
  // Installed: the room lets the install's state go, nothing to choose, before this device reaches it.
  await act(async () => { finish({ state: "starting", installed: true, reachable: false }); await Promise.resolve(); });
  act(() => { localHostInstallController.clear(); store.patch({ localHostStatus: { state: "starting", installed: true, reachable: false } }); });
  expect(document.getElementById("wizard-prepare")).toBeNull();
  expect(screen.getByText("Starting the service…")).toBeInTheDocument();
  act(() => store.patch({ localHostStatus: { state: "running", installed: true, reachable: true } }));
  expect(screen.getByText("Checking that the service answers…")).toBeInTheDocument();
  expect(document.getElementById("wizard-prepare")).toBeNull();
  // Answering: its agents, in the same step.
  act(() => store.patch({ pairings: [{ fp: "fp-local", host: "This computer", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d", paired_at: 1, revoked: false }],
    machineLinks: { "fp-local": { reach: "ok", via: "node" } } }));
  expect(screen.getByText("This computer is ready. Connect Sidevoice to the agents you use here.")).toBeInTheDocument();
  act(() => localHostInstallController.clear());
});

test("where the app does not install Sidevoice itself, preparing this computer is the install command, then it waits for this computer and moves on", () => {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "absent" })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null),
  } } } });
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "agents" }));
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" }, voiceSettings: defaultVoiceSettings(), voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" } }));
  render(<App store={store} />);
  expect(title()).toHaveTextContent("Prepare this computer");
  // Never an empty step: no Prepare that could not work, but the command to run here, as another machine's, and that one
  // of the person's agents can run it.
  expect(document.getElementById("wizard-prepare")).toBeNull();
  // The only way, so nothing to open: shown as it is.
  expect(manualToggle(true)).toBeNull();
  expect([...document.querySelectorAll("#wizard .ui-snippet code")].map((code) => code.textContent)).toEqual(["npx sidevoice@latest install"]);
  expect(wizard().getByRole("button", { name: "Copy setup command" })).toHaveClass("ui-copy-button");
  expect(wizard().getByText("You can also ask one of your agents to run it for you.")).toBeInTheDocument();
  expect(document.getElementById("wizard")).not.toHaveTextContent("@sidevoice/uplink");
  expect(document.querySelector("#wizard .prepare-here-wait")).toHaveTextContent("Waiting for the Sidevoice service…");
  // Run: it starts, and the command goes.
  act(() => store.patch({ localHostStatus: { state: "starting", installed: true, reachable: false } }));
  expect(document.querySelector("#wizard .ui-snippet")).toBeNull();
  expect(document.querySelector("#wizard .wizard-prepare-wait")).toHaveTextContent("Starting the service…");
  // Answering: on to its agents by itself, in the same step.
  act(() => store.patch({ localHostStatus: { state: "running", installed: true, reachable: true },
    pairings: [{ fp: "fp-local", host: "This computer", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d", paired_at: 1, revoked: false }],
    machineLinks: { "fp-local": { reach: "ok", via: "node" } } }));
  expect(wizard().getByText("This computer is ready. Connect Sidevoice to the agents you use here.")).toBeInTheDocument();
});

test("where the app installs Sidevoice itself, the command is the other way, under I'll do it myself: closed until opened, then the command and the wait, and on by itself once it answers", async () => {
  const install = vi.fn();
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "absent" })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install,
  } } } });
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "agents" }));
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" }, voiceSettings: defaultVoiceSettings(), voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" } }));
  render(<App store={store} />);
  expect(title()).toHaveTextContent("Prepare this computer");
  // Two ways, one under the other: the app's (the step's main action), then the person's, closed, the description true to both.
  expect(wizard().getByText("To use the agents on this computer, Sidevoice needs a background service.")).toBeInTheDocument();
  const prepare = document.getElementById("wizard-prepare")!;
  expect(prepare).toHaveTextContent("Prepare this computer");
  expect(prepare).toHaveClass("ui-button--primary");
  expect(prepare.compareDocumentPosition(manualToggle()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(manualToggle()).toHaveAttribute("aria-expanded", "false");
  expect(document.querySelector("#wizard .ui-snippet")).toBeNull();
  // Opened: the command, that an agent can run it, and the wait — nothing to press: this computer is listened for.
  await act(async () => { fireEvent.click(manualToggle()); });
  expect(manualToggle()).toHaveAttribute("aria-expanded", "true");
  const manual = document.getElementById(manualToggle().getAttribute("aria-controls")!)!;
  expect([...manual.querySelectorAll(".ui-snippet code")].map((code) => code.textContent)).toEqual(["npx sidevoice@latest install"]);
  expect(manual).toHaveTextContent("You can also ask one of your agents to run it for you.");
  expect(manual.querySelector(".prepare-here-wait")).toHaveTextContent("Waiting for the Sidevoice service…");
  expect(wizard().queryByRole("button", { name: /^Check/ })).toBeNull();
  // Prepare is still there, and nothing was installed by opening it.
  expect(document.getElementById("wizard-prepare")).not.toBeNull();
  expect(install).not.toHaveBeenCalled();
  // Closed again.
  await act(async () => { fireEvent.click(manualToggle()); });
  expect(document.querySelector("#wizard .ui-snippet")).toBeNull();
  // Run by hand: it starts, then answers, and the step moves on to its agents by itself.
  await act(async () => { fireEvent.click(manualToggle()); });
  act(() => store.patch({ localHostStatus: { state: "starting", installed: true, reachable: false } }));
  expect(manualToggle(true)).toBeNull();
  expect(document.querySelector("#wizard .wizard-prepare-wait")).toHaveTextContent("Starting the service…");
  act(() => store.patch({ localHostStatus: { state: "running", installed: true, reachable: true },
    pairings: [{ fp: "fp-local", host: "This computer", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d", paired_at: 1, revoked: false }],
    machineLinks: { "fp-local": { reach: "ok", via: "node" } } }));
  expect(wizard().getByText("This computer is ready. Connect Sidevoice to the agents you use here.")).toBeInTheDocument();
  expect(install).not.toHaveBeenCalled();
}, WHOLE_APP_MS);

// Chosen on this device: the default settings' transcription and voice.
const CHOSEN = { stt: trialKey(defaultVoiceSettings().stt)!, tts: trialKey(defaultVoiceSettings().tts)! };

test("the setup decides where it resumes only once this device's voice settings are known, not on the machines alone", () => {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "remote", chosen: CHOSEN }));
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" } }));
  paired(store);
  render(<App store={store} />);
  expect(document.querySelector("#wizard[open]")).toBeNull();
  act(() => store.patch({ voiceSettings: defaultVoiceSettings() }));
  expect(title()).toHaveTextContent("When your turn ends");
});

test("a machine that answers after the setup opened moves it on to where it stands, past what was already chosen", () => {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "remote", chosen: CHOSEN }));
  const store = room();
  expect(title()).toHaveTextContent("Connect to your machine");
  paired(store);
  expect(title()).toHaveTextContent("When your turn ends");
});

test("a provider chosen without its key asks for it in the setup as Settings does: Escape closes the key's entry, never the setup", async () => {
  const openai = { id: "openai", name: "OpenAI", status: { stale: false, reason: { code: "credential-missing", params: {} } }, models: [] };
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "remote" }));
  const store = room();
  act(() => store.patch({ voiceCatalogue: { state: "ready", catalogs: [...CATALOGS, openai] as unknown as CatalogView[], error: "" },
    voiceSettings: { ...defaultVoiceSettings(), stt: { catalog: "openai", model: "", language: null } }, providerKeys: { openai: false } }));
  paired(store);
  expect(title()).toHaveTextContent("Set up transcription");
  const wizard = document.getElementById("wizard")!;
  const deferred = () => JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!).deferred_at ?? null;
  // A small dialog, above the setup's (not inside it).
  fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
  const entry = screen.getByRole("dialog", { name: "Connect OpenAI" });
  expect(wizard.contains(entry)).toBe(false);
  await act(async () => { fireEvent(entry, new Event("cancel", { cancelable: true })); });
  expect(screen.queryByRole("dialog", { name: "Connect OpenAI" })).toBeNull();
  expect(document.querySelector("#wizard[open]")).toBe(wizard);
  expect(deferred()).toBeNull();
}, WHOLE_APP_MS);

/** Back pressed from wherever the setup stands to its first step: each step it lands on, read again once everything
 *  pending has run — a step that moved on by itself would read as the next one. */
async function walkBack() {
  const seen = [title().textContent];
  for (let back = document.querySelector<HTMLButtonElement>("#wizard .wizard-back"); back; back = document.querySelector<HTMLButtonElement>("#wizard .wizard-back")) {
    await act(async () => { fireEvent.click(back!); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    seen.push(title().textContent);
  }
  return seen;
}

test("Back from the last step lands on each step before it and stays there, on another machine's path", async () => {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "remote", chosen: CHOSEN }));
  const store = room();
  paired(store);
  expect(title()).toHaveTextContent("When your turn ends");
  // Its machine paired and answering: Connect to your machine stays, with Continue, rather than moving on again.
  expect(await walkBack()).toEqual(["When your turn ends", "Set up voice", "Set up transcription", "Connect to your machine", "The basics"]);
}, WHOLE_APP_MS);

test("Back from the last step lands on each step before it and stays there, on this computer's path", async () => {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "running", installed: true, reachable: true })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(),
  } } } });
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "agents", agents_done: true, chosen: CHOSEN }));
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, speechLanguage: "es", localHostAvailable: true, localHostStatus: { state: "running", installed: true, reachable: true },
    voiceSettings: defaultVoiceSettings(), voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" },
    pairings: [{ fp: "fp-local", host: "This computer", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d", paired_at: 1, revoked: false }],
    machineLinks: { "fp-local": { reach: "ok", via: "node" } } }));
  render(<App store={store} />);
  expect(title()).toHaveTextContent("When your turn ends");
  expect(await walkBack()).toEqual(["When your turn ends", "Set up voice", "Set up transcription", "Prepare this computer", "Where do you use your agents?", "The basics"]);
  // And forward again from the choice: this computer ready, its agents' step, not a jump past it.
  await act(async () => { fireEvent.click(document.querySelector<HTMLButtonElement>("#wizard .wizard-actions .ui-button--primary")!); });
  expect(title()).toHaveTextContent("Where do you use your agents?");
}, WHOLE_APP_MS);

/* Continue without trying goes on without the try, never without the model: in every model step, it is not offered while
 * the step's model is not on this device or is still downloading, only once it is ready. */
const TURN_MODEL = { id: "smart-turn-v3.2", family: "smart-turn", capabilities: ["end-of-turn"], languages: ["es"], voices: [], parametersM: 1, license: "MIT", installed: true, builds: [{ id: "smart-turn-v3.2/int8", available: true, reasons: [] }] };
const MODEL_STEPS = [
  { title: "Set up transcription", task: "stt", model: "whisper-base", chosen: {} },
  { title: "Set up voice", task: "tts", model: "kokoro-82m-v1.0", chosen: { stt: CHOSEN.stt } },
  { title: "When your turn ends", task: "end-of-turn", model: TURN_MODEL.id, chosen: CHOSEN },
] as const;
const withTurn = (installed: (id: string) => boolean) => CATALOGS.map((catalog) => ({ ...catalog, models: [...catalog.models, TURN_MODEL].map((model) => installed(model.id) ? model
  : { ...model, installed: false, recommendedBuild: model.builds![0].id, builds: [{ ...model.builds![0], installed: false, downloadBytes: 9e6 }] }) })) as unknown as CatalogView[];

/* The try's block is the step's whether or not its model is there: its own button from the start, waiting for the model
 * with the footer's reason; once it is ready, it starts the try, whose one Stop is the footer's. */
for (const step of MODEL_STEPS) {
  test(`${step.title}: the try's own button is there before its model is, waiting with the footer's reason, then starts the try`, async () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "remote", chosen: step.chosen }));
    const store = createRoomStore();
    act(() => store.patch({ machinesReady: true, speechLanguage: "es", voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "smart-turn" },
      voiceCatalogue: { state: "ready", catalogs: withTurn((id) => id !== step.model), error: "" } }));
    render(<App store={store} />);
    paired(store);
    expect(title()).toHaveTextContent(step.title);
    const turn = step.task === "end-of-turn";
    const card = () => document.querySelector<HTMLButtonElement>(turn ? "#wizard #turn-try" : "#wizard #wizard-card-try")!;
    const footerReason = document.getElementById("wizard-stage-reason")!.textContent!;
    expect(footerReason).toMatch(/isn't ready yet\.$/);
    expect(card()).toHaveAttribute("aria-disabled", "true");
    expect(card()).toHaveAccessibleDescription(footerReason);
    // Its block laid out as once ready: the button and the level on the first row.
    expect(card().closest(".stt-try-head")!.querySelector(".voice-wave")).toBeInTheDocument();
    act(() => store.patch({ voiceCatalogue: { state: "ready", catalogs: withTurn(() => true), error: "" } }));
    expect(card()).not.toHaveAttribute("aria-disabled");
    actions.tryTurnSettings = vi.fn(() => new Promise(() => {}));
    if (!turn) pendingTry();
    await act(async () => { fireEvent.click(card()); });
    expect(turn ? actions.tryTurnSettings : actions.tryVoiceSettings).toHaveBeenCalled();
    // Running: the footer's is the one Stop; the block's button says it runs.
    expect(wizard().queryAllByRole("button", { name: "Stop" }).map((button) => button.id)).toEqual(["wizard-try"]);
    expect(card()).toHaveAttribute("aria-busy", "true");
  }, WHOLE_APP_MS);
}

for (const step of MODEL_STEPS) {
  test(`${step.title} offers Continue without trying only once its model is ready`, () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "remote", chosen: step.chosen }));
    const store = createRoomStore();
    act(() => store.patch({ machinesReady: true, speechLanguage: "es", voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "smart-turn" },
      voiceCatalogue: { state: "ready", catalogs: withTurn((id) => id !== step.model), error: "" } }));
    render(<App store={store} />);
    paired(store);
    expect(title()).toHaveTextContent(step.title);
    const skip = () => wizard().queryByRole("button", { name: "Continue without trying" });
    // Not downloaded.
    expect(skip()).toBeNull();
    // Downloading (the room reports an end-of-turn download under its own task, wider than the fact's declared type).
    act(() => store.patch({ voiceInstall: { task: step.task as "stt" | "tts", model: step.model, state: "running", fraction: 0.5, error: "" } }));
    expect(wizard().getByText("Downloading… 50%")).toBeInTheDocument();
    expect(skip()).toBeNull();
    // Ready.
    act(() => store.patch({ voiceInstall: null, voiceCatalogue: { state: "ready", catalogs: withTurn(() => true), error: "" } }));
    expect(skip()).toBeInTheDocument();
  }, WHOLE_APP_MS);
}
