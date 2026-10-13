import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { VARIANTS_KEY } from "../../lib/variants";
import type { DetectedAgent, HostAgentsState } from "../../state/room-types";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { cleanup(); localStorage.removeItem(VARIANTS_KEY); localStorage.removeItem("sidevoice.settings"); localStorage.removeItem("sidevoice.highlights"); });

/* VARIANTS `machine-state`: a machine's state where it is listed (Settings' nav, a phone's list), quieter than words — a
 * green dot on its icon while connected (A, the default); the dot and the state in a tooltip (B); a word only while not
 * connected (C) — and `machine-state-this-device`: This device's state shown (A) or hidden (B). Under all of them: what
 * needs the person is said in words, the whole state is in each entry's name and on its page, a dot only ever means
 * connected, and This device is never "Running" or "Starting…" in the nav. */

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


const dot = (entry: HTMLElement) => entry.querySelector(".state-on-icon-dot");
const word = (entry: HTMLElement) => entry.querySelector(".machine-state")?.textContent ?? null;
const choose = (variants: Record<string, string>) => localStorage.setItem(VARIANTS_KEY, JSON.stringify(variants));

test("A (the default): a green dot on a connected machine's icon and nothing else; not connected, nothing", () => {
  open(null);
  for (const entry of [navEntry, row]) {
    expect(dot(entry("NUC"))).not.toBeNull();
    expect(word(entry("NUC"))).toBeNull();
    expect(dot(entry("Old laptop"))).toBeNull();
    expect(word(entry("Old laptop"))).toBeNull();
    expect(entry("Lab box").querySelector(".machine-entry-line .machine-nav-insecure svg")).toHaveClass("lucide-lock-open");
  }
  // The dot sits on the icon, beside the "new" mark's place, never on the name's or a state's line.
  expect(navEntry("NUC").querySelector(".machine-nav-icon .state-on-icon .state-on-icon-dot")).toHaveAttribute("aria-hidden", "true");
  // Its whole state is in its name and its tooltip.
  expect(navEntry("NUC")).toHaveAccessibleName("NUC, Connected");
  expect(navEntry("Old laptop")).toHaveAccessibleName("Old laptop, Not connected");
  expect(navEntry("Lab box")).toHaveAccessibleName("Lab box, Connected, not encrypted");
  expect(navEntry("NUC")).toHaveAttribute("title", "NUC · Connected directly");
  // One line where nothing is said.
  expect(navEntry("NUC").querySelector(".machine-entry-copy")!.children).toHaveLength(1);
  // This device: the dot while its service runs and answers, no word, and connected in its name.
  expect(dot(thisDevice())).not.toBeNull();
  expect(word(thisDevice())).toBeNull();
  expect(thisDevice()).toHaveAccessibleName("This device, Connected");
});

test("B: the dot, and the state in the app's tooltip on keyboard focus (no native title beside it)", async () => {
  choose({ "machine-state": "dot-tip" });
  open(null);
  expect(dot(navEntry("NUC"))).not.toBeNull();
  expect(word(navEntry("NUC"))).toBeNull();
  expect(navEntry("NUC")).not.toHaveAttribute("title");
  act(() => { navEntry("Lab box").focus(); });
  const tip = await screen.findByRole("tooltip");
  expect(tip).toHaveTextContent("Lab box · Connected directly · Not encrypted");
  // Focus keeps the entry's own name, and its click still opens the machine.
  expect(navEntry("Lab box")).toHaveAccessibleName("Lab box, Connected, not encrypted");
  act(() => { navEntry("Lab box").click(); });
  expect(header("machines")).toHaveTextContent("Lab box");
});

test("C: no dot; a short word only while not connected — nothing while connected or still being checked", () => {
  choose({ "machine-state": "word-off" });
  open(null, { machineLinks: { ...links, "fp-lab": { reach: "checking", via: "" } } });
  for (const entry of [navEntry, row]) {
    expect(dot(entry("NUC"))).toBeNull();
    expect(word(entry("NUC"))).toBeNull();
    expect(word(entry("Old laptop"))).toBe("Not connected");
    expect(entry("Old laptop").querySelector(".machine-state")).toHaveAttribute("data-tone", "neutral");
  }
  expect(document.querySelector(".state-on-icon-dot")).toBeNull();
  // This device running: nothing, and still connected in its name.
  expect(word(thisDevice())).toBeNull();
  expect(thisDevice()).toHaveAccessibleName("This device, Connected");
});

test("the panel's choice is followed live, without a reload", () => {
  open(null);
  expect(dot(navEntry("NUC"))).not.toBeNull();
  act(() => {
    choose({ "machine-state": "word-off" });
    window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY }));
  });
  expect(dot(navEntry("NUC"))).toBeNull();
  expect(word(navEntry("Old laptop"))).toBe("Not connected");
});

test("under every value: what needs the person is said in words, in its tone", () => {
  for (const style of ["dot", "dot-tip", "word-off"]) {
    choose({ "machine-state": style });
    open(null, { localHostStatus: { state: "failed", installed: true } }, [local, paired({ revoked: true })]);
    expect(word(navEntry("NUC"))).toBe("Not paired");
    expect(navEntry("NUC").querySelector(".machine-state")).toHaveAttribute("data-tone", "warning");
    expect(dot(navEntry("NUC"))).toBeNull();
    expect(word(thisDevice())).toBe("Not working");
    expect(thisDevice().querySelector(".machine-state")).toHaveAttribute("data-tone", "danger");
    expect(thisDevice()).toHaveAccessibleName("This device, Not working");
    cleanup();
  }
});

test("under every value: This device is never \"Running\", \"Starting…\" or \"Not running\" in the nav or a phone's row", () => {
  const states: LocalHostStatus[] = [running, { state: "starting" }, { state: "stopped-by-person", installed: true }, { state: "absent" }];
  for (const style of ["dot", "dot-tip", "word-off"]) for (const status of states) {
    choose({ "machine-state": style });
    open(null, { localHostStatus: status });
    // Its service's routine is not worded; C may say Not connected, as any machine.
    expect(thisDevice().textContent).toMatch(style === "word-off" ? /^This device(Not connected)?$/ : /^This device$/);
    expect(thisDevice().getAttribute("aria-label")).not.toMatch(/Running|Starting|Not running|Not prepared/);
    cleanup();
  }
});

test("machine-state-this-device B: This device's entry shows no state — but Not working; remote machines are as picked", () => {
  choose({ "machine-state-this-device": "hide" });
  open(null);
  expect(dot(thisDevice())).toBeNull();
  expect(thisDevice()).toHaveAccessibleName("This device");
  expect(dot(navEntry("NUC"))).not.toBeNull();
  cleanup();
  choose({ "machine-state-this-device": "hide" });
  open(null, { localHostStatus: { state: "failed", installed: true } });
  expect(word(thisDevice())).toBe("Not working");
  expect(thisDevice()).toHaveAccessibleName("This device, Not working");
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

test("under every value: a dot is only ever green and only means connected; one live state per page; the page in words", () => {
  for (const style of ["dot", "dot-tip", "word-off"]) {
    choose({ "machine-state": style });
    open(null);
    for (const mark of document.querySelectorAll(".state-on-icon-dot")) expect(["direct", "room", "running"]).toContain(mark.getAttribute("data-state"));
    for (const state of document.querySelectorAll(".machine-state")) expect(state.getAttribute("data-tone")).not.toBe("accent");
    // A remote page: its header's state is the live one, in words at length; the card has none.
    const states = (page: HTMLElement) => [...page.querySelectorAll(".host-detail-header [role=status], .host-status-card [role=status]")];
    const remote = document.querySelector<HTMLElement>("#pane-machines .host-detail")!;
    expect(states(remote)).toEqual([remote.querySelector(".host-detail-state > :first-child")]);
    expect(states(remote)[0]).toHaveTextContent(/^Connected directly$/);
    // This device: its card's state is the live one, its header's is not.
    const own = document.querySelector<HTMLElement>("#pane-this-computer .host-detail")!;
    expect(states(own)).toEqual([own.querySelector(".host-status-card .host-status-state")]);
    cleanup();
  }
});

test("under every value: \"New\" is never on the state's line, and is in the entry's name", () => {
  for (const marks of ["pill", "count", "dot"]) {
    for (const style of ["dot", "dot-tip", "word-off"]) {
      choose({ "machine-state": style, "section-new": marks });
      open(null, { hostAgents: { "fp-old": newAgent() } });
      const entry = navEntry("Old laptop");
      const state = entry.querySelector(".machine-state");
      if (state) { expect(state.querySelector("[class*='new']")).toBeNull(); expect(state.textContent).toBe("Not connected"); }
      expect(entry.querySelector(".machine-nav-icon .new-on-icon-dot, .machine-entry-line .new-nav-pill, .machine-entry-line .new-nav-count")).not.toBeNull();
      expect(entry).toHaveAccessibleName("Old laptop, Not connected, new");
      cleanup();
      localStorage.removeItem("sidevoice.highlights");
    }
  }
});

test("in Spanish: what needs the person, and the name, in Spanish", () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  open(null, { localHostStatus: { state: "failed", installed: true } });
  expect(thisDevice()).toHaveAccessibleName("Este dispositivo, No funciona");
  expect(word(thisDevice())).toBe("No funciona");
  expect(navEntry("NUC")).toHaveAccessibleName("NUC, Conectada");
});
