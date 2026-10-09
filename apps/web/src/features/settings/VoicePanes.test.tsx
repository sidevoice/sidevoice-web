import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VoiceSettings } from "./VoiceSettings";
import { ProviderKeys } from "./ProviderKeys";
import { createRoomStore, installRoomBridge, RoomStoreContext } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import type { SidevoiceActions } from "../../state/room-types";

afterEach(cleanup);

const build = (id: string, extra: Record<string, unknown> = {}) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 1e6, memoryMb: 1, available: true, reasons: [], installed: true, ...extra });
const entry = { family: "test", parametersM: 1, license: "MIT" };
const models = [
  { ...entry, id: "whisper-base", capabilities: ["stt"], languages: ["es"], voices: [], installed: true, builds: [build("whisper-base/int8")] },
  { ...entry, id: "kokoro-82m-v1.0", capabilities: ["tts"], languages: ["es"], voices: [{ id: "ef_dora", languages: ["es"] }], installed: true, builds: [build("kokoro/int8")] },
  { ...entry, id: "gpt-4o-transcribe", capabilities: ["stt"], languages: [], voices: [], installed: false, builds: [build("gpt-4o-transcribe/openai", { backend: "openai", accelerator: "remote" })] },
];

function renderPane(pane: "voice" | "keys", facts: Record<string, unknown> = {}) {
  const store = createRoomStore();
  store.patch({ voiceSettings: defaultVoiceSettings("es"), voiceCatalogue: { state: "ready", models, error: "" }, providerKeys: { openai: false, elevenlabs: true }, ...facts });
  installRoomBridge(store);
  const actions = { editVoice: vi.fn(), saveProviderKey: vi.fn().mockResolvedValue(undefined), loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined) };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
  render(<RoomStoreContext.Provider value={store}>{pane === "voice" ? <VoiceSettings /> : <ProviderKeys />}</RoomStoreContext.Provider>);
  for (const section of document.querySelectorAll("section")) section.hidden = false;
  return { store, actions };
}

test("the voice pane lists the catalogue's choices and says why smart-turn and a keyless provider cannot be chosen", () => {
  const { actions } = renderPane("voice");
  const stt = document.getElementById("stt-model") as HTMLSelectElement;
  expect([...stt.options].map((option) => [option.value, option.disabled])).toEqual([["whisper-base", false], ["gpt-4o-transcribe", true]]);
  expect(stt.options[1].textContent).toMatch(/Falta la clave de OpenAI/);
  const end = document.getElementById("voice-end-of-turn") as HTMLSelectElement;
  expect(end.options[1].disabled).toBe(true);
  expect(document.getElementById("end-of-turn-note")).toHaveTextContent("Aún no hay un modelo de fin de turno");
  fireEvent.change(document.getElementById("tts-voice")!, { target: { value: "ef_dora" } });
  expect(actions.editVoice).toHaveBeenCalledWith({ tts: { voice: "ef_dora" } });
  expect(screen.getByText(/reinicia la voz un momento/)).toBeInTheDocument();
});

test("a catalogue the voice could not give says why and can be asked again", () => {
  const { actions } = renderPane("voice", { voiceCatalogue: { state: "failed", models: [], error: "La voz de la llamada aún no está disponible en esta versión de la página." } });
  expect(screen.getByRole("alert")).toHaveTextContent("aún no está disponible");
  expect(document.getElementById("stt-model")).toBeNull();
  fireEvent.click(document.getElementById("voice-catalogue-retry")!);
  expect(actions.loadVoiceCatalogue).toHaveBeenCalled();
});

test("in a browser the key pane warns where the key lives and to cap the spend; in the app it names the keychain", () => {
  renderPane("keys");
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/este navegador, sin cifrar/);
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/límite de gasto/);
  cleanup();
  renderPane("keys", { inApp: true });
  expect(document.getElementById("provider-keys-where")).toHaveTextContent(/llavero del sistema/);
});

test("a key is handed to the voice, the field is emptied, and a kept key can be removed", async () => {
  const { actions, store } = renderPane("keys");
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
});
