import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { Badge } from "../../components/ui/Badge";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { VARIANTS_KEY } from "../../lib/variants";
import type { DetectedAgent, HostAgentsState } from "../../state/room-types";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { cleanup(); localStorage.removeItem(VARIANTS_KEY); localStorage.removeItem("sidevoice.settings"); localStorage.removeItem("sidevoice.highlights"); });

/* A machine's state where it is listed (Settings' nav, a phone's list), quieter than words: a green dot on its icon
 * while connected, nothing otherwise — This device's too. What needs the person is said in words, the whole state is in
 * each entry's name (and a remote entry's native tooltip) and on its page, a dot only ever means connected, and This
 * device is never "Running" or "Starting…" in the nav. */

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

function open(facts: Record<string, unknown> = {}, pairings = [local, paired(), lab, old]) {
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
const lines = (entry: HTMLElement) => entry.querySelector(".machine-entry-copy")!.children.length;

test("a green dot on a connected machine's icon and nothing else; not connected, nothing", () => {
  open();
  for (const entry of [navEntry, row]) {
    expect(dot(entry("NUC"))).toHaveAttribute("data-state", "direct");
    expect(word(entry("NUC"))).toBeNull();
    expect(dot(entry("Old laptop"))).toBeNull();
    expect(word(entry("Old laptop"))).toBeNull();
    expect(lines(entry("Old laptop"))).toBe(1);
    // Paired without encryption, it reads as NUC: its dot, no word, one line, nothing after its name.
    expect(dot(entry("Lab box"))).toHaveAttribute("data-state", "direct");
    expect(entry("Lab box").querySelector(".machine-entry-line")!.children.length).toBe(entry("NUC").querySelector(".machine-entry-line")!.children.length);
    expect(entry("Lab box").querySelector("svg.lucide-lock-open")).toBeNull();
  }
  // The dot sits on the icon, beside the "new" mark's place, never on the name's or a state's line.
  expect(navEntry("NUC").querySelector(".machine-nav-icon .state-on-icon .state-on-icon-dot")).toHaveAttribute("aria-hidden", "true");
  expect(navEntry("NUC").querySelector(".machine-entry-copy .state-on-icon-dot")).toBeNull();
  // Its whole state is in its name and in its native tooltip.
  expect(navEntry("NUC")).toHaveAccessibleName("NUC, Connected");
  expect(navEntry("Old laptop")).toHaveAccessibleName("Old laptop, Not connected");
  expect(navEntry("Lab box")).toHaveAccessibleName("Lab box, Connected");
  expect(navEntry("NUC")).toHaveAttribute("title", "NUC · Connected");
  expect(navEntry("Old laptop")).toHaveAttribute("title", "Old laptop · Not connected");
  expect(navEntry("Lab box")).toHaveAttribute("title", "Lab box · Connected");
  // One line where nothing is said.
  expect(lines(navEntry("NUC"))).toBe(1);
  // This device: the dot while its service runs and answers, no word, and connected in its name.
  expect(dot(thisDevice())).toHaveAttribute("data-state", "running");
  expect(word(thisDevice())).toBeNull();
  expect(thisDevice()).toHaveAccessibleName("This device, Connected");
});

test("a remote entry's tooltip is the native one: no app tooltip on keyboard focus, and its click opens the machine", () => {
  open();
  act(() => { navEntry("Lab box").focus(); });
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(navEntry("Lab box")).toHaveAccessibleName("Lab box, Connected");
  act(() => { navEntry("Lab box").click(); });
  expect(header("machines")).toHaveTextContent("Lab box");
});

test("a state still being found shows nothing: no dot, no word, one line", () => {
  open({ machineLinks: { ...links, "fp-lab": { reach: "checking", via: "" } }, localHostStatus: { state: "starting" } });
  for (const entry of [navEntry, row]) {
    expect(dot(entry("Lab box"))).toBeNull();
    expect(word(entry("Lab box"))).toBeNull();
    expect(lines(entry("Lab box"))).toBe(1);
  }
  expect(navEntry("Lab box")).toHaveAttribute("title", "Lab box · Checking…");
  expect(dot(thisDevice())).toBeNull();
  expect(thisDevice().textContent).toBe("This device");
});

test("a choice the preview's panel stored for the old variants changes nothing", () => {
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "machine-state": "word-off", "machine-state-this-device": "hide" }));
  open();
  expect(dot(navEntry("NUC"))).not.toBeNull();
  expect(word(navEntry("Old laptop"))).toBeNull();
  expect(dot(thisDevice())).not.toBeNull();
  expect(thisDevice()).toHaveAccessibleName("This device, Connected");
});

test("what needs the person is said in words, in its tone, and never wears the dot", () => {
  open({ localHostStatus: { state: "failed", installed: true } }, [local, paired({ revoked: true })]);
  for (const entry of [navEntry, row]) {
    expect(word(entry("NUC"))).toBe("Not paired");
    expect(entry("NUC").querySelector(".machine-state")).toHaveAttribute("data-tone", "warning");
    expect(dot(entry("NUC"))).toBeNull();
    expect(lines(entry("NUC"))).toBe(2);
  }
  expect(navEntry("NUC")).toHaveAccessibleName("NUC, Not paired");
  expect(navEntry("NUC")).toHaveAttribute("title", "NUC · No longer paired");
  expect(word(thisDevice())).toBe("Not working");
  expect(thisDevice().querySelector(".machine-state")).toHaveAttribute("data-tone", "danger");
  expect(dot(thisDevice())).toBeNull();
  expect(thisDevice()).toHaveAccessibleName("This device, Not working");
});

test("This device is never \"Running\", \"Starting…\" or \"Not running\" in the nav or a phone's row; its dot only while it runs", () => {
  const states: LocalHostStatus[] = [running, { state: "starting" }, { state: "stopped-by-person", installed: true }, { state: "absent" }];
  for (const status of states) {
    open({ localHostStatus: status });
    expect(thisDevice().textContent).toBe("This device");
    expect(thisDevice().getAttribute("aria-label")).not.toMatch(/Running|Starting|Not running|Not prepared/);
    expect(!!dot(thisDevice())).toBe(status === running);
    cleanup();
  }
});

test("a page's header: the long state, nothing after it, and what to do under it", () => {
  open({ machinesView: { machine: "fp-lab" } });
  // Paired without encryption: its state alone, as any machine's.
  expect(header("machines").querySelector(".host-detail-state")).toHaveTextContent(/^Connected$/);
  expect(header("machines").querySelector(".host-detail-state")!.children.length).toBe(1);
  expect(header("machines").querySelector("svg.lucide-lock-open, .ui-infotip")).toBeNull();
  act(() => { navEntry("Old laptop").click(); });
  expect(header("machines").querySelector(".host-detail-state")).toHaveTextContent(/^Not connected$/);
  expect(header("machines").querySelector(".host-detail-hint")).toHaveTextContent(/^Not reachable from here now$/);
  cleanup();
  open({}, [local, paired({ revoked: true })]);
  expect(navEntry("NUC")).toHaveAccessibleName("NUC, Not paired");
  expect(navEntry("NUC").querySelector(".machine-state")).toHaveAttribute("data-tone", "warning");
  expect(header("machines").querySelector(".host-detail-state")).toHaveTextContent(/^No longer paired$/);
  expect(header("machines").querySelector(".host-detail-hint")).toHaveTextContent(
    /^This machine removed this device\. To use it here again, pair it with a new code from it, or forget it below\.$/);
});

test("no longer paired: its page says why and what to do — Pair again opens Add a machine, Forget is at its foot; a paired one has neither", () => {
  open({}, [local, paired({ revoked: true })]);
  const pair = within(header("machines")).getByRole("button", { name: "Pair again" });
  act(() => { pair.click(); });
  expect(window.sidevoiceActions!.openPairing).toHaveBeenCalledOnce();
  expect(within(document.getElementById("pane-machines")!).getByRole("button", { name: "Forget NUC" })).toBeInTheDocument();
  cleanup();
  open({ machinesView: { machine: "fp-nuc" } });
  expect(within(header("machines")).queryByRole("button", { name: "Pair again" })).toBeNull();
});

test("machine-unencrypted is decided (none): whatever the preview's panel stored for it, nothing says not encrypted", () => {
  for (const stored of [null, "list", "page"]) {
    if (stored) localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "machine-unencrypted": stored }));
    open({ machinesView: { machine: "fp-lab" } });
    for (const entry of [navEntry, row]) expect(entry("Lab box").querySelector("svg.lucide-lock-open")).toBeNull();
    expect(navEntry("Lab box")).toHaveAccessibleName("Lab box, Connected");
    expect(navEntry("Lab box")).toHaveAttribute("title", "Lab box · Connected");
    expect(header("machines").querySelector(".host-detail-state")).toHaveTextContent(/^Connected$/);
    expect(screen.queryByRole("button", { name: "About this connection" })).toBeNull();
    expect(document.getElementById("pane-machines")).not.toHaveTextContent(/encrypt/i);
    cleanup();
    localStorage.removeItem(VARIANTS_KEY);
  }
});

test("Connected on a page wears the models' Ready badge, green with its dot; not connected stays muted words", () => {
  const ready = render(<Badge tone="positive" dot>Ready</Badge>).container.firstElementChild!;
  open({ machinesView: { machine: "fp-nuc" } });
  const state = header("machines").querySelector(".host-detail-state > :first-child")!;
  expect(state).toHaveTextContent(/^Connected$/);
  expect(state).toHaveClass("ui-badge", "machine-state");
  expect(state).toHaveAttribute("data-tone", "positive");
  expect(state).toHaveAttribute("role", "status");
  // The Ready badge's own parts: its class, its tone and its dot, hidden from a screen reader.
  expect(state.getAttribute("data-tone")).toBe(ready.getAttribute("data-tone"));
  expect(state.firstElementChild!.className).toBe(ready.firstElementChild!.className);
  expect(state.querySelector(".ui-badge-dot")).toHaveAttribute("aria-hidden");
  act(() => { navEntry("Old laptop").click(); });
  const off = header("machines").querySelector(".host-detail-state > :first-child")!;
  expect(off).toHaveTextContent(/^Not connected$/);
  expect(off).not.toHaveClass("ui-badge");
  expect(off).toHaveAttribute("data-tone", "neutral");
  expect(off.querySelector(".ui-badge-dot")).toBeNull();
});

test("a dot is only ever green and only means connected; one live state per page; the page in words", () => {
  open();
  expect(document.querySelectorAll(".state-on-icon-dot").length).toBeGreaterThan(0);
  for (const mark of document.querySelectorAll(".state-on-icon-dot")) expect(["direct", "running"]).toContain(mark.getAttribute("data-state"));
  for (const state of document.querySelectorAll(".machine-state")) expect(state.getAttribute("data-tone")).not.toBe("accent");
  // A remote page: its header's state is the live one, in words at length; the card has none.
  const states = (page: HTMLElement) => [...page.querySelectorAll(".host-detail-header [role=status], .host-status-card [role=status]")];
  const remote = document.querySelector<HTMLElement>("#pane-machines .host-detail")!;
  expect(states(remote)).toEqual([remote.querySelector(".host-detail-state > :first-child")]);
  expect(states(remote)[0]).toHaveTextContent(/^Connected$/);
  // This device: its card's state is the live one, its header's is not.
  const own = document.querySelector<HTMLElement>("#pane-this-computer .host-detail")!;
  expect(states(own)).toEqual([own.querySelector(".host-status-card .host-status-state")]);
});

test("\"New\" is off for this release: an agent new on a machine marks neither its entry nor its name, whatever the panel stored", () => {
  for (const stored of [null, { "section-new": "pill" }, { "section-new": "count" }, { "section-new": "dot" }, { "section-new-dot": "end" }]) {
    if (stored) localStorage.setItem(VARIANTS_KEY, JSON.stringify(stored));
    open({ hostAgents: { "fp-old": newAgent() } });
    const entry = navEntry("Old laptop");
    expect(entry.querySelector(".machine-state")).toBeNull();
    expect(dot(entry)).toBeNull();
    expect(entry.querySelector(".new-on-icon-dot, .new-end-dot, .new-nav-pill, .new-nav-count, .sr-only")).toBeNull();
    expect(entry).toHaveAccessibleName("Old laptop, Not connected");
    cleanup();
    localStorage.removeItem(VARIANTS_KEY);
    localStorage.removeItem("sidevoice.highlights");
  }
});

test("in Spanish: what needs the person, and the name, in Spanish", () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  open({ localHostStatus: { state: "failed", installed: true } });
  expect(thisDevice()).toHaveAccessibleName("Este dispositivo, No funciona");
  expect(word(thisDevice())).toBe("No funciona");
  expect(navEntry("NUC")).toHaveAccessibleName("NUC, Conectada");
});
