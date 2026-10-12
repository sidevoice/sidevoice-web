import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, within } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { VARIANTS_KEY } from "../../lib/variants";
import type { DetectedAgent, HostAgentsState } from "../../state/room-types";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { cleanup(); localStorage.removeItem(VARIANTS_KEY); localStorage.removeItem("sidevoice.settings"); localStorage.removeItem("sidevoice.highlights"); });

/* VARIANTS `machine-state`: a machine's state in words under its name (A, the default) or as a pill (B) — in Settings'
 * nav, a phone's list and the machine's page — and, under both, the spec's rules: never a dot, never the accent, never
 * on the line "new" is on, said in words, one live region per page. */

const paired = (extra: Partial<PairingSummary> = {}): PairingSummary => ({
  fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], rv: { url: "https://room.example", node: "nuc-1" },
  device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false, ...extra,
});
const local = paired({ fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local" });
const lab = paired({ fp: "fp-lab", host: "Lab box", insecure: true, urls: ["http://192.168.1.20:8768"], rv: null, device_id: "d-lab" });
const old = paired({ fp: "fp-old", host: "Old laptop", device_id: "d-old" });
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.1.0", api: 1 }, calls: 0 };
const links = { "fp-nuc": { reach: "ok", via: "node" }, "fp-lab": { reach: "ok", via: "node" }, "fp-old": { reach: "offline", via: "" } } as const;

const newAgent = (): HostAgentsState => ({ status: "ready", error: null, busy: {}, actionErrors: {}, value: { agents: [{
  id: "codex", label: "Codex", present: true, version: "1.0.0", registration: "not-connected", connect: "auto", actionable: true,
  can: { connect: true, update: true, disconnect: true }, manual: { connect: [], disconnect: [], replace: [] },
} as DetectedAgent], scanned_at: "2026-10-02T10:00:00Z", custom: { command: "c", snippet: "{}", version: "1" } } });

function open(style: "word" | "pill" | null, facts: Record<string, unknown> = {}, pairings = [local, paired(), lab, old]) {
  if (style) localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "machine-state": style }));
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => running), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(),
  } } } });
  window.sidevoiceActions = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), machineDevices: vi.fn().mockResolvedValue([]),
    loadHostAgents: vi.fn(), revokeLocalHostDevice: vi.fn(), loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => { store.patch({ pairings, machinesAt: 1_700_086_400_000, machinesReady: true, localHostAvailable: true, inApp: true,
    localHostStatus: running, machineLinks: links, settingsSection: "machines", ...facts }); });
  render(<RoomProvider store={store}><SettingsDialog /></RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  return store;
}

const nav = () => document.querySelector<HTMLElement>(".settings-nav")!;
const navEntry = (name: string) => nav().querySelector<HTMLElement>(`.machine-entry[data-name="${name}"]`)!;
const row = (name: string) => document.querySelector<HTMLElement>(`.machines-inline .machine-entry[data-name="${name}"]`)!;
const thisDevice = () => document.getElementById("settings-this-computer")!;
const header = (pane: string) => document.querySelector<HTMLElement>(`#pane-${pane} .host-detail-header`)!;

test("A (the default): each machine's state is a word in its tone on the line under its name, in the nav and a phone's rows", () => {
  open(null);
  const words = (entry: HTMLElement) => [entry.querySelector(".machine-entry-line")!.textContent, entry.querySelector(".machine-state")!.textContent,
    entry.querySelector(".machine-state")!.getAttribute("data-tone")];
  for (const entry of [navEntry, row]) {
    expect(words(entry("NUC"))).toEqual(["NUC", "Connected", "positive"]);
    expect(words(entry("Old laptop"))).toEqual(["Old laptop", "Not connected", "neutral"]);
    expect(entry("Lab box").querySelector(".machine-entry-line .machine-nav-insecure svg")).toHaveClass("lucide-lock-open");
  }
  expect(document.querySelector(".machine-state-pill")).toBeNull();
  // This device: its name and, under it, its service's state, all of it in its name.
  expect(thisDevice().querySelector(".machine-entry-line")).toHaveTextContent(/^This device$/);
  expect(thisDevice().querySelector(".machine-state")).toHaveTextContent(/^Running$/);
  expect(thisDevice()).toHaveAccessibleName("This device, Running");
  expect(navEntry("Lab box")).toHaveAccessibleName("Lab box, Connected, not encrypted");
});

test("B: the state is a pill in its tone, on the same line; the page's header says it at length as a pill too", () => {
  open("pill");
  const pill = navEntry("NUC").querySelector(".machine-state-pill")!;
  expect(pill).toHaveClass("ui-badge");
  expect(pill).toHaveTextContent(/^Connected$/);
  expect(pill).toHaveAttribute("data-tone", "positive");
  expect(row("Old laptop").querySelector(".machine-state-pill")).toHaveAttribute("data-tone", "neutral");
  expect(thisDevice().querySelector(".machine-state-pill")).toHaveTextContent(/^Running$/);
  expect(document.querySelector(".settings-nav .machine-state, .machines-inline .machine-state")).toBeNull();
  // The page: the long form as a pill, Not encrypted as a warning pill with its open lock, and its (i).
  expect(header("machines").querySelector(".machine-state-pill")).toHaveTextContent(/^Connected directly$/);
  act(() => { navEntry("Lab box").click(); });
  const insecure = within(header("machines")).getByText("Not encrypted");
  expect(insecure).toHaveClass("ui-badge");
  expect(insecure).toHaveAttribute("data-tone", "warning");
  expect(insecure.querySelector("svg")).toHaveClass("lucide-lock-open");
  expect(within(header("machines")).getByRole("button", { name: "About this connection" })).toBeInTheDocument();
});

test("the panel's choice is followed live, without a reload", () => {
  open(null);
  expect(navEntry("NUC").querySelector(".machine-state")).not.toBeNull();
  act(() => {
    localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "machine-state": "pill" }));
    window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY }));
  });
  expect(navEntry("NUC").querySelector(".machine-state")).toBeNull();
  expect(navEntry("NUC").querySelector(".machine-state-pill")).toHaveTextContent("Connected");
});

test("a page's header: the long state, Not encrypted in words after it, and what to do under it", () => {
  open(null, { machinesView: { machine: "fp-lab" } });
  expect(header("machines").querySelector(".host-detail-state")).toHaveTextContent(/^Connected directly·Not encrypted$/);
  expect(within(header("machines")).getByText("Not encrypted").querySelector("svg")).toHaveClass("lucide-lock-open");
  act(() => { navEntry("Old laptop").click(); });
  expect(header("machines").querySelector(".host-detail-state")).toHaveTextContent(/^Not connected$/);
  expect(header("machines").querySelector(".host-detail-hint")).toHaveTextContent(/^Not reachable from here now$/);
  cleanup();
  open(null, {}, [local, paired({ revoked: true })]);
  expect(navEntry("NUC")).toHaveAccessibleName("NUC, Not paired");
  expect(navEntry("NUC").querySelector(".machine-state")).toHaveAttribute("data-tone", "warning");
  expect(header("machines").querySelector(".host-detail-state")).toHaveTextContent(/^No longer paired$/);
  expect(header("machines").querySelector(".host-detail-hint")).toHaveTextContent(/^Pair it again, or forget it below\.$/);
});

test("under both values: never a dot for a state, never the accent, one live state per page", () => {
  for (const style of ["word", "pill"] as const) {
    open(style);
    // No dot: not in the nav, not in the page's header, not on the remote service card (which no longer says it).
    expect(document.querySelector(".machine-nav-dot, .host-detail-header .ui-badge-dot, [data-remote] .host-status-dot, [data-remote] .host-status-state")).toBeNull();
    for (const state of document.querySelectorAll(".machine-state, .machine-state-pill")) expect(state.getAttribute("data-tone")).not.toBe("accent");
    // A remote page: its header's state is the live one, the card has none.
    const states = (page: HTMLElement) => [...page.querySelectorAll(".host-detail-header [role=status], .host-status-card [role=status]")];
    const remote = document.querySelector<HTMLElement>("#pane-machines .host-detail")!;
    expect(states(remote)).toEqual([remote.querySelector(".host-detail-state > :first-child")]);
    expect(states(remote)[0]).toHaveTextContent(/^Connected directly$/);
    // This device: its card's state is the live one, its header's is not.
    const own = document.querySelector<HTMLElement>("#pane-this-computer .host-detail")!;
    expect(states(own)).toEqual([own.querySelector(".host-status-card .host-status-state")]);
    expect(own.querySelector(".host-status-card .host-status-state")).toHaveTextContent(/^Running$/);
    cleanup();
  }
});

test("under both values: \"New\" is never on the state's line", () => {
  for (const marks of ["sparkle", "pill", "dot"]) {
    for (const style of ["word", "pill"]) {
      localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "machine-state": style, "new-mark": marks }));
      open(null, { hostAgents: { "fp-nuc": newAgent() } });
      const entry = navEntry("NUC");
      const state = entry.querySelector(".machine-state, .machine-state-pill")!;
      expect(state.querySelector("[class*='new']")).toBeNull();
      expect(state.textContent).toBe("Connected");
      // The mark is on the icon (A, C) or at the name's line's end (B), and in the entry's name.
      expect(entry.querySelector(".machine-nav-icon .new-on-icon-sparkle, .machine-nav-icon .new-on-icon-dot, .machine-entry-line .new-nav-pill")).not.toBeNull();
      expect(entry).toHaveAccessibleName("NUC, Connected, new");
      cleanup();
      localStorage.removeItem("sidevoice.highlights");
    }
  }
});

test("This device's entry says where its service stands, in each of its states", () => {
  const cases: [LocalHostStatus, string][] = [
    [{ state: "starting" }, "Starting…"], [{ state: "failed", installed: true }, "Not working"],
    [{ state: "stopped-by-person", installed: true }, "Not running"], [running, "Running"],
  ];
  for (const [status, words] of cases) {
    open(null, { localHostStatus: status });
    expect(thisDevice().querySelector(".machine-state")).toHaveTextContent(new RegExp(`^${words}$`));
    expect(thisDevice()).toHaveAccessibleName(`This device, ${words}`);
    cleanup();
  }
  open(null, { localHostStatus: { state: "absent" } }, [paired()]);
  expect(thisDevice()).toHaveAccessibleName("This device, Not prepared");
  expect(thisDevice().querySelector(".machine-state")).toHaveAttribute("data-tone", "neutral");
  cleanup();
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  open(null, { localHostStatus: { state: "failed", installed: true } });
  expect(thisDevice()).toHaveAccessibleName("Este dispositivo, No funciona");
  expect(thisDevice().querySelector(".machine-state")).toHaveAttribute("data-tone", "danger");
});
