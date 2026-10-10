import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HostAgentsPanel } from "./HostAgentsPanel";
import { RoomHeader } from "../room/RoomHeader";
import { MachineList } from "../room/MachineList";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { HostAgentsState } from "../../state/room-types";
import type { PairingSummary } from "../../services/device-pairing.js";

vi.mock("../../services/room-session-controller.js", () => ({}));

const known = (id = "codex", changes: Record<string, unknown> = {}) => ({
  id, label: id === "codex" ? "Codex" : id, present: true, version: "0.157.0", registration: "not-connected" as const,
  connect: "auto" as const, instructions: { command: "/opt/sidevoice/bin/connector mcp --stdio", file: "~/.codex/config.toml", snippet: '[mcp_servers.sidevoice]\ncommand = "/opt/sidevoice/bin/connector"' },
  ...changes,
});

const ready = (agents = [known()]): HostAgentsState => ({
  status: "ready", value: { agents, scanned_at: "2026-10-02T10:00:00Z", custom: { command: "sidevoice connector mcp", snippet: '{"mcpServers":{"sidevoice":{"command":"sidevoice"}}}', version: "connector 4.2.1" } },
  error: null, busy: {}, actionErrors: {},
});

const pairing = (fp: string, host: string): PairingSummary => ({ fp, host, urls: [`https://${host.toLowerCase()}.example`], rv: null,
  device_id: `device-${fp}`, paired_at: 1_700_000_000, revoked: false });

function setActions(actions: Partial<NonNullable<typeof window.sidevoiceActions>>) {
  window.sidevoiceActions = actions as typeof window.sidevoiceActions;
}

test("P10 unreachable and no-connector states offer a retry", async () => {
  for (const [error, copy] of [["unreachable", "This machine cannot be reached right now."], ["no-connector", "Sidevoice is not running on this machine."]] as const) {
    const store = createRoomStore();
    const loadHostAgents = vi.fn(async () => {});
    setActions({ loadHostAgents });
    act(() => store.patch({ hostAgents: { fp: { status: "failed", value: null, error: { key: error }, busy: {}, actionErrors: {} } } }));
    const view = render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent(copy);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Check again" })); });
    expect(loadHostAgents).toHaveBeenCalledWith("fp", { rescan: true });
    view.unmount();
  }
});

test("manual instructions come from the selected host and trigger four-second watch rescans", async () => {
  vi.useFakeTimers();
  try {
    const store = createRoomStore();
    const loadHostAgents = vi.fn(async () => {});
    setActions({ loadHostAgents, hostAgentAction: vi.fn(async () => {}) });
    act(() => store.patch({ hostAgents: { "fp-a": ready() } }));
    render(<RoomProvider store={store}><HostAgentsPanel fp="fp-a" /></RoomProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Do it myself" }));
    expect(screen.getByText("/opt/sidevoice/bin/connector mcp --stdio")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "CODE" && element.textContent?.includes("[mcp_servers.sidevoice]"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show setup" }));
    expect(screen.getByText("connector 4.2.1")).toBeInTheDocument();
    expect(screen.getByText("sidevoice connector mcp")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(loadHostAgents).toHaveBeenCalledWith("fp-a", { rescan: true, watch: "codex" });
  } finally {
    vi.useRealTimers();
  }
});

/** The menu's Settings entry, and the menu trigger that carries the notice. */
const settingsEntry = () => document.getElementById("settings-open") as HTMLButtonElement;
const menuTrigger = () => document.querySelector("#call-menu summary") as HTMLElement;

test("P11 pending notice on the Settings entry routes to its host's Agents screen", async () => {
  const store = createRoomStore();
  const host = pairing("fp-nuc", "NUC");
  const pending = ready([known("cursor", { actionable: true, label: "Cursor" })]);
  const openAgentSettings = vi.fn((fp: string | null) => store.patch({ settingsAgentRequest: { fp, id: 1 } }));
  setActions({ openAgentSettings });
  act(() => store.patch({ pairings: [host], pairingInUse: host.fp, machinesReady: true, hostAgents: { [host.fp]: pending } }));

  render(<RoomProvider store={store}><RoomHeader /><MachineList /></RoomProvider>);
  expect(menuTrigger()).toHaveAttribute("aria-label", "New agents need attention. Open settings.");
  expect(menuTrigger().querySelector(".settings-notice-dot")).toBeInTheDocument();
  const gear = settingsEntry();
  expect(gear.querySelector(".settings-notice-dot")).toBeInTheDocument();
  await act(async () => { fireEvent.click(gear); });
  expect(openAgentSettings).toHaveBeenCalledWith("fp-nuc");
  expect(screen.getByRole("heading", { name: /^NUC/ })).toBeInTheDocument();
  expect(screen.getByText("Not checked yet")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /^Agents/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Cursor")).toBeInTheDocument();
});

test("multiple pending hosts leave an explicit translated choice in Machines", async () => {
  const store = createRoomStore();
  const hosts = [pairing("fp-nuc", "NUC"), pairing("fp-laptop", "Laptop")];
  const openAgentSettings = vi.fn((fp: string | null) => store.patch({ settingsAgentRequest: { fp, id: 2 } }));
  setActions({ openAgentSettings });
  act(() => store.patch({ pairings: hosts, pairingInUse: hosts[0].fp, machinesReady: true,
    hostAgents: { "fp-nuc": ready([known("cursor", { actionable: true })]), "fp-laptop": ready([known("claude", { actionable: true })]) } }));

  render(<RoomProvider store={store}><RoomHeader /><MachineList /></RoomProvider>);
  await act(async () => { fireEvent.click(settingsEntry()); });
  expect(openAgentSettings).toHaveBeenCalledWith(null);
  expect(screen.getByRole("button", { name: "Review agents for NUC" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review agents for Laptop" })).toBeInTheDocument();
});

test("forgotten or revoked hosts cannot leave an orphaned notice on the menu", () => {
  for (const pairings of [[], [{ ...pairing("fp-nuc", "NUC"), revoked: true }]]) {
    const store = createRoomStore();
    const host = pairing("fp-nuc", "NUC");
    act(() => store.patch({ pairings: [host], hostAgents: { [host.fp]: ready([known("cursor", { actionable: true })]) } }));
    const view = render(<RoomProvider store={store}><RoomHeader /></RoomProvider>);
    expect(settingsEntry().querySelector(".settings-notice-dot")).toBeInTheDocument();
    act(() => store.patch({ pairings }));
    expect(settingsEntry().querySelector(".settings-notice-dot")).not.toBeInTheDocument();
    expect(menuTrigger().querySelector(".settings-notice-dot")).not.toBeInTheDocument();
    view.unmount();
  }
});

test("Not now clears that host's agent notice from the menu and machine views", async () => {
  const store = createRoomStore();
  const host = pairing("fp-nuc", "NUC");
  const state = ready([known("cursor", { actionable: true, label: "Cursor" })]);
  setActions({ hostAgentAction: vi.fn(async (_fp: string, id: string, action: "connect" | "disconnect" | "dismiss") => {
    if (action !== "dismiss") return;
    const agents = state.value!.agents.map((agent) => agent.id === id ? { ...agent, dismissed: true, actionable: false } : agent);
    act(() => store.patch({ hostAgents: { [host.fp]: { ...state, value: { ...state.value!, agents } } } }));
  }) });
  act(() => store.patch({ pairings: [host], pairingInUse: host.fp, machinesReady: true, hostAgents: { [host.fp]: state } }));

  render(<RoomProvider store={store}><RoomHeader /><HostAgentsPanel fp={host.fp} /><MachineList /></RoomProvider>);
  const gear = settingsEntry();
  expect(gear.querySelector(".settings-notice-dot")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  await vi.waitFor(() => expect(settingsEntry().querySelector(".settings-notice-dot")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Review agents for NUC" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review agents for NUC" }).querySelector(".host-agent-dot")).not.toBeInTheDocument();
});

test("foreign rows remain read-only and an automatic connection failure opens the host's manual instructions", async () => {
  const foreign = known("claude", { registration: "foreign", actionable: false });
  const store = createRoomStore();
  act(() => store.patch({
    hostAgents: {
      fp: {
        ...ready([foreign, known()]),
        actionErrors: { codex: { key: "connect-failed" } },
      },
    },
  }));
  setActions({ hostAgentAction: vi.fn(async () => {}) });
  render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);

  expect(screen.getByText("Connected to a different MCP server")).toBeInTheDocument();
  const foreignRow = screen.getByText("Connected to a different MCP server").closest("li");
  expect(foreignRow).not.toBeNull();
  expect(within(foreignRow as HTMLElement).queryByRole("button")).toBeNull();
  await waitFor(() => expect(screen.getByText("/opt/sidevoice/bin/connector mcp --stdio")).toBeInTheDocument());
  expect(screen.getByRole("alert")).toHaveTextContent("Could not connect this agent.");
});
