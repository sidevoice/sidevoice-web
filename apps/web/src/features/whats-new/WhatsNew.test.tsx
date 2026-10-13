import { afterEach, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { CatalogView } from "../../services/model-catalogs.js";
import { App } from "../../app/App";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { ONBOARDING_STORAGE_KEY } from "../../services/onboarding-state";
import type { SidevoiceActions } from "../../state/room-types";
import { OnboardingProvider } from "../onboarding/onboarding-context";
import { HIGHLIGHTS_ON } from "../highlights/highlights";
import { useWhatsNew } from "./WhatsNew";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { delete window.sidevoiceActions; localStorage.removeItem(ONBOARDING_STORAGE_KEY); });

/* What's new, for a device set up on an earlier release: only what it lacks, as the "new" mark on its own setting — no
 * dialog. Seen there is seen for good. Off for this release (HIGHLIGHTS_ON): no mark shows anywhere, while what would
 * be new is still worked out, dormant, to come back. */

const build = (id: string) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 1, memoryMb: 1, available: true, reasons: [], installed: true });
const model = (id: string, family: string, task: string) => ({ id, family, capabilities: [task], parametersM: 1, license: "MIT", languages: ["es", "en"], voices: [], installed: true, builds: [build(id + "/b")], recommendedBuild: id + "/b" });
const CATALOGS = [{ id: "local", name: null, status: { stale: false }, models: [model("whisper-base", "whisper", "stt"), model("kokoro-82m-v1.0", "kokoro", "tts"), model("smart-turn-v3", "smart-turn", "end-of-turn")] }] as unknown as CatalogView[];

function setUp(record: Record<string, unknown>, settings: Record<string, unknown> = {}) {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "remote", agents_done: true, turn_done: true, completed_at: 1, ...record }));
  window.sidevoiceActions = { showSettingsSection: vi.fn(), loadVoiceCatalogue: vi.fn() } as unknown as SidevoiceActions;
  const store = createRoomStore();
  const voice = { ...defaultVoiceSettings(), end_of_turn: "silence", ...settings };
  act(() => store.patch({ machinesReady: true, voiceSettings: voice, voiceDraft: voice, voiceCatalogue: { state: "ready", catalogs: CATALOGS, error: "" } } as never));
  return store;
}

function room(record: Record<string, unknown>, settings: Record<string, unknown> = {}) {
  render(<App store={setUp(record, settings)} />);
}

/** What's new would show, by feature id, for a device set up as `record` with `settings`. */
function whatsNew(record: Record<string, unknown>, settings: Record<string, unknown> = {}) {
  let ids: string[] = [];
  function Probe() { ids = useWhatsNew().items.map((item) => item.id); return null; }
  render(<RoomProvider store={setUp(record, settings)} runtime={false}><OnboardingProvider><Probe /></OnboardingProvider></RoomProvider>);
  return ids;
}

const mark = (feature: string) => document.querySelector(`[data-highlight="feature:${feature}"]`);

test("off for this release: set up on an earlier release, no dialog and no New on any setting", () => {
  expect(HIGHLIGHTS_ON).toBe(false);
  room({ baseline_release: 0 });
  expect(screen.queryByRole("dialog")).toBeNull();
  // The settings that would wear it are there, without it.
  expect(document.getElementById("stt-language")).not.toBeNull();
  expect(document.getElementById("voice-end-of-turn")).not.toBeNull();
  expect(mark("end-of-turn-smart")).toBeNull();
  expect(mark("speech-language")).toBeNull();
  expect(document.querySelector(".new-mark, .new-badge")).toBeNull();
  // Nothing was shown, so nothing is taken as seen.
  expect(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!).features ?? {}).toEqual({});
});

test("set up on an earlier release: what is new and not had yet is still worked out, newest first", () => {
  expect(whatsNew({ baseline_release: 0 })).toEqual(["end-of-turn-smart", "speech-language"]);
});

test("set up on this release: nothing is new", () => {
  expect(whatsNew({ baseline_release: 2 })).toEqual([]);
});

test("a feature this device already has is not new", () => {
  expect(whatsNew({ baseline_release: 0 }, { end_of_turn: "smart-turn" })).toEqual(["speech-language"]);
});

test("a feature already seen stays not new", () => {
  expect(whatsNew({ baseline_release: 0, features: { "end-of-turn-smart": { state: "seen", at: 1 } } })).toEqual(["speech-language"]);
});

test("never while the setup is not settled", () => {
  expect(whatsNew({ baseline_release: 0, completed_at: null })).toEqual([]);
});
