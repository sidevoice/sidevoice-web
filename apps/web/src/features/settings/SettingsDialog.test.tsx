import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import type { CatalogView } from "../../services/model-catalogs.js";
import type { SidevoiceActions } from "../../state/room-types";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(cleanup);

/* Settings as a screen of sections: the store says which one shows, and Save waits while a chosen model is not ready. */

const build = (id: string, installed: boolean) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 63e6, memoryMb: 1, available: true, reasons: [], installed });
const model = (id: string, family: string, task: string, installed = true) =>
  ({ id, family, capabilities: [task], parametersM: 1, license: "MIT", languages: ["es"], voices: [], installed, builds: [build(id + "/int8", installed)], recommendedBuild: id + "/int8" });
const catalogs = [{ id: "local", name: null, status: { stale: false }, models: [
  model("whisper-base", "whisper", "stt"), model("whisper-small", "whisper", "stt", false), model("kokoro-82m-v1.0", "kokoro", "tts"),
] }] as unknown as CatalogView[];

function open(draftModel: string) {
  const store = createRoomStore();
  const settings = defaultVoiceSettings();
  act(() => store.patch({ voiceSettings: settings, voiceDraft: { ...settings, stt: { ...settings.stt, model: draftModel } },
    voiceCatalogue: { state: "ready", catalogs, error: "" }, settingsSection: "general" }));
  window.sidevoiceActions = { editVoice: vi.fn(), installVoiceModel: vi.fn(), loadVoiceCatalogue: vi.fn() } as unknown as SidevoiceActions;
  render(<RoomProvider store={store}><SettingsDialog /></RoomProvider>);
  // The runtime opens it (showModal); here it is simply open.
  document.getElementById("language-settings")!.setAttribute("open", "");
  return store;
}

test("the sections are General, Transcription, Voice, Call, Providers, Machines and Advanced, one showing at a time", () => {
  open("whisper-base");
  expect([...document.querySelectorAll(".settings-nav button")].map((button) => button.textContent)).toEqual(["General", "Transcription", "Voice", "Call", "Providers", "Machines", "Advanced"]);
  expect(document.getElementById("pane-general")).not.toHaveAttribute("hidden");
  fireEvent.click(document.getElementById("settings-advanced")!);
  expect(document.getElementById("pane-general")).toHaveAttribute("hidden");
  expect(document.getElementById("pane-advanced")).not.toHaveAttribute("hidden");
  expect(document.getElementById("settings-advanced")).toHaveAttribute("aria-current", "page");
  expect(document.getElementById("voice-idle-unload")).toBeInTheDocument();
  expect(document.getElementById("reset-settings")).toBeInTheDocument();
  fireEvent.click(document.getElementById("settings-call")!);
  expect(document.getElementById("voice-end-of-turn")).toBeInTheDocument();
  expect(screen.getByRole("radiogroup", { name: "Thinking sound" })).toBeInTheDocument();
});

test("Save waits while the chosen model is not on this device, says why, and takes the person to it", () => {
  const store = open("whisper-small");
  const save = screen.getByRole("button", { name: "Save changes" });
  expect(save).toHaveAttribute("aria-disabled", "true");
  expect(save).toHaveAccessibleDescription("The transcription model isn't ready yet.");
  fireEvent.click(save);
  expect(store.getState().facts.settingsSection).toBe("transcription");
});

test("Save is free once every chosen model is ready", () => {
  open("whisper-base");
  const save = screen.getByRole("button", { name: "Save changes" });
  expect(save).not.toHaveAttribute("aria-disabled");
  expect(save).not.toBeDisabled();
});

test("the thinking sound and the screen are this device's, applied at once", () => {
  localStorage.removeItem("sidevoice.call-preferences");
  open("whisper-base");
  fireEvent.click(document.getElementById("settings-call")!);
  expect(screen.getByRole("radio", { name: "Screen off" })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("radio", { name: "Always" }));
  expect(JSON.parse(localStorage.getItem("sidevoice.call-preferences")!).presence).toBe("always");
  localStorage.removeItem("sidevoice.call-preferences");
});

test("Advanced lists the models on this device with their size; Delete asks, says what uses one, and takes it off", async () => {
  const store = open("whisper-base");
  act(() => store.patch({ modelsRemovable: true }));
  const uninstall = vi.fn(async () => {});
  window.sidevoiceActions = { ...window.sidevoiceActions, uninstallVoiceModel: uninstall } as unknown as SidevoiceActions;
  fireEvent.click(document.getElementById("settings-advanced")!);
  const rows = [...document.querySelectorAll("#downloaded-models .downloaded-model")];
  expect(rows.map((row) => row.getAttribute("data-model"))).toEqual(["whisper-base", "kokoro-82m-v1.0"]);
  expect(rows[0]).toHaveTextContent("63 MB");
  fireEvent.click(screen.getByRole("button", { name: "Delete whisper-base from this device" }));
  expect(screen.getByRole("group", { name: "Delete whisper-base from this device" })).toHaveTextContent("Transcription use whisper-base.");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete" })));
  expect(uninstall).toHaveBeenCalledWith("whisper-base");
});

test("where the engine can't delete models, they are listed without Delete, and it says so", () => {
  open("whisper-base");
  fireEvent.click(document.getElementById("settings-advanced")!);
  expect(document.querySelectorAll("#downloaded-models .downloaded-model")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
  expect(document.getElementById("pane-advanced")).toHaveTextContent("This version of the app can't delete them yet.");
});
