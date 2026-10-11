import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { SidevoiceActions } from "../../state/room-types";
import { AudioDevicesBar } from "./AudioDevices";
import { chooseOption, listOptions, selectedValue } from "../../test/select";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { cleanup(); delete window.sidevoiceActions; });

/* The bar the microphone's chevron opens: the voice's devices to choose, the speaker disabled with why where it cannot
 * be chosen, and a lost device said once. */

const devices = (extra: Record<string, unknown> = {}) => ({ inputs: [{ id: "mic-a", label: "Built-in" }, { id: "mic-b", label: "" }], outputs: [{ id: "out-a", label: "Speakers" }],
  input: "mic-a", output: null, outputSelectable: true, ...extra });

function bar(facts: Record<string, unknown>) {
  const actions = { setAudioDevices: vi.fn(async () => undefined), refreshAudioDevices: vi.fn(async () => undefined) };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
  const store = createRoomStore();
  act(() => store.patch(facts as never));
  const onClose = vi.fn();
  render(<RoomProvider store={store} runtime={false}><AudioDevicesBar id="audio-devices" open onClose={onClose} /></RoomProvider>);
  return { actions, store, onClose };
}

test("the microphone and the speaker, the system's default first, a device with no name yet numbered; a choice goes to the voice", async () => {
  const { actions, onClose } = bar({ audioDevices: devices() });
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
  // Escape closes a list open in the bar, and the bar stays; with no list open, Escape closes the bar.
  listOptions("audio-input");
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(onClose).toHaveBeenCalled();
});

test("a speaker this platform cannot choose is disabled, saying why; a lost device is said until it is seen", () => {
  const { store } = bar({ audioDevices: devices({ outputSelectable: false }), audioLost: { input: "mic-b" } });
  const speaker = screen.getByLabelText("Speaker");
  expect(speaker).toBeDisabled();
  expect(speaker).toHaveAccessibleDescription(/plays through the system's speaker/);
  expect(screen.getByText("The chosen microphone is gone: the system's default is in use.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  expect(store.getState().facts.audioLost).toBeNull();
});
