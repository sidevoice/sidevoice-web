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
  expect([...document.querySelectorAll(".settings-nav > button")].map((button) => button.textContent)).toEqual(["General", "Transcription", "Voice", "Call", "Providers", "Machines", "Advanced"]);
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

test("no Save: a model chosen that is not here says the one in use stays until it is ready", () => {
  open("whisper-small");
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  fireEvent.click(document.getElementById("settings-transcription")!);
  expect(document.getElementById("stt-model-card")).toHaveTextContent("Will switch when ready: whisper-base stays in use until then.");
});

test("a chosen model already in use says nothing about switching", () => {
  open("whisper-base");
  fireEvent.click(document.getElementById("settings-transcription")!);
  expect(document.getElementById("stt-model-card")).not.toHaveTextContent("Will switch when ready");
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

/** Each downloaded model listed, in order, with what it is for (its purpose chip, where the layout shows it on the row). */
const listed = (within: Element | null) => [...(within?.querySelectorAll(".downloaded-model") ?? [])]
  .map((row) => [row.getAttribute("data-model"), row.querySelector(".model-purpose")?.getAttribute("data-purpose") ?? null]);

/** Two more models downloaded that nothing uses, for Remove all. */
const withUnused = [{ ...catalogs[0], models: [...catalogs[0].models.filter((entry) => entry.id !== "whisper-small"),
  model("whisper-small", "whisper", "stt"), model("whisper-tiny", "whisper", "stt")] }] as unknown as CatalogView[];

test("Advanced lists the models in one list, those in use first, by what they are for; only one not in use can be deleted", async () => {
  const store = open("whisper-base");
  act(() => store.patch({ modelsRemovable: true }));
  const uninstall = vi.fn(async () => {});
  window.sidevoiceActions = { ...window.sidevoiceActions, uninstallVoiceModel: uninstall } as unknown as SidevoiceActions;
  fireEvent.click(document.getElementById("settings-advanced")!);
  const list = document.getElementById("downloaded-models");
  expect(listed(list)).toEqual([["whisper-base", "transcription"], ["kokoro-82m-v1.0", "voice"]]);
  expect(list?.querySelector(".downloaded-model")).toHaveTextContent("63 MB");
  expect(list?.querySelector(".downloaded-model")).toHaveTextContent("In use");
  // In use: not offered for deletion.
  expect(screen.queryByRole("button", { name: "Delete whisper-base from this device" })).toBeNull();
  // Still in use while only the draft moves off it (the saved settings use it); saved elsewhere, it is not.
  const openai = { catalog: "openai", model: "whisper-1", language: null };
  act(() => store.patch({ voiceDraft: { ...store.getState().facts.voiceDraft!, stt: openai } }));
  expect(screen.queryByRole("button", { name: "Delete whisper-base from this device" })).toBeNull();
  act(() => store.patch({ voiceSettings: { ...store.getState().facts.voiceSettings!, stt: openai } }));
  fireEvent.click(screen.getByRole("button", { name: "Delete whisper-base from this device" }));
  expect(screen.getByRole("group", { name: "Delete whisper-base from this device" })).toHaveTextContent("whisper-base");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete" })));
  expect(uninstall).toHaveBeenCalledWith("whisper-base");
});

test("the voice detector comes first, is never deletable, and says why after its tags; a row's tags are purpose then In use, or the other way (models-row)", () => {
  const vad = { ...model("silero-vad", "silero-vad", "vad") };
  const withVad = [{ ...withUnused[0], models: [...(withUnused[0] as { models: unknown[] }).models, vad] }] as unknown as CatalogView[];
  const store = open("whisper-base");
  act(() => store.patch({ modelsRemovable: true, voiceCatalogue: { state: "ready", catalogs: withVad, error: "" } }));
  fireEvent.click(document.getElementById("settings-advanced")!);
  const list = document.getElementById("downloaded-models");
  expect(listed(list).map(([id]) => id)).toEqual(["silero-vad", "whisper-base", "kokoro-82m-v1.0", "whisper-small", "whisper-tiny"]);
  expect(screen.queryByRole("button", { name: "Delete silero-vad from this device" })).toBeNull();
  expect(list?.querySelector('[data-model="silero-vad"] .ui-infotip')).not.toBeNull();
  expect(list).toHaveAttribute("data-row", "chip-first");
  const tags = (id: string) => [...list!.querySelector(`[data-model="${id}"] .downloaded-model-title`)!.children].map((tag) => tag.matches(".ui-infotip") ? "ui-infotip" : tag.className.split(" ")[0]);
  expect(tags("silero-vad")).toEqual(["downloaded-model-name", "model-purpose", "ui-badge", "ui-infotip"]);
});

test("Remove all deletes every model not in use, asking first with how many and what it frees, and says which one stayed", async () => {
  const store = open("whisper-base");
  act(() => store.patch({ modelsRemovable: true, voiceCatalogue: { state: "ready", catalogs: withUnused, error: "" } }));
  const uninstall = vi.fn(async (id: string) => { if (id === "whisper-tiny") throw Object.assign(new Error("busy"), { code: "model-in-use" }); });
  window.sidevoiceActions = { ...window.sidevoiceActions, uninstallVoiceModel: uninstall } as unknown as SidevoiceActions;
  fireEvent.click(document.getElementById("settings-advanced")!);
  fireEvent.click(screen.getByRole("button", { name: "Remove all not in use · 126 MB" }));
  expect(uninstall).not.toHaveBeenCalled();
  expect(screen.getByRole("group", { name: "Remove all" })).toHaveTextContent("Delete 2 models not in use and free 126 MB?");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete 2 models" })));
  expect(uninstall.mock.calls.map(([id]) => id)).toEqual(["whisper-small", "whisper-tiny"]);
  expect(screen.getByText(/^Deleted 1 of 2\. whisper-tiny is running right now/)).toHaveAttribute("role", "status");
});

test("models-row badge-first: In use comes before the purpose", () => {
  localStorage.setItem("sidevoice.variants", JSON.stringify({ "models-row": "badge-first" }));
  try {
    const store = open("whisper-base");
    act(() => store.patch({ modelsRemovable: true, voiceCatalogue: { state: "ready", catalogs: withUnused, error: "" } }));
    fireEvent.click(document.getElementById("settings-advanced")!);
    expect(document.getElementById("downloaded-models")).toHaveAttribute("data-row", "badge-first");
    const title = document.querySelector('[data-model="whisper-base"] .downloaded-model-title')!;
    expect([...title.children].map((tag) => tag.className.split(" ")[0])).toEqual(["downloaded-model-name", "ui-badge", "model-purpose"]);
    expect(screen.getByRole("button", { name: "Remove all not in use · 126 MB" })).toBeInTheDocument();
  } finally { localStorage.removeItem("sidevoice.variants"); }
});

test("where the engine can't delete models, they are listed without Delete, and it says so", () => {
  open("whisper-base");
  fireEvent.click(document.getElementById("settings-advanced")!);
  expect(document.querySelectorAll("#downloaded-models .downloaded-model")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
  expect(document.getElementById("pane-advanced")).toHaveTextContent("This version of the app can't delete them yet.");
});
