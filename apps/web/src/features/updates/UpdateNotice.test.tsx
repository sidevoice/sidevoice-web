import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { fakeUpdater } from "../../test/updater";
import { ConversationSidebar } from "../room/ConversationSidebar";
import { SettingsDialog } from "../settings/SettingsDialog";
import { UpdateBanner } from "./UpdateNotice";
import type { UpdaterStatus } from "./useUpdates";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus, LocalHostVersion } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => {
  cleanup();
  for (const key of ["sidevoice.variants", "sidevoice.settings", "sidevoice.updates-checked-at", "sidevoice.update-continue"]) localStorage.removeItem(key);
  sessionStorage.removeItem("sidevoice.update-notice-hidden");
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
  delete (window as { sidevoiceActions?: unknown }).sidevoiceActions;
});

/* Where the room says an update waits (VARIANTS `update-notice`, a desktop's): C, the default, an update icon by the
 * brand whose popover lists each update with its action; A, the update's mark on the Settings gear, which opens Updates on
 * the most pressing one's button; B, a slim banner over the room with the most pressing one, dismissible until it moves
 * on; D, today's foot (UpdatesEntry.test.tsx). What can be done in place is (the app's Update and Restart, the page's
 * Reload); anything else lands on its row's button in Settings › Updates. Every button says what it updates, in the
 * words of Updates' rows (VARIANTS `updates-rows`). */

const local: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
const lab: PairingSummary = { fp: "fp-lab", host: "Lab box", urls: ["https://lab.example"], rv: null, device_id: "d-lab", paired_at: 1_700_000_100, revoked: false };
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.8.1", api: 1 }, calls: 0, product_version: "0.8.1" };
const BEHIND: LocalHostVersion = { bridge: 3, bundled: { version: "0.9.0" }, installed: { version: "0.8.1" }, core_api: 1, update: "available" };
const CURRENT: LocalHostVersion = { ...BEHIND, bundled: { version: "0.8.1" }, update: "current" };

function variants(notice: string, rows?: string) {
  localStorage.setItem("sidevoice.variants", JSON.stringify({ "update-notice": notice, ...(rows ? { "updates-rows": rows } : {}) }));
}

/** The desktop app (a release, its updater as fakeUpdater makes it), its service as `service` says, with the room's
 *  sidebar, the banner's place and Settings (open, as the gear opens it). */
function room({ updater = {}, service = CURRENT, remote = {}, facts = {} }: { updater?: Parameters<typeof fakeUpdater>[0]; service?: LocalHostVersion;
  remote?: Record<string, unknown>; facts?: Record<string, unknown> } = {}) {
  const fake = fakeUpdater(updater);
  const update = vi.fn(async () => running);
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { build: { channel: "release", version: "0.3.0" }, updater: fake.updater,
    localHost: { state: vi.fn(async () => running), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(), version: vi.fn(async () => service), update } } } });
  const reloadToUpdate = vi.fn();
  window.sidevoiceActions = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), machineDevices: vi.fn().mockResolvedValue([]),
    loadHostAgents: vi.fn(), loadMachineInfo: vi.fn(), reloadToUpdate } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  const machines = Object.keys(remote).length ? [local, lab] : [local];
  act(() => { store.patch({ pairings: machines, machinesReady: true, inApp: true, localHostAvailable: true, localHostStatus: running, remoteHostStatus: remote as never,
    machineLinks: Object.fromEntries(machines.map((pairing) => [pairing.fp, { reach: "ok", via: "node" }])), ...facts } as never); });
  render(<RoomProvider store={store}><UpdateBanner /><ConversationSidebar /><SettingsDialog /></RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  return { store, fake, update, reloadToUpdate };
}
const settle = () => act(async () => {});
const brand = () => document.querySelector<HTMLElement>(".sidebar-brand .update-brand");
const gear = () => document.querySelector<HTMLElement>(".sidebar-foot .sidebar-settings")!;
const banner = () => document.querySelector<HTMLElement>(".update-banner");
/** The brand's popover, opened. */
async function popover() {
  await act(async () => { fireEvent.click(brand()!); });
  return within(await screen.findByRole("dialog", { name: "Updates" }));
}
/** Focus lands on what a landing asked for, in Settings › Updates. */
async function landsOn(control: () => HTMLElement | null) {
  await waitFor(() => expect(document.activeElement).toBe(control()), { timeout: 3000 });
}
const appRow = () => document.getElementById("updates-app");

test("C, the default: nothing by the brand while nothing waits; then an update icon with a dot, its count in its name", async () => {
  room();
  await settle();
  expect(brand()).toBeNull();
  cleanup();
  room({ service: BEHIND, remote: { "fp-lab": { state: "connected", checkedAt: 1, version: "0.8.1", update: { latest: "0.9.0", command: "sidevoice update" } } } });
  await waitFor(() => expect(brand()).toHaveAccessibleName("Updates, 2 waiting"));
  expect(brand()!.querySelector(".update-brand-dot")).toHaveAttribute("aria-hidden", "true");
  // Nothing of it at the foot: Settings alone.
  expect(document.querySelector(".sidebar-foot .update-line, .sidebar-foot .updates-entry")).toBeNull();
  expect(gear()).toHaveAccessibleName("Settings");
});

test("C: the app's update acts in place — Update the app downloads, focus stays on its words; Restart to update the app restarts", async () => {
  const { fake } = room({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } } });
  await waitFor(() => expect(brand()).not.toBeNull());
  const list = await popover();
  expect(list.getByText("Sidevoice 0.4.0 is available")).toBeInTheDocument();
  // A press focuses what it pressed, as a browser does.
  const updateApp = list.getByRole("button", { name: "Update the app" });
  updateApp.focus();
  await act(async () => { fireEvent.click(updateApp); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  await act(async () => { fake.push({ state: "downloading", version: "0.4.0", progress: 0.4 }); });
  expect(list.getByText(/^Downloading Sidevoice 0\.4\.0… 40\s?%$/)).toBeInTheDocument();
  expect(list.queryByRole("button", { name: /Update the app|Restart/ })).toBeNull();
  // Its button gone as it acted, focus is on its words, not lost to the page.
  expect(document.activeElement).toHaveTextContent(/^Downloading Sidevoice 0\.4\.0/);
  await act(async () => { fake.push({ state: "ready", version: "0.4.0" }); });
  expect(list.getByText("Sidevoice 0.4.0 is ready")).toBeInTheDocument();
  await act(async () => { fireEvent.click(list.getByRole("button", { name: "Restart to update the app" })); });
  expect(fake.updater.restart).toHaveBeenCalledOnce();
  expect(localStorage.getItem("sidevoice.update-continue")).toBeNull();
});

test("C: what can't be done in place lands on its button in Updates: the service's Update, a remote machine's Copy; the page's Reload reloads", async () => {
  const { store, reloadToUpdate } = room({ service: BEHIND, facts: { webUpdate: "b2" },
    remote: { "fp-lab": { state: "connected", checkedAt: 1, version: "0.8.1", update: { latest: "0.9.0", command: "sidevoice update" } } } });
  await waitFor(() => expect(brand()).toHaveAccessibleName("Updates, 3 waiting"));
  let list = await popover();
  // The page's, then this computer's service (its own number), then the machines.
  expect([...document.querySelectorAll(".update-notice-text")].map((text) => text.textContent))
    .toEqual(["A new version of Sidevoice is ready", "Sidevoice service 0.9.0 is available", "Lab box needs an update"]);
  await act(async () => { fireEvent.click(list.getByRole("button", { name: "Reload Sidevoice" })); });
  expect(reloadToUpdate).toHaveBeenCalledOnce();
  const sees = list.getAllByRole("button", { name: "See updates" });
  await act(async () => { fireEvent.click(sees[0]); });
  expect(store.getState().facts.settingsSection).toBe("updates");
  await landsOn(() => document.getElementById("updates-this-computer"));
  expect(document.activeElement).toHaveAccessibleName("Update the service");
  list = await popover();
  await act(async () => { fireEvent.click(list.getAllByRole("button", { name: "See updates" })[1]); });
  await landsOn(() => document.getElementById("updates-machine-fp-lab")!.querySelector("button"));
});

test("A: the gear wears the update's mark and says so; it opens Updates on the most pressing one's button", async () => {
  variants("gear");
  room({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } }, service: BEHIND });
  await waitFor(() => expect(gear()).toHaveAccessibleName("Settings, an update is waiting"));
  expect(gear().querySelector('.settings-notice[data-mark="update"]')).toHaveAttribute("aria-hidden", "true");
  expect(brand()).toBeNull();
  expect(banner()).toBeNull();
  await act(async () => { fireEvent.click(gear()); });
  // The app's first: its row's Update the app.
  await landsOn(() => appRow() && within(appRow()!).getByRole("button", { name: "Update the app" }));
});

test("A: the page's new version alone puts no mark on the gear: it loads by itself after the call", async () => {
  variants("gear");
  room({ facts: { webUpdate: "b2" } });
  await settle();
  expect(gear()).toHaveAccessibleName("Settings");
  expect(gear().querySelector('.settings-notice[data-mark="update"]')).toBeNull();
});

test("B: a banner whose words follow the update — available, its download, ready, a machine behind — each with its action", async () => {
  variants("banner");
  const { fake } = room({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } } });
  await waitFor(() => expect(banner()).not.toBeNull());
  const bar = within(banner()!);
  expect(banner()).toHaveAccessibleName("Updates");
  expect(banner()).not.toHaveAttribute("role");
  expect(bar.getByText("Sidevoice 0.4.0 is available")).toBeInTheDocument();
  await act(async () => { fireEvent.click(bar.getByRole("button", { name: "Update the app" })); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  await act(async () => { fake.push({ state: "downloading", version: "0.4.0", progress: 0.25 }); });
  expect(bar.getByText(/^Downloading Sidevoice 0\.4\.0… 25\s?%$/)).toBeInTheDocument();
  await act(async () => { fake.push({ state: "ready", version: "0.4.0" }); });
  expect(bar.getByText("Sidevoice 0.4.0 is ready")).toBeInTheDocument();
  expect(bar.getByRole("button", { name: "Restart to update the app" })).toBeInTheDocument();
  cleanup();
  variants("banner");
  room({ remote: { "fp-lab": { state: "connected", checkedAt: 1, version: "0.8.1", update: { latest: "0.9.0", command: "sidevoice update" } } } });
  await waitFor(() => expect(banner()).toHaveTextContent("Lab box needs an update"));
  await act(async () => { fireEvent.click(within(banner()!).getByRole("button", { name: "See updates" })); });
  await landsOn(() => document.getElementById("updates-machine-fp-lab")!.querySelector("button"));
});

test("B: × hides the banner, focus going on to what follows it, until its update moves on", async () => {
  variants("banner");
  const { fake } = room({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } } });
  await waitFor(() => expect(banner()).not.toBeNull());
  await act(async () => { fireEvent.click(within(banner()!).getByRole("button", { name: "Hide this notice" })); });
  expect(banner()).toBeNull();
  await waitFor(() => expect(document.activeElement).not.toBe(document.body));
  expect(document.querySelector(".conversation-sidebar")).toContainElement(document.activeElement as HTMLElement);
  // The same update, the same window: still hidden.
  await act(async () => { fake.push({ state: "available", version: "0.4.0" }); });
  expect(banner()).toBeNull();
  // Ready now: back.
  await act(async () => { fake.push({ state: "ready", version: "0.4.0" }); });
  expect(banner()).toHaveTextContent("Sidevoice 0.4.0 is ready");
});

test("one row (updates-rows A): the notice says Sidevoice as one — Restart to update Sidevoice, which asks the service to follow; no service number", async () => {
  variants("brand", "one");
  const { fake } = room({ updater: { status: { state: "ready", version: "0.4.0" } }, service: BEHIND });
  await waitFor(() => expect(brand()).toHaveAccessibleName("Updates, 2 waiting"));
  const list = await popover();
  expect([...document.querySelectorAll(".update-notice-text")].map((text) => text.textContent)).toEqual(["Sidevoice 0.4.0 is ready", "A Sidevoice update is available"]);
  await act(async () => { fireEvent.click(list.getByRole("button", { name: "Restart to update Sidevoice" })); });
  expect(fake.updater.restart).toHaveBeenCalledOnce();
  expect(Number(localStorage.getItem("sidevoice.update-continue"))).toBeGreaterThan(0);
});

test("in Spanish: Sidevoice 0.4.0 está listo, Reiniciar para actualizar la app, Ver actualizaciones, Ocultar este aviso", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  onTestFinished(() => localStorage.removeItem("sidevoice.settings"));
  variants("banner");
  room({ updater: { status: { state: "ready", version: "0.4.0" } } });
  await waitFor(() => expect(banner()).toHaveTextContent("Sidevoice 0.4.0 está listo"));
  expect(within(banner()!).getByRole("button", { name: "Reiniciar para actualizar la app" })).toBeInTheDocument();
  expect(within(banner()!).getByRole("button", { name: "Ocultar este aviso" })).toBeInTheDocument();
  expect(banner()).toHaveAccessibleName("Actualizaciones");
});

test("no notice on a phone, whatever the variant", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
    media, matches: media === "(max-width: 899px)", onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
  onTestFinished(() => { vi.restoreAllMocks(); });
  for (const notice of ["brand", "gear", "banner", "foot"]) {
    variants(notice);
    room({ updater: { status: { state: "ready", version: "0.4.0" } } as { status: UpdaterStatus } });
    await settle();
    expect(document.querySelector(".update-brand, .update-banner, .update-line, .updates-entry, .settings-notice[data-mark=\"update\"]"), notice).toBeNull();
    cleanup();
  }
});
