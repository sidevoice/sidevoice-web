import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { fakeUpdater } from "../../test/updater";
import { ConversationSidebar } from "../room/ConversationSidebar";
import { SettingsDialog } from "../settings/SettingsDialog";
import type { UpdaterStatus } from "./useUpdates";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus, LocalHostVersion } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => {
  cleanup();
  for (const key of ["sidevoice.variants", "sidevoice.settings", "sidevoice.updates-checked-at", "sidevoice.update-continue"]) localStorage.removeItem(key);
  // The rail is a test's own: the next one starts beside the list.
  localStorage.removeItem("sidevoice.sidebar-collapsed");
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
  delete (window as { sidevoiceActions?: unknown }).sidevoiceActions;
});

/* Where the room says an update waits (decided, a desktop's): a chip on its own line above Settings at the
 * conversations' foot, the most pressing update's words and its action — in the rail an icon above the gear, its
 * popover listing each one. Automatic says nothing until the app's update is ready; manual says it as soon as one is
 * found: Version X available · Download, its download, Sidevoice X · Restart. What can be done in place is (the app's
 * Download and Restart, the page's Reload); anything else lands on its row's button in Settings › Updates. The flow in
 * each mode, everywhere it shows, is UpdateFlow.test.tsx. */

const local: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
const lab: PairingSummary = { fp: "fp-lab", host: "Lab box", urls: ["https://lab.example"], rv: null, device_id: "d-lab", paired_at: 1_700_000_100, revoked: false };
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.8.1", api: 1 }, calls: 0, product_version: "0.8.1" };
const BEHIND: LocalHostVersion = { bridge: 3, bundled: { version: "0.9.0" }, installed: { version: "0.8.1" }, core_api: 1, update: "available" };
const CURRENT: LocalHostVersion = { ...BEHIND, bundled: { version: "0.8.1" }, update: "current" };

function variants(picked: Record<string, string>) {
  localStorage.setItem("sidevoice.variants", JSON.stringify(picked));
}

/** The desktop app (a release, its updater as fakeUpdater makes it), its service as `service` says, with the room's
 *  sidebar and Settings (open, as the gear opens it). */
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
  render(<RoomProvider store={store}><ConversationSidebar /><SettingsDialog /></RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  return { store, fake, update, reloadToUpdate };
}
const settle = () => act(async () => {});
const foot = () => document.querySelector<HTMLElement>(".sidebar-foot")!;
const gear = () => document.querySelector<HTMLElement>(".sidebar-foot .sidebar-settings")!;
const line = () => document.querySelector<HTMLElement>(".sidebar-foot .update-beside");
const chip = () => document.querySelector<HTMLElement>(".sidebar-foot .update-chip");
const collapse = () => act(async () => { fireEvent.click(document.querySelector(".sidebar-collapse")!); });
/** The rail's chip's popover, opened. */
async function popover() {
  await act(async () => { fireEvent.click(chip()!); });
  return within(await screen.findByRole("dialog", { name: "Updates" }));
}
/** Focus lands on what a landing asked for, in Settings › Updates. */
async function landsOn(control: () => HTMLElement | null) {
  await waitFor(() => expect(document.activeElement).toBe(control()), { timeout: 3000 });
}
/** The foot's children, by what each is: the chip's line, Settings. */
const footOrder = () => [...foot().children].map((child) => child.classList.contains("update-beside") ? "chip" : child.classList.contains("sidebar-settings") ? "settings" : "?");
/** Nothing of an update at the foot: Settings alone, named. */
function settingsAlone() {
  expect(line()).toBeNull();
  expect(chip()).toBeNull();
  expect(footOrder()).toEqual(["settings"]);
  expect(gear()).toHaveTextContent("Settings");
}

test("manual: nothing while nothing waits; then the chip on its own line above Settings — Version 0.4.0 available · Download, its download, Sidevoice 0.4.0 · Restart", async () => {
  room({ updater: { mode: "manual" } });
  await settle();
  settingsAlone();
  cleanup();
  const { fake } = room({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } } });
  await waitFor(() => expect(chip()).not.toBeNull());
  // Its own line, then Settings as ever, named.
  expect(footOrder()).toEqual(["chip", "settings"]);
  expect(gear()).toHaveTextContent("Settings");
  expect(gear()).toHaveAccessibleName("Settings");
  // Its words, then its action's one word, never cut short; its name says the action in full.
  expect(chip()!.querySelector(".update-chip-words")).toHaveTextContent(/^Version 0\.4\.0 available$/);
  expect(chip()!.querySelector(".update-chip-action")).toHaveTextContent(/^Download$/);
  expect(chip()).toHaveAccessibleName("Version 0.4.0 available · Download");
  expect(chip()).toHaveAttribute("title", "Sidevoice 0.4.0 is available · Download");
  await act(async () => { fireEvent.click(chip()!); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  await act(async () => { fake.push({ state: "downloading", version: "0.4.0", progress: 0.4 }); });
  // Downloading: to read, not to press.
  expect(chip()!.tagName).toBe("SPAN");
  expect(chip()).toHaveTextContent(/^Downloading… 40\s?%$/);
  await act(async () => { fake.push({ state: "ready", version: "0.4.0" }); });
  expect(chip()!.querySelector(".update-chip-words")).toHaveTextContent(/^Sidevoice 0\.4\.0$/);
  expect(chip()!.querySelector(".update-chip-action")).toHaveTextContent(/^Restart$/);
  expect(chip()).toHaveAccessibleName("Sidevoice 0.4.0 · Restart to update Sidevoice");
  expect(fake.updater.restart).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(chip()!); });
  expect(fake.updater.restart).toHaveBeenCalledOnce();
  // Sidevoice as one: its restart asks this computer's service to follow.
  expect(Number(localStorage.getItem("sidevoice.update-continue"))).toBeGreaterThan(0);
  // Settings opens Settings, as ever.
  await act(async () => { fireEvent.click(gear()); });
  expect(document.getElementById("pane-general")).not.toBeNull();
});

test("automatic: nothing while the app's update is found or downloads by itself; once downloaded, Sidevoice 0.4.0 · Restart", async () => {
  const { fake } = room({ updater: { mode: "automatic", status: { state: "available", version: "0.4.0" } } });
  await settle();
  settingsAlone();
  await act(async () => { fake.push({ state: "downloading", version: "0.4.0", progress: 0.4 }); });
  settingsAlone();
  await act(async () => { fake.push({ state: "ready", version: "0.4.0" }); });
  expect(footOrder()).toEqual(["chip", "settings"]);
  expect(chip()!.querySelector(".update-chip-words")).toHaveTextContent(/^Sidevoice 0\.4\.0$/);
  expect(chip()!.querySelector(".update-chip-action")).toHaveTextContent(/^Restart$/);
  expect(chip()).toHaveAccessibleName("Sidevoice 0.4.0 · Restart to update Sidevoice");
  expect(fake.updater.restart).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(chip()!); });
  expect(fake.updater.restart).toHaveBeenCalledOnce();
});

test("a failed download or install is said under the chip's row, Retry in the chip", async () => {
  const { fake } = room({ updater: { mode: "manual", status: { state: "available", version: "0.4.0", error: { code: "update-download-failed" } } } });
  await waitFor(() => expect(chip()).toHaveAccessibleName("Version 0.4.0 available · Retry download"));
  expect(chip()!.querySelector(".update-chip-action")).toHaveTextContent(/^Retry$/);
  const alert = line()!.querySelector("[role=alert]")!;
  expect(alert).toHaveTextContent("The update couldn't be downloaded.");
  expect(document.querySelector(".update-beside-row")).not.toContainElement(alert as HTMLElement);
  fake.updater.download.mockRejectedValueOnce(new Error("disk full"));
  await act(async () => { fireEvent.click(chip()!); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  cleanup();
  room({ updater: { mode: "automatic", status: { state: "ready", version: "0.4.0", error: { code: "update-install-failed" } } } });
  await waitFor(() => expect(chip()).toHaveAccessibleName("Sidevoice 0.4.0 · Restart to update Sidevoice"));
  expect(line()!.querySelector("[role=alert]")).not.toBeNull();
});

test("what can't be done in place lands on its button in Updates: the service's Update, a remote machine's Copy; the page's Reload reloads", async () => {
  room({ service: BEHIND });
  await waitFor(() => expect(chip()).toHaveAccessibleName("Update available · See updates"));
  expect(chip()!.querySelector(".update-chip-action")).toBeNull();
  await act(async () => { fireEvent.click(chip()!); });
  await landsOn(() => document.getElementById("updates-this-computer"));
  cleanup();
  room({ remote: { "fp-lab": { state: "connected", checkedAt: 1, version: "0.8.1", update: { latest: "0.9.0", command: "sidevoice update" } } } });
  await waitFor(() => expect(chip()).toHaveAccessibleName("Update available · See updates"));
  await act(async () => { fireEvent.click(chip()!); });
  await landsOn(() => document.getElementById("updates-machine-fp-lab")!.querySelector("button"));
  cleanup();
  const { reloadToUpdate } = room({ facts: { webUpdate: "b2" } });
  await waitFor(() => expect(chip()).toHaveTextContent(/^Reload to update$/));
  expect(chip()).toHaveAccessibleName("Reload to update");
  await act(async () => { fireEvent.click(chip()!); });
  expect(reloadToUpdate).toHaveBeenCalledOnce();
});

test("in the rail: an icon above the gear, its count in its name; its popover lists each update with its action", async () => {
  const { fake } = room({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } }, service: BEHIND });
  await waitFor(() => expect(chip()).not.toBeNull());
  await collapse();
  expect(chip()).toHaveAccessibleName("Updates, 2 waiting");
  expect(chip()).toHaveAttribute("aria-haspopup", "dialog");
  expect(line()).toHaveAttribute("data-rail");
  expect(footOrder()).toEqual(["chip", "settings"]);
  expect(gear()).toHaveAccessibleName("Settings");
  expect(gear()).not.toHaveTextContent("Settings");
  const list = await popover();
  expect([...document.querySelectorAll(".update-notice-text")].map((text) => text.textContent)).toEqual(["Sidevoice 0.4.0 is available", "A Sidevoice update is available"]);
  await act(async () => { fireEvent.click(list.getByRole("button", { name: "Download", description: "Sidevoice 0.4.0 is available" })); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  // This computer's service, while the app has an update: Sidevoice's one row, the app's first.
  await act(async () => { fireEvent.click(list.getByRole("button", { name: "See updates", description: "A Sidevoice update is available" })); });
  await landsOn(() => document.getElementById("updates-app") && within(document.getElementById("updates-app")!).getByRole("button", { name: "Download" }));
});

test("in the rail, automatic: no icon while the app's update downloads by itself; once ready, the icon, Restart in its popover", async () => {
  const { fake } = room({ updater: { mode: "automatic", status: { state: "downloading", version: "0.4.0", progress: 0.4 } } });
  await settle();
  await collapse();
  expect(chip()).toBeNull();
  expect(footOrder()).toEqual(["settings"]);
  await act(async () => { fake.push({ state: "ready", version: "0.4.0" }); });
  expect(chip()).toHaveAccessibleName("Updates, 1 waiting");
  const list = await popover();
  expect(document.querySelector(".update-notice-text")).toHaveTextContent(/^Sidevoice 0\.4\.0 is ready$/);
  await act(async () => { fireEvent.click(list.getByRole("button", { name: "Restart to update Sidevoice" })); });
  expect(fake.updater.restart).toHaveBeenCalledOnce();
});

test("Sidevoice as one: Restart to update Sidevoice asks the service to follow; the service's line says no number of its own", async () => {
  const { fake } = room({ updater: { status: { state: "ready", version: "0.4.0" } }, service: BEHIND });
  await waitFor(() => expect(chip()).toHaveAccessibleName("Sidevoice 0.4.0 · Restart to update Sidevoice"));
  await act(async () => { fireEvent.click(chip()!); });
  expect(fake.updater.restart).toHaveBeenCalledOnce();
  expect(Number(localStorage.getItem("sidevoice.update-continue"))).toBeGreaterThan(0);
  await collapse();
  const list = await popover();
  expect([...document.querySelectorAll(".update-notice-text")].map((text) => text.textContent)).toEqual(["Sidevoice 0.4.0 is ready", "A Sidevoice update is available"]);
  expect(list.getByRole("button", { name: "Restart to update Sidevoice" })).toBeInTheDocument();
});

test("in Spanish: Versión 0.4.0 disponible · Descargar, then Sidevoice 0.4.0 · Reiniciar; Settings is Configuración", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  onTestFinished(() => localStorage.removeItem("sidevoice.settings"));
  const { fake } = room({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } } });
  await waitFor(() => expect(chip()).toHaveAccessibleName("Versión 0.4.0 disponible · Descargar"));
  expect(gear()).toHaveAccessibleName("Configuración");
  await act(async () => { fake.push({ state: "ready", version: "0.4.0" }); });
  expect(chip()).toHaveAccessibleName("Sidevoice 0.4.0 · Reiniciar para actualizar Sidevoice");
  expect(chip()!.querySelector(".update-chip-action")).toHaveTextContent(/^Reiniciar$/);
  await collapse();
  expect(chip()).toHaveAccessibleName("Actualizaciones, 1 pendientes");
});

test("no chip on a phone", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
    media, matches: media === "(max-width: 899px)", onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
  onTestFinished(() => { vi.restoreAllMocks(); });
  room({ updater: { status: { state: "ready", version: "0.4.0" } } as { status: UpdaterStatus } });
  await settle();
  expect(document.querySelector(".update-chip, .update-beside")).toBeNull();
});

test("a choice the panel stored for the dropped variant (the banner, the foot's row, the chip in Settings' row) is the chip above Settings", async () => {
  for (const old of ["banner", "foot", "beside-settings"]) {
    variants({ "update-notice": old });
    room({ updater: { status: { state: "ready", version: "0.4.0" } } });
    await waitFor(() => expect(chip(), old).toHaveAccessibleName("Sidevoice 0.4.0 · Restart to update Sidevoice"));
    expect(footOrder(), old).toEqual(["chip", "settings"]);
    expect(gear(), old).toHaveTextContent("Settings");
    expect(document.querySelector(".update-banner, .update-line, .updates-entry"), old).toBeNull();
    cleanup();
  }
});
