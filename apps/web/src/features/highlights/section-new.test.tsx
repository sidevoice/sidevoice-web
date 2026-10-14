import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { RoomHeader } from "../room/RoomHeader";
import { SettingsDialog } from "../settings/SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { VARIANTS_KEY } from "../../lib/variants";
import { HIGHLIGHTS_ON } from "./highlights";
import type { DetectedAgent, HostAgentsState } from "../../state/room-types";
import type { PairingSummary } from "../../services/device-pairing.js";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { cleanup(); localStorage.removeItem(VARIANTS_KEY); localStorage.removeItem("sidevoice.settings"); localStorage.removeItem("sidevoice.highlights"); });

/* "New" is off for this release (HIGHLIGHTS_ON): with things new under a section and a machine, no mark shows on the
 * gear, the section, the machine or the thing itself, and nothing says "new" in words. Where a section's mark goes is
 * no longer a variant: a choice the preview's panel stored for `section-new` or `section-new-dot` changes nothing. */

/** An agent just found, by a name of its own each time: what this device saw is kept for the page's life. */
let found = 0;
const listing = (ids: string[]): HostAgentsState => ({ status: "ready", error: null, busy: {}, actionErrors: {}, value: { agents: ids.map((id) => ({
  id, label: "Codex", present: true, version: "1.0.0", registration: "not-connected", connect: "auto", actionable: true,
  can: { connect: true, update: true, disconnect: true }, manual: { connect: [], disconnect: [], replace: [] } }) as DetectedAgent),
  scanned_at: "2026-10-02T10:00:00Z", custom: { command: "c", snippet: "{}", version: "1" } } });
let shown = "";
const nuc: PairingSummary = { fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], rv: null, device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false };

/** A browser paired with the NUC, where `n` agents were just found: `n` candidates, under Machines and the NUC. */
function open(stored: Record<string, string> | null, n = 1) {
  if (stored) localStorage.setItem(VARIANTS_KEY, JSON.stringify(stored));
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
const MARKS = ".settings-notice, .new-on-icon-dot, .new-end-dot, .new-mark, .new-badge, .new-nav-pill, .new-nav-count";

/** Nothing new anywhere: no mark, no word, the gear, the section and the machine named plainly. */
function nothingNew(language: "en" | "es" = "en") {
  expect(document.querySelector(MARKS)).toBeNull();
  expect(document.querySelector(".new-on-icon[data-dot]")).toBeNull();
  expect(gear()).toHaveAccessibleName(language === "en" ? "Settings" : "Configuración");
  expect(section()).toHaveAccessibleName(language === "en" ? "Machines" : "Máquinas");
  expect(machine()).toHaveAccessibleName(language === "en" ? "NUC, Online" : "NUC, En línea");
  expect(document.body.textContent).not.toMatch(language === "en" ? /\bNew\b/ : /\bNuevo\b/);
}

test("off for this release: agents just found show no mark on the gear, the section, the machine or the agent", () => {
  expect(HIGHLIGHTS_ON).toBe(false);
  open(null, 2);
  // The agent itself is there, without its "New".
  expect(document.querySelector(`[data-highlight="agent:fp-nuc:${shown}"]`)).toBeNull();
  expect(document.querySelector(".host-agents")).not.toBeNull();
  nothingNew();
  // Never shown, so never recorded as shown.
  expect(localStorage.getItem("sidevoice.highlights") ?? "{}").not.toContain(shown);
});

test("in Spanish, nothing new either", () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  open(null);
  nothingNew("es");
});

test("a choice the preview's panel stored for section-new or section-new-dot changes nothing, nor its live change", () => {
  for (const stored of [{ "section-new": "pill" }, { "section-new": "count" }, { "section-new": "dot" },
    { "section-new-dot": "side" }, { "section-new-dot": "label" }, { "section-new-dot": "end" }] as Record<string, string>[]) {
    open(stored);
    nothingNew();
    cleanup();
  }
  open(null);
  act(() => {
    localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "section-new": "count", "section-new-dot": "end" }));
    window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY }));
  });
  nothingNew();
});
