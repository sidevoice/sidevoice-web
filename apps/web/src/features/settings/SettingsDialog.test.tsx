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

test("the sections are General, Transcription, Voice, Providers, Machines and Advanced, one showing at a time", () => {
  open("whisper-base");
  expect([...document.querySelectorAll(".settings-nav button")].map((button) => button.textContent)).toEqual(["General", "Transcription", "Voice", "Providers", "Machines", "Advanced"]);
  expect(document.getElementById("pane-general")).not.toHaveAttribute("hidden");
  fireEvent.click(document.getElementById("settings-advanced")!);
  expect(document.getElementById("pane-general")).toHaveAttribute("hidden");
  expect(document.getElementById("pane-advanced")).not.toHaveAttribute("hidden");
  expect(document.getElementById("settings-advanced")).toHaveAttribute("aria-current", "page");
  expect(document.getElementById("voice-end-of-turn")).toBeInTheDocument();
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
