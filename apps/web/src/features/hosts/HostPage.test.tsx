import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { MachineView } from "../../state/room-types";
import { HostPage } from "./HostPage";

vi.mock("../../services/room-session-controller.js", () => ({}));

const machine: MachineView = {
  id: "fp-nuc", pairingId: "fp-nuc", host: "NUC", inUse: true, revoked: false,
  reach: "direct", state: "connected", pairedLabel: "",
};

function renderHost(props: Partial<ComponentProps<typeof HostPage>> = {}) {
  const store = createRoomStore();
  const checkMachine = vi.fn();
  window.sidevoiceActions = { checkMachine } as unknown as typeof window.sidevoiceActions;
  render(<RoomProvider store={store}><HostPage machine={machine} onBack={() => {}}
    statusPanel={null} devicesPanel={null} {...props} /></RoomProvider>);
  return { checkMachine, store };
}

test("a host page reuses the machine's real settings tabs and remote device instructions", () => {
  renderHost();
  expect(screen.getByRole("tab", { name: "Integrations" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Voice" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Transcription" })).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Agents" })).toBeNull();

  fireEvent.click(screen.getByRole("tab", { name: "Devices" }));
  expect(screen.getByText("sidevoice pair-device")).toBeInTheDocument();
});

test("the Agents slot appears only when a host capability and its real panel are both supplied", () => {
  const agentsPanel = <p>Agent management from the host capability</p>;
  renderHost({ machine: { ...machine, capabilities: { agents: true } }, agentsPanel, initialTab: "agents" });
  const agents = screen.getByRole("tab", { name: "Agents" });
  expect(agents).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Agent management from the host capability")).toBeInTheDocument();
});

test("remote status retry checks only that machine", () => {
  const { checkMachine } = renderHost();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(checkMachine).toHaveBeenCalledWith("fp-nuc");
});
