import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { SidevoiceActions } from "../../state/room-types";
import { AudioDevicesBar } from "./AudioDevices";

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
  render(<RoomProvider store={store} runtime={false}><AudioDevicesBar id="audio-devices" open onClose={() => undefined} /></RoomProvider>);
  return { actions, store };
}

test("the microphone and the speaker, the system's default first, a device with no name yet numbered; a choice goes to the voice", async () => {
  const { actions } = bar({ audioDevices: devices() });
  expect(actions.refreshAudioDevices).toHaveBeenCalled();
  const mic = screen.getByLabelText("Microphone") as HTMLSelectElement;
  expect([...mic.options].map((option) => option.textContent)).toEqual(["System default", "Built-in", "Microphone 2"]);
  expect(mic.value).toBe("mic-a");
  await act(async () => { fireEvent.change(mic, { target: { value: "" } }); });
  expect(actions.setAudioDevices).toHaveBeenCalledWith({ input: null });
  await act(async () => { fireEvent.change(screen.getByLabelText("Speaker"), { target: { value: "out-a" } }); });
  expect(actions.setAudioDevices).toHaveBeenLastCalledWith({ output: "out-a" });
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
