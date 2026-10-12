import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { CatalogView } from "../../services/model-catalogs.js";
import { App } from "../../app/App";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { ONBOARDING_STORAGE_KEY } from "../../services/onboarding-state";
import type { SidevoiceActions } from "../../state/room-types";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { delete window.sidevoiceActions; });

/* What's new, for a device set up on an earlier release: only what it lacks, as the "new" mark on its own setting — no
 * dialog. Seen there is seen for good. */

const build = (id: string) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 1, memoryMb: 1, available: true, reasons: [], installed: true });
const model = (id: string, family: string, task: string) => ({ id, family, capabilities: [task], parametersM: 1, license: "MIT", languages: ["es", "en"], voices: [], installed: true, builds: [build(id + "/b")], recommendedBuild: id + "/b" });
const CATALOGS = [{ id: "local", name: null, status: { stale: false }, models: [model("whisper-base", "whisper", "stt"), model("kokoro-82m-v1.0", "kokoro", "tts"), model("smart-turn-v3", "smart-turn", "end-of-turn")] }] as unknown as CatalogView[];

function room(record: Record<string, unknown>, settings: Record<string, unknown> = {}) {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "remote", agents_done: true, turn_done: true, completed_at: 1, ...record }));
  window.sidevoiceActions = { showSettingsSection: vi.fn(), loadVoiceCatalogue: vi.fn() } as unknown as SidevoiceActions;
  const store = createRoomStore();
  const voice = { ...defaultVoiceSettings(), end_of_turn: "silence", ...settings };
  act(() => store.patch({ machinesReady: true, voiceSettings: voice, voiceDraft: voice, voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" } } as never));
  render(<App store={store} />);
  return store;
}

const mark = (feature: string) => document.querySelector(`[data-highlight="feature:${feature}"]`);

test("set up on an earlier release: what is new and not had yet is marked new on its setting, with no dialog", async () => {
  room({ baseline_release: 0 });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mark("end-of-turn-smart")).not.toBeNull();
  expect(mark("speech-language")).not.toBeNull();
  await act(async () => { fireEvent.click(mark("end-of-turn-smart")!.querySelector("button")!); });
  expect(mark("end-of-turn-smart")).toBeNull();
  const kept = JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!);
  expect(kept.features["end-of-turn-smart"].state).toBe("seen");
});

test("set up on this release: nothing is new", () => {
  room({ baseline_release: 2 });
  expect(mark("end-of-turn-smart")).toBeNull();
  expect(mark("speech-language")).toBeNull();
});

test("a feature this device already has is not new", () => {
  room({ baseline_release: 0 }, { end_of_turn: "smart-turn" });
  expect(mark("end-of-turn-smart")).toBeNull();
  expect(mark("speech-language")).not.toBeNull();
});

test("a feature already seen stays not new", () => {
  room({ baseline_release: 0, features: { "end-of-turn-smart": { state: "seen", at: 1 } } });
  expect(mark("end-of-turn-smart")).toBeNull();
  expect(mark("speech-language")).not.toBeNull();
});
