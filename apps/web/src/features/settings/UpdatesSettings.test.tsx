import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { VARIANTS_KEY } from "../../lib/variants";
import { fakeUpdater } from "../../test/updater";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => {
  cleanup();
  localStorage.removeItem(VARIANTS_KEY); localStorage.removeItem("sidevoice.settings"); localStorage.removeItem("sidevoice.updates-checked-at");
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
});

/* VARIANTS `updates-section`: the desktop app's version and updates on This device's card (A, the default), or a
 * Settings section of their own, Updates (B) — the one AppUpdateSettings, mounted in one place or the other, never both;
 * in the desktop app only. */

const local: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.1.0", api: 1 }, calls: 0, product_version: "0.9.0" };
const RELEASE = { channel: "release", version: "0.9.0", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" };
const NIGHTLY = { channel: "nightly", version: "0.10.0-nightly", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" };

/** The desktop app (its build, and a release's updater), or a browser (`build` null), with Settings at `section`. */
function open(where: "this-device" | "section" | null, { build = RELEASE as Record<string, unknown> | null, section = "this-computer" } = {}) {
  if (where) localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "updates-section": where }));
  const fake = fakeUpdater();
  if (build) Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { build,
    ...(build.channel === "release" ? { updater: fake.updater } : {}),
    localHost: { state: vi.fn(async () => running), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn() } } } });
  window.sidevoiceActions = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), machineDevices: vi.fn().mockResolvedValue([]),
    loadHostAgents: vi.fn(), loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local], machinesReady: true, inApp: !!build, localHostAvailable: !!build, localHostStatus: running,
    machineLinks: { "fp-local": { reach: "ok", via: "node" } }, settingsSection: section }); });
  render(<RoomProvider store={store}><SettingsDialog /></RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  return { store, fake };
}

const entry = () => document.getElementById("settings-updates");
const pane = (id: string) => document.getElementById("pane-" + id)!;
const navOrder = () => [...document.querySelectorAll(".settings-nav > button.ui-nav-item")].map((item) => item.id.replace("settings-", ""));

test("A (the default): no Updates section; the version, Automatic/Manual and Check for updates on This device's card", async () => {
  open(null);
  await act(async () => {});
  expect(entry()).toBeNull();
  expect(pane("updates")).toBeNull();
  const card = within(pane("this-computer"));
  expect(await card.findByRole("radiogroup", { name: "Updates" })).toBeInTheDocument();
  expect(card.getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
  expect(pane("this-computer").querySelector(".host-status-product")).toHaveTextContent("Sidevoice 0.9.0");
});

test("B: Updates is a section of its own, before Advanced — the app's version, Automatic/Manual, Check for updates — and This device's card has none of them", async () => {
  open("section", { section: "updates" });
  await act(async () => {});
  expect(entry()).toHaveTextContent(/^Updates$/);
  expect(navOrder().slice(-3)).toEqual(["machines", "updates", "advanced"]);
  expect(entry()).toHaveAttribute("aria-current", "page");
  const updates = within(pane("updates"));
  expect(updates.getByRole("heading", { name: "Updates" })).toBeInTheDocument();
  expect(updates.getByText("Version")).toBeInTheDocument();
  expect(pane("updates").querySelector(".updates-settings-version .host-status-product")).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  expect(await updates.findByRole("radiogroup", { name: "Updates" })).toBeInTheDocument();
  expect(updates.getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
  // One AppUpdateSettings on the page: Updates', not the card's.
  expect(document.querySelectorAll(".app-update-settings")).toHaveLength(1);
  expect(pane("this-computer").querySelector(".app-update-settings")).toBeNull();
  // The card keeps the service's own version.
  expect(pane("this-computer").querySelector(".host-status-product")).toHaveTextContent("Sidevoice 0.9.0");
});

test("B, a nightly app: Updates says so under its version, updated by hand; the card no longer does", async () => {
  open("section", { build: NIGHTLY, section: "updates" });
  await act(async () => {});
  const note = pane("updates").querySelector(".host-status-build")!;
  expect(note).toHaveTextContent("Nightly · abcdef0 · 2026-10-13 — updates by hand");
  expect(within(note as HTMLElement).getByRole("link", { name: /updates by hand/ })).toHaveAttribute("target", "_blank");
  expect(pane("this-computer").querySelector(".host-status-build")).toBeNull();
  // A nightly has no updater: no Automatic/Manual, no Check for updates.
  expect(screen.queryByRole("radiogroup", { name: "Updates" })).toBeNull();
});

test("B in a browser: no Updates section (the desktop app's only)", () => {
  open("section", { build: null, section: "general" });
  expect(entry()).toBeNull();
  expect(pane("updates")).toBeNull();
});

test("the panel's choice is followed live; Updates shown as it goes is This device, where the updates are then", async () => {
  const { store } = open("section", { section: "updates" });
  await act(async () => {});
  act(() => {
    localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "updates-section": "this-device" }));
    window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY }));
  });
  expect(entry()).toBeNull();
  expect(store.getState().facts.settingsSection).toBe("this-computer");
  expect(await within(pane("this-computer")).findByRole("radiogroup", { name: "Updates" })).toBeInTheDocument();
});

test("in Spanish: Actualizaciones, its version as Versión", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  open("section", { section: "updates" });
  await act(async () => {});
  expect(entry()).toHaveTextContent(/^Actualizaciones$/);
  expect(within(pane("updates")).getByText("Versión")).toBeInTheDocument();
});
