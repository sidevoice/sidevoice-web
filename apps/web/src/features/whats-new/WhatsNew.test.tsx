import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { App } from "../../app/App";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { ONBOARDING_STORAGE_KEY } from "../../services/onboarding-state";
import type { SidevoiceActions } from "../../state/room-types";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { delete window.sidevoiceActions; });

/* What's new, for a device set up on an earlier release: only what it lacks, once; Got it is seen for good. */

function room(record: Record<string, unknown>, facts: Record<string, unknown> = {}) {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "remote", agents_done: true, turn_done: true, completed_at: 1, ...record }));
  window.sidevoiceActions = { showSettingsSection: vi.fn(), loadVoiceCatalogue: vi.fn() } as unknown as SidevoiceActions;
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, voiceSettings: { ...defaultVoiceSettings(), end_of_turn: "silence" }, ...facts } as never));
  render(<App store={store} />);
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
