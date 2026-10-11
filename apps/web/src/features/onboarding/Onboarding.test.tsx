import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../app/App";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { ONBOARDING_STORAGE_KEY } from "../../services/onboarding-state";
import type { SidevoiceActions } from "../../state/room-types";
import type { CatalogView } from "../../services/model-catalogs.js";

vi.mock("../../services/room-session-controller.js", () => ({}));

/* The first-run setup over the real room, in a browser: no agents here, so it pairs another machine, then tries this
 * device's transcription and voice for real (the actions stand in for the voice), and enters only once its completion
 * is stored. */

const CATALOGS = [{ id: "local", name: null, status: { stale: false }, models: [
  { id: "whisper-base", family: "whisper", capabilities: ["stt"], languages: ["es", "en"], voices: [], parametersM: 1, license: "MIT", installed: true, builds: [{ id: "whisper-base/int8", available: true, reasons: [] }] },
  { id: "moonshine-tiny", family: "moonshine", capabilities: ["stt"], languages: ["en"], voices: [], parametersM: 1, license: "MIT", installed: true, builds: [{ id: "moonshine/int8", available: true, reasons: [] }] },
  { id: "kokoro-82m-v1.0", family: "kokoro", capabilities: ["tts"], languages: ["es"], voices: [{ id: "ef_dora", languages: ["es"] }], speed: { min: 0.5, max: 2 }, parametersM: 1, license: "MIT", installed: true, builds: [{ id: "kokoro/int8", available: true, reasons: [] }] },
] }] as unknown as CatalogView[];
const NUC = { fp: "fp-nuc", device_id: "d-1", urls: ["https://nuc.example"], rv: null, host: "NUC", paired_at: 1_700_000_000, revoked: false };

let actions: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  actions = {
    openPairing: vi.fn(), chooseMachine: vi.fn(), loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined), editVoice: vi.fn(),
    tryVoiceSettings: vi.fn().mockResolvedValue({ text: "hola, ¿me oyes?" }), cancelVoiceTry: vi.fn(), loadHostAgents: vi.fn().mockResolvedValue(undefined),
    installVoiceModel: vi.fn().mockResolvedValue(undefined), cancelVoiceInstall: vi.fn(),
  };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
});
afterEach(() => { delete window.sidevoiceActions; vi.restoreAllMocks(); });

function room() {
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, speechLanguage: "es", voiceSettings: defaultVoiceSettings("es"), voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" } }));
  render(<App store={store} />);
  return store;
}
const title = () => screen.getByRole("heading", { level: 2 });
const stageAction = () => document.getElementById("wizard-stage-action") as HTMLButtonElement;
const paired = (store: ReturnType<typeof createRoomStore>) => act(() => store.patch({ pairings: [NUC], pairingInUse: NUC.fp, node: NUC.fp, nodeReach: "ok", rendezvous: "node" }));

test("a browser starts by pairing another machine, shown how to prepare it, and moves on once it answers", () => {
  const store = room();
  expect(title()).toHaveTextContent("Connect to your machine");
  expect(document.querySelector("#wizard .setup-command code")).toHaveTextContent("npx sidevoice@latest install");
  // The room, its settings and its call bar stay out of reach behind the setup.
  expect(document.querySelector(".room-shell")).toHaveAttribute("hidden");
  // The code is entered right here, not in another dialog on top.
  expect(document.getElementById("wizard-pairing-code")).toBeInTheDocument();
  expect(actions.openPairing).not.toHaveBeenCalled();
  paired(store);
  expect(title()).toHaveTextContent("Set up transcription");
});

test("transcription and voice are this device's, each tried for real before Continue; a change asks for another try", async () => {
  const store = room();
  paired(store);
  expect(title()).toHaveTextContent("Set up transcription");
  // Source first, then the model, as in Settings → Voice.
  expect((document.getElementById("stt-source") as HTMLSelectElement).value).toBe("local");
  expect(stageAction()).toHaveTextContent("Speak");
  await act(async () => { fireEvent.click(stageAction()); });
  expect(actions.tryVoiceSettings).toHaveBeenCalledWith("stt", { keep: true });
  expect(document.getElementById("stt-heard")).toHaveTextContent("hola, ¿me oyes?");
  expect(stageAction()).toHaveTextContent("Continue");
  // Another model is another setting: it is tried again before going on.
  act(() => store.patch({ voiceSettings: { ...defaultVoiceSettings("es"), stt: { catalog: "local", model: "moonshine-tiny", language: null } } }));
  await waitFor(() => expect(stageAction()).toHaveTextContent("Speak"));
  await act(async () => { fireEvent.click(stageAction()); });
  fireEvent.click(stageAction());

  expect(title()).toHaveTextContent("Set up voice");
  const sample = document.getElementById("wizard-sample") as HTMLTextAreaElement;
  fireEvent.change(sample, { target: { value: "Probando la voz" } });
  await act(async () => { fireEvent.click(stageAction()); });
  // Transcription left to detect the language: the sample is said in the one this device speaks.
  expect(actions.tryVoiceSettings).toHaveBeenLastCalledWith("tts", { text: "Probando la voz", language: "es", keep: true });
  fireEvent.click(stageAction());

  expect(title()).toHaveTextContent("Ready");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enter Sidevoice" })); });
  expect(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!).completed_at).toBeGreaterThan(0);
  expect(document.querySelector(".room-shell")).not.toHaveAttribute("hidden");
});

test("a failed try says why and keeps the step; a completion that is not stored keeps Ready, with Retry", async () => {
  const store = room();
  paired(store);
  actions.tryVoiceSettings.mockRejectedValueOnce(Object.assign(new Error("Nothing was heard in time."), { code: "trial-silence" }));
  await act(async () => { fireEvent.click(stageAction()); });
  expect(screen.getByRole("alert")).toHaveTextContent("Nothing was heard in time.");
  expect(stageAction()).toHaveTextContent("Speak");
  await act(async () => { fireEvent.click(stageAction()); });
  fireEvent.click(stageAction());
  await act(async () => { fireEvent.click(stageAction()); });
  fireEvent.click(stageAction());

  const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation((key) => { if (key === ONBOARDING_STORAGE_KEY) throw new DOMException("blocked", "SecurityError"); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enter Sidevoice" })); });
  expect(title()).toHaveTextContent("Ready");
  expect(screen.getByRole("alert")).toHaveTextContent("Setup progress was not saved");
  expect(document.querySelector(".room-shell")).toHaveAttribute("hidden");
  setItem.mockRestore();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry" })); });
  expect(document.querySelector(".room-shell")).not.toHaveAttribute("hidden");
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

test("a model not on this device is downloaded first: the footer offers its download, then the try once it is here", async () => {
  const store = room();
  const absent = CATALOGS.map((catalog) => ({ ...catalog, models: catalog.models.map((model) => model.id === "whisper-base"
    ? { ...model, installed: false, recommendedBuild: "whisper-base/int8", builds: [{ id: "whisper-base/int8", available: true, reasons: [], installed: false, downloadBytes: 148e6 }] } : model) }));
  act(() => store.patch({ voiceCatalogue: { state: "ready", catalogs: absent as unknown as CatalogView[], error: "" } }));
  paired(store);
  expect(title()).toHaveTextContent("Set up transcription");
  expect(stageAction()).toHaveTextContent("Download (148 MB)");
  expect(document.getElementById("stt-language")).toBeNull();
  fireEvent.click(stageAction());
  expect(actions.installVoiceModel).toHaveBeenCalledWith("stt");
  act(() => store.patch({ voiceInstall: { task: "stt", model: "whisper-base", state: "running", fraction: 0.5, error: "" } }));
  expect(stageAction()).toHaveTextContent("Cancel download");
  fireEvent.click(stageAction());
  expect(actions.cancelVoiceInstall).toHaveBeenCalled();
  act(() => store.patch({ voiceInstall: null, voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" } }));
  expect(stageAction()).toHaveTextContent("Speak");
  expect(document.getElementById("stt-language")).toBeInTheDocument();
});
