import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, within } from "@testing-library/react";
import { RoomHeader } from "../room/RoomHeader";
import { SettingsDialog } from "../settings/SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { VARIANTS_KEY } from "../../lib/variants";
import type { DetectedAgent, HostAgentsState } from "../../state/room-types";
import type { PairingSummary } from "../../services/device-pairing.js";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { cleanup(); localStorage.removeItem(VARIANTS_KEY); localStorage.removeItem("sidevoice.settings"); localStorage.removeItem("sidevoice.highlights"); });

/* VARIANTS `section-new`: what a Settings section and a machine show when something under them is new — "New" at the
 * entry's end, the thing's own pill (A, the default); how many at its end, the gear's own count (B); a dot on its icon
 * (C). Under every value the gear says how many (never a dot), the thing itself says "New", and it is said in words. */

/** An agent just found, by a name of its own each time: what this device saw is kept for the page's life. */
let found = 0;
const listing = (ids: string[]): HostAgentsState => ({ status: "ready", error: null, busy: {}, actionErrors: {}, value: { agents: ids.map((id) => ({
  id, label: "Codex", present: true, version: "1.0.0", registration: "not-connected", connect: "auto", actionable: true,
  can: { connect: true, update: true, disconnect: true }, manual: { connect: [], disconnect: [], replace: [] } }) as DetectedAgent),
  scanned_at: "2026-10-02T10:00:00Z", custom: { command: "c", snippet: "{}", version: "1" } } });
let shown = "";
const nuc: PairingSummary = { fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], rv: null, device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false };

/** A browser paired with the NUC, where `n` agents were just found: `n` things new, under Machines and the NUC. */
function open(style: "pill" | "count" | "dot" | null, n = 1) {
  if (style) localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "section-new": style }));
  window.sidevoiceActions = { openPairing: vi.fn(), machineDevices: vi.fn().mockResolvedValue([]), loadHostAgents: vi.fn(), loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  const ids = Array.from({ length: n }, () => `codex-${++found}`);
  shown = ids[0];
  act(() => { store.patch({ pairings: [nuc], machinesReady: true, machineLinks: { "fp-nuc": { reach: "ok", via: "node" } }, hostAgents: { "fp-nuc": listing(ids) }, settingsSection: "machines" }); });
  render(<RoomProvider store={store}><RoomHeader /><SettingsDialog /></RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
}

const gear = () => document.getElementById("settings-open")!;
const section = () => document.getElementById("settings-machines")!;
const machine = () => document.querySelector<HTMLElement>('.settings-nav .machine-entry[data-name="NUC"]')!;
const item = () => document.querySelector<HTMLElement>(`.new-mark[data-highlight="agent:fp-nuc:${shown}"]`)!;
/** The marks an icon wears. */
const onIcon = (entry: HTMLElement) => [...entry.querySelectorAll(".new-on-icon > span[aria-hidden]")].map((mark) => mark.getAttribute("class"));

test("A (the default): \"New\" at the section's and the machine's entry's end, the thing's own pill; how many on the gear", () => {
  open(null);
  const mark = gear().querySelector(".settings-notice")!;
  expect(mark).toHaveAttribute("data-mark", "count");
  expect(mark).toHaveTextContent(/^1$/);
  expect(gear()).toHaveAccessibleName("Settings, 1 new");
  expect(onIcon(section())).toEqual([]);
  expect(section().lastElementChild).toHaveClass("new-nav-pill");
  expect(section().lastElementChild).toHaveTextContent(/^New$/);
  // Its visible word is its name's: no hidden ", new" beside it.
  expect(section().querySelector(".sr-only")).toBeNull();
  expect(section()).toHaveAccessibleName("Machines New");
  expect(onIcon(machine())).toEqual([]);
  expect(machine().querySelector(".machine-entry-line > .new-nav-pill")).toHaveTextContent(/^New$/);
  expect(machine()).toHaveAccessibleName("NUC, Connected, new");
  // The thing itself: the same pill, the same word, and its ×.
  const badge = item().querySelector(".ui-badge")!;
  expect(badge).toHaveTextContent(/^New$/);
  expect(badge.querySelector("svg")).toBeNull();
  expect(badge.className).toBe(section().lastElementChild!.className.replace("new-nav-pill", "new-badge"));
  expect(within(item()).getByRole("button", { name: "Clear “New”" })).toBeInTheDocument();
});

test("B: how many at the section's and the machine's entry's end, as the gear counts them; said in words", () => {
  open("count", 2);
  expect(gear().querySelector(".settings-notice")).toHaveTextContent(/^2$/);
  const count = section().querySelector(".new-nav-count")!;
  expect(count).toHaveTextContent(/^2$/);
  expect(count).toHaveAttribute("aria-hidden", "true");
  expect(section()).toHaveAccessibleName(/^Machines ?, new$/);
  expect(machine().querySelector(".machine-entry-line > .new-nav-count")).toHaveTextContent(/^2$/);
  expect(machine()).toHaveAccessibleName("NUC, Connected, new");
  expect(onIcon(section())).toEqual([]);
  expect(document.querySelector(".settings-nav .new-nav-pill")).toBeNull();
  expect(item().querySelector(".ui-badge")).toHaveTextContent(/^New$/);
});

test("C: a dot on the section's and the machine's icon, never on the gear; said in words", () => {
  open("dot");
  expect(gear().querySelector(".settings-notice")).toHaveAttribute("data-mark", "count");
  expect(onIcon(section())).toEqual(["new-on-icon-dot"]);
  expect(section()).toHaveAccessibleName(/^Machines ?, new$/);
  expect(onIcon(machine())).toEqual(["new-on-icon-dot"]);
  expect(machine()).toHaveAccessibleName("NUC, Connected, new");
  expect(document.querySelector(".settings-nav .new-nav-pill, .settings-nav .new-nav-count")).toBeNull();
  expect(item().querySelector(".ui-badge")).toHaveTextContent(/^New$/);
});

test("the panel's choice is followed live, without a reload", () => {
  open(null);
  expect(section().querySelector(".new-nav-pill")).not.toBeNull();
  act(() => {
    localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "section-new": "dot" }));
    window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY }));
  });
  expect(section().querySelector(".new-nav-pill")).toBeNull();
  expect(onIcon(section())).toEqual(["new-on-icon-dot"]);
});

test("under every value the gear is a count, never a dot, and every mark goes once nothing is new", () => {
  for (const style of ["pill", "count", "dot"] as const) {
    open(style);
    expect(gear().querySelectorAll(".settings-notice")).toHaveLength(1);
    expect(gear().querySelector(".settings-notice-dot, .new-on-icon-dot, svg.lucide-sparkle")).toBeNull();
    act(() => { within(item()).getByRole("button", { name: "Clear “New”" }).click(); });
    expect(gear().querySelector(".settings-notice")).toBeNull();
    expect(gear()).toHaveAccessibleName("Settings");
    expect(document.querySelector(".new-on-icon-dot, .new-nav-pill, .new-nav-count")).toBeNull();
    cleanup();
    localStorage.removeItem("sidevoice.highlights");
  }
});

test("in Spanish: the gear says how many as a count, and A's pill says Nuevo", () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  open("pill");
  expect(gear()).toHaveAccessibleName("Ajustes, novedades: 1");
  expect(section().lastElementChild).toHaveTextContent(/^Nuevo$/);
});
