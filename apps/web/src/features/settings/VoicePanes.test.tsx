import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VoiceSettings } from "./VoiceSettings";
import { ProviderKeys } from "./ProviderKeys";
import { StorageBlockedBanner } from "./StorageBlockedBanner";
import { createRoomStore, installRoomBridge, RoomStoreContext } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import type { SidevoiceActions } from "../../state/room-types";
import type { CatalogView } from "../../services/model-catalogs.js";

afterEach(cleanup);

/* The voice and providers panes, on the engine's catalogues; the interface speaks English here (the test's system). */

const build = (id: string, extra: Record<string, unknown> = {}) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 1e6, memoryMb: 1, available: true, reasons: [], installed: true, ...extra });
const local = (id: string, family: string, capabilities: string[], extra: Record<string, unknown> = {}) =>
  ({ id, family, capabilities, parametersM: 1, license: "MIT", languages: ["es"], voices: [], installed: true, builds: [build(id + "/int8")], ...extra });
const catalogs = [
  { id: "local", name: null, status: { stale: false }, models: [
    local("whisper-base", "whisper", ["stt"]),
    local("whisper-large", "whisper", ["stt"], { builds: [build("whisper-large/int8", { available: false, reasons: [{ code: "memory", params: {} }] })] }),
    local("moonshine-tiny", "moonshine", ["stt"]),
    local("kokoro-82m-v1.0", "kokoro", ["tts"], { voices: [{ id: "ef_dora", languages: ["es"] }], speed: { min: 0.5, max: 2 } }),
    local("piper-es", "piper", ["tts"], { installed: false, voices: [{ id: "davefx", languages: ["es"] }], recommendedBuild: "piper-es/onnx",
      builds: [build("piper-es/onnx", { downloadBytes: 63e6, installed: false })] }),
  ] },
  { id: "elevenlabs", name: "ElevenLabs", status: { stale: false }, models: [{ id: "scribe_v2", capabilities: ["stt"], languages: [], voices: [] }] },
  { id: "openai", name: "OpenAI", status: { stale: false, reason: { code: "credential-missing", params: {} } }, models: [] },
] as unknown as CatalogView[];

function renderPane(pane: "voice" | "keys", facts: Record<string, unknown> = {}) {
  const store = createRoomStore();
  store.patch({ voiceSettings: defaultVoiceSettings("es"), voiceCatalogue: { state: "ready", catalogs, error: "" }, providerKeys: { openai: false, elevenlabs: true }, ...facts });
  installRoomBridge(store);
  const actions = { editVoice: vi.fn(), saveProviderKey: vi.fn().mockResolvedValue(undefined), loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined),
    installVoiceModel: vi.fn().mockResolvedValue(undefined), cancelVoiceInstall: vi.fn(), tryVoiceSettings: vi.fn().mockResolvedValue({}), cancelVoiceTry: vi.fn() };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
  render(<RoomStoreContext.Provider value={store}>{pane === "voice" ? <VoiceSettings /> : <ProviderKeys />}</RoomStoreContext.Provider>);
  for (const section of document.querySelectorAll("section")) section.hidden = false;
  return { store, actions };
}

const options = (id: string) => [...(document.getElementById(id) as HTMLSelectElement).options];

test("a slot's source comes first: this device, then each provider, one without its key disabled with why", () => {
  const { actions } = renderPane("voice");
  expect(options("stt-source").map((option) => [option.value, option.textContent, option.disabled])).toEqual([
    ["local", "On this device", false],
    ["elevenlabs", "ElevenLabs", false],
    ["openai", "OpenAI — needs your key (Providers)", true],
  ]);
  fireEvent.change(document.getElementById("stt-source")!, { target: { value: "elevenlabs" } });
  expect(actions.editVoice).toHaveBeenCalledWith({ stt: { catalog: "elevenlabs" } });
});

test("then the source's models, this device's by family, one that does not run here disabled with why", () => {
  renderPane("voice");
  const groups = [...document.getElementById("stt-model")!.querySelectorAll("optgroup")].map((group) => [group.label, [...group.querySelectorAll("option")].map((option) => option.value)]);
  expect(groups).toEqual([["whisper", ["whisper-base", "whisper-large"]], ["moonshine", ["moonshine-tiny"]]]);
  const large = options("stt-model").find((option) => option.value === "whisper-large")!;
  expect(large.disabled).toBe(true);
  expect(large.textContent).toBe("whisper-large — does not run here: it does not fit in this device's memory");
});

test("the voice and the speed range are the model's; smart-turn says why it cannot be chosen; a change says it restarts the voice", () => {
  const { actions } = renderPane("voice");
  const speed = document.getElementById("tts-speed") as HTMLInputElement;
  expect([speed.min, speed.max]).toEqual(["0.5", "2"]);
  fireEvent.change(document.getElementById("tts-voice")!, { target: { value: "ef_dora" } });
  expect(actions.editVoice).toHaveBeenCalledWith({ tts: { voice: "ef_dora" } });
  expect(options("voice-end-of-turn")[1].disabled).toBe(true);
  expect(document.getElementById("end-of-turn-note")).toHaveTextContent("No end-of-turn model runs on this device yet");
  expect(screen.getByText(/restarts the voice for a moment/)).toBeInTheDocument();
  cleanup();
  // A model that takes no speed has no slider.
  renderPane("voice", { voiceSettings: { ...defaultVoiceSettings("es"), tts: { catalog: "local", model: "piper", voice: null, speed: 1 } } });
  expect(document.getElementById("tts-speed")).toBeNull();
});

test("catalogues the engine could not give say why and can be asked again", () => {
  const { actions } = renderPane("voice", { voiceCatalogue: { state: "failed", catalogs: [], error: "The call's voice is not available yet." } });
  expect(screen.getByRole("alert")).toHaveTextContent("not available yet");
  expect(document.getElementById("stt-model")).toBeNull();
  fireEvent.click(document.getElementById("voice-catalogue-retry")!);
  expect(actions.loadVoiceCatalogue).toHaveBeenCalled();
});

test("in a browser the key pane warns where the key lives and to cap the spend; in the app it names the keychain", () => {
  renderPane("keys");
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/in this browser, unencrypted/);
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/spending limit/);
  cleanup();
  renderPane("keys", { inApp: true });
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/system keychain/);
});

test("one key per remote catalogue: handed to the engine's host, the field emptied, and a kept key removable", async () => {
  const { actions, store } = renderPane("keys");
  expect([...document.querySelectorAll(".provider-key")].map((row) => row.getAttribute("data-provider"))).toEqual(["elevenlabs", "openai"]);
  const field = document.getElementById("provider-key-openai") as HTMLInputElement;
  expect(field.type).toBe("password");
  expect((document.getElementById("provider-key-remove-openai") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(field, { target: { value: " sk-test " } });
  await act(async () => { fireEvent.click(document.getElementById("provider-key-save-openai")!); });
  expect(actions.saveProviderKey).toHaveBeenCalledWith("openai", "sk-test");
  expect(field.value).toBe("");
  act(() => store.patch({ providerKeys: { openai: true, elevenlabs: true } }));
  await act(async () => { fireEvent.click(document.getElementById("provider-key-remove-openai")!); });
  expect(actions.saveProviderKey).toHaveBeenLastCalledWith("openai", null);
  cleanup();
  renderPane("keys", { voiceCatalogue: { state: "ready", catalogs: [catalogs[0]], error: "" } });
  expect(document.getElementById("provider-keys-none")).toBeInTheDocument();
});

test("the providers are the catalogues: while they load it says so, and when they could not be read it says why, never an empty list", () => {
  renderPane("keys", { voiceCatalogue: { state: "loading", catalogs: [], error: "" } });
  expect(document.getElementById("provider-keys-loading")).toBeInTheDocument();
  expect(document.getElementById("provider-keys-none")).toBeNull();
  cleanup();
  const { actions } = renderPane("keys", { voiceCatalogue: { state: "failed", catalogs: [], error: "This browser is blocking site data for this page." } });
  expect(screen.getByRole("alert")).toHaveTextContent("blocking site data");
  expect(document.getElementById("provider-keys-none")).toBeNull();
  fireEvent.click(document.getElementById("provider-keys-retry")!);
  expect(actions.loadVoiceCatalogue).toHaveBeenCalled();
});

test("a catalogue its storage was refused to says the browser blocks site data", () => {
  const blocked = catalogs.map((catalog) => catalog.id === "local" ? { ...catalog, status: { stale: false, reason: { code: "storage-blocked", params: {} } }, models: [] } : catalog) as CatalogView[];
  renderPane("voice", { voiceCatalogue: { state: "ready", catalogs: blocked, error: "" } });
  expect(options("stt-source")[0].textContent).toMatch(/On this device — This browser is blocking site data for this page/);
});

test("a browser that blocks site data is said once, on top, while it does", () => {
  const store = createRoomStore();
  render(<RoomStoreContext.Provider value={store}><StorageBlockedBanner /></RoomStoreContext.Provider>);
  expect(document.getElementById("storage-blocked")).toBeNull();
  act(() => store.patch({ storageBlocked: true }));
  expect(screen.getByRole("alert")).toHaveTextContent("This browser is blocking site data for this page. Allow it");
});

const withVoiceModel = (model: string, catalog = "local") => ({ ...defaultVoiceSettings("es"), tts: { catalog, model, voice: null, speed: 1 } });

test("a model not on this device offers its download with its size; its voices wait until it is here", () => {
  const { actions } = renderPane("voice", { voiceSettings: withVoiceModel("piper-es") });
  expect(document.getElementById("tts-model-card")).toHaveTextContent("Not on this device yet · 63 MB to download");
  expect(document.getElementById("tts-voice")).toBeNull();
  expect(document.getElementById("tts-try")).toBeNull();
  fireEvent.click(document.getElementById("tts-model-download")!);
  expect(actions.installVoiceModel).toHaveBeenCalledWith("tts");
});

test("while it downloads the card shows how far it has got, and the download can be cancelled", () => {
  const { actions } = renderPane("voice", { voiceSettings: withVoiceModel("piper-es"),
    voiceInstall: { task: "tts", model: "piper-es", state: "running", fraction: 0.4, error: "" } });
  const card = document.getElementById("tts-model-card")!;
  expect(card).toHaveTextContent("Downloading… 40%");
  expect((card.querySelector("progress") as HTMLProgressElement).value).toBe(0.4);
  fireEvent.click(document.getElementById("tts-model-cancel")!);
  expect(actions.cancelVoiceInstall).toHaveBeenCalled();
  cleanup();
  renderPane("voice", { voiceSettings: withVoiceModel("piper-es"), voiceInstall: { task: "tts", model: "piper-es", state: "failed", fraction: null, error: "The download failed." } });
  expect(screen.getByRole("alert")).toHaveTextContent("The download failed.");
});

test("once it is here its voices appear, and it can be tried without saving; a provider's model needs no download", async () => {
  const { actions } = renderPane("voice");
  expect(document.getElementById("tts-model-card")).toHaveTextContent("On this device");
  expect(options("tts-voice").map((option) => option.value)).toEqual(["", "ef_dora"]);
  await act(async () => { fireEvent.click(document.getElementById("tts-try")!); });
  expect(actions.tryVoiceSettings).toHaveBeenCalledWith("tts", expect.objectContaining({ keep: false }));
  cleanup();
  renderPane("voice", { voiceSettings: { ...defaultVoiceSettings("es"), stt: { catalog: "elevenlabs", model: "scribe_v2", language: null } } });
  expect(document.getElementById("stt-model-card")).toBeNull();
  expect(document.getElementById("stt-language")).toBeInTheDocument();
});
