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

/* VARIANTS `new-mark`: what the gear, a section and a machine show when something under them is new — a sparkle (A, the
 * default), a "New" pill with a count on the gear (B), a dot in Settings' nav with a count on the gear (C) — and what
 * the thing itself says: "✦ New" (A) or "New". Under every value it is said in words, and the gear is never a dot. */

/** An agent just found, by a name of its own each time: what this device saw is kept for the page's life. */
let found = 0;
const listing = (id: string): HostAgentsState => ({ status: "ready", error: null, busy: {}, actionErrors: {}, value: { agents: [{
  id, label: "Codex", present: true, version: "1.0.0", registration: "not-connected", connect: "auto", actionable: true,
  can: { connect: true, update: true, disconnect: true }, manual: { connect: [], disconnect: [], replace: [] } } as DetectedAgent],
  scanned_at: "2026-10-02T10:00:00Z", custom: { command: "c", snippet: "{}", version: "1" } } });
let shown = "";
const nuc: PairingSummary = { fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], rv: null, device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false };

/** A browser paired with the NUC, where Codex was just found: one thing new, under Machines and the NUC. */
function open(style: "sparkle" | "pill" | "dot" | null) {
  if (style) localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "new-mark": style }));
  window.sidevoiceActions = { openPairing: vi.fn(), machineDevices: vi.fn().mockResolvedValue([]), loadHostAgents: vi.fn(), loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  shown = `codex-${++found}`;
  act(() => { store.patch({ pairings: [nuc], machinesReady: true, machineLinks: { "fp-nuc": { reach: "ok", via: "node" } }, hostAgents: { "fp-nuc": listing(shown) }, settingsSection: "machines" }); });
  render(<RoomProvider store={store}><RoomHeader /><SettingsDialog /></RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
}

const gear = () => document.getElementById("settings-open")!;
const section = () => document.getElementById("settings-machines")!;
const machine = () => document.querySelector<HTMLElement>('.settings-nav .machine-entry[data-name="NUC"]')!;
const item = () => document.querySelector<HTMLElement>(`.new-mark[data-highlight="agent:fp-nuc:${shown}"]`)!;
/** The marks an icon wears. */
const onIcon = (entry: HTMLElement) => [...entry.querySelectorAll(".new-on-icon > span[aria-hidden]")].map((mark) => mark.getAttribute("class"));

test("A (the default): a sparkle on the gear, the section's icon and the machine's; \"✦ New\" on the thing itself", () => {
  open(null);
  expect(gear()).toHaveAccessibleName("Settings, 1 new");
  const mark = gear().querySelector(".settings-notice")!;
  expect(mark).toHaveAttribute("data-mark", "sparkle");
  expect(mark).toHaveAttribute("aria-hidden", "true");
  expect(mark.querySelector("svg")).toHaveClass("lucide-sparkle");
  expect(onIcon(section())).toEqual(["new-on-icon-sparkle"]);
  expect(section()).toHaveAccessibleName(/^Machines ?, new$/);
  expect(onIcon(machine())).toEqual(["new-on-icon-sparkle"]);
  expect(machine()).toHaveAccessibleName("NUC, Connected, new");
  expect(document.querySelector(".new-nav-pill")).toBeNull();
  // The thing itself teaches what the sparkle means.
  const badge = item().querySelector(".ui-badge")!;
  expect(badge).toHaveTextContent(/^New$/);
  expect(badge.querySelector("svg")).toHaveClass("lucide-sparkle");
  expect(within(item()).getByRole("button", { name: "Clear “New”" })).toBeInTheDocument();
});

test("B: how many on the gear; \"New\" at the section's and the machine's entry's end, in their names; \"New\" on the thing", () => {
  open("pill");
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
  expect(item().querySelector(".ui-badge svg")).toBeNull();
  expect(item().querySelector(".ui-badge")).toHaveTextContent(/^New$/);
});

test("C: how many on the gear; a dot on the section's and the machine's icon, in Settings' nav only; \"New\" on the thing", () => {
  open("dot");
  expect(gear().querySelector(".settings-notice")).toHaveAttribute("data-mark", "count");
  expect(gear().querySelector(".settings-notice")).toHaveTextContent(/^1$/);
  expect(onIcon(section())).toEqual(["new-on-icon-dot"]);
  expect(section()).toHaveAccessibleName(/^Machines ?, new$/);
  expect(onIcon(machine())).toEqual(["new-on-icon-dot"]);
  expect(document.querySelector(".new-nav-pill")).toBeNull();
  expect(item().querySelector(".ui-badge svg")).toBeNull();
});

test("under every value the gear is never a dot, and its mark goes once nothing is new", () => {
  for (const style of ["sparkle", "pill", "dot"] as const) {
    open(style);
    expect(gear().querySelectorAll("[aria-hidden]:not(svg)")).toHaveLength(1);
    expect(gear().querySelector(".settings-notice-dot, .new-on-icon-dot")).toBeNull();
    act(() => { within(item()).getByRole("button", { name: "Clear “New”" }).click(); });
    expect(gear().querySelector(".settings-notice")).toBeNull();
    expect(gear()).toHaveAccessibleName("Settings");
    expect(document.querySelector(".new-on-icon-sparkle, .new-on-icon-dot, .new-nav-pill")).toBeNull();
    cleanup();
    localStorage.removeItem("sidevoice.highlights");
  }
});

test("in Spanish the gear says how many as a count, not as a plural that breaks at one", () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  open("pill");
  expect(gear()).toHaveAccessibleName("Ajustes, novedades: 1");
  expect(section().lastElementChild).toHaveTextContent(/^Nuevo$/);
});
