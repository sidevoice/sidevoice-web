import { TooltipProvider } from "../../components/ui/Tooltip";
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SlotPane, TurnChoices } from "./VoiceSettings";
import { ProviderKeys } from "./ProviderKeys";
import { StorageBlockedBanner } from "./StorageBlockedBanner";
import { createRoomStore, installRoomBridge, RoomStoreContext, useRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import type { SidevoiceActions, TrialProgress } from "../../state/room-types";
import type { CatalogView } from "../../services/model-catalogs.js";

afterEach(() => { cleanup(); localStorage.removeItem("sidevoice.variants"); });

/** Settings' transcription, voice and advanced sections, as the voice is chosen in them. */
function VoicePanes() {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  return <><SlotPane task="stt" /><SlotPane task="tts" />{draft && <TurnChoices draft={draft} />}</>;
}

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
  store.patch({ voiceSettings: defaultVoiceSettings(), voiceCatalogue: { state: "ready", catalogs, error: "" }, providerKeys: { openai: false, elevenlabs: true }, ...facts });
  installRoomBridge(store);
  const actions = { editVoice: vi.fn(), saveProviderKey: vi.fn().mockResolvedValue(undefined), loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined),
    installVoiceModel: vi.fn().mockResolvedValue(undefined), cancelVoiceInstall: vi.fn(), tryVoiceSettings: vi.fn().mockResolvedValue({}), cancelVoiceTry: vi.fn() };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
  render(<RoomStoreContext.Provider value={store}><TooltipProvider>{pane === "voice" ? <VoicePanes /> : <ProviderKeys />}</TooltipProvider></RoomStoreContext.Provider>);
  for (const section of document.querySelectorAll("section")) section.hidden = false;
  return { store, actions };
}

const options = (id: string) => [...(document.getElementById(id) as HTMLSelectElement).options];

test("a slot's source comes first: this device, then each provider; one without its key says so, and asks for it right there", () => {
  const { actions } = renderPane("voice");
  expect(options("stt-source").map((option) => [option.value, option.textContent, option.disabled])).toEqual([
    ["local", "On this device", false],
    ["elevenlabs", "ElevenLabs", false],
    ["openai", "OpenAI — needs your key", false],
  ]);
  fireEvent.change(document.getElementById("stt-source")!, { target: { value: "elevenlabs" } });
  expect(actions.editVoice).toHaveBeenCalledWith({ stt: { catalog: "elevenlabs" } });
});

test("then the source's models, this device's family first and then a model of it, one that does not run here disabled with why", () => {
  const { actions } = renderPane("voice");
  expect(options("stt-family").map((option) => [option.value, option.textContent])).toEqual([["whisper", "Whisper"], ["moonshine", "Moonshine"]]);
  expect(options("stt-model").map((option) => option.value)).toEqual(["whisper-base", "whisper-large"]);
  fireEvent.change(document.getElementById("stt-family")!, { target: { value: "moonshine" } });
  expect(actions.editVoice).toHaveBeenCalledWith({ stt: { model: "moonshine-tiny" } });
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
  expect(options("voice-end-of-turn")[0].disabled).toBe(true);
  expect(screen.getByText(/No end-of-turn model runs on this device yet/)).toBeInTheDocument();
  cleanup();
  // A model that takes no speed has no slider.
  renderPane("voice", { voiceSettings: { ...defaultVoiceSettings(), tts: { catalog: "local", model: "piper", voice: null, speed: 1 } } });
  expect(document.getElementById("tts-speed")).toBeNull();
});

test("catalogues the engine could not give say why and can be asked again", () => {
  const { actions } = renderPane("voice", { voiceCatalogue: { state: "failed", catalogs: [], error: "The call's voice is not available yet." } });
  expect(screen.getAllByText(/not available yet/)).toHaveLength(2);
  expect(document.getElementById("stt-model")).toBeNull();
  fireEvent.click(document.getElementById("stt-catalogue-retry")!);
  expect(actions.loadVoiceCatalogue).toHaveBeenCalled();
});

test("in a browser one line says where the key lives and to cap the spend; in the app it names the keychain", () => {
  renderPane("keys");
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/unencrypted in this browser/);
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/spending limit/);
  cleanup();
  renderPane("keys", { inApp: true });
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/system keychain/);
});

test("each provider is a card: Connect opens the key in place, Test and save keeps it, and connected it shows a check, the last four, Replace and Remove", async () => {
  const { actions, store } = renderPane("keys");
  const cards = [...document.querySelectorAll(".provider-card")];
  expect(cards.map((card) => [card.getAttribute("data-provider"), card.getAttribute("data-state")])).toEqual([["elevenlabs", "connected"], ["openai", "absent"]]);
  expect(cards[0]).toHaveTextContent("Connected");
  expect(within(cards[0] as HTMLElement).getByRole("button", { name: "Replace the ElevenLabs key" })).toBeInTheDocument();
  expect(within(cards[0] as HTMLElement).getByRole("button", { name: "Remove the ElevenLabs key" })).toBeInTheDocument();
  // No key field until asked for.
  expect(document.getElementById("provider-key-openai")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
  const field = document.getElementById("provider-key-openai") as HTMLInputElement;
  expect(field.type).toBe("password");
  expect(screen.getByRole("link", { name: /Get a key at OpenAI/ })).toHaveAttribute("href", "https://platform.openai.com/api-keys");
  fireEvent.change(field, { target: { value: " sk-test-7f3a " } });
  expect(document.getElementById("provider-key-save-openai")).toHaveTextContent("Test and save");
  await act(async () => { fireEvent.click(document.getElementById("provider-key-save-openai")!); });
  expect(actions.saveProviderKey).toHaveBeenCalledWith("openai", "sk-test-7f3a");
  act(() => store.patch({ providerKeys: { openai: true, elevenlabs: true } }));
  expect(document.querySelector(".provider-card[data-provider='openai'] .provider-card-masked")).toHaveTextContent("••••7f3a");
  cleanup();
  renderPane("keys", { voiceCatalogue: { state: "ready", catalogs: [catalogs[0]], error: "" } });
  expect(document.getElementById("provider-keys-none")).toBeInTheDocument();
});

test("a key the provider refuses on Test and save is not kept, and the form says why in the provider's words", async () => {
  const { actions } = renderPane("keys");
  const connect = vi.fn().mockRejectedValue(Object.assign(new Error("credential-rejected"), { code: "credential-rejected", detail: "invalid_api_key" }));
  window.sidevoiceActions = { ...actions, connectProviderKey: connect } as unknown as typeof window.sidevoiceActions;
  fireEvent.click(screen.getByRole("button", { name: "Connect OpenAI" }));
  fireEvent.change(document.getElementById("provider-key-openai")!, { target: { value: "sk-bad" } });
  await act(async () => { fireEvent.click(document.getElementById("provider-key-save-openai")!); });
  expect(connect).toHaveBeenCalledWith("openai", "sk-bad");
  expect(document.querySelector(".provider-card[data-provider='openai']")).toHaveTextContent("OpenAI didn't accept the key: it was revoked or mistyped. invalid_api_key");
  expect(document.getElementById("provider-key-openai")).toBeInTheDocument();
});

test("a kept key the provider refused says so, and offers to replace it", () => {
  const refused = catalogs.map((catalog) => catalog.id === "elevenlabs" ? { ...catalog, status: { stale: false, reason: { code: "credential-rejected", params: {} } } } : catalog) as CatalogView[];
  renderPane("keys", { voiceCatalogue: { state: "ready", catalogs: refused, error: "" } });
  const card = document.querySelector(".provider-card[data-provider='elevenlabs']")!;
  expect(card).toHaveAttribute("data-state", "rejected");
  expect(card).toHaveTextContent("Key rejected");
  expect(card).toHaveTextContent("didn't accept the key");
  expect(within(card as HTMLElement).getByRole("button", { name: "Replace the ElevenLabs key" })).toBeInTheDocument();
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

const withVoiceModel = (model: string, catalog = "local") => ({ ...defaultVoiceSettings(), tts: { catalog, model, voice: null, speed: 1 } });

test("a model not on this device offers its download with its size; its voices wait until it is here", () => {
  const { actions } = renderPane("voice", { voiceSettings: withVoiceModel("piper-es") });
  expect(document.getElementById("tts-model-card")).toHaveTextContent(/Not downloaded\s*63 MB/);
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
  expect(card.querySelector("[role=progressbar]")).toHaveAttribute("aria-valuenow", "40");
  // While it downloads, the model cannot be changed under it.
  expect((document.getElementById("tts-model") as HTMLSelectElement).disabled).toBe(true);
  fireEvent.click(document.getElementById("tts-model-cancel")!);
  expect(actions.cancelVoiceInstall).toHaveBeenCalled();
  cleanup();
  renderPane("voice", { voiceSettings: withVoiceModel("piper-es"), voiceInstall: { task: "tts", model: "piper-es", state: "failed", fraction: null, error: "The download failed." } });
  expect(screen.getByRole("alert")).toHaveTextContent("The download failed.");
});

test("once it is here its voices appear, and it can be tried without saving; a provider's model needs no download", async () => {
  const { actions } = renderPane("voice");
  expect(document.getElementById("tts-model-card")).toHaveTextContent("Ready");
  expect(options("tts-voice").map((option) => option.value)).toEqual(["", "ef_dora"]);
  await act(async () => { fireEvent.click(document.getElementById("tts-try")!); });
  expect(actions.tryVoiceSettings).toHaveBeenCalledWith("tts", expect.objectContaining({ keep: false }));
  cleanup();
  renderPane("voice", { voiceSettings: { ...defaultVoiceSettings(), stt: { catalog: "elevenlabs", model: "scribe_v2", language: null } } });
  expect(document.getElementById("stt-model-card")).toHaveTextContent("No download needed");
  expect(document.getElementById("stt-language")).toBeInTheDocument();
});

/** A try that runs until the test ends it, and what the pane asked it to tell as it goes. */
function pendingTry(actions: { tryVoiceSettings: ReturnType<typeof vi.fn> }) {
  const running: { told: TrialProgress; finish(result: unknown): void } = { told: {}, finish: () => {} };
  actions.tryVoiceSettings.mockImplementation((_task: string, options: TrialProgress) => {
    running.told = options;
    return new Promise((resolve) => { running.finish = resolve; });
  });
  return running;
}

/** What was heard, taller than its two lines where it is drawn (jsdom draws nothing: its drawn height is 0). */
function overflowing() {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get(this: HTMLElement) { return this.tagName === "BLOCKQUOTE" ? 96 : 0; } });
  return () => { delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight; };
}

test("try-result card: a try is all in the model's block — getting ready, listening with the level, what was heard quoted with See all, how quick, again", async () => {
  const { actions } = renderPane("voice");
  const card = document.getElementById("stt-model-card")!;
  const running = pendingTry(actions);
  await act(async () => { fireEvent.click(document.getElementById("stt-try")!); });
  expect(actions.tryVoiceSettings).toHaveBeenCalledWith("stt", expect.objectContaining({ keep: false }));
  expect(card).toHaveTextContent("Getting ready…");
  expect(document.getElementById("stt-try")).toHaveTextContent("Stop");
  act(() => running.told.onListening!());
  expect(card).toHaveTextContent("Listening… say a short sentence");
  expect(card.querySelector(".voice-wave canvas")).toBeInTheDocument();
  // Longer than its two lines where it is drawn: the rest a See all away.
  const long = "una frase bastante larga para la prueba ".repeat(6).trim();
  const restore = overflowing();
  await act(async () => { running.finish({ text: long, timings: { ready_ms: 900, audio_ms: 1800, endpoint_silence_ms: 600, recognition_ms: 420 } }); });
  restore();
  expect(card.querySelector("blockquote#stt-heard")).toHaveTextContent(long);
  expect(card.querySelector("#stt-timing")).toHaveTextContent("Transcribed in 0.4 s");
  expect(document.getElementById("stt-try")).toHaveTextContent("Speak again");
  // See all opens the Popover with the whole of it (opened here, a Radix popover stalls jsdom for the tests after it).
  expect(document.getElementById("stt-heard-all")).toHaveAttribute("aria-haspopup", "dialog");
  expect(document.getElementById("stt-heard-all")).toHaveAttribute("aria-expanded", "false");
});

test("try-result card: a try that failed says why in the model's block, and offers it again", async () => {
  const { actions } = renderPane("voice");
  actions.tryVoiceSettings.mockRejectedValueOnce(Object.assign(new Error("Nothing was heard in time."), { code: "trial-silence" }));
  await act(async () => { fireEvent.click(document.getElementById("stt-try")!); });
  expect(within(document.getElementById("stt-model-card")!).getByRole("alert")).toHaveTextContent("Nothing was heard in time.");
  expect(document.getElementById("stt-try")).toHaveTextContent("Speak again");
});

test("try-result dialog: the try opens its own dialog — the sentence lit as it is heard, how quick, again or Done; the block keeps one line", async () => {
  localStorage.setItem("sidevoice.variants", JSON.stringify({ "try-result": "dialog" }));
  const { actions } = renderPane("voice");
  const running = pendingTry(actions);
  await act(async () => { fireEvent.click(document.getElementById("tts-try")!); });
  expect(actions.tryVoiceSettings).toHaveBeenCalledWith("tts", expect.objectContaining({ text: "Hi! This is how Sidevoice will read your agent's replies.", keep: false }));
  const dialog = document.getElementById("tts-try-dialog")!;
  expect(dialog).toHaveAttribute("open");
  expect(dialog).toHaveTextContent("Try the voice");
  act(() => { running.told.onProgress!({ from: 0, to: 0 }); running.told.onProgress!({ from: 4, to: 4 }); });
  expect(dialog).toHaveTextContent("Playing…");
  expect(dialog.querySelector(".model-try-said")).toHaveTextContent(/^Hi!$/);
  expect(dialog.querySelector(".model-try-unsaid")).toHaveTextContent(/^This is how/);
  await act(async () => { running.finish({ timings: { ready_ms: 600, first_sound_ms: 320 } }); });
  expect(dialog.querySelector("#tts-timing")).toHaveTextContent("Starts speaking in 0.3 s");
  expect(dialog.querySelector(".model-try-sentence")).toHaveAttribute("data-done");
  expect(document.getElementById("tts-try-repeat")).toHaveTextContent("Listen again");
  fireEvent.click(document.getElementById("tts-try-done")!);
  expect(dialog).not.toHaveAttribute("open");
  expect(document.getElementById("tts-timing")).toBeNull();
  expect(document.querySelector("#tts-model-card .model-try-summary")).toHaveTextContent("Starts speaking in 0.3 s");
  // Closed while it runs, the try stops.
  pendingTry(actions);
  await act(async () => { fireEvent.click(document.getElementById("tts-try")!); });
  expect(dialog).toHaveAttribute("open");
  fireEvent.click(document.getElementById("tts-try-stop")!);
  expect(actions.cancelVoiceTry).toHaveBeenCalled();
  expect(dialog).not.toHaveAttribute("open");
});

test("how a model runs folds under it: each build with what it runs on and its sizes, Automatic the engine's own", () => {
  const { actions } = renderPane("voice");
  const toggle = document.querySelector("#stt-model-card ~ .model-runtime .model-runtime-toggle") as HTMLButtonElement;
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  const options = [...document.querySelectorAll(".model-runtime-option")].slice(0, 2);
  expect(options[0]).toHaveTextContent("Automatic (recommended)");
  expect(options[0].querySelector("input")).toBeChecked();
  expect(options[1]).toHaveTextContent("Sherpa-ONNX · int8 · processor");
  fireEvent.click(options[1].querySelector("input")!);
  expect(actions.editVoice).toHaveBeenCalledWith({ stt: { build: "whisper-base/int8" } });
});

test("catalogues read again after a download keep the pane as it is: nothing empties and redraws under the person", () => {
  const { store } = renderPane("voice");
  const card = document.getElementById("stt-model-card");
  act(() => store.patch({ voiceCatalogue: { state: "loading", catalogs, error: "" } }));
  expect(document.getElementById("stt-model-card")).toBe(card);
  expect(screen.queryByText("Loading the call's voice settings…")).toBeNull();
});

test("the smart end of turn has its model chosen like the others — just the models — and made ready in the same block", () => {
  const withTurn = catalogs.map((catalog) => catalog.id === "local" ? { ...catalog, models: [...catalog.models,
    local("smart-turn-v3.2", "smart-turn", ["end-of-turn"], { installed: false, recommendedBuild: "smart-turn-v3.2/int8", builds: [build("smart-turn-v3.2/int8", { downloadBytes: 9e6, installed: false })] })] } : catalog) as CatalogView[];
  const { actions } = renderPane("voice", { voiceCatalogue: { state: "ready", catalogs: withTurn, error: "" } });
  expect(options("voice-end-of-turn")[0]).toHaveTextContent("Smart");
  expect(options("turn-model").map((option) => option.value)).toEqual(["smart-turn-v3.2"]);
  expect(document.getElementById("turn-model-card")).toHaveTextContent(/Not downloaded\s*9 MB/);
  fireEvent.click(document.getElementById("turn-model-download")!);
  expect(actions.installVoiceModel).toHaveBeenCalledWith("end-of-turn");
});

test("a provider chosen without its key asks for it right there, and saves it where Providers keeps it", async () => {
  const { actions } = renderPane("voice", { voiceSettings: { ...defaultVoiceSettings(), stt: { catalog: "openai", model: "", language: null } } });
  const key = document.getElementById("provider-key-openai") as HTMLInputElement;
  expect(key).toBeInTheDocument();
  fireEvent.change(key, { target: { value: "sk-test-1234" } });
  await act(async () => { fireEvent.click(document.getElementById("provider-key-save-openai")!); });
  expect(actions.saveProviderKey).toHaveBeenCalledWith("openai", "sk-test-1234");
});
