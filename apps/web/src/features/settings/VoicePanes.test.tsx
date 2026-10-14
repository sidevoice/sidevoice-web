import { TooltipProvider } from "../../components/ui/Tooltip";
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SlotPane, TurnChoices } from "./VoiceSettings";
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
  renderPane({ voiceSettings: withVoiceModel("piper-es"), voiceInstall: { task: "tts", model: "piper-es", state: "failed", fraction: null,
    error: "The model could not be downloaded. Check the connection and try again.", details: "download-failed" } });
  const alert = screen.getByRole("alert");
  expect(alert.querySelector(".ui-alert-body")).toHaveTextContent(/^The model could not be downloaded\. Check the connection and try again\.$/);
  // What the engine said is behind Details, closed.
  expect(alert.querySelector("details:not([open]) > pre")).toHaveTextContent("download-failed");
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

test("a try is all in its block — getting ready, listening with the level, what was heard quoted with See all, how quick, again", async () => {
  const { actions } = renderPane();
  const block = document.getElementById("stt-try-block")!;
  const running = pendingTry(actions);
  await act(async () => { fireEvent.click(document.getElementById("stt-try")!); });
  expect(actions.tryVoiceSettings).toHaveBeenCalledWith("stt", expect.objectContaining({ keep: false }));
  expect(block).toHaveTextContent("Getting ready…");
  expect(document.getElementById("stt-try")).toHaveTextContent("Stop");
  act(() => running.told.onListening!());
  expect(block).toHaveTextContent("Listening… say a short sentence");
  expect(block.querySelector(".voice-wave canvas")).toBeInTheDocument();
  // The take's bar fills to its longest (10 s) while it listens.
  expect(block.querySelector(".model-try-take")).toHaveStyle({ animationDuration: "10000ms" });
  expect(block.querySelector(".model-try-take")).toHaveAccessibleName("Records up to 10 s");
  // Longer than its two lines where it is drawn: the rest a See all away.
  const long = "una frase bastante larga para la prueba ".repeat(6).trim();
  const restore = overflowing();
  await act(async () => { running.finish({ text: long, timings: { ready_ms: 900, recognition_ms: 420 } }); });
  restore();
  expect(block.querySelector(".model-try-take")).toBeNull();
  expect(block.querySelector("blockquote#stt-heard")).toHaveTextContent(long);
  // One line, its own time only: a model already there (under 1 s to be ready) is not said.
  expect(block.querySelector("#stt-timing")).toHaveTextContent(/^Transcribed in 0\.4 s$/);
  expect(document.getElementById("stt-try")).toHaveTextContent("Speak again");
  // See all opens the Popover with the whole of it (opened here, a Radix popover stalls jsdom for the tests after it).
  expect(document.getElementById("stt-heard-all")).toHaveAttribute("aria-haspopup", "dialog");
  expect(document.getElementById("stt-heard-all")).toHaveAttribute("aria-expanded", "false");
});

test("Stop ends the take on screen at once: Transcribing… where Listening… was, the take's bar stopped, until what was heard", async () => {
  const { actions } = renderPane();
  window.sidevoiceActions!.finishVoiceTry = vi.fn();
  const block = document.getElementById("stt-try-block")!;
  const area = () => block.querySelector(".stt-try-area")!;
  const running = pendingTry(actions);
  await act(async () => { fireEvent.click(document.getElementById("stt-try")!); });
  act(() => running.told.onListening!());
  expect(area().querySelector(".model-try-take")).not.toHaveAttribute("data-ended");
  fireEvent.click(document.getElementById("stt-try")!);
  expect(window.sidevoiceActions!.finishVoiceTry).toHaveBeenCalled();
  // The voice says the take has ended and what was said is being transcribed.
  act(() => running.told.onTranscribing!(true));
  expect(area()).toHaveTextContent("Transcribing…");
  expect(area()).not.toHaveTextContent("Listening…");
  expect(area().querySelector(".model-try-take")).toHaveAttribute("data-ended");
  await act(async () => { running.finish({ text: "hasta aquí", timings: { ready_ms: 900, recognition_ms: 300 } }); });
  expect(area()).not.toHaveTextContent("Transcribing…");
  expect(area().querySelector("#stt-heard")).toHaveTextContent("hasta aquí");
  // A turn that came to nothing: listening again, the bar going on.
  await act(async () => { fireEvent.click(document.getElementById("stt-try")!); });
  act(() => running.told.onListening!());
  act(() => running.told.onTranscribing!(true));
  act(() => running.told.onTranscribing!(false));
  expect(area()).toHaveTextContent("Listening…");
  expect(area().querySelector(".model-try-take")).not.toHaveAttribute("data-ended");
});

test("the transcription try is one steady layout: the button and the level first, then listening or what was heard in one area", async () => {
  const { actions } = renderPane();
  const block = document.getElementById("stt-try-block")!;
  const head = () => block.querySelector(".stt-try-head")!;
  const area = () => block.querySelector(".stt-try-area")!;
  // Before any try: the button beside the level, in the first row; no row of its own.
  expect(head()).toContainElement(document.getElementById("stt-try"));
  expect(head().querySelector(".voice-wave canvas")).toBeInTheDocument();
  expect(block.querySelector(".turn-try-main")).toBeNull();
  expect(area()).toHaveAttribute("aria-live", "polite");
  expect(block.querySelector(".model-try-take")).toBeNull();
  const running = pendingTry(actions);
  await act(async () => { fireEvent.click(document.getElementById("stt-try")!); });
  expect(area()).toHaveTextContent("Getting ready…");
  expect(head().querySelector(".voice-wave canvas")).toBeInTheDocument();
  // Listening: what to do and the take's bar, in the area; the level still in the first row, with the button (Stop).
  act(() => running.told.onListening!());
  expect(area()).toHaveTextContent("Listening…");
  expect(area().querySelector(".model-try-take")).toBeInTheDocument();
  expect(head().querySelector(".voice-wave canvas")).toBeInTheDocument();
  expect(head()).toContainElement(document.getElementById("stt-try"));
  expect(document.getElementById("stt-try")).toHaveTextContent("Stop");
  const shown = area();
  // Done: the same area holds what was heard and how quick, and no take bar.
  await act(async () => { running.finish({ text: "hola", timings: { ready_ms: 900, recognition_ms: 420 } }); });
  expect(area()).toBe(shown);
  expect(area().querySelector("#stt-heard")).toHaveTextContent("hola");
  expect(area().querySelector("#stt-timing")).toHaveTextContent("Transcribed in 0.4 s");
  expect(area()).not.toHaveTextContent("Listening…");
  expect(block.querySelector(".model-try-take")).toBeNull();
  expect(head().querySelector(".voice-wave canvas")).toBeInTheDocument();
  expect(head()).toContainElement(document.getElementById("stt-try"));
  expect(document.getElementById("stt-try")).toHaveTextContent("Speak again");
  // A failure with no words here: the generic line, never what it said, which is behind Details.
  actions.tryVoiceSettings.mockRejectedValueOnce(Object.assign(new Error("format model whisper-q5 unsupported"), { code: "wasm-trap" }));
  await act(async () => { fireEvent.click(document.getElementById("stt-try")!); });
  const failed = within(document.getElementById("stt-try-block")!).getByRole("alert");
  expect(failed.querySelector("p")).toHaveTextContent(/^Something went wrong with the try\.$/);
  expect(failed.querySelector("details > pre")!.textContent).toBe("wasm-trap\nformat model whisper-q5 unsupported");
});

test("the model's load is said after the try's time only when it had to load (from 1 s), on its line", async () => {
  const { actions } = renderPane();
  const running = pendingTry(actions);
  await act(async () => { fireEvent.click(document.getElementById("stt-try")!); });
  await act(async () => { running.finish({ text: "hola", timings: { ready_ms: 1000, recognition_ms: 420 } }); });
  expect(document.querySelector("#stt-timing")).toHaveTextContent(/^Transcribed in 0\.4 s \(model loaded in 1\.0 s\)$/);
  const again = pendingTry(actions);
  await act(async () => { fireEvent.click(document.getElementById("stt-try")!); });
  await act(async () => { again.finish({ text: "hola", timings: { ready_ms: 999, recognition_ms: 420 } }); });
  expect(document.querySelector("#stt-timing")).toHaveTextContent(/^Transcribed in 0\.4 s$/);
  expect(document.querySelector("#stt-timing .ui-infotip")).toBeNull();
});

test("the voice's try is laid out as the transcription's: the button and the level first, the sentence shown and editable before any try", () => {
  renderPane();
  const block = document.getElementById("tts-try-block")!;
  const head = block.querySelector(".stt-try-head")!;
  expect(head).toContainElement(document.getElementById("tts-try"));
  expect(head.querySelector(".voice-wave canvas")).toBeInTheDocument();
  expect(block.querySelector(".turn-try-main")).toBeNull();
  expect(block.querySelector(".stt-try-area.tts-try-area .model-try-live")).toHaveAttribute("aria-live", "polite");
  // The sentence, before any try: a quote; a click on it, or its pencil, makes it a box to edit.
  const said = block.querySelector("button.tts-try-said")!;
  expect(said).toHaveTextContent(/^Hi! This is how Sidevoice will read your agent's replies\.$/);
  expect(block.querySelector("#tts-sentence")).toBeNull();
  fireEvent.click(said);
  expect(block.querySelector("#tts-sentence")).toHaveValue("Hi! This is how Sidevoice will read your agent's replies.");
  fireEvent.blur(block.querySelector("#tts-sentence")!);
  expect(block.querySelector("#tts-sentence")).toBeNull();
  fireEvent.click(block.querySelector(".tts-try-sentence > button.ui-button")!);
  expect(block.querySelector("#tts-sentence")).toBeInTheDocument();
});

test("the voice's try: Play says the sentence edited, lit while it speaks; then how quick under it, the bars still there, and Play again", async () => {
  const { actions } = renderPane();
  const block = document.getElementById("tts-try-block")!;
  const head = () => block.querySelector(".stt-try-head")!;
  const area = () => block.querySelector(".tts-try-area")!;
  fireEvent.click(block.querySelector("button.tts-try-said")!);
  fireEvent.change(block.querySelector("#tts-sentence")!, { target: { value: "Otra frase." } });
  const running = pendingTry(actions);
  await act(async () => { fireEvent.click(document.getElementById("tts-try")!); });
  expect(actions.tryVoiceSettings).toHaveBeenLastCalledWith("tts", expect.objectContaining({ text: "Otra frase." }));
  // Getting ready, under the sentence; the button is Stop, beside the bars.
  expect(area().querySelector(".model-try-live")).toHaveTextContent("Getting ready…");
  expect(document.getElementById("tts-try")).toHaveTextContent("Stop");
  expect(head()).toContainElement(document.getElementById("tts-try"));
  expect(head().querySelector(".voice-wave canvas")).toBeInTheDocument();
  // Speaking: the sentence lit as heard, not editable.
  act(() => { running.told.onProgress!({ from: 0, to: 0 }); running.told.onProgress!({ from: 4, to: 4 }); });
  expect(area().querySelector(".model-try-said")).toHaveTextContent(/^Otra$/);
  expect(block.querySelector("#tts-sentence, button.tts-try-said")).toBeNull();
  expect(within(block).queryByRole("button", { name: "Edit the sentence" })).toBeNull();
  expect(head().querySelector(".voice-wave canvas")).toBeInTheDocument();
  expect(area()).not.toHaveTextContent("Getting ready…");
  await act(async () => { running.finish({ timings: { ready_ms: 300, first_sound_ms: 250 } }); });
  // Done: the sentence in full, how quick under it; the bars and the button where they were, now Play again.
  expect(area().querySelector(".tts-try-sentence")).toHaveTextContent(/^Otra frase\.$/);
  expect(area().querySelector(".tts-try-sentence + .model-try-live #tts-timing")).toHaveTextContent(/^First sound in 0\.3 s$/);
  expect(head().querySelector(".voice-wave canvas")).toBeInTheDocument();
  expect(head()).toContainElement(document.getElementById("tts-try"));
  expect(document.getElementById("tts-try")).toHaveTextContent(/^Play again$/);
  // Stop, while it speaks, stops it.
  pendingTry(actions);
  await act(async () => { fireEvent.click(document.getElementById("tts-try")!); });
  fireEvent.click(document.getElementById("tts-try")!);
  expect(actions.cancelVoiceTry).toHaveBeenCalled();
});

test("a try that failed says why in its block, and offers it again", async () => {
  const { actions } = renderPane();
  actions.tryVoiceSettings.mockRejectedValueOnce(Object.assign(new Error("Nothing was heard in time."), { code: "trial-silence" }));
  await act(async () => { fireEvent.click(document.getElementById("stt-try")!); });
  expect(within(document.getElementById("stt-try-block")!).getByRole("alert")).toHaveTextContent("Nothing was heard in time.");
  expect(document.getElementById("stt-try")).toHaveTextContent("Speak again");
});


test("a transcription try that stopped shows its take in its try block, after the result and outside what is read out as it comes; stopped by the person, it goes", async () => {
  const { actions } = renderPane();
  const block = document.getElementById("stt-try-block")!;
  const take = { sampleRate: 16000, samples: new Float32Array(32000), started_at: 0, ended_at: 2000, turns: [{ turn_id: "t1", speech_ms: 300, pauses: [], end_ms: 1700 }] };
  let running = pendingTry(actions);
  await act(async () => { fireEvent.click(document.getElementById("stt-try")!); });
  act(() => running.told.onListening!());
  act(() => running.told.onTake!(take));
  expect(block.querySelector("#stt-take")).toBeNull();
  await act(async () => { running.finish({ text: "hola", timings: { ready_ms: 900, audio_ms: 1200, endpoint_silence_ms: 500, recognition_ms: 300 } }); });
  const shown = block.querySelector("#stt-take")!;
  expect(shown).toHaveTextContent("2.0 s recorded");
  expect(shown).toHaveTextContent("speech starts at 0.3 s");
  expect(shown).toHaveTextContent("turn ends at 1.7 s");
  expect(shown.closest("[aria-live]")).toBeNull();
  // After what was heard, and not in the model's card (the try moved out of it, into the try block).
  expect(block.querySelector("#stt-heard")!.compareDocumentPosition(shown) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(document.getElementById("stt-model-card")!.querySelector("#stt-take")).toBeNull();
  // The voice's own try records no one: no take.
  expect(document.getElementById("tts-take")).toBeNull();
  // Again, and stopped: the try is put away with its take.
  running = pendingTry(actions);
  await act(async () => { fireEvent.click(document.getElementById("stt-try")!); });
  expect(block.querySelector("#stt-take")).toBeNull();
  act(() => running.told.onTake!(take));
  await act(async () => { running.finish(Promise.reject(Object.assign(new Error("The try was stopped."), { code: "trial-cancelled" }))); });
  expect(block.querySelector("#stt-take")).toBeNull();
});

test("how a model runs folds under it: each build with what it runs on and its sizes, Automatic the engine's own", () => {
  const { actions } = renderPane();
  const toggle = document.querySelector("#stt-model-card .model-runtime .model-runtime-toggle") as HTMLButtonElement;
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  // No (i) there: what this is is said inside, once open.
  expect(toggle.closest(".model-runtime")!.querySelector(".ui-infotip")).toBeNull();
  expect(document.querySelector(".model-runtime-info")).toBeNull();
  fireEvent.click(toggle);
  // Its first line, muted: what this is, and that most people can leave it.
  const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  expect(panel.firstElementChild).toHaveClass("model-runtime-info");
  expect(panel.firstElementChild).toHaveTextContent(/^Which engine and format run this model on your device/);
  const options = [...document.querySelectorAll(".model-runtime-option")].slice(0, 2);
  expect(options[0]).toHaveTextContent("Automatic (recommended)");
  expect(options[0].querySelector("input")).toBeChecked();
  expect(options[1]).toHaveTextContent("Sherpa-ONNX · int8 · processor");
  fireEvent.click(options[1].querySelector("input")!);
  expect(actions.editVoice).toHaveBeenCalledWith({ stt: { build: "whisper-base/int8" } });
});

test("in the model's card, how it runs comes after the model is chosen and before its download", () => {
  renderPane({ voiceSettings: withVoiceModel("piper-es") });
  for (const task of ["stt", "tts"]) {
    const card = document.getElementById(task + "-model-card")!;
    const parts = [...card.children].map((child) => child.className);
    const pickers = parts.indexOf("model-prepare-pickers"), runtime = parts.indexOf("model-runtime"), status = parts.indexOf("model-prepare-status");
    expect(pickers).toBeGreaterThanOrEqual(0);
    expect(runtime).toBeGreaterThan(pickers);
    expect(status).toBeGreaterThan(runtime);
  }
});

const follows = (later: Element, earlier: Element) => Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);

test("every try is last, in its own block after the slot's settings, outside the model's card", () => {
  renderPane();
  const stt = document.getElementById("stt-try-block")!;
  expect(stt).toHaveClass("turn-try", "turn-try-card");
  expect(stt.closest(".ui-row")).toHaveTextContent(/^Try transcription/);
  expect(document.getElementById("stt-model-card")).not.toContainElement(stt);
  expect(stt).toContainElement(document.getElementById("stt-try"));
  expect(follows(stt, document.getElementById("stt-language")!.closest(".ui-row")!)).toBe(true);
  const tts = document.getElementById("tts-try-block")!;
  expect(tts).toHaveClass("turn-try", "turn-try-card");
  expect(tts.closest(".ui-row")).toHaveTextContent(/^Try the voice/);
  expect(document.getElementById("tts-model-card")).not.toContainElement(tts);
  expect(tts).toContainElement(document.getElementById("tts-try"));
  expect(follows(tts, document.getElementById("tts-voice")!.closest(".ui-row")!)).toBe(true);
  expect(follows(tts, document.getElementById("tts-speed")!.closest(".ui-row")!)).toBe(true);
});

test("a model not ready yet has no try", () => {
  renderPane({ voiceSettings: withVoiceModel("piper-es") });
  expect(document.getElementById("tts-try-block")).toBeNull();
  expect(document.getElementById("tts-try")).toBeNull();
  expect(document.getElementById("stt-try-block")).toBeInTheDocument();
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

test("a provider chosen without its key says so in a row with Connect, which opens the key's dialog as Providers does; kept, the row goes, the slot says so and its source has the focus", async () => {
  {
    const { actions, store } = renderPane({ voiceSettings: { ...defaultVoiceSettings(), stt: { catalog: "openai", model: "", language: null } } });
    // Kept where Providers keeps it: the host has the key, and OpenAI lists with it.
    actions.saveProviderKey.mockImplementation(async (provider: string) => store.patch({ providerKeys: { openai: true, elevenlabs: true },
      voiceCatalogue: { state: "ready", error: "", catalogs: catalogs.map((catalog) => catalog.id === provider ? { ...catalog, status: { stale: false } } : catalog) } }));
    const row = screen.getByText("OpenAI needs a key").closest(".ui-row") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Connect OpenAI" }));
    const field = within(screen.getByRole("dialog", { name: "Connect OpenAI" })).getByLabelText("API key");
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: "sk-test-1234" } });
    await act(async () => { fireEvent.keyDown(field, { key: "Enter" }); });
    expect(actions.saveProviderKey).toHaveBeenCalledWith("openai", "sk-test-1234");
    expect(screen.queryByText("OpenAI needs a key")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("OpenAI connected.")).toHaveAttribute("role", "status");
    expect(document.activeElement).toBe(document.getElementById("stt-source"));
  }
});

