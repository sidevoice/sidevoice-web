import { TooltipProvider } from "../../components/ui/Tooltip";
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SlotPane, TurnChoices } from "./VoiceSettings";
import { VARIANTS_KEY } from "../../lib/variants";
import { StorageBlockedBanner } from "./StorageBlockedBanner";
import { createRoomStore, installRoomBridge, RoomStoreContext, useRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import type { SidevoiceActions, TrialProgress } from "../../state/room-types";
import type { CatalogView } from "../../services/model-catalogs.js";
import { chooseOption, listOptions } from "../../test/select";

afterEach(() => { cleanup(); localStorage.removeItem("sidevoice.variants"); });

/** Settings' transcription, voice and advanced sections, as the voice is chosen in them. */
function VoicePanes() {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  return <><SlotPane task="stt" /><SlotPane task="tts" />{draft && <TurnChoices draft={draft} />}</>;
}

/* The voice panes, on the engine's catalogues (Providers' own: ProviderKeys.test); the interface speaks English here
 * (the test's system). */

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

function renderPane(facts: Record<string, unknown> = {}) {
  const store = createRoomStore();
  store.patch({ voiceSettings: defaultVoiceSettings(), voiceCatalogue: { state: "ready", catalogs, error: "" }, providerKeys: { openai: false, elevenlabs: true }, ...facts });
  installRoomBridge(store);
  const actions = { editVoice: vi.fn(), saveProviderKey: vi.fn().mockResolvedValue(undefined), loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined),
    installVoiceModel: vi.fn().mockResolvedValue(undefined), cancelVoiceInstall: vi.fn(), tryVoiceSettings: vi.fn().mockResolvedValue({}), cancelVoiceTry: vi.fn() };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
  render(<RoomStoreContext.Provider value={store}><TooltipProvider><VoicePanes /></TooltipProvider></RoomStoreContext.Provider>);
  for (const section of document.querySelectorAll("section")) section.hidden = false;
  return { store, actions };
}

test("a slot's source comes first: this device, then each provider; one without its key says so, and asks for it right there", () => {
  const { actions } = renderPane();
  expect(listOptions("stt-source").map((option) => [option.value, option.label, option.disabled, option.detail])).toEqual([
    ["local", "On this device", false, ""],
    ["elevenlabs", "ElevenLabs", false, ""],
    ["openai", "OpenAI", false, "needs your key"],
  ]);
  chooseOption("stt-source", "elevenlabs");
  expect(actions.editVoice).toHaveBeenCalledWith({ stt: { catalog: "elevenlabs" } });
});

test("then the source's models, this device's family first and then a model of it, one that does not run here disabled with why", () => {
  const { actions } = renderPane();
  expect(listOptions("stt-family").map((option) => [option.value, option.label])).toEqual([["whisper", "Whisper"], ["moonshine", "Moonshine"]]);
  expect(listOptions("stt-model").map((option) => option.value)).toEqual(["whisper-base", "whisper-large"]);
  chooseOption("stt-family", "moonshine");
  expect(actions.editVoice).toHaveBeenCalledWith({ stt: { model: "moonshine-tiny" } });
  const large = listOptions("stt-model").find((option) => option.value === "whisper-large")!;
  expect(large.disabled).toBe(true);
  expect([large.label, large.detail]).toEqual(["whisper-large", "does not run here: it does not fit in this device's memory"]);
});

test("the voice and the speed range are the model's; smart-turn says why it cannot be chosen; a change says it restarts the voice", () => {
  const { actions } = renderPane();
  const speed = document.getElementById("tts-speed") as HTMLInputElement;
  expect([speed.min, speed.max]).toEqual(["0.5", "2"]);
  chooseOption("tts-voice", "ef_dora");
  expect(actions.editVoice).toHaveBeenCalledWith({ tts: { voice: "ef_dora" } });
  expect(listOptions("voice-end-of-turn")[0].disabled).toBe(true);
  expect(screen.getByText(/No end-of-turn model runs on this device yet/)).toBeInTheDocument();
  cleanup();
  // A model that takes no speed has no slider.
  renderPane({ voiceSettings: { ...defaultVoiceSettings(), tts: { catalog: "local", model: "piper", voice: null, speed: 1 } } });
  expect(document.getElementById("tts-speed")).toBeNull();
});

test("catalogues the engine could not give say why and can be asked again", () => {
  const { actions } = renderPane({ voiceCatalogue: { state: "failed", catalogs: [], error: "The call's voice is not available yet." } });
  expect(screen.getAllByText(/not available yet/)).toHaveLength(2);
  expect(document.getElementById("stt-model")).toBeNull();
  fireEvent.click(document.getElementById("stt-catalogue-retry")!);
  expect(actions.loadVoiceCatalogue).toHaveBeenCalled();
});

test("a catalogue its storage was refused to says the browser blocks site data", () => {
  const blocked = catalogs.map((catalog) => catalog.id === "local" ? { ...catalog, status: { stale: false, reason: { code: "storage-blocked", params: {} } }, models: [] } : catalog) as CatalogView[];
  renderPane({ voiceCatalogue: { state: "ready", catalogs: blocked, error: "" } });
  const local = listOptions("stt-source")[0];
  expect(local.label).toBe("On this device");
  expect(local.detail).toMatch(/^This browser is blocking site data for this page/);
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
  const { actions } = renderPane({ voiceSettings: withVoiceModel("piper-es") });
  expect(document.getElementById("tts-model-card")).toHaveTextContent(/Not downloaded\s*63 MB/);
  expect(document.getElementById("tts-voice")).toBeNull();
  expect(document.getElementById("tts-try")).toBeNull();
  fireEvent.click(document.getElementById("tts-model-download")!);
  expect(actions.installVoiceModel).toHaveBeenCalledWith("tts");
});

test("while it downloads the card shows how far it has got, and the download can be cancelled", () => {
  const { actions } = renderPane({ voiceSettings: withVoiceModel("piper-es"),
    voiceInstall: { task: "tts", model: "piper-es", state: "running", fraction: 0.4, error: "" } });
  const card = document.getElementById("tts-model-card")!;
  expect(card).toHaveTextContent("Downloading… 40%");
  expect(card.querySelector("[role=progressbar]")).toHaveAttribute("aria-valuenow", "40");
  // While it downloads, the model cannot be changed under it.
  expect(document.getElementById("tts-model")).toBeDisabled();
  fireEvent.click(document.getElementById("tts-model-cancel")!);
  expect(actions.cancelVoiceInstall).toHaveBeenCalled();
  cleanup();
  renderPane({ voiceSettings: withVoiceModel("piper-es"), voiceInstall: { task: "tts", model: "piper-es", state: "failed", fraction: null, error: "The download failed." } });
  expect(screen.getByRole("alert")).toHaveTextContent("The download failed.");
});

test("once it is here its voices appear, and it can be tried without saving; a provider's model needs no download", async () => {
  const { actions } = renderPane();
  expect(document.getElementById("tts-model-card")).toHaveTextContent("Ready");
  expect(listOptions("tts-voice").map((option) => [option.value, option.label, option.detail])).toEqual([["", "Automatic (the model's own)", ""], ["ef_dora", "ef_dora", "Spanish"]]);
  await act(async () => { fireEvent.click(document.getElementById("tts-try")!); });
  expect(actions.tryVoiceSettings).toHaveBeenCalledWith("tts", expect.objectContaining({ keep: false }));
  cleanup();
  renderPane({ voiceSettings: { ...defaultVoiceSettings(), stt: { catalog: "elevenlabs", model: "scribe_v2", language: null } } });
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
  const { actions } = renderPane();
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
  const { actions } = renderPane();
  actions.tryVoiceSettings.mockRejectedValueOnce(Object.assign(new Error("Nothing was heard in time."), { code: "trial-silence" }));
  await act(async () => { fireEvent.click(document.getElementById("stt-try")!); });
  expect(within(document.getElementById("stt-model-card")!).getByRole("alert")).toHaveTextContent("Nothing was heard in time.");
  expect(document.getElementById("stt-try")).toHaveTextContent("Speak again");
});

test("try-result dialog: the try opens its own dialog — the sentence lit as it is heard, how quick, again or Done; the block keeps one line", async () => {
  localStorage.setItem("sidevoice.variants", JSON.stringify({ "try-result": "dialog" }));
  const { actions } = renderPane();
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
  const { actions } = renderPane();
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
  const { store } = renderPane();
  const card = document.getElementById("stt-model-card");
  act(() => store.patch({ voiceCatalogue: { state: "loading", catalogs, error: "" } }));
  expect(document.getElementById("stt-model-card")).toBe(card);
  expect(screen.queryByText("Loading the call's voice settings…")).toBeNull();
});

test("the smart end of turn has its model chosen like the others — just the models — and made ready in the same block", () => {
  const withTurn = catalogs.map((catalog) => catalog.id === "local" ? { ...catalog, models: [...catalog.models,
    local("smart-turn-v3.2", "smart-turn", ["end-of-turn"], { installed: false, recommendedBuild: "smart-turn-v3.2/int8", builds: [build("smart-turn-v3.2/int8", { downloadBytes: 9e6, installed: false })] })] } : catalog) as CatalogView[];
  const { actions } = renderPane({ voiceCatalogue: { state: "ready", catalogs: withTurn, error: "" } });
  expect(listOptions("voice-end-of-turn")[0].label).toMatch(/^Smart/);
  expect(listOptions("turn-model").map((option) => option.value)).toEqual(["smart-turn-v3.2"]);
  expect(document.getElementById("turn-model-card")).toHaveTextContent(/Not downloaded\s*9 MB/);
  fireEvent.click(document.getElementById("turn-model-download")!);
  expect(actions.installVoiceModel).toHaveBeenCalledWith("end-of-turn");
});

test.each(["dialog", "row", "popover"] as const)("%s: a provider chosen without its key says so in a row with Connect, which opens the key's entry as Providers does; kept, the row goes, the slot says so and its source has the focus", async (variant) => {
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "provider-connect": variant }));
  try {
    const { actions, store } = renderPane({ voiceSettings: { ...defaultVoiceSettings(), stt: { catalog: "openai", model: "", language: null } } });
    // Kept where Providers keeps it: the host has the key, and OpenAI lists with it.
    actions.saveProviderKey.mockImplementation(async (provider: string) => store.patch({ providerKeys: { openai: true, elevenlabs: true },
      voiceCatalogue: { state: "ready", error: "", catalogs: catalogs.map((catalog) => catalog.id === provider ? { ...catalog, status: { stale: false } } : catalog) } }));
    const row = screen.getByText("OpenAI needs a key").closest(".ui-row") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Connect OpenAI" }));
    const field = variant === "row" ? within(row).getByLabelText("OpenAI API key") : within(screen.getByRole("dialog", { name: "Connect OpenAI" })).getByLabelText("API key");
    if (variant !== "row") expect(screen.getByRole("dialog")).toHaveClass(variant === "popover" ? "ui-popover" : "ui-dialog");
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: "sk-test-1234" } });
    await act(async () => { fireEvent.keyDown(field, { key: "Enter" }); });
    expect(actions.saveProviderKey).toHaveBeenCalledWith("openai", "sk-test-1234");
    expect(screen.queryByText("OpenAI needs a key")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("OpenAI connected.")).toHaveAttribute("role", "status");
    expect(document.activeElement).toBe(document.getElementById("stt-source"));
  } finally { localStorage.removeItem(VARIANTS_KEY); }
});

