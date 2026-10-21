import { expect, test, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HostAgentsPanel, sidevoiceEntry } from "./HostAgentsPanel";
import { RoomHeader } from "../room/RoomHeader";
import { MachineList } from "../room/MachineList";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { AgentReadinessStatus, DetectedAgent, HostAgentsState } from "../../state/room-types";
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

const pairing = (fp: string, host: string): PairingSummary => ({ fp, host, urls: [`https://${host.toLowerCase()}.example`],
  device_id: `device-${fp}`, paired_at: 1_700_000_000, revoked: false });

/** The steps shown in a row, each a block to copy, in order. */
const steps = (row: HTMLElement) => [...row.querySelectorAll(".host-agent-steps .ui-snippet-text")].map((step) => step.textContent);
/** What each step's block is, in order: Command, Commands, File: …, Configuration. */
const labels = (row: HTMLElement) => [...row.querySelectorAll(".host-agent-steps .host-agent-howto-label")].map((label) => label.textContent);

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

test("a search that failed for a reason with no words here says the panel's own line, its key behind Details", () => {
  const store = createRoomStore();
  setActions({ loadHostAgents: vi.fn(async () => {}) });
  act(() => store.patch({ hostAgents: { fp: { status: "failed", value: null, error: { key: "connector.quarantined" }, busy: {}, actionErrors: {} } } }));
  render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);
  const quiet = document.querySelector(".host-agent-problem-quiet")!;
  expect(quiet.querySelector("p")).toHaveTextContent(/^This action could not be completed\.$/);
  expect(quiet.querySelector("details:not([open]) > pre")!.textContent).toBe("connector.quarantined");
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
    expect(document.querySelector("#host-agent-other-howto code")?.textContent).toBe('"sidevoice": {\n  "command": "sidevoice"\n}');
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

test("P11 an agent new on a machine: off for this release, no mark on the gear, the machine or the agent; Settings opens at that machine's agents", async () => {
  const store = createRoomStore();
  const host = pairing("fp-nuc", "NUC");
  const pending = ready([known("cursor", { actionable: true, label: "Cursor" })]);
  const openAgentSettings = vi.fn((fp: string | null) => store.patch({ settingsAgentRequest: { fp, id: 1 } }));
  setActions({ openAgentSettings });
  act(() => store.patch({ pairings: [host], machinesReady: true, hostAgents: { [host.fp]: pending } }));

  render(<RoomProvider store={store}><RoomHeader /><MachineList /></RoomProvider>);
  const gear = settingsEntry();
  expect(gear).toHaveAttribute("aria-label", "Settings");
  expect(gear.querySelector(".settings-notice")).toBeNull();
  await act(async () => { fireEvent.click(gear); });
  // Opening Settings never jumps to what is new.
  expect(openAgentSettings).not.toHaveBeenCalled();
  expect(entry("NUC")).toHaveAttribute("aria-current", "page");
  expect(entry("NUC")!.querySelector(".new-on-icon-dot, .new-end-dot")).toBeNull();
  expect(entry("NUC")).toHaveAttribute("aria-label", expect.not.stringContaining("new"));
  expect(screen.getAllByText("Checking…").length).toBeGreaterThan(0);
  expect(document.getElementById("host-agents-title")).toHaveTextContent("Agents");
  // Cursor is connected by the connector itself (it edits Cursor's file): Connect, and no "New" on the row.
  const row = screen.getByText("Cursor").closest("li") as HTMLElement;
  expect(within(row).queryByText("New")).toBeNull();
  expect(row.querySelector(".new-mark")).toBeNull();
  expect(within(row).getByRole("button", { name: "Connect Cursor to Sidevoice" })).toBeInTheDocument();
});

test("the runtime's Settings handler on the menu entry survives the header's renders, and still opens at the agents", async () => {
  const store = createRoomStore();
  const host = pairing("fp-nuc", "NUC");
  const openAgentSettings = vi.fn();
  setActions({ openAgentSettings });
  act(() => store.patch({ pairings: [host], machinesReady: true, hostAgents: { [host.fp]: ready([known("cursor", { actionable: true })]) } }));
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
  // Opening Settings never jumps to what is new: the marks on the entries lead there.
  expect(openAgentSettings).not.toHaveBeenCalled();
});

test("agents new on two machines: off for this release, no count on the gear and no mark on either machine's entry", async () => {
  const store = createRoomStore();
  const hosts = [pairing("fp-nuc", "NUC"), pairing("fp-laptop", "Laptop")];
  const openAgentSettings = vi.fn((fp: string | null) => store.patch({ settingsAgentRequest: { fp, id: 2 } }));
  setActions({ openAgentSettings });
  act(() => store.patch({ pairings: hosts, machinesReady: true,
    hostAgents: { "fp-nuc": ready([known("cursor", { actionable: true })]), "fp-laptop": ready([known("claude", { actionable: true })]) } }));

  render(<RoomProvider store={store}><RoomHeader /><MachineList /></RoomProvider>);
  expect(settingsEntry()).toHaveAttribute("aria-label", "Settings");
  expect(settingsEntry().querySelector(".settings-notice")).toBeNull();
  await act(async () => { fireEvent.click(settingsEntry()); });
  // Opening Settings never jumps to what is new.
  expect(openAgentSettings).not.toHaveBeenCalled();
  // Neither machine under Machines carries a mark, nor says "new" to a screen reader.
  for (const name of ["NUC", "Laptop"]) {
    expect(entry(name)!.querySelector(".new-on-icon-dot, .new-end-dot")).toBeNull();
    expect(entry(name)).toHaveAttribute("aria-label", expect.not.stringContaining("new"));
  }
});

test("forgotten or revoked hosts leave no notice on the gear (none shows at all for this release)", () => {
  for (const pairings of [[], [{ ...pairing("fp-nuc", "NUC"), revoked: true }]]) {
    const store = createRoomStore();
    const host = pairing("fp-nuc", "NUC");
    act(() => store.patch({ pairings: [host], hostAgents: { [host.fp]: ready([known("cursor", { actionable: true })]) } }));
    const view = render(<RoomProvider store={store}><RoomHeader /></RoomProvider>);
    expect(settingsEntry().querySelector(".settings-notice")).not.toBeInTheDocument();
    act(() => store.patch({ pairings }));
    expect(settingsEntry().querySelector(".settings-notice")).not.toBeInTheDocument();
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

    const foreignRow = screen.getByText("· Another ‘sidevoice’ entry").closest("li") as HTMLElement;
    expect(within(foreignRow).getByRole("button", { name: "About Codex’s status" })).toBeInTheDocument();
    // Never touched by Sidevoice: no Connect, no Disconnect.
    expect(within(foreignRow).queryByRole("button", { name: /^Connect / })).toBeNull();
    expect(within(foreignRow).queryByRole("button", { name: /^Disconnect/ })).toBeNull();

    fireEvent.click(within(foreignRow).getByRole("button", { name: "Replace manually" }));
    // Two commands one after the other: one step, a line each, copied at once.
    expect(steps(foreignRow)).toEqual(["codex mcp remove sidevoice\ncodex mcp add sidevoice -- /opt/sidevoice/bin/connector mcp --stdio"]);
    expect(labels(foreignRow)).toEqual(["Commands"]);
    expect(foreignRow).toHaveTextContent("after you replace the agent configuration");
    const copy = within(foreignRow).getAllByRole("button", { name: "Copy" })[0];
    await act(async () => { fireEvent.click(copy); });
    expect(writeText).toHaveBeenCalledWith("codex mcp remove sidevoice\ncodex mcp add sidevoice -- /opt/sidevoice/bin/connector mcp --stdio");
    // Copying turns its button into a check and says so out of sight.
    expect(copy).toHaveAttribute("data-state", "copied");
    expect(within(foreignRow).getByText("Copied")).toHaveClass("ui-copy-live");
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
    const row = screen.getByText("· Another ‘sidevoice’ entry").closest("li") as HTMLElement;
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

  const foreignRow = screen.getByText("· Another ‘sidevoice’ entry").closest("li") as HTMLElement;
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
    expect(lines()).toEqual(["Connected"]);
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

test("an entry an older Sidevoice set up says so, with the why in its (i), and Update rewrites it where the connector can", async () => {
  const store = createRoomStore();
  const hostAgentAction = vi.fn(async () => {});
  setActions({ loadHostAgents: vi.fn(async () => {}), hostAgentAction });
  act(() => store.patch({ hostAgents: { fp: ready([known("codex", { registration: "outdated", actionable: false })]) } }));
  render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);
  const row = () => document.querySelector(".host-agent-row") as HTMLElement;
  expect(row()).toHaveTextContent("Set up by an older Sidevoice");
  expect(within(row()).getByRole("button", { name: "About Codex’s status" })).toBeInTheDocument();
  const update = within(row()).getByRole("button", { name: "Update Codex’s Sidevoice entry" });
  expect(update).toHaveTextContent("Update");
  await act(async () => { fireEvent.click(update); });
  expect(hostAgentAction).toHaveBeenCalledWith("fp", "codex", "connect");
  // A connector that can't rewrite it leaves it to be done by hand.
  act(() => store.patch({ hostAgents: { fp: ready([known("codex", { registration: "outdated", actionable: false, can: { connect: true, update: false, disconnect: true } })]) } }));
  expect(within(row()).queryByRole("button", { name: /^Update / })).toBeNull();
  expect(within(row()).getByRole("button", { name: "I’ll do it myself" })).toBeInTheDocument();
});

test("by hand, commands one after another are one step with one snippet, a line each; a file between them splits them", () => {
  const store = createRoomStore();
  setActions({ loadHostAgents: vi.fn(async () => {}), hostAgentAction: vi.fn(async () => {}) });
  const twoCommands = { ...STEPS, connect: [{ command: "codex mcp remove sidevoice" }, { command: "codex mcp add sidevoice -- connector" }] };
  act(() => store.patch({ hostAgents: { fp: ready([known("codex", { manual: twoCommands })]) } }));
  render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);
  const row = () => document.querySelector(".host-agent-row") as HTMLElement;
  fireEvent.click(within(row()).getByText("I’ll do it myself"));
  expect(row().querySelectorAll(".host-agent-steps > li")).toHaveLength(1);
  expect(row().querySelectorAll(".host-agent-steps .ui-snippet")).toHaveLength(1);
  expect(steps(row())).toEqual(["codex mcp remove sidevoice\ncodex mcp add sidevoice -- connector"]);
  expect(steps(row())[0]!.split("\n")).toHaveLength(2);
  expect(labels(row())).toEqual(["Commands"]);

  // A command, a file to edit (Cursor's way), a command: three steps, the file's on its own.
  const split = { ...STEPS, connect: [{ command: "first --one" }, { file: "~/.cursor/mcp.json", snippet: '{"mcpServers":{}}' }, { command: "second --two" }] };
  act(() => store.patch({ hostAgents: { fp: ready([known("codex", { manual: split })]) } }));
  expect(row().querySelectorAll(".host-agent-steps > li")).toHaveLength(3);
  expect(steps(row())).toEqual(["first --one", '{"mcpServers":{}}', "second --two"]);
  expect(labels(row())).toEqual(["Command", "File: ~/.cursor/mcp.json", "Command"]);
});

test("in Spanish, several commands are Comandos", () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  try {
    const store = createRoomStore();
    setActions({ loadHostAgents: vi.fn(async () => {}), hostAgentAction: vi.fn(async () => {}) });
    act(() => store.patch({ hostAgents: { fp: ready([known("codex", { manual: { ...STEPS, connect: [{ command: "a" }, { command: "b" }] } })]) } }));
    render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);
    const row = document.querySelector(".host-agent-row") as HTMLElement;
    fireEvent.click(within(row).getByText("Lo hago yo"));
    expect(labels(row)).toEqual(["Comandos"]);
  } finally { localStorage.removeItem("sidevoice.settings"); }
});

test("a row's status is one of three — Connected, Not connected, Needs attention — the last with its reason after it", () => {
  const store = createRoomStore();
  setActions({ loadHostAgents: vi.fn(async () => {}), hostAgentAction: vi.fn(async () => {}) });
  render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);
  const row = () => document.querySelector(".host-agent-row") as HTMLElement;
  const status = () => row().querySelector(".host-agent-status") as HTMLElement;
  const reason = () => status().querySelector(".host-agent-reason")?.textContent ?? null;
  const cases: [Partial<DetectedAgent>, string, string | null, string][] = [
    [{ registration: "connected" }, "Connected", null, "host-agent-ok"],
    [{ registration: "not-connected" }, "Not connected", null, "muted"],
    [{ registration: "not-connected", can: { connect: false, update: false, disconnect: false } }, "Not connected", " · Connect it manually", "muted"],
    [{ registration: "outdated", actionable: false }, "Needs attention", " · Set up by an older Sidevoice", "host-agent-attention"],
    [{ registration: "foreign", actionable: false }, "Needs attention", " · Another ‘sidevoice’ entry", "host-agent-attention"],
    [{ registration: "invalid", actionable: false }, "Needs attention", " · Its MCP settings can’t be read", "host-agent-attention"],
  ];
  for (const [changes, state, why, tone] of cases) {
    act(() => store.patch({ hostAgents: { fp: ready([known("codex", changes)]) } }));
    expect(status().firstChild?.textContent).toBe(state);
    expect(reason()).toBe(why);
    expect(status()).toHaveClass(tone);
    expect(status()).toHaveAttribute("title", why ? state + why : state);
    // Needs attention keeps its (i), the why.
    if (state === "Needs attention") expect(within(row()).getByRole("button", { name: "About Codex’s status" })).toBeInTheDocument();
  }
  // Needs attention keeps the row's action: Update where the connector can rewrite it, by hand otherwise.
  act(() => store.patch({ hostAgents: { fp: ready([known("codex", { registration: "outdated", actionable: false })]) } }));
  expect(within(row()).getByRole("button", { name: "Update Codex’s Sidevoice entry" })).toBeInTheDocument();
  act(() => store.patch({ hostAgents: { fp: ready([known("codex", { registration: "foreign", actionable: false })]) } }));
  expect(within(row()).getByRole("button", { name: "Replace manually" })).toBeInTheDocument();
});

test("by hand, a remote machine's steps say where to run them; this device's don't", () => {
  const remote = pairing("fp-nuc", "NUC");
  const here: PairingSummary = { ...pairing("fp-local", "MacBook"), local: true };
  setActions({ loadHostAgents: vi.fn(async () => {}), hostAgentAction: vi.fn(async () => {}) });
  for (const [fp, where] of [["fp-nuc", "Run these on NUC:"], ["fp-local", null]] as const) {
    const store = createRoomStore();
    act(() => store.patch({ pairings: [here, remote], machinesReady: true, hostAgents: { [fp]: ready() } }));
    const view = render(<RoomProvider store={store}><HostAgentsPanel fp={fp} /></RoomProvider>);
    const row = document.querySelector(".host-agent-row") as HTMLElement;
    fireEvent.click(within(row).getByText("I’ll do it myself"));
    const line = row.querySelector(".host-agent-where");
    expect(line?.textContent ?? null).toBe(where);
    // Above the steps.
    if (line) expect(line.nextElementSibling).toHaveClass("host-agent-steps");
    expect(steps(row).length).toBeGreaterThan(0);
    view.unmount();
  }
});

test("in Spanish, a remote machine's steps say Ejecuta esto en …", () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  try {
    const store = createRoomStore();
    setActions({ loadHostAgents: vi.fn(async () => {}), hostAgentAction: vi.fn(async () => {}) });
    act(() => store.patch({ pairings: [pairing("fp-nuc", "NUC")], machinesReady: true, hostAgents: { "fp-nuc": ready() } }));
    render(<RoomProvider store={store}><HostAgentsPanel fp="fp-nuc" /></RoomProvider>);
    const row = document.querySelector(".host-agent-row") as HTMLElement;
    fireEvent.click(within(row).getByText("Lo hago yo"));
    expect(row.querySelector(".host-agent-where")).toHaveTextContent("Ejecuta esto en NUC:");
  } finally { localStorage.removeItem("sidevoice.settings"); }
});

test("a registration this app does not know reads as unknown, with nothing to do unless the connector says it can connect (core#112)", () => {
  const store = createRoomStore();
  setActions({ loadHostAgents: vi.fn(async () => {}), hostAgentAction: vi.fn(async () => {}) });
  render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);
  const row = () => document.querySelector(".host-agent-row") as HTMLElement;
  const status = () => row().querySelector(".host-agent-status") as HTMLElement;
  const actions = () => [...row().querySelectorAll(".host-agent-actions button")].map((button) => button.textContent);
  // A newer connector's value, extra fields and all: not "Not connected", no Connect, no steps by hand.
  const newer = { registration: "pending-approval", approval: { by: "admin" } } as unknown as Partial<DetectedAgent>;
  act(() => store.patch({ hostAgents: { fp: ready([known("codex", { ...newer, can: undefined, connect: "auto" })]) } }));
  expect(status().firstChild?.textContent).toBe("Connection status is unknown");
  expect(status()).toHaveClass("muted");
  expect(actions()).toEqual([]);
  // Where the connector itself says it can connect, Connect is there; still nothing by hand, and nothing marked new.
  act(() => store.patch({ hostAgents: { fp: ready([known("codex", newer)]) } }));
  expect(status().firstChild?.textContent).toBe("Connection status is unknown");
  expect(actions()).toEqual(["Connect"]);
  act(() => store.patch({ hostAgents: { fp: ready([known("codex", { ...newer, can: { connect: false, update: false, disconnect: false } })]) } }));
  expect(actions()).toEqual([]);
});

test("a machine with only Cursor installed lists Cursor, and Other to connect any agent by hand", () => {
  const store = createRoomStore();
  setActions({ loadHostAgents: vi.fn(async () => {}), hostAgentAction: vi.fn(async () => {}) });
  // Claude Code connected long ago and Codex, neither installed any more: not shown, whatever their registration.
  act(() => store.patch({ hostAgents: { fp: ready([
    known("cursor", { label: "Cursor", version: null }),
    known("claude", { label: "Claude Code", present: false, registration: "connected" }),
    known("codex", { present: false }),
  ]) } }));
  render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);
  expect([...document.querySelectorAll(".host-agent-row .host-agent-name strong")].map((name) => name.textContent)).toEqual(["Cursor"]);
  const other = screen.getByRole("button", { name: "Don’t see yours? Connect it by hand" });
  fireEvent.click(other);
  // What to do — add Sidevoice to the agent's MCP servers — and only Sidevoice's entry to paste there: not the whole
  // configuration, and not the bare command (the entry holds it, with its environment).
  const howto = document.querySelector("#host-agent-other-howto")!;
  expect(howto).toHaveTextContent("Add Sidevoice to your agent’s list of MCP servers");
  expect(howto.querySelectorAll(".ui-snippet")).toHaveLength(1);
  expect(howto.querySelector(".ui-snippet code")?.textContent).toBe('"sidevoice": {\n  "command": "sidevoice"\n}');
  expect(howto).not.toHaveTextContent("sidevoice connector mcp");
  expect(screen.getByRole("button", { name: "Copy the Sidevoice entry" })).toBeInTheDocument();
});

test("the entry to paste is Sidevoice's own under mcpServers, as the connector registers it, whole", () => {
  const entry = { command: "/opt/sidevoice/bin/sidevoice-connector", args: ["mcp"], env: { SIDEVOICE_DATA_DIR: "/home/ana/.local/share/sidevoice" } };
  const pasted = sidevoiceEntry(JSON.stringify({ mcpServers: { sidevoice: entry } }, null, 2));
  expect(pasted.startsWith('"sidevoice": {')).toBe(true);
  // Pasted into a list of servers, it is that member, exactly.
  expect(JSON.parse(`{${pasted}}`)).toEqual({ sidevoice: entry });
  // Anything of another shape is shown as it came.
  expect(sidevoiceEntry("not json")).toBe("not json");
  expect(sidevoiceEntry('{"servers":{}}')).toBe('{"servers":{}}');
});

test("readiness works for any agent, while an absent field leaves the Codex card unchanged", () => {
  const store = createRoomStore();
  setActions({ loadHostAgents: vi.fn(async () => {}), hostAgentAction: vi.fn(async () => {}) });
  const agents = (state: AgentReadinessStatus["state"], reasons: AgentReadinessStatus["reasons"]) => ready([
    known("cursor", { label: "Cursor", registration: "connected", readiness: { state, reasons } }),
    known("codex", { registration: "connected" }),
  ]);
  act(() => store.patch({ hostAgents: { fp: agents("needs_attention", [{ code: "cursor.bridge_not_running", message: "Connector English fallback" }]) } }));
  render(<RoomProvider store={store}><HostAgentsPanel fp="fp" /></RoomProvider>);
  const [cursor, codex] = [...document.querySelectorAll<HTMLElement>(".host-agent-row")];
  const codexBefore = codex.innerHTML;
  expect(within(cursor).getByRole("button", { name: "Needs attention" })).toBeInTheDocument();
  fireEvent.click(within(cursor).getByRole("button", { name: "Needs attention" }));
  expect(within(cursor).getByRole("group", { name: "Needs attention" })).toHaveTextContent("Settings › Beta");
  expect(codex.querySelector(".host-agent-readiness")).toBeNull();
  expect(codex.innerHTML).toBe(codexBefore);
  act(() => store.patch({ hostAgents: { fp: agents("unsupported", [{ code: "cursor.unsupported", message: "Connector English fallback" }]) } }));
  expect(within(cursor).getByRole("button", { name: "Not supported" })).toHaveAttribute("aria-expanded", "true");
  expect(within(cursor).getByRole("group", { name: "Not supported" })).toHaveTextContent("Cursor voice requires a Mac");
  expect(codex.innerHTML).toBe(codexBefore);
  act(() => store.patch({ hostAgents: { fp: ready([
    known("cursor", { label: "Cursor", registration: "connected" }),
    known("codex", { registration: "connected", readiness: { state: "needs_attention", reasons: [{ code: "other.future" }] } }),
  ]) } }));
  expect(cursor.querySelector(".host-agent-readiness")).toBeNull();
  fireEvent.click(within(codex).getByRole("button", { name: "Needs attention" }));
  expect(within(codex).getByRole("group", { name: "Needs attention" })).toHaveTextContent("Sidevoice cannot show the reason for this status.");
  expect(within(codex).getByRole("group", { name: "Needs attention" })).not.toHaveTextContent("other.future");
});
