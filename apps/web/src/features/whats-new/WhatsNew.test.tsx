import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CatalogView } from "../../services/model-catalogs.js";
import { FEATURES } from "./catalogue";
import { App } from "../../app/App";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { ONBOARDING_STORAGE_KEY } from "../../services/onboarding-state";
import type { SidevoiceActions } from "../../state/room-types";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { delete window.sidevoiceActions; sessionStorage.removeItem("sidevoice.whats-new-shown"); });

/* What's new, for a device set up on an earlier release: only what it lacks, once; Got it is seen for good. */

const build = (id: string) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 1, memoryMb: 1, available: true, reasons: [], installed: true });
const model = (id: string, family: string, task: string) => ({ id, family, capabilities: [task], parametersM: 1, license: "MIT", languages: ["es", "en"], voices: [], installed: true, builds: [build(id + "/b")], recommendedBuild: id + "/b" });
const CATALOGS = [{ id: "local", name: null, status: { stale: false }, models: [model("whisper-base", "whisper", "stt"), model("kokoro-82m-v1.0", "kokoro", "tts"), model("smart-turn-v3", "smart-turn", "end-of-turn")] }] as unknown as CatalogView[];

function room(record: Record<string, unknown>, facts: Record<string, unknown> = {}) {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "remote", agents_done: true, turn_done: true, completed_at: 1, ...record }));
  window.sidevoiceActions = { showSettingsSection: vi.fn(), loadVoiceCatalogue: vi.fn() } as unknown as SidevoiceActions;
  const store = createRoomStore();
  const settings = { ...defaultVoiceSettings(), end_of_turn: "silence" };
  act(() => store.patch({ machinesReady: true, voiceSettings: settings, voiceDraft: settings, voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" }, ...facts } as never));
  render(<App store={store} />);
  return store;
}

test("set up on an earlier release: what is new and not had yet, in a small dialog; Got it is seen", async () => {
  room({ baseline_release: 0 });
  const dialog = screen.getByRole("dialog", { name: "New in Sidevoice" });
  expect(dialog).toHaveTextContent("A smart end of turn");
  expect(dialog).toHaveTextContent("The language you speak");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Got it" })); });
  const kept = JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!);
  expect(kept.features["end-of-turn-smart"].state).toBe("seen");
});

test("set up on this release, or already having it: nothing is news", () => {
  room({ baseline_release: 2 });
  expect(screen.queryByRole("dialog", { name: "New in Sidevoice" })).toBeNull();
});

// Each item's Set up opens Settings at its own section, never another, and points at its control there.
test.each(FEATURES.map((feature) => [feature.id, feature]))("Set up for %s opens its section and points at its control", async (_id, feature) => {
  const store = room({ baseline_release: 0 });
  const dialog = screen.getByRole("dialog", { name: "New in Sidevoice" });
  const rows = [...dialog.querySelectorAll(".whats-new-item")];
  const row = rows[FEATURES.filter((entry) => !entry.achieved(store.getState())).indexOf(feature)] as HTMLElement;
  await act(async () => { fireEvent.click(within(row).getByRole("button", { name: "Set up" })); });
  expect(store.getState().facts.settingsSection).toBe(feature.section);
  await waitFor(() => expect(document.getElementById(feature.control)!.closest(".ui-row")).toHaveClass("settings-highlight"));
  expect(document.activeElement?.id).toBe(feature.control);
  expect(store.getState().facts.settingsFocus).toBeNull();
});
