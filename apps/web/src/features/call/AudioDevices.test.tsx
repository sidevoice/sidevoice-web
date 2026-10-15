import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { SidevoiceActions } from "../../state/room-types";
import { AudioDevices } from "./AudioDevices";
import { chooseOption, listOptions, selectedValue } from "../../test/select";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { cleanup(); delete window.sidevoiceActions; });

/* The panel the microphone's chevron opens: the voice's devices to choose, the speaker disabled with why where it
 * cannot be chosen, and a lost device said once. Where it is drawn and how a pointer opens it: e2e/device-popover. */

const devices = (extra: Record<string, unknown> = {}) => ({ inputs: [{ id: "mic-a", label: "Built-in" }, { id: "mic-b", label: "" }], outputs: [{ id: "out-a", label: "Speakers" }],
  input: "mic-a", output: null, outputSelectable: true, ...extra });

function panel(facts: Record<string, unknown>) {
  const actions = { setAudioDevices: vi.fn(async () => undefined), refreshAudioDevices: vi.fn(async () => undefined) };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
  const store = createRoomStore();
  act(() => store.patch(facts as never));
  render(<RoomProvider store={store} runtime={false}><AudioDevices /></RoomProvider>);
  const toggle = screen.getByRole("button", { name: "Microphone and speaker" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(document.getElementById("audio-devices")).toBeNull();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  return { actions, store, toggle };
}

test("the microphone and the speaker, the system's default first, a device with no name yet numbered; a choice goes to the voice", async () => {
  const { actions, toggle } = panel({ audioDevices: devices() });
  expect(actions.refreshAudioDevices).toHaveBeenCalled();
  expect(screen.getByLabelText("Microphone")).toBe(document.getElementById("audio-input"));
  expect(listOptions("audio-input").map((option) => option.label)).toEqual(["System default", "Built-in", "Microphone 2"]);
  expect(selectedValue("audio-input")).toBe("mic-a");
  // Picked as a tap would, then the choice is let to settle (it is async).
  chooseOption("audio-input", "");
  await act(async () => {});
  expect(actions.setAudioDevices).toHaveBeenCalledWith({ input: null });
  chooseOption("audio-output", "out-a");
  await act(async () => {});
  expect(actions.setAudioDevices).toHaveBeenLastCalledWith({ output: "out-a" });
  // Only the two devices: the list is read again on opening and follows the devices by itself, and it closes on its own.
  expect(screen.getByRole("dialog", { name: "Microphone and speaker" })).toBe(document.getElementById("audio-devices"));
  expect(screen.queryAllByRole("button")).toEqual([toggle]);
  // Escape closes a list open in the panel, and the panel stays; with no list open, Escape closes the panel.
  listOptions("audio-input");
  expect(document.getElementById("audio-devices")).not.toBeNull();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  expect(document.getElementById("audio-devices")).toBeNull();
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("the chevron toggles the panel; ArrowUp opens it from the keyboard", () => {
  const { toggle } = panel({ audioDevices: devices() });
  fireEvent.click(toggle);
  expect(document.getElementById("audio-devices")).toBeNull();
  fireEvent.keyDown(toggle, { key: "ArrowUp" });
  expect(document.getElementById("audio-devices")).not.toBeNull();
});

test("a speaker this platform cannot choose is disabled, saying why; a lost device is said until it is seen", () => {
  const { store } = panel({ audioDevices: devices({ outputSelectable: false }), audioLost: { input: "mic-b" } });
  const speaker = screen.getByLabelText("Speaker");
  expect(speaker).toBeDisabled();
  expect(speaker).toHaveAccessibleDescription(/plays through the system's speaker/);
  expect(screen.getByText("The chosen microphone is gone: the system's default is in use.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  expect(store.getState().facts.audioLost).toBeNull();
});
