import { afterEach, expect, test, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { cleanup(); localStorage.removeItem("sidevoice.settings"); localStorage.removeItem("sidevoice.deviceName"); });

/* This device (decided 2026-10-12): in the desktop app, where it can host, a section of its own before Providers, and
 * Machines is Remote machines; anywhere else (a browser, even one talking to a local Sidevoice, or a phone) neither. */

const paired = (extra: Partial<PairingSummary> = {}): PairingSummary => ({
  fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], rv: { url: "https://room.example", node: "nuc-1" },
  device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false, ...extra,
});
const local = paired({ fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local" });
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.1.0", api: 1 }, calls: 0 };

function open(pairings: PairingSummary[], facts: Record<string, unknown> = {}) {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => running), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(),
  } } } });
  window.sidevoiceActions = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), machineDevices: vi.fn().mockResolvedValue([]),
    loadHostAgents: vi.fn(), revokeLocalHostDevice: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => { store.patch({ pairings, machinesAt: 1_700_086_400_000, machinesReady: true, localHostAvailable: pairings.some((item) => item.local), inApp: pairings.some((item) => item.local),
    localHostStatus: running, machineLinks: { "fp-nuc": { reach: "ok", via: "node" } }, settingsSection: "general", ...facts }); });
  render(<RoomProvider store={store}><SettingsDialog /></RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  return store;
}

/** The sections' names as their entries show them: This device's first line, its state under it. */
const sections = () => [...document.querySelectorAll(".settings-nav > button")].map((button) => button.querySelector(".machine-nav-name")?.textContent ?? button.textContent);
const machinesNav = () => [...document.querySelectorAll(".settings-nav .machine-nav button")].map((button) => button.textContent);
const machinesPane = () => document.getElementById("pane-machines")!;
/** The nav's Add, short ("Add"), its whole words its name and its tooltip. */
const add = () => document.querySelector<HTMLElement>(".settings-nav .machine-nav .machine-nav-add")!;
const addSays = (whole: string) => { expect(add()).toHaveAccessibleName(whole); expect(add()).toHaveAttribute("title", whole); };

const navIcon = (id: string) => document.getElementById("settings-" + id)!.querySelector("svg")!;

test("in the desktop app: This device right before Providers, Remote machines after, each with its own icon", () => {
  open([local, paired()]);
  expect(sections()).toEqual(["General", "Transcription", "Voice", "Call", "This device", "Providers", "Remote machines", "Advanced"]);
  // A laptop for this device, a server for the others: the wizard's This computer and Another machine.
  expect(navIcon("this-computer")).toHaveClass("lucide-laptop");
  expect(navIcon("machines")).toHaveClass("lucide-server");
  expect(navIcon("machines")).not.toHaveClass("lucide-monitor");
  expect(machinesPane().querySelector(".ui-section-title")).toHaveTextContent(/^Remote machines$/);
  expect(machinesNav()).toEqual([expect.stringMatching(/^NUC/), "Add"]);
  addSays("Add a remote machine");
});

test("in the desktop app, in Spanish: Este dispositivo before Proveedores, then Máquinas remotas", () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  open([local, paired()]);
  const names = sections();
  expect(names.indexOf("Este dispositivo")).toBe(names.indexOf("Proveedores") - 1);
  expect(names.indexOf("Máquinas remotas")).toBe(names.indexOf("Proveedores") + 1);
  expect(names).not.toContain("Máquinas");
  expect(machinesPane().querySelector(".ui-section-title")).toHaveTextContent(/^Máquinas remotas$/);
  expect(machinesNav()).toEqual([expect.stringMatching(/^NUC/), "Añadir"]);
  addSays("Añadir una máquina remota");
});

test("in a browser: no This device, and plain Machines with its own icon, in English and in Spanish", () => {
  open([paired()]);
  expect(sections()).toEqual(["General", "Transcription", "Voice", "Call", "Providers", "Machines", "Advanced"]);
  expect(document.getElementById("pane-this-computer")).toBeNull();
  expect(navIcon("machines")).toHaveClass("lucide-monitor");
  expect(machinesPane().querySelector(".ui-section-title")).toHaveTextContent(/^Machines$/);
  expect(machinesNav()).toEqual([expect.stringMatching(/^NUC/), "Add"]);
  addSays("Add a machine");
  cleanup();
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  open([paired()]);
  expect(sections()).toContain("Máquinas");
  expect(sections()).not.toContain("Este dispositivo");
  expect(machinesNav()).toEqual([expect.stringMatching(/^NUC/), "Añadir"]);
  addSays("Añadir una máquina");
});

test("in a browser talking to a local Sidevoice (it can host, but it isn't the app): no This device; that one is a machine", () => {
  open([local, paired()], { localHostAvailable: true, inApp: false });
  expect(sections()).not.toContain("This device");
  expect(sections()).toContain("Machines");
  expect(document.getElementById("pane-this-computer")).toBeNull();
  expect(navIcon("machines")).toHaveClass("lucide-monitor");
  expect(machinesNav()).toEqual([expect.stringMatching(/MacBook/), expect.stringMatching(/^NUC/), "Add"]);
  addSays("Add a machine");
  expect(machinesPane().querySelector('.machine-entry[data-name="MacBook"]')).not.toBeNull();
});

test("This device's page is titled with this device's name; its pencil renames it in General, the one place", async () => {
  localStorage.setItem("sidevoice.deviceName", "Ana’s MacBook");
  const store = open([local, paired()], { settingsSection: "this-computer" });
  const pane = document.getElementById("pane-this-computer")!;
  expect(pane.querySelector(".ui-section-title")).toHaveTextContent(/^Ana’s MacBook$/);
  // The machine's page inside has no name, rename or alias of its own.
  expect(pane.querySelector(".host-detail .host-name")).toBeNull();
  expect(pane.querySelector(".host-rename-open")).toBeNull();
  expect(within(pane).queryByRole("button", { name: /^Rename MacBook/ })).toBeNull();
  await act(async () => { within(pane).getByRole("button", { name: "Rename this device" }).click(); });
  expect(store.getState().facts.settingsSection).toBe("general");
  await waitFor(() => expect(document.activeElement).toBe(document.getElementById("device-name")));
  expect(document.getElementById("pane-general")).not.toHaveAttribute("hidden");
  cleanup();
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  open([local], { settingsSection: "this-computer" });
  expect(screen.getByRole("button", { name: "Cambiar el nombre de este dispositivo" })).toBeInTheDocument();
});

test("with this computer prepared: This device shows its page; Remote machines lists the others alone", async () => {
  const store = open([local, paired()]);
  await act(async () => { document.getElementById("settings-this-computer")!.click(); });
  expect(store.getState().facts.settingsSection).toBe("this-computer");
  const pane = document.getElementById("pane-this-computer")!;
  expect(pane).not.toHaveAttribute("hidden");
  expect(pane.querySelector('.host-detail[aria-label="MacBook"]')).not.toBeNull();
  expect(within(pane).getByRole("heading", { name: "Sidevoice on MacBook" })).toBeInTheDocument();
  expect(within(pane).getByRole("heading", { name: "Paired devices" })).toBeInTheDocument();
  expect(within(pane).queryByRole("button", { name: /^(Use agents on|Prepare) this computer$/ })).toBeNull();
  // Remote machines: the others alone, then Add a remote machine — in the nav and in its pane.
  await act(async () => { document.getElementById("settings-machines")!.click(); });
  expect(machinesNav()).toEqual([expect.stringMatching(/^NUC/), "Add"]);
  addSays("Add a remote machine");
  expect(machinesPane().querySelector('.machine-entry[data-name="MacBook"]')).toBeNull();
  expect(machinesPane().querySelector('.machine-entry[data-name="NUC"]')).not.toBeNull();
  expect(within(machinesPane()).queryByRole("heading", { name: "Sidevoice on MacBook" })).toBeNull();
  expect(within(machinesPane()).getByRole("heading", { name: "Sidevoice on NUC" })).toBeInTheDocument();
});

test("on a host not yet prepared: This device offers to prepare it, with no other machine; Remote machines has no install entry", () => {
  open([paired()], { localHostAvailable: true, inApp: true, localHostStatus: { state: "absent" }, settingsSection: "this-computer" });
  expect(sections()).toContain("This device");
  const pane = document.getElementById("pane-this-computer")!;
  expect(pane.querySelector(".this-computer-prepare")).toHaveTextContent("Install Sidevoice on this computer.");
  expect(within(pane).getByRole("button", { name: "Prepare this computer" })).toBeInTheDocument();
  expect(within(pane).getByRole("button", { name: "I’ll do it myself" })).toHaveAttribute("aria-expanded", "false");
  expect(within(pane).queryByRole("button", { name: /another machine/i })).toBeNull();
  expect(pane.querySelector(".host-detail")).toBeNull();
  expect(machinesPane().querySelector(".local-install-entry")).toBeNull();
  expect(within(machinesPane()).queryByRole("button", { name: /^(Use agents on|Prepare) this computer$/, hidden: true })).toBeNull();
});

test("Machines empty: in the app it says no other machines; in a browser, that this device is paired with none", () => {
  open([local], { settingsSection: "machines" });
  expect(machinesPane().querySelector(".machines-empty")).toHaveTextContent("No other machines yet.");
  cleanup();
  open([], { settingsSection: "machines" });
  expect(machinesPane().querySelector(".machines-empty")).toHaveTextContent("This device is not paired with a machine yet.");
});

const agents = (ids: string[]) => ({ status: "ready", error: null, busy: {}, actionErrors: {}, value: { agents: ids.map((id) => ({
  id, label: id, present: true, version: "1.0.0", registration: "not-connected", connect: "auto", actionable: true,
  can: { connect: true, update: true, disconnect: true }, manual: { connect: [], disconnect: [], replace: [] },
})), scanned_at: "2026-10-02T10:00:00Z", custom: { command: "c", snippet: "{}", version: "1" } } });
const markOn = (id: string) => {
  const entry = document.getElementById("settings-" + id)!;
  return !!entry.querySelector(".new-on-icon-dot, .new-end-dot, .new-badge") || /new/.test(entry.getAttribute("aria-label") ?? "");
};

test("off for this release: a new agent on this computer marks no This device, nor another machine's Remote machines", () => {
  localStorage.removeItem("sidevoice.highlights");
  const store = open([local, paired()]);
  act(() => store.patch({ hostAgents: { "fp-local": agents(["codex"]) } } as never));
  expect(markOn("this-computer")).toBe(false);
  expect(markOn("machines")).toBe(false);
  act(() => store.patch({ hostAgents: { "fp-nuc": agents(["cursor"]) } } as never));
  expect(markOn("machines")).toBe(false);
  expect(markOn("this-computer")).toBe(false);
  expect(document.querySelector(".settings-notice")).toBeNull();
  localStorage.removeItem("sidevoice.highlights");
});
