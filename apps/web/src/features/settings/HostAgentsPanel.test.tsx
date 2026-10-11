import { expect, test, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HostAgentsPanel } from "./HostAgentsPanel";
import { RoomHeader } from "../room/RoomHeader";
import { MachineList } from "../room/MachineList";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { DetectedAgent, HostAgentsState } from "../../state/room-types";
import type { PairingSummary } from "../../services/device-pairing.js";

vi.mock("../../services/room-session-controller.js", () => ({}));

afterEach(() => { localStorage.removeItem("sidevoice.variants"); });

/** The connector's steps for Codex, as it writes them: connecting (a command, or the file's snippet), taking Sidevoice
 *  out, and replacing another "sidevoice" entry (remove it, then connect). */
const STEPS = {
  connect: [{ command: "/opt/sidevoice/bin/connector mcp --stdio" }, { file: "~/.codex/config.toml", snippet: '[mcp_servers.sidevoice]\ncommand = "/opt/sidevoice/bin/connector"' }],
  disconnect: [{ command: "codex mcp remove sidevoice" }],
  replace: [{ command: "codex mcp remove sidevoice" }, { command: "codex mcp add sidevoice -- /opt/sidevoice/bin/connector mcp --stdio" }],
};

/** An agent as the connector reports it: what it can do itself (`can`) and the steps to do each by hand (`manual`). */
const known = (id = "codex", changes: Partial<DetectedAgent> = {}): DetectedAgent => ({
  id, label: id === "codex" ? "Codex" : id, present: true, version: "0.157.0", registration: "not-connected",
  connect: "auto", can: { connect: true, update: true, disconnect: true }, manual: STEPS,
  ...changes,
});

const ready = (agents = [known()]): HostAgentsState => ({
  status: "ready", value: { agents, scanned_at: "2026-10-02T10:00:00Z", custom: { command: "sidevoice connector mcp", snippet: '{"mcpServers":{"sidevoice":{"command":"sidevoice"}}}', version: "connector 4.2.1" } },
  error: null, busy: {}, actionErrors: {},
});

const pairing = (fp: string, host: string): PairingSummary => ({ fp, host, urls: [`https://${host.toLowerCase()}.example`], rv: null,
  device_id: `device-${fp}`, paired_at: 1_700_000_000, revoked: false });

/** The steps shown in a row, each a block to copy, in order. */
const steps = (row: HTMLElement) => [...row.querySelectorAll(".host-agent-steps .ui-snippet-text")].map((step) => step.textContent);

function setActions(actions: Partial<NonNullable<typeof window.sidevoiceActions>>) {
  window.sidevoiceActions = actions as typeof window.sidevoiceActions;
}

test("P10 a search that failed with nothing found keeps the heading, says why quietly, and offers Search again", async () => {
  for (const [error, copy] of [["unreachable", "This machine cannot be reached right now."], ["no-connector", "Sidevoice is not running on this machine."]] as const) {
    const store = createRoomStore();
    const loadHostAgents = vi.fn(async () => {});
    setActions({ loadHostAgents });
    act(() => store.patch({ hostAgents: { fp: { status: "failed", value: null, error: { key: error }, busy: {}, actionErrors: {} } } }));
    const view = render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);
    expect(screen.getByRole("heading", { name: "Agents" })).toBeInTheDocument();
    expect(document.querySelector(".host-agent-problem-quiet")).toHaveTextContent(copy);
    expect(screen.queryByRole("alert")).toBeNull();
    // Opening the panel searched once already; Search again searches once more.
    loadHostAgents.mockClear();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Search again" })); });
    expect(loadHostAgents).toHaveBeenCalledExactlyOnceWith("fp", { rescan: true });
    view.unmount();
  }
});

test("manual instructions come from the selected host and trigger four-second watch rescans", async () => {
  // The watch's interval faked; Radix's menu runs on real timeouts.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  let view: ReturnType<typeof render> | undefined;
  try {
    const store = createRoomStore();
    const loadHostAgents = vi.fn(async () => {});
    setActions({ loadHostAgents, hostAgentAction: vi.fn(async () => {}) });
    act(() => store.patch({ hostAgents: { "fp-a": ready([known("codex", { can: { connect: false, update: false, disconnect: true } })]) } }));
    view = render(<RoomProvider store={store}><HostAgentsPanel fp="fp-a" /></RoomProvider>);
    const row = document.querySelector(".host-agent-row") as HTMLElement;

    // What the connector can't do itself is done by hand: no Connect, and the row says so.
    expect(row).toHaveTextContent("Connect it manually");
    expect(within(row).queryByRole("button", { name: "Connect Codex to Sidevoice" })).toBeNull();
    fireEvent.click(within(row).getByText("I’ll do it myself"));
    expect(steps(row)).toEqual(["/opt/sidevoice/bin/connector mcp --stdio", '[mcp_servers.sidevoice]\ncommand = "/opt/sidevoice/bin/connector"']);
    expect(row).toHaveTextContent("File: ~/.codex/config.toml");
    fireEvent.click(screen.getByText("Don’t see yours? Connect it by hand"));
    expect(screen.getByText("sidevoice connector mcp")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(loadHostAgents).toHaveBeenCalledWith("fp-a", { rescan: true, watch: "codex" });
  } finally {
    // Unmounted on the fake clock, so its intervals go with it.
    view?.unmount();
    vi.useRealTimers();
  }
});

/** The menu's Settings entry, and the menu trigger that carries the notice. */
const settingsEntry = () => document.getElementById("settings-open") as HTMLButtonElement;

const entry = (name: string) => document.querySelector<HTMLElement>(`.machines-inline .machine-entry[data-name="${name}"]`);

test("P11 an agent new on a machine marks the gear, opens Settings at that machine's agents, and is marked New there", async () => {
  const store = createRoomStore();
  const host = pairing("fp-nuc", "NUC");
  const pending = ready([known("cursor", { actionable: true, label: "Cursor" })]);
  const openAgentSettings = vi.fn((fp: string | null) => store.patch({ settingsAgentRequest: { fp, id: 1 } }));
  setActions({ openAgentSettings });
  act(() => store.patch({ pairings: [host], pairingInUse: host.fp, machinesReady: true, hostAgents: { [host.fp]: pending } }));

  render(<RoomProvider store={store}><RoomHeader /><MachineList /></RoomProvider>);
  const gear = settingsEntry();
  expect(gear).toHaveAttribute("aria-label", "Settings, 1 new");
  expect(gear.querySelector(".settings-notice-dot")).toBeInTheDocument();
  await act(async () => { fireEvent.click(gear); });
  expect(openAgentSettings).toHaveBeenCalledWith("fp-nuc");
  expect(entry("NUC")).toHaveAttribute("aria-current", "page");
  expect(entry("NUC")!.querySelector(".new-dot")).toHaveTextContent(", new");
  expect(screen.getAllByText("Not checked yet").length).toBeGreaterThan(0);
  expect(document.getElementById("host-agents-title")).toHaveTextContent("Agents");
  // Cursor is connected by the connector itself (it edits Cursor's file): Connect, and "New" on the row.
  const row = screen.getByText("Cursor").closest("li") as HTMLElement;
  expect(within(row).getByText("New")).toBeInTheDocument();
  expect(within(row).getByRole("button", { name: "Connect Cursor to Sidevoice" })).toBeInTheDocument();
});

test("the runtime's Settings handler on the menu entry survives the header's renders, and still opens at the agents", async () => {
  const store = createRoomStore();
  const host = pairing("fp-nuc", "NUC");
  const openAgentSettings = vi.fn();
  setActions({ openAgentSettings });
  act(() => store.patch({ pairings: [host], pairingInUse: host.fp, machinesReady: true, hostAgents: { [host.fp]: ready([known("cursor", { actionable: true })]) } }));
  render(<RoomProvider store={store}><RoomHeader /></RoomProvider>);
  // The runtime wires the entry once it loads, as room-session-controller.js does.
  const openSettings = vi.fn();
  settingsEntry().onclick = openSettings;
  // Renders that change the notice must leave that handler alone.
  act(() => store.patch({ hostAgents: { [host.fp]: ready([known("cursor", { actionable: true }), known("claude", { actionable: true })]) } }));
  act(() => store.patch({ hostAgents: {} }));
  act(() => store.patch({ hostAgents: { [host.fp]: ready([known("cursor", { actionable: true })]) } }));
  expect(settingsEntry().onclick).toBe(openSettings);
  await act(async () => { fireEvent.click(settingsEntry()); });
  expect(openSettings).toHaveBeenCalledTimes(1);
  expect(openAgentSettings).toHaveBeenCalledWith("fp-nuc");
});

test("agents new on two machines: the gear counts them, Settings opens at the first, and each machine's entry has the dot", async () => {
  const store = createRoomStore();
  const hosts = [pairing("fp-nuc", "NUC"), pairing("fp-laptop", "Laptop")];
  const openAgentSettings = vi.fn((fp: string | null) => store.patch({ settingsAgentRequest: { fp, id: 2 } }));
  setActions({ openAgentSettings });
  act(() => store.patch({ pairings: hosts, pairingInUse: hosts[0].fp, machinesReady: true,
    hostAgents: { "fp-nuc": ready([known("cursor", { actionable: true })]), "fp-laptop": ready([known("claude", { actionable: true })]) } }));

  render(<RoomProvider store={store}><RoomHeader /><MachineList /></RoomProvider>);
  expect(settingsEntry()).toHaveAttribute("aria-label", "Settings, 2 new");
  await act(async () => { fireEvent.click(settingsEntry()); });
  expect(openAgentSettings).toHaveBeenCalledWith("fp-nuc");
  // Each machine under Machines carries the dot, said in words to a screen reader.
  expect(entry("NUC")!.querySelector(".new-dot")).toHaveTextContent(", new");
  expect(entry("Laptop")!.querySelector(".new-dot")).toHaveTextContent(", new");
});

test("forgotten or revoked hosts cannot leave an orphaned notice on the gear", () => {
  for (const pairings of [[], [{ ...pairing("fp-nuc", "NUC"), revoked: true }]]) {
    const store = createRoomStore();
    const host = pairing("fp-nuc", "NUC");
    act(() => store.patch({ pairings: [host], hostAgents: { [host.fp]: ready([known("cursor", { actionable: true })]) } }));
    const view = render(<RoomProvider store={store}><RoomHeader /></RoomProvider>);
    expect(settingsEntry().querySelector(".settings-notice-dot")).toBeInTheDocument();
    act(() => store.patch({ pairings }));
    expect(settingsEntry().querySelector(".settings-notice-dot")).not.toBeInTheDocument();
    view.unmount();
  }
});

test("a foreign Codex row is short, with the why in its (i), and replacing it by hand is the connector's steps, each to copy", async () => {
  const foreign = known("codex", { registration: "foreign", actionable: false });
  const store = createRoomStore();
  const hostAgentAction = vi.fn(async () => {});
  const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const writeText = vi.fn(async (_value: string) => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  setActions({ hostAgentAction });
  act(() => store.patch({ hostAgents: { fp: ready([foreign]) } }));
  try {
    render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);

    const foreignRow = screen.getByText("Another ‘sidevoice’ entry").closest("li") as HTMLElement;
    expect(within(foreignRow).getByRole("button", { name: "About Codex’s status" })).toBeInTheDocument();
    // Never touched by Sidevoice: no Connect, no Disconnect.
    expect(within(foreignRow).queryByRole("button", { name: /^Connect / })).toBeNull();
    expect(within(foreignRow).queryByRole("button", { name: /^Disconnect/ })).toBeNull();

    fireEvent.click(within(foreignRow).getByRole("button", { name: "Replace manually" }));
    expect(steps(foreignRow)).toEqual(["codex mcp remove sidevoice", "codex mcp add sidevoice -- /opt/sidevoice/bin/connector mcp --stdio"]);
    expect(foreignRow).toHaveTextContent("after you replace the agent configuration");
    await act(async () => { fireEvent.click(within(foreignRow).getAllByRole("button", { name: "Copy" })[0]); });
    expect(writeText).toHaveBeenCalledWith("codex mcp remove sidevoice");
    expect(hostAgentAction).not.toHaveBeenCalled();
  } finally {
    if (previousClipboard) Object.defineProperty(navigator, "clipboard", previousClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

test("foreign Codex manual replacement closes and confirms on connect, then stays closed after disconnect", () => {
  vi.useFakeTimers();
  const foreign = known("codex", { registration: "foreign", actionable: false });
  const store = createRoomStore();
  const hostAgentAction = vi.fn(async () => {});
  setActions({ hostAgentAction });
  act(() => store.patch({ hostAgents: { fp: ready([foreign]) } }));
  let view: ReturnType<typeof render> | undefined;
  try {
    view = render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);
    const row = screen.getByText("Another ‘sidevoice’ entry").closest("li") as HTMLElement;
    const reveal = within(row).getByRole("button", { name: "Replace manually" });
    fireEvent.click(reveal);
    expect(reveal).toHaveAttribute("aria-expanded", "true");
    expect(row).toHaveTextContent("codex mcp add sidevoice");

    const connected = known("codex", { registration: "connected", actionable: false });
    act(() => store.patch({ hostAgents: { fp: ready([connected]) } }));
    expect(row).not.toHaveTextContent("codex mcp add sidevoice");
    expect(row).toHaveTextContent("Codex is ready for new conversations");
    expect(within(row).getByRole("button", { name: /^Disconnect .* from Sidevoice$/ })).toBeInTheDocument();
    expect(hostAgentAction).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(5000); });
    expect(row).not.toHaveTextContent("Codex is ready for new conversations");
    fireEvent.click(within(row).getByRole("button", { name: /^Disconnect .* from Sidevoice$/ }));
    expect(hostAgentAction).not.toHaveBeenCalledWith("fp", "codex", "disconnect");
    expect(within(row).getByRole("group", { name: /^Disconnect .* from Sidevoice$/ })).toHaveTextContent("MCP servers");
    fireEvent.click(within(row).getByRole("button", { name: /^Remove from / }));
    expect(hostAgentAction).toHaveBeenCalledWith("fp", "codex", "disconnect");

    const disconnected = known("codex", { registration: "not-connected", actionable: false });
    act(() => store.patch({ hostAgents: { fp: ready([disconnected]) } }));
    expect(within(row).getByRole("button", { name: "I’ll do it myself" })).toHaveAttribute("aria-expanded", "false");
    expect(row).not.toHaveTextContent("codex mcp add sidevoice");
  } finally {
    view?.unmount();
    vi.useRealTimers();
  }
});

test("foreign rows without host instructions stay read-only while an automatic connection failure opens manual setup", async () => {
  const foreign = known("claude", { registration: "foreign", actionable: false, manual: null });
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

  const foreignRow = screen.getByText("Another ‘sidevoice’ entry").closest("li") as HTMLElement;
  // Nothing to do on it here, only its (i) to say why.
  expect(foreignRow.querySelectorAll(".host-agent-actions button")).toHaveLength(0);
  expect(within(foreignRow).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["About claude’s status"]);
  await waitFor(() => expect(screen.getByText("/opt/sidevoice/bin/connector mcp --stdio")).toBeInTheDocument());
  expect(screen.getByRole("alert")).toHaveTextContent("Could not connect this agent.");
});

test("a row is always its name and one status line: connecting turns that line to ready, then connected; disconnecting, to not connected", () => {
  vi.useFakeTimers();
  try {
    const store = createRoomStore();
    setActions({ loadHostAgents: vi.fn(async () => {}) });
    const notConnected = known();
    act(() => store.patch({ hostAgents: { fp: ready([notConnected]) } }));
    render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);
    const row = () => document.querySelector(".host-agent-row") as HTMLElement;
    const lines = () => [...row().querySelectorAll(".host-agent-status")].map((line) => line.textContent);
    expect(lines()).toEqual(["Not connected"]);
    act(() => store.patch({ hostAgents: { fp: ready([known("codex", { registration: "connected" })]) } }));
    expect(lines()).toEqual(["Codex is ready for new conversations"]);
    expect(row().querySelector(".host-agent-status")).toHaveClass("host-agent-ok");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(lines()).toEqual(["Connected to Sidevoice"]);
    act(() => store.patch({ hostAgents: { fp: ready([notConnected]) } }));
    expect(lines()).toEqual(["Not connected"]);
  } finally { vi.useRealTimers(); }
});

test("the row's actions: doing it by hand, and Connect or Disconnect, are buttons on the row, as the connector can", () => {
  const store = createRoomStore();
  setActions({ loadHostAgents: vi.fn(async () => {}), hostAgentAction: vi.fn(async () => {}) });
  act(() => store.patch({ hostAgents: { fp: ready() } }));
  render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);
  const row = () => document.querySelector(".host-agent-row") as HTMLElement;
  const actions = () => [...row().querySelectorAll(".host-agent-actions button")].map((button) => button.textContent);
  expect(actions()).toEqual(["I’ll do it myself", "Connect"]);
  fireEvent.click(within(row()).getByText("I’ll do it myself"));
  expect(steps(row())[0]).toBe("/opt/sidevoice/bin/connector mcp --stdio");

  // Connected: taking Sidevoice out, by hand (its own steps) or by Disconnect.
  act(() => store.patch({ hostAgents: { fp: ready([known("codex", { registration: "connected" })]) } }));
  expect(actions()).toEqual(["I’ll do it myself", "Disconnect"]);
  fireEvent.click(within(row()).getByText("I’ll do it myself"));
  expect(steps(row())).toEqual(["codex mcp remove sidevoice"]);
  expect(row()).toHaveTextContent("after you remove it");
  // A connector that can't take it out itself leaves only the steps.
  act(() => store.patch({ hostAgents: { fp: ready([known("codex", { registration: "connected", can: { connect: true, update: true, disconnect: false } })]) } }));
  expect(actions()).toEqual(["I’ll do it myself"]);
});

