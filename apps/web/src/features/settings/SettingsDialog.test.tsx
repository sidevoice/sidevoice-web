import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { withMicrophone } from "./with-microphone.test-util";
import { SettingsDialog } from "./SettingsDialog";
import { KEYBOARD_QUERY } from "./ShortcutsSettings";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings, editVoiceSettings } from "../../services/voice-settings.js";
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

test("the sections are General, Transcription, Voice, Call, Permissions, Providers, Machines and Advanced, one showing at a time", () => {
  withMicrophone();
  open("whisper-base");
  expect([...document.querySelectorAll(".settings-nav > button")].map((button) => button.textContent)).toEqual(["General", "Transcription", "Voice", "Call", "Permissions", "Providers", "Machines", "Advanced"]);
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

/** A device with a mouse or a trackpad, where a keyboard is all but certain (jsdom's media queries match nothing). */
function withKeyboard() {
  const matchMedia = window.matchMedia;
  window.matchMedia = ((media: string) => ({ ...matchMedia(media), matches: media === KEYBOARD_QUERY })) as typeof window.matchMedia;
  onTestFinished(() => { window.matchMedia = matchMedia; });
}

/** The desktop app, as its bridge shows it: the global mute shortcut and the call controls' setting. */
function inDesktopApp() {
  const shortcut = { accelerator: "Cmd+Shift+M", label: "⇧⌘M", state: "on", alternatives: [], voiceOver: false };
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: {
    muteShortcut: { get: vi.fn(async () => shortcut), set: vi.fn(async () => shortcut) },
    callControls: { settings: vi.fn(async () => ({ alwaysShown: false })), setAlwaysShown: vi.fn(async (alwaysShown: boolean) => ({ alwaysShown })) },
  } } });
  onTestFinished(() => { delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop; });
}

const navLabels = () => [...document.querySelectorAll(".settings-nav > button")].map((button) => button.textContent);

test("Shortcuts is hidden for now (sidevoice-web#148): not with a keyboard, not in the desktop app, and a place asked in it opens General", async () => {
  withKeyboard();
  withMicrophone();
  const store = open("whisper-base");
  expect(navLabels()).toEqual(["General", "Transcription", "Voice", "Call", "Permissions", "Providers", "Machines", "Advanced"]);
  expect(document.getElementById("pane-shortcuts")).toBeNull();
  act(() => store.patch({ settingsSection: "shortcuts" }));
  expect(store.getState().facts.settingsSection).toBe("general");
  expect(document.getElementById("pane-general")).not.toHaveAttribute("hidden");
});

test("in the desktop app Shortcuts is hidden too, and Call keeps only the call controls' setting", async () => {
  inDesktopApp();
  open("whisper-base");
  expect(navLabels()).not.toContain("Shortcuts");
  fireEvent.click(document.getElementById("settings-call")!);
  const call = document.getElementById("pane-call")!;
  expect(await within(call).findByRole("switch", { name: "Always show the call controls" })).toBeInTheDocument();
  expect(call).not.toHaveTextContent("Mute shortcut");
});

/** The desktop app that can reset its machine (macOS): `host.data` with deleteAll, and uninstall where it has it. */
function withReset({ uninstall }: { uninstall: boolean }) {
  const data = { pairings: { read: vi.fn(async () => ({ pairings: [] })), write: vi.fn(async () => {}) },
    deleteAll: vi.fn(), resetReport: vi.fn(async () => null), ...(uninstall ? { uninstall: vi.fn() } : {}) };
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { data } } });
  onTestFinished(() => { delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop; });
}

test("a browser has no Danger zone, and no section of its own anywhere", () => {
  withMicrophone();
  open("whisper-base");
  expect(navLabels()).not.toContain("Danger zone");
  expect(document.querySelector(".danger-zone")).toBeNull();
  expect(document.getElementById("delete-all-sidevoice-data")).toBeNull();
});

test.each([false, true])("the desktop app's Danger zone is the last group of Advanced, in red, not a section (uninstall: %s)", (uninstall) => {
  withMicrophone();
  withReset({ uninstall });
  open("whisper-base");
  expect(navLabels()).not.toContain("Danger zone");
  const groups = [...document.querySelectorAll("#pane-advanced .ui-group")];
  const last = groups.at(-1)!;
  expect(last).toHaveClass("danger-group");
  expect(last.querySelector(".ui-group-title")).toHaveTextContent("Danger zone");
  expect(last.querySelector("#delete-all-sidevoice-data")).toBeInTheDocument();
  expect(!!last.querySelector("#uninstall-sidevoice")).toBe(uninstall);
});

test("General: appearance, this device's name, then the interface's language", () => {
  open("whisper-base");
  expect([...document.querySelectorAll("#pane-general .ui-row-label")].map((label) => label.textContent))
    .toEqual(["Appearance", "This device’s name", "Language"]);
});

/** Leaving Settings: the back arrow before the title, the button whose click the runtime binds to close it. */
const leave = () => document.getElementById("settings-close") as HTMLButtonElement;
const head = () => document.querySelector<HTMLElement>("#language-settings .ui-dialog-head")!;

test("Settings is left by a back arrow before its title, named Back; there is no × any more", () => {
  open("whisper-base");
  expect(head().firstElementChild).toBe(leave());
  expect(leave().nextElementSibling).toContainElement(document.getElementById("settings-title"));
  expect(leave()).toHaveAttribute("type", "button");
  expect(leave()).not.toHaveAttribute("hidden");
  expect(leave()).toHaveAccessibleName("Back");
  expect(leave()).toHaveAttribute("title", "Close Settings and return to your conversations");
  expect(leave().querySelector("svg")).toHaveClass("lucide-arrow-left");
  // The arrow is the header's only button: no close × at its end.
  expect(head().querySelectorAll("button")).toHaveLength(1);
  expect(head().querySelector(".ui-dialog-close, .lucide-x")).toBeNull();
});

test("in Spanish the arrow that leaves Settings is Volver", () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  try {
    open("whisper-base");
    expect(leave()).toHaveAccessibleName("Volver");
    expect(leave()).toHaveAttribute("title", "Cerrar la configuración y volver a tus conversaciones");
  } finally {
    localStorage.removeItem("sidevoice.settings");
  }
});

test("Escape still closes Settings: its cancel is left to the dialog, whichever section shows", () => {
  open("whisper-base");
  const dialog = document.getElementById("language-settings")!;
  for (const section of ["general", "advanced"]) {
    fireEvent.click(document.getElementById("settings-" + section)!);
    const escape = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
  }
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

test("a delete that fails says why in words: a model still downloading, or one that couldn't be deleted, its detail behind Details", async () => {
  const store = open("whisper-base");
  act(() => store.patch({ modelsRemovable: true, voiceCatalogue: { state: "ready", catalogs: withUnused, error: "" } }));
  const detail = "EBUSY: resource busy or locked, unlink '/models/whisper-tiny.bin'";
  const uninstall = vi.fn(async (id: string) => {
    throw id === "whisper-small" ? Object.assign(new Error("model-installing"), { code: "model-installing" })
      : Object.assign(new Error("uninstall-failed"), { code: "uninstall-failed", detail });
  });
  window.sidevoiceActions = { ...window.sidevoiceActions, uninstallVoiceModel: uninstall } as unknown as SidevoiceActions;
  fireEvent.click(document.getElementById("settings-advanced")!);
  const errorOf = (id: string) => document.querySelector(`[data-model="${id}"] .downloaded-model-error`);

  fireEvent.click(screen.getByRole("button", { name: "Delete whisper-small from this device" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete" })));
  expect(uninstall).toHaveBeenCalledWith("whisper-small");
  expect(errorOf("whisper-small")).toHaveTextContent(/^This model is still downloading\. Try again when it finishes\.$/);
  expect(errorOf("whisper-small")!.querySelector("details")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Delete whisper-tiny from this device" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete" })));
  const error = errorOf("whisper-tiny")!;
  expect(error.textContent!.startsWith("Couldn't delete this model.")).toBe(true);
  expect(error.querySelector("details:not([open]) > pre")!.textContent).toBe(detail);
  expect(error.textContent!.replace(error.querySelector("details")!.textContent!, "")).not.toContain("EBUSY");
});

test("the voice detector comes first, is never deletable, and says why right by its name; a row's tags are its purpose then In use", () => {
  const vad = { ...model("silero-vad", "silero-vad", "vad") };
  const withVad = [{ ...withUnused[0], models: [...(withUnused[0] as { models: unknown[] }).models, vad] }] as unknown as CatalogView[];
  const store = open("whisper-base");
  act(() => store.patch({ modelsRemovable: true, voiceCatalogue: { state: "ready", catalogs: withVad, error: "" } }));
  fireEvent.click(document.getElementById("settings-advanced")!);
  const list = document.getElementById("downloaded-models");
  expect(listed(list).map(([id]) => id)).toEqual(["silero-vad", "whisper-base", "kokoro-82m-v1.0", "whisper-small", "whisper-tiny"]);
  expect(screen.queryByRole("button", { name: "Delete silero-vad from this device" })).toBeNull();
  expect(list?.querySelector('[data-model="silero-vad"] .ui-infotip')).not.toBeNull();
  const tags = (id: string) => [...list!.querySelector(`[data-model="${id}"] .downloaded-model-title`)!.children].map((tag) => tag.matches(".ui-infotip") ? "ui-infotip" : tag.className.split(" ")[0]);
  expect(tags("silero-vad")).toEqual(["downloaded-model-name", "ui-infotip", "model-purpose", "ui-badge"]);
  expect(tags("whisper-base")).toEqual(["downloaded-model-name", "model-purpose", "ui-badge"]);
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
  expect(screen.getByText(/^Deleted 1 of 2\. whisper-tiny is running right now/).closest(".downloaded-model-error")).toHaveAttribute("role", "status");
});

test("where the engine can't delete models, they are listed without Delete, and it says so", () => {
  open("whisper-base");
  fireEvent.click(document.getElementById("settings-advanced")!);
  expect(document.querySelectorAll("#downloaded-models .downloaded-model")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
  expect(document.getElementById("pane-advanced")).toHaveTextContent("This version of the app can't delete them yet.");
});

test("a model of another family chosen in the first-run setup, with Settings drawn behind it, leaves Voice drawn and the choice as made", () => {
  // Settings is drawn from the start, under the setup, in a form: its own Selects follow every choice the setup makes.
  // A model of another family is a new value and a new list at once; it once looped there (the slot's model taken
  // back as none, then given its catalogue's first again) until React gave up and Voice showed it had failed.
  const tts = (id: string, family: string) => ({ ...model(id, family, "tts", false), speed: { min: 0.5, max: 2 } });
  const local = [{ id: "local", name: null, status: { stale: false }, models: [
    tts("kokoro-82m-v0.19", "kokoro"), tts("kokoro-82m-v1.0", "kokoro"), tts("supertonic-3", "supertonic"), tts("supertonic-2", "supertonic"), model("whisper-base", "whisper", "stt"),
  ] }] as unknown as CatalogView[];
  const store = createRoomStore();
  act(() => store.patch({ voiceSettings: defaultVoiceSettings(), voiceCatalogue: { state: "ready", catalogs: local, error: "" }, settingsSection: "general" }));
  // The runtime's own edit (room-session-controller.js `editVoice`): the draft, from what is being edited.
  const editVoice = vi.fn((patch: Parameters<SidevoiceActions["editVoice"]>[0]) => {
    const facts = store.getState().facts;
    store.patch({ voiceDraft: editVoiceSettings(facts.voiceDraft ?? facts.voiceSettings!, patch, facts.voiceCatalogue.catalogs) });
  });
  window.sidevoiceActions = { editVoice, installVoiceModel: vi.fn(), loadVoiceCatalogue: vi.fn(), cancelVoiceTry: vi.fn() } as unknown as SidevoiceActions;
  render(<RoomProvider store={store}><SettingsDialog /></RoomProvider>);
  // The setup's Voice step: Supertonic, its first model.
  act(() => editVoice({ tts: { model: "supertonic-3" } }));
  expect(editVoice.mock.calls.map(([patch]) => patch)).toEqual([{ tts: { model: "supertonic-3" } }]);
  expect(store.getState().facts.voiceDraft?.tts.model).toBe("supertonic-3");
  expect(document.querySelector("#pane-voice .panel-error")).toBeNull();
  fireEvent.click(document.getElementById("settings-voice")!);
  expect(document.getElementById("tts-family")).toHaveAttribute("data-value", "supertonic");
  expect(document.getElementById("tts-model")).toHaveAttribute("data-value", "supertonic-3");
});

test("Permissions is hidden where there is nothing to ask (no microphone API), and a place asked in it opens General", async () => {
  const store = open("whisper-base");
  expect(navLabels()).not.toContain("Permissions");
  expect(document.getElementById("pane-permissions")).toBeNull();
  act(() => store.patch({ settingsSection: "permissions" }));
  expect(store.getState().facts.settingsSection).toBe("general");
});

test("Call links to Permissions while the microphone is not allowed, and not once it is", async () => {
  withMicrophone("denied");
  const store = open("whisper-base");
  act(() => store.patch({ settingsSection: "call" }));
  const pane = document.getElementById("pane-call")!;
  const link = await within(pane).findByRole("button", { name: "Open Permissions" });
  fireEvent.click(link);
  expect(store.getState().facts.settingsSection).toBe("permissions");
  cleanup();
  withMicrophone("granted");
  const again = open("whisper-base");
  act(() => again.patch({ settingsSection: "call" }));
  await within(document.getElementById("pane-call")!).findByText("Thinking sound");
  expect(within(document.getElementById("pane-call")!).queryByRole("button", { name: "Open Permissions" })).toBeNull();
});
