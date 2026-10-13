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
  // The rail is a test's own: the next one starts beside the list.
  localStorage.removeItem("sidevoice.sidebar-collapsed");
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
  delete (window as { sidevoiceActions?: unknown }).sidevoiceActions;
});

/* Where the room says an update waits (VARIANTS `update-notice`, a desktop's): B1, the default, a slim banner over the
 * room with the most pressing update, dismissible until it moves on; B2, that banner's look as a chip in Settings' row
 * at the conversations' foot, Settings then its gear — in the rail an icon above the gear, its popover listing each
 * one; D, the foot's row kept as the reference (UpdatesEntry.test.tsx). What can be done in place is (the app's
 * Download and Restart, the page's Reload); anything else lands on its row's button in Settings › Updates. The flow in
 * each mode, everywhere it shows, is UpdateFlow.test.tsx. */

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
const gear = () => document.querySelector<HTMLElement>(".sidebar-foot .sidebar-settings")!;
const banner = () => document.querySelector<HTMLElement>(".update-banner");
const chip = () => document.querySelector<HTMLElement>(".sidebar-foot .update-chip");
const collapse = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: "Collapse conversations" })); });
/** The rail's chip's popover, opened. */
async function popover() {
  await act(async () => { fireEvent.click(chip()!); });
  return within(await screen.findByRole("dialog", { name: "Updates" }));
}
/** Focus lands on what a landing asked for, in Settings › Updates. */
async function landsOn(control: () => HTMLElement | null) {
  await waitFor(() => expect(document.activeElement).toBe(control()), { timeout: 3000 });
}
const appRow = () => document.getElementById("updates-app");

test("B1, the default: nothing while nothing waits; then a banner whose words follow the update — available with Download, its download, ready — each with its action", async () => {
  room();
  await settle();
  expect(banner()).toBeNull();
  cleanup();
  const { fake } = room({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } } });
  await waitFor(() => expect(banner()).not.toBeNull());
  const bar = within(banner()!);
  expect(banner()).toHaveAccessibleName("Updates");
  expect(banner()).not.toHaveAttribute("role");
  expect(bar.getByText("Sidevoice 0.4.0 is available")).toBeInTheDocument();
  // Nothing of it at the foot: Settings alone, named.
  expect(chip()).toBeNull();
  expect(gear()).toHaveTextContent("Settings");
  // A press focuses what it pressed, as a browser does; Download reads the update's words as its description.
  const download = bar.getByRole("button", { name: "Download", description: "Sidevoice 0.4.0 is available" });
  download.focus();
  await act(async () => { fireEvent.click(download); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  await act(async () => { fake.push({ state: "downloading", version: "0.4.0", progress: 0.25 }); });
  expect(bar.getByText(/^Downloading Sidevoice 0\.4\.0… 25\s?%$/)).toBeInTheDocument();
  expect(bar.queryByRole("button", { name: /Download|Restart/ })).toBeNull();
  // Its button gone as it acted, focus is on its words, not lost to the page.
  expect(document.activeElement).toHaveTextContent(/^Downloading Sidevoice 0\.4\.0/);
  await act(async () => { fake.push({ state: "ready", version: "0.4.0" }); });
  expect(bar.getByText("Sidevoice 0.4.0 is ready")).toBeInTheDocument();
  expect(fake.updater.restart).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(bar.getByRole("button", { name: "Restart to update the app" })); });
  expect(fake.updater.restart).toHaveBeenCalledOnce();
  expect(localStorage.getItem("sidevoice.update-continue")).toBeNull();
});

test("B1: what can't be done in place lands on its button in Updates: a remote machine's Copy; the page's Reload reloads", async () => {
  const { reloadToUpdate } = room({ facts: { webUpdate: "b2" } });
  await waitFor(() => expect(banner()).toHaveTextContent("A new version of Sidevoice is ready"));
  await act(async () => { fireEvent.click(within(banner()!).getByRole("button", { name: "Reload Sidevoice" })); });
  expect(reloadToUpdate).toHaveBeenCalledOnce();
  cleanup();
  room({ remote: { "fp-lab": { state: "connected", checkedAt: 1, version: "0.8.1", update: { latest: "0.9.0", command: "sidevoice update" } } } });
  await waitFor(() => expect(banner()).toHaveTextContent("Lab box needs an update"));
  await act(async () => { fireEvent.click(within(banner()!).getByRole("button", { name: "See updates" })); });
  await landsOn(() => document.getElementById("updates-machine-fp-lab")!.querySelector("button"));
});

test("B1: × hides the banner, focus going on to what follows it, until its update moves on", async () => {
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

test("B2: Settings' row holds the gear, named Settings, then the chip — Sidevoice 0.4.0 · Download, its download, Sidevoice 0.4.0 · Restart — no banner", async () => {
  variants("beside-settings");
  const { fake } = room({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } } });
  await waitFor(() => expect(chip()).not.toBeNull());
  expect(banner()).toBeNull();
  const row = document.querySelector(".sidebar-foot .update-beside-row")!;
  expect([...row.children]).toEqual([gear(), chip()]);
  expect(gear()).toHaveAccessibleName("Settings");
  expect(gear()).not.toHaveTextContent("Settings");
  // Its words, then its action's one word, never cut short; its name says the action in full.
  expect(chip()!.querySelector(".update-chip-words")).toHaveTextContent(/^Sidevoice 0\.4\.0$/);
  expect(chip()!.querySelector(".update-chip-action")).toHaveTextContent(/^Download$/);
  expect(chip()).toHaveAccessibleName("Sidevoice 0.4.0 · Download");
  expect(chip()).toHaveAttribute("title", "Sidevoice 0.4.0 is available · Download");
  await act(async () => { fireEvent.click(chip()!); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  await act(async () => { fake.push({ state: "downloading", version: "0.4.0", progress: 0.4 }); });
  // Downloading: to read, not to press.
  expect(chip()!.tagName).toBe("SPAN");
  expect(chip()).toHaveTextContent(/^Downloading… 40\s?%$/);
  await act(async () => { fake.push({ state: "ready", version: "0.4.0" }); });
  expect(chip()).toHaveAccessibleName("Sidevoice 0.4.0 · Restart to update the app");
  expect(chip()!.querySelector(".update-chip-action")).toHaveTextContent(/^Restart$/);
  expect(fake.updater.restart).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(chip()!); });
  expect(fake.updater.restart).toHaveBeenCalledOnce();
  // Its gear opens Settings, as ever.
  await act(async () => { fireEvent.click(gear()); });
  expect(document.getElementById("pane-general")).not.toBeNull();
});

test("B2: a failed download or install is said under the row, Retry in the chip; the service and machines land on Updates", async () => {
  variants("beside-settings");
  const { fake } = room({ updater: { mode: "manual", status: { state: "available", version: "0.4.0", error: { code: "update-download-failed" } } } });
  await waitFor(() => expect(chip()).toHaveAccessibleName("Sidevoice 0.4.0 · Retry download"));
  expect(chip()!.querySelector(".update-chip-action")).toHaveTextContent(/^Retry$/);
  const alert = document.querySelector(".update-beside")!.querySelector("[role=alert]")!;
  expect(alert).toHaveTextContent("The update couldn't be downloaded.");
  expect(document.querySelector(".update-beside-row")).not.toContainElement(alert as HTMLElement);
  fake.updater.download.mockRejectedValueOnce(new Error("disk full"));
  await act(async () => { fireEvent.click(chip()!); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  cleanup();
  variants("beside-settings");
  room({ service: BEHIND });
  await waitFor(() => expect(chip()).toHaveAccessibleName("Update available · See updates"));
  expect(chip()!.querySelector(".update-chip-action")).toBeNull();
  await act(async () => { fireEvent.click(chip()!); });
  await landsOn(() => document.getElementById("updates-this-computer"));
});

test("B2 in the rail: an icon above the gear, its count in its name; its popover lists each update with its action", async () => {
  variants("beside-settings");
  const { fake } = room({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } }, service: BEHIND });
  await waitFor(() => expect(chip()).not.toBeNull());
  await collapse();
  expect(chip()).toHaveAccessibleName("Updates, 2 waiting");
  expect(chip()).toHaveAttribute("aria-haspopup", "dialog");
  const foot = document.querySelector(".sidebar-foot .update-beside")!;
  expect([...foot.children].map((child) => child.classList.contains("update-chip") ? "chip" : child.classList.contains("sidebar-settings") ? "gear" : "?")).toEqual(["chip", "gear"]);
  const list = await popover();
  expect([...document.querySelectorAll(".update-notice-text")].map((text) => text.textContent)).toEqual(["Sidevoice 0.4.0 is available", "Sidevoice service 0.9.0 is available"]);
  await act(async () => { fireEvent.click(list.getByRole("button", { name: "Download" })); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
});

test("one row (updates-rows A): the notice says Sidevoice as one — Restart to update Sidevoice, which asks the service to follow; no service number", async () => {
  variants("banner", "one");
  const { fake } = room({ updater: { status: { state: "ready", version: "0.4.0" } }, service: BEHIND });
  await waitFor(() => expect(banner()).toHaveTextContent("Sidevoice 0.4.0 is ready"));
  await act(async () => { fireEvent.click(within(banner()!).getByRole("button", { name: "Restart to update Sidevoice" })); });
  expect(fake.updater.restart).toHaveBeenCalledOnce();
  expect(Number(localStorage.getItem("sidevoice.update-continue"))).toBeGreaterThan(0);
  cleanup();
  variants("beside-settings", "one");
  room({ updater: { status: { state: "ready", version: "0.4.0" } }, service: BEHIND });
  await waitFor(() => expect(chip()).toHaveAccessibleName("Sidevoice 0.4.0 · Restart to update Sidevoice"));
  await collapse();
  const list = await popover();
  expect([...document.querySelectorAll(".update-notice-text")].map((text) => text.textContent)).toEqual(["Sidevoice 0.4.0 is ready", "A Sidevoice update is available"]);
  expect(list.getByRole("button", { name: "Restart to update Sidevoice" })).toBeInTheDocument();
});

test("in Spanish: Sidevoice 0.4.0 está listo, Reiniciar para actualizar la app, Ocultar este aviso; the chip, Sidevoice 0.4.0 · Descargar", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  onTestFinished(() => localStorage.removeItem("sidevoice.settings"));
  room({ updater: { status: { state: "ready", version: "0.4.0" } } });
  await waitFor(() => expect(banner()).toHaveTextContent("Sidevoice 0.4.0 está listo"));
  expect(within(banner()!).getByRole("button", { name: "Reiniciar para actualizar la app" })).toBeInTheDocument();
  expect(within(banner()!).getByRole("button", { name: "Ocultar este aviso" })).toBeInTheDocument();
  expect(banner()).toHaveAccessibleName("Actualizaciones");
  cleanup();
  variants("beside-settings");
  room({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } } });
  await waitFor(() => expect(chip()).toHaveAccessibleName("Sidevoice 0.4.0 · Descargar"));
  expect(gear()).toHaveAccessibleName("Configuración");
});

test("no notice on a phone, whatever the variant", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
    media, matches: media === "(max-width: 899px)", onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
  onTestFinished(() => { vi.restoreAllMocks(); });
  for (const notice of ["banner", "beside-settings", "foot"]) {
    variants(notice);
    room({ updater: { status: { state: "ready", version: "0.4.0" } } as { status: UpdaterStatus } });
    await settle();
    expect(document.querySelector(".update-banner, .update-chip, .update-line, .updates-entry"), notice).toBeNull();
    cleanup();
  }
});

test("a choice the panel stored for a dropped value (the brand's icon, the gear's mark) is the default, the banner", async () => {
  for (const old of ["brand", "gear"]) {
    variants(old);
    room({ updater: { status: { state: "ready", version: "0.4.0" } } });
    await waitFor(() => expect(banner(), old).toHaveTextContent("Sidevoice 0.4.0 is ready"));
    expect(document.querySelector(".update-brand, .settings-notice[data-mark=\"update\"], .update-chip"), old).toBeNull();
    cleanup();
  }
});
