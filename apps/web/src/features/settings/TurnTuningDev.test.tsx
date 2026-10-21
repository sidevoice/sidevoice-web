import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DEV_TURN_TUNING_KEY, TURN_PRESETS, TurnTuningDev, turnTuningDevEnabled } from "./TurnTuningDev";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings, editVoiceSettings, TURN_TUNING } from "../../services/voice-settings.js";
import type { SidevoiceActions } from "../../state/room-types";

afterEach(() => { localStorage.clear(); });

test("the panel shows only when the dev flag is set, by localStorage or by the URL", () => {
  expect(turnTuningDevEnabled(localStorage, "")).toBe(false);
  localStorage.setItem(DEV_TURN_TUNING_KEY, "1");
  expect(turnTuningDevEnabled(localStorage, "")).toBe(true);
  expect(turnTuningDevEnabled(localStorage, "?devTurnTuning=0")).toBe(false);
  expect(localStorage.getItem(DEV_TURN_TUNING_KEY)).toBeNull();
  expect(turnTuningDevEnabled(localStorage, "?devTurnTuning=1")).toBe(true);
  expect(localStorage.getItem(DEV_TURN_TUNING_KEY)).toBe("1");
  localStorage.setItem(DEV_TURN_TUNING_KEY, "yes");
  expect(turnTuningDevEnabled(localStorage, "")).toBe(false);
  expect(turnTuningDevEnabled(null, "")).toBe(false);
});

function mount() {
  const store = createRoomStore();
  act(() => store.patch({ voiceSettings: defaultVoiceSettings() }));
  // The runtime's own edit (room-session-controller.js `editVoice`): the draft, then kept as the voice's settings.
  const editVoice = vi.fn((patch: Parameters<SidevoiceActions["editVoice"]>[0]) => {
    const facts = store.getState().facts;
    const next = editVoiceSettings(facts.voiceDraft ?? facts.voiceSettings!, patch, []);
    store.patch({ voiceDraft: next, voiceSettings: next });
  });
  window.sidevoiceActions = { editVoice } as unknown as SidevoiceActions;
  render(<RoomProvider store={store}><TurnTuningDev /></RoomProvider>);
  return { store, editVoice };
}

test("a control, a preset and the reset reach the stored turn settings", () => {
  const { store, editVoice } = mount();
  const turn = () => store.getState().facts.voiceSettings!.turn;
  fireEvent.change(screen.getByLabelText("Audio grace"), { target: { value: "700" } });
  expect(editVoice).toHaveBeenLastCalledWith({ turn: { audio_grace_ms: 700 } });
  expect(turn().audio_grace_ms).toBe(700);
  fireEvent.change(screen.getByLabelText("Listening bar, agent playing"), { target: { value: "0.7" } });
  expect(turn().listening_bar).toEqual({ quiet: TURN_TUNING.listening_bar.quiet, playing: 0.7 });
  // Out of bounds is refused by the settings, not stored.
  fireEvent.change(screen.getByLabelText("Fade"), { target: { value: "5000" } });
  expect(turn().fade_ms).toBe(TURN_TUNING.fade_ms);
  fireEvent.click(screen.getByRole("button", { name: /Preset B/ }));
  expect(turn()).toMatchObject({ ...TURN_PRESETS.B.turn, listening_bar: { quiet: 0.45, playing: 0.55 } });
  expect(screen.getByLabelText("Audio grace")).toHaveValue(TURN_PRESETS.B.turn.audio_grace_ms);
  fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
  expect(turn()).toEqual(TURN_TUNING);
});
