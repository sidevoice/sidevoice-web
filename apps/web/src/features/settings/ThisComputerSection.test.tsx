import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { VARIANTS_KEY } from "../../lib/variants";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { cleanup(); localStorage.removeItem(VARIANTS_KEY); });

/* VARIANTS `this-computer`: this computer under Machines (A, in-machines) or a section of its own above Machines (B,
 * own-section) wherever this device can host. */

const paired = (extra: Partial<PairingSummary> = {}): PairingSummary => ({
  fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], rv: { url: "https://room.example", node: "nuc-1" },
  device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false, ...extra,
});
const local = paired({ fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local" });
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.1.0", api: 1 }, calls: 0 };

function open(variant: "in-machines" | "own-section", pairings: PairingSummary[], facts: Record<string, unknown> = {}) {
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "this-computer": variant }));
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => running), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(),
  } } } });
  window.sidevoiceActions = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), machineDevices: vi.fn().mockResolvedValue([]),
    loadHostAgents: vi.fn(), revokeLocalHostDevice: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => { store.patch({ pairings, machinesAt: 1_700_086_400_000, machinesReady: true, localHostAvailable: pairings.some((item) => item.local),
    localHostStatus: running, machineLinks: { "fp-nuc": { reach: "ok", via: "node" } }, settingsSection: "general", ...facts }); });
  render(<RoomProvider store={store}><SettingsDialog /></RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  return store;
}

const sections = () => [...document.querySelectorAll(".settings-nav > button")].map((button) => button.textContent);
const machinesNav = () => [...document.querySelectorAll(".settings-nav .machine-nav button")].map((button) => button.textContent);
const machinesPane = () => document.getElementById("pane-machines")!;

test("A: no This computer section; this computer is listed under Machines", () => {
  open("in-machines", [local, paired()]);
  expect(sections()).not.toContain("This computer");
  expect(document.getElementById("pane-this-computer")).toBeNull();
  expect(machinesNav()).toEqual([expect.stringMatching(/^This computerMacBook/), expect.stringMatching(/^NUC/), "Add a machine"]);
  expect(machinesPane().querySelector('.machine-entry[data-name="MacBook"]')).not.toBeNull();
});

test("B with this computer prepared: its section right above Machines shows its page; Machines lists the others alone", async () => {
  const store = open("own-section", [local, paired()]);
  const names = sections();
  expect(names.indexOf("This computer")).toBe(names.indexOf("Machines") - 1);
  await act(async () => { document.getElementById("settings-this-computer")!.click(); });
  expect(store.getState().facts.settingsSection).toBe("this-computer");
  const pane = document.getElementById("pane-this-computer")!;
  expect(pane).not.toHaveAttribute("hidden");
  expect(pane.querySelector('.host-detail[aria-label="MacBook"]')).not.toBeNull();
  expect(within(pane).getByRole("heading", { name: "Sidevoice on MacBook" })).toBeInTheDocument();
  expect(within(pane).getByRole("heading", { name: "Paired devices" })).toBeInTheDocument();
  expect(within(pane).queryByRole("button", { name: "Use agents on this computer" })).toBeNull();
  // Machines: the remote machines alone, then Add a machine — in the nav and in its pane.
  await act(async () => { document.getElementById("settings-machines")!.click(); });
  expect(machinesNav()).toEqual([expect.stringMatching(/^NUC/), "Add a machine"]);
  expect(machinesPane().querySelector('.machine-entry[data-name="MacBook"]')).toBeNull();
  expect(machinesPane().querySelector('.machine-entry[data-name="NUC"]')).not.toBeNull();
  expect(within(machinesPane()).queryByRole("heading", { name: "Sidevoice on MacBook" })).toBeNull();
  expect(within(machinesPane()).getByRole("heading", { name: "Sidevoice on NUC" })).toBeInTheDocument();
});

test("B on a host not yet prepared: its section offers to prepare it, with no other machine; Machines has no install entry", () => {
  open("own-section", [paired()], { localHostAvailable: true, localHostStatus: { state: "absent" }, settingsSection: "this-computer" });
  expect(sections()).toContain("This computer");
  const pane = document.getElementById("pane-this-computer")!;
  expect(pane.querySelector(".this-computer-prepare")).toHaveTextContent("Prepare Sidevoice on this computer. This step does not register or connect agents.");
  expect(within(pane).getByRole("button", { name: "Use agents on this computer" })).toBeInTheDocument();
  expect(within(pane).queryByRole("button", { name: /another machine/i })).toBeNull();
  expect(pane.querySelector(".host-detail")).toBeNull();
  expect(machinesPane().querySelector(".local-install-entry")).toBeNull();
  expect(within(machinesPane()).queryByRole("button", { name: "Use agents on this computer", hidden: true })).toBeNull();
});

test("B where this device can't host looks like A: no section", () => {
  open("own-section", [paired()], { localHostAvailable: false });
  expect(sections()).not.toContain("This computer");
  expect(document.getElementById("pane-this-computer")).toBeNull();
  expect(machinesNav()).toEqual([expect.stringMatching(/^NUC/), "Add a machine"]);
});

test("in a browser (this device can't host) B has no section, even with a pairing that looks local", () => {
  open("own-section", [local, paired()], { localHostAvailable: false });
  expect(sections()).not.toContain("This computer");
  expect(document.getElementById("pane-this-computer")).toBeNull();
  expect(machinesNav()).toEqual([expect.stringMatching(/MacBook/), expect.stringMatching(/^NUC/), "Add a machine"]);
});

test("Machines empty: B says no other machines; A that this device is paired with none", () => {
  open("own-section", [local], { settingsSection: "machines" });
  expect(machinesPane().querySelector(".machines-empty")).toHaveTextContent("No other machines yet.");
  cleanup();
  open("in-machines", [], { localHostAvailable: true, localHostStatus: { state: "absent" }, settingsSection: "machines" });
  expect(machinesPane().querySelector(".machines-empty")).toHaveTextContent("This device is not paired with a machine yet.");
});

const agents = (ids: string[]) => ({ status: "ready", error: null, busy: {}, actionErrors: {}, value: { agents: ids.map((id) => ({
  id, label: id, present: true, version: "1.0.0", registration: "not-connected", connect: "auto", actionable: true,
  can: { connect: true, update: true, disconnect: true }, manual: { connect: [], disconnect: [], replace: [] },
})), scanned_at: "2026-10-02T10:00:00Z", custom: { command: "c", snippet: "{}", version: "1" } } });
const dotOn = (id: string) => !!document.getElementById("settings-" + id)?.querySelector(".new-on-icon-dot");

test("a new agent on this computer puts its dot on This computer in B, on Machines in A; another machine's stays on Machines", () => {
  for (const [variant, section] of [["own-section", "this-computer"], ["in-machines", "machines"]] as const) {
    localStorage.removeItem("sidevoice.highlights");
    const store = open(variant, [local, paired()]);
    act(() => store.patch({ hostAgents: { "fp-local": agents(["codex"]) } } as never));
    expect(dotOn(section)).toBe(true);
    if (variant === "own-section") expect(dotOn("machines")).toBe(false);
    act(() => store.patch({ hostAgents: { "fp-nuc": agents(["cursor"]) } } as never));
    expect(dotOn("machines")).toBe(true);
    if (variant === "own-section") expect(dotOn("this-computer")).toBe(false);
    cleanup();
  }
  localStorage.removeItem("sidevoice.highlights");
});
