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
import { VARIANTS_KEY } from "../../lib/variants";

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
    tryVoiceSettings: vi.fn().mockResolvedValue({ text: "hola, ¿me oyes?", timings: { ready_ms: 900, audio_ms: 1800, endpoint_silence_ms: 600, recognition_ms: 420 } }), cancelVoiceTry: vi.fn(), loadHostAgents: vi.fn().mockResolvedValue(undefined),
    installVoiceModel: vi.fn().mockResolvedValue(undefined), cancelVoiceInstall: vi.fn(),
  };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
});
afterEach(() => { delete window.sidevoiceActions; vi.restoreAllMocks(); localStorage.removeItem("sidevoice.variants"); });

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
const card = (task: "stt" | "tts") => document.querySelector("#wizard #" + task + "-model-card")!;
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
  expect(tryButton()).toHaveTextContent("Speak");
  // The try is the model's: its hint in its block, and the block offers no second Speak beside the footer's.
  expect(card("stt").querySelector(".model-try-hint")).toHaveTextContent("Recommended: try it before you go on.");
  expect(document.getElementById("wizard-try-again")).toBeNull();
  await act(async () => { fireEvent.click(tryButton()); });
  expect(actions.tryVoiceSettings).toHaveBeenCalledWith("stt", expect.objectContaining({ keep: true }));
  expect(card("stt").querySelector("#stt-heard")).toHaveTextContent("hola, ¿me oyes?");
  // Tried: Continue is the main action now, and how quick it was is said in a line, in the block.
  expect(stageAction()).toHaveTextContent(/^Continue$/);
  expect(stageAction()).toHaveClass("ui-button--primary");
  expect(card("stt").querySelector("#stt-timing")).toHaveTextContent("Transcribed in 0.4 s");
  expect(card("stt").querySelector("#stt-timing")).not.toHaveTextContent("smaller model");
  // Trying it again is the block's.
  expect(card("stt").querySelector("#wizard-try-again")).toHaveTextContent("Speak again");
  expect(document.querySelector(".model-try-hint")).toBeNull();
  await act(async () => { fireEvent.click(stageAction()); });

  expect(title()).toHaveTextContent("Set up voice");
  // Not tried: going on without it is offered all the same.
  expect(stageAction()).toHaveTextContent("Continue without trying");
  expect(stageAction()).not.toHaveAttribute("aria-disabled");
  await act(async () => { fireEvent.click(stageAction()); });

  expect(title()).toHaveTextContent("When your turn ends");
  expect(document.getElementById("voice-end-of-turn")).toBeInTheDocument();
  await act(async () => { fireEvent.click(document.getElementById("wizard-turn-continue")!); });

  expect(title()).toHaveTextContent("You’re all set — talk to your agents");
  // What was set up, read from what the steps wrote, and what to tell an agent.
  expect(document.querySelector(".wizard-recap-list")).toHaveTextContent("Transcription");
  expect(document.querySelector(".wizard-ready .ui-quote blockquote")).toHaveTextContent("voice_connect");
  expect(wizard().getByRole("button", { name: "Copy the message for your agent" })).toHaveClass("ui-copy-button");
  await act(async () => { fireEvent.click(wizard().getByRole("button", { name: "Enter Sidevoice" })); });
  const kept = JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!);
  expect(kept.completed_at).toBeGreaterThan(0);
  expect(kept.trials.tts).toBeUndefined();
  expect(document.querySelector(".room-shell")).not.toHaveAttribute("hidden");
}, WHOLE_APP_MS);

test("a failed try says why and keeps the step; a completion that is not stored keeps Ready, with Retry", async () => {
  const store = room();
  paired(store);
  actions.tryVoiceSettings.mockRejectedValueOnce(Object.assign(new Error("Nothing was heard in time."), { code: "trial-silence" }));
  await act(async () => { fireEvent.click(tryButton()); });
  expect(wizard().getByRole("alert")).toHaveTextContent("Nothing was heard in time.");
  expect(card("stt")).toContainElement(wizard().getByRole("alert"));
  expect(title()).toHaveTextContent("Set up transcription");
  await act(async () => { fireEvent.click(stageAction()); });
  await act(async () => { fireEvent.click(stageAction()); });
  await act(async () => { fireEvent.click(document.getElementById("wizard-turn-continue")!); });

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

test("try-result card: the voice's try is all in its block — the sentence edited there, lit as it is heard, then how quick and Listen again", async () => {
  const store = room();
  paired(store);
  await act(async () => { fireEvent.click(stageAction()); });
  expect(title()).toHaveTextContent("Set up voice");
  // The sentence to hear is the block's, where it is then heard.
  const sample = card("tts").querySelector("#wizard-sample") as HTMLTextAreaElement;
  expect(sample).toHaveValue("Hi! This is how Sidevoice will read your agent's replies.");
  fireEvent.change(sample, { target: { value: "Hola, qué tal." } });
  const running = pendingTry();
  await act(async () => { fireEvent.click(tryButton()); });
  expect(actions.tryVoiceSettings).toHaveBeenCalledWith("tts", expect.objectContaining({ text: "Hola, qué tal.", keep: true }));
  expect(card("tts")).toHaveTextContent("Getting ready…");
  // Playing: the sentence in the field's place, lit up to what was heard; Stop is the block's too.
  act(() => { running.told.onProgress!({ from: 0, to: 0 }); running.told.onProgress!({ from: 5, to: 5 }); });
  expect(card("tts").querySelector("#wizard-sample")).toBeNull();
  expect(card("tts").querySelector(".model-try-said")).toHaveTextContent(/^Hola,$/);
  expect(card("tts").querySelector(".model-try-unsaid")).toHaveTextContent("qué tal.");
  expect(card("tts").querySelector("#wizard-try-again")).toHaveTextContent("Stop");
  await act(async () => { running.finish({ timings: { ready_ms: 600, first_sound_ms: 320 } }); });
  expect(card("tts").querySelector("#tts-timing")).toHaveTextContent("Starts speaking in 0.3 s");
  expect(card("tts").querySelector("#wizard-try-again")).toHaveTextContent("Listen again");
  expect(card("tts").querySelector("#wizard-sample")).toHaveValue("Hola, qué tal.");
  expect(stageAction()).toHaveTextContent(/^Continue$/);
});

test("try-result dialog: the footer's Speak opens the try's dialog — listening, then what was heard; its Escape is its own, and the block keeps a line", async () => {
  localStorage.setItem("sidevoice.variants", JSON.stringify({ "try-result": "dialog" }));
  const store = room();
  paired(store);
  const running = pendingTry();
  await act(async () => { fireEvent.click(tryButton()); });
  const dialog = document.querySelector("#wizard #stt-try-dialog")!;
  expect(dialog).toHaveAttribute("open");
  expect(dialog).toHaveTextContent("Try transcription");
  act(() => running.told.onListening!());
  expect(dialog).toHaveTextContent("Listening… say a short sentence");
  expect(dialog.querySelector(".voice-wave canvas")).toBeInTheDocument();
  await act(async () => { running.finish({ text: "hola, ¿me oyes?", timings: { ready_ms: 900, audio_ms: 1800, endpoint_silence_ms: 600, recognition_ms: 420 } }); });
  expect(dialog.querySelector("#stt-heard")).toHaveTextContent("hola, ¿me oyes?");
  expect(dialog.querySelector("#stt-timing")).toHaveTextContent("Transcribed in 0.4 s");
  // Escape closes the try's dialog alone: the setup is not put off, and stays on its step.
  await act(async () => { fireEvent(dialog, new Event("cancel", { cancelable: true })); });
  expect(dialog).not.toHaveAttribute("open");
  expect(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!).deferred_at).toBeFalsy();
  expect(title()).toHaveTextContent("Set up transcription");
  // The block keeps how it went in a line, and offers it again; the footer goes on.
  expect(card("stt").querySelector(".model-try-summary")).toHaveTextContent("hola, ¿me oyes? · Transcribed in 0.4 s");
  expect(document.querySelector("#wizard #stt-heard")).toBeNull();
  expect(card("stt").querySelector("#wizard-try-again")).toHaveTextContent("Speak again");
  expect(stageAction()).toHaveTextContent(/^Continue$/);
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
  expect(stageAction()).toHaveAttribute("aria-disabled", "true");
  expect(stageAction()).toHaveAccessibleDescription("The transcription model isn't ready yet.");
  expect(document.getElementById("stt-language")).toBeNull();
  fireEvent.click(document.getElementById("stt-model-download")!);
  expect(actions.installVoiceModel).toHaveBeenCalledWith("stt");
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
  await act(async () => { fireEvent.click(document.getElementById("wizard-prepare")!); });
  expect(document.getElementById("wizard-prepare")).toBeNull();
  // Installed: the room lets the install's state go, nothing to choose, before this device reaches it.
  await act(async () => { finish({ state: "starting", installed: true, reachable: false }); await Promise.resolve(); });
  act(() => { localHostInstallController.clear(); store.patch({ localHostStatus: { state: "starting", installed: true, reachable: false } }); });
  expect(document.getElementById("wizard-prepare")).toBeNull();
  expect(screen.getByText("Starting Sidevoice on this computer…")).toBeInTheDocument();
  act(() => store.patch({ localHostStatus: { state: "running", installed: true, reachable: true } }));
  expect(screen.getByText("Checking that this computer answers…")).toBeInTheDocument();
  expect(document.getElementById("wizard-prepare")).toBeNull();
  // Answering: its agents, in the same step.
  act(() => store.patch({ pairings: [{ fp: "fp-local", host: "This computer", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d", paired_at: 1, revoked: false }],
    machineLinks: { "fp-local": { reach: "ok", via: "node" } } }));
  expect(screen.getByText("This computer is ready. Connect Sidevoice to the agents you use here.")).toBeInTheDocument();
  act(() => localHostInstallController.clear());
});

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
  // The default way: a small dialog, above the setup's (not inside it).
  fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
  const entry = screen.getByRole("dialog", { name: "Connect OpenAI" });
  expect(wizard.contains(entry)).toBe(false);
  await act(async () => { fireEvent(entry, new Event("cancel", { cancelable: true })); });
  expect(screen.queryByRole("dialog", { name: "Connect OpenAI" })).toBeNull();
  expect(document.querySelector("#wizard[open]")).toBe(wizard);
  expect(deferred()).toBeNull();
  // The row way: in the step itself; Escape stays in it.
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "provider-connect": "row" }));
  act(() => { window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY })); });
  try {
    fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
    const field = screen.getByLabelText("OpenAI API key");
    expect(wizard.contains(field)).toBe(true);
    let notCancelled = true;
    await act(async () => { notCancelled = fireEvent.keyDown(field, { key: "Escape" }); });
    expect(notCancelled).toBe(false);
    expect(screen.queryByLabelText("OpenAI API key")).toBeNull();
    expect(document.querySelector("#wizard[open]")).toBe(wizard);
    expect(deferred()).toBeNull();
  } finally { localStorage.removeItem(VARIANTS_KEY); }
}, WHOLE_APP_MS);
