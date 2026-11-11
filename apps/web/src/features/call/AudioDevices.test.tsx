import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { SidevoiceActions } from "../../state/room-types";
import { AudioDeviceRows, AudioDevices } from "./AudioDevices";
import { installApp, removeApp } from "../../host/testing";
import type { AudioRouteBridge } from "../../host";
import { chooseOption, listOptions, selectedValue } from "../../test/select";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { cleanup(); removeApp(); delete window.sidevoiceActions; });

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

/** A host's `audioRoute`: the output's name `current`, and what `subscribe` was given to tell a change with. */
function route(over: Partial<AudioRouteBridge> & { name?: string | null } = {}) {
  const { name = null, ...rest } = over;
  const listeners = new Set<(name: string | null) => void>();
  return {
    open: async () => undefined,
    current: async () => name,
    subscribe: (listener: (name: string | null) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    tell: (next: string | null) => listeners.forEach((listener) => listener(next)),
    listeners,
    ...rest,
  };
}

test("the speaker button is labelled with the output now, by the system's own name, live as the route changes, and by its own word when there is none", async () => {
  const audioRoute = route({ name: "AirPods de Rubén" });
  installApp({ audioRoute });
  panel({ audioDevices: devices({ outputSelectable: false }) });
  expect(await screen.findByRole("button", { name: "Speaker: AirPods de Rubén" })).toHaveTextContent("AirPods de Rubén");
  await act(async () => { audioRoute.tell("iPhone"); });
  expect(screen.getByRole("button", { name: "Speaker: iPhone" })).toHaveTextContent("iPhone");
  await act(async () => { audioRoute.tell(null); });
  expect(screen.getByRole("button", { name: "Speaker" })).toHaveTextContent("Speaker");
  cleanup();
  expect(audioRoute.listeners.size).toBe(0);
  cleanup();
  installApp({ audioRoute: route({ name: "Car" }) });
  const settings = { setAudioDevices: vi.fn(async () => undefined), refreshAudioDevices: vi.fn(async () => undefined) };
  window.sidevoiceActions = settings as unknown as SidevoiceActions;
  const store = createRoomStore();
  store.patch({ settingsSection: "call", audioDevices: devices({ outputSelectable: false }) } as never);
  render(<RoomProvider store={store} runtime={false}><AudioDeviceRows /></RoomProvider>);
  expect(await screen.findByRole("button", { name: "Speaker: Car" })).toBeInTheDocument();
});

test("where the host can open the system's output picker, the speaker is our button that opens it, and says nothing of Control Center", async () => {
  const open = vi.fn(async () => undefined);
  installApp({ audioRoute: route({ open }) });
  panel({ audioDevices: devices({ outputSelectable: false }) });
  const button = screen.getByRole("button", { name: "Speaker" });
  expect(screen.queryByRole("combobox", { name: "Speaker" })).toBeNull();
  expect(document.getElementById("audio-output-hint")).toBeNull();
  await act(async () => { fireEvent.click(button); });
  expect(open).toHaveBeenCalledTimes(1);
});

test("a picker the host cannot show says so in the list's own words, and a selectable speaker keeps its select", async () => {
  installApp({ audioRoute: route({ open: async () => { throw { key: "audio_route", code: "audio-route-picker-failed" }; } }) });
  panel({ audioDevices: devices({ outputSelectable: false }) });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Speaker" })); });
  expect(screen.getByRole("alert")).toBeInTheDocument();
  cleanup();
  panel({ audioDevices: devices({ outputSelectable: true }) });
  expect(screen.getByLabelText("Speaker")).not.toBeDisabled();
});

test("Settings' speaker row is the same button, with no note", () => {
  installApp({ audioRoute: route({ open: async () => undefined }) });
  const actions = { setAudioDevices: vi.fn(async () => undefined), refreshAudioDevices: vi.fn(async () => undefined) };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
  const store = createRoomStore();
  store.patch({ settingsSection: "call", audioDevices: devices({ outputSelectable: false }) } as never);
  render(<RoomProvider store={store} runtime={false}><AudioDeviceRows /></RoomProvider>);
  expect(screen.getByRole("button", { name: "Speaker" })).toBeInTheDocument();
  expect(screen.queryByText(/plays through/)).toBeNull();
});

/* Settings › Call and the panel only read the store: the runtime keeps `audioDevices` fresh (services/audio-device-refresh.ts). */

test("Settings' rows fill when the list arrives after mount (permission granted, a device plugged in), without a remount", () => {
  const actions = { setAudioDevices: vi.fn(async () => undefined), refreshAudioDevices: vi.fn(async () => undefined) };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
  const store = createRoomStore();
  store.patch({ settingsSection: "call" } as never);
  render(<RoomProvider store={store} runtime={false}><AudioDeviceRows /></RoomProvider>);
  expect(screen.getByText("Looking for devices…")).toBeInTheDocument();
  expect(screen.getByLabelText("Microphone")).toBeDisabled();
  act(() => store.patch({ audioDevices: devices() } as never));
  expect(screen.queryByText("Looking for devices…")).toBeNull();
  expect(screen.getByLabelText("Microphone")).not.toBeDisabled();
  expect(listOptions("settings-audio-input").map((option) => option.label)).toEqual(["System default", "Built-in", "Microphone 2"]);
  // A device plugged in: the runtime patches the list, the rows follow.
  act(() => store.patch({ audioDevices: devices({ inputs: [{ id: "mic-a", label: "Built-in" }, { id: "mic-c", label: "USB" }] }) } as never));
  expect(listOptions("settings-audio-input").map((option) => option.label)).toEqual(["System default", "Built-in", "USB"]);
});

test("the list is read again each time the section is shown, and a hidden section reads nothing", () => {
  const actions = { setAudioDevices: vi.fn(async () => undefined), refreshAudioDevices: vi.fn(async () => undefined) };
  window.sidevoiceActions = actions as unknown as SidevoiceActions;
  const store = createRoomStore();
  store.patch({ settingsSection: "general" } as never);
  const view = render(<RoomProvider store={store} runtime={false}><AudioDeviceRows /></RoomProvider>);
  expect(actions.refreshAudioDevices).not.toHaveBeenCalled();
  act(() => store.patch({ settingsSection: "call" } as never));
  expect(actions.refreshAudioDevices).toHaveBeenCalledTimes(1);
  act(() => store.patch({ settingsSection: "general" } as never));
  act(() => store.patch({ settingsSection: "call" } as never));
  expect(actions.refreshAudioDevices).toHaveBeenCalledTimes(2);
  view.unmount();
  act(() => store.patch({ settingsSection: "general" } as never));
  act(() => store.patch({ settingsSection: "call" } as never));
  expect(actions.refreshAudioDevices).toHaveBeenCalledTimes(2);
});
