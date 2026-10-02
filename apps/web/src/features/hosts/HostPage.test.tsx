import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { MachineView } from "../../state/room-types";
import { HostAgentsPanel } from "../settings/HostAgentsPanel";
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

test("every paired host can open Agents before a listing capability or successful response exists", () => {
  const agentsPanel = <p>Agent management for the selected host</p>;
  renderHost({ agentsPanel, initialTab: "agents" });
  const agents = screen.getByRole("tab", { name: "Agents" });
  expect(agents).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Agent management for the selected host")).toBeInTheDocument();
});

test("a pending agent marks the host Agents tab from its fingerprint-scoped listing", () => {
  const store = createRoomStore();
  act(() => store.patch({ hostAgents: { "fp-nuc": { status: "ready", value: {
    agents: [{ id: "codex", label: "Codex", present: true, version: null, registration: "not-connected", connect: "auto", actionable: true }], scanned_at: 1,
  }, error: null, busy: {}, actionErrors: {} } } }));
  window.sidevoiceActions = {} as unknown as typeof window.sidevoiceActions;
  render(<RoomProvider store={store}><HostPage machine={machine} onBack={() => {}} statusPanel={null} devicesPanel={null} agentsPanel={<p>Host agents</p>} /></RoomProvider>);
  expect(screen.getByRole("tab", { name: /Agents/ }).querySelector(".host-agent-dot")).toBeInTheDocument();
});

test("a revoked pairing does not show a stale pending marker or Agents tab", () => {
  const store = createRoomStore();
  act(() => store.patch({ hostAgents: { "fp-nuc": { status: "ready", value: {
    agents: [{ id: "codex", label: "Codex", present: true, version: null, registration: "not-connected", connect: "auto", actionable: true }], scanned_at: 1,
  }, error: null, busy: {}, actionErrors: {} } } }));
  window.sidevoiceActions = {} as unknown as typeof window.sidevoiceActions;
  render(<RoomProvider store={store}><HostPage machine={{ ...machine, revoked: true }} onBack={() => {}} statusPanel={null} devicesPanel={null}
    agentsPanel={<p>Host agents</p>} initialTab="agents" /></RoomProvider>);
  expect(screen.queryByRole("tab", { name: /Agents/ })).toBeNull();
  expect(screen.queryByText("Host agents")).toBeNull();
});

test("an unpaired machine does not advertise an Agents tab", () => {
  renderHost({ machine: { ...machine, pairingId: undefined }, agentsPanel: <p>Agents</p>, initialTab: "agents" });
  expect(screen.queryByRole("tab", { name: "Agents" })).toBeNull();
});

test("a paired host keeps no-connector recovery reachable from its Agents tab", () => {
  const store = createRoomStore();
  const loadHostAgents = vi.fn(async () => {});
  window.sidevoiceActions = { loadHostAgents } as unknown as typeof window.sidevoiceActions;
  act(() => store.patch({ hostAgents: { "fp-nuc": { status: "failed", value: null, error: { key: "no-connector" }, busy: {}, actionErrors: {} } } }));
  render(<RoomProvider store={store}><HostPage machine={machine} onBack={() => {}} statusPanel={null} devicesPanel={null}
    agentsPanel={<HostAgentsPanel fp="fp-nuc" />} initialTab="agents" /></RoomProvider>);
  expect(screen.getByRole("tab", { name: "Agents" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("Sidevoice is not running on this machine.");
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  expect(loadHostAgents).toHaveBeenCalledWith("fp-nuc", { rescan: true });
});

test("remote status retry checks only that machine", () => {
  const { checkMachine } = renderHost();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(checkMachine).toHaveBeenCalledWith("fp-nuc");
});
