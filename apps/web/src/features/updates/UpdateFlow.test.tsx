import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { fakeUpdater } from "../../test/updater";
import { ConversationSidebar } from "../room/ConversationSidebar";
import { SettingsDialog } from "../settings/SettingsDialog";
import type { UpdateMode, UpdaterStatus } from "./useUpdates";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus, LocalHostVersion } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => {
  cleanup();
  for (const key of ["sidevoice.variants", "sidevoice.updates-checked-at", "sidevoice.update-continue", "sidevoice.sidebar-collapsed"]) localStorage.removeItem(key);
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
  delete (window as { sidevoiceActions?: unknown }).sidevoiceActions;
});

/* The desktop app's update, step by step, as the person meets it everywhere it shows — Settings › Updates, the room's
 * chip above Settings and This device's line. Manual: Check for updates that finds one never downloads and never offers
 * Restart: Version X available · Download; Download, then its progress, then Restart to update. Automatic: a found one
 * downloads by itself, the room saying nothing until it is ready, then Restart to update. Restart is only ever the
 * person's press. The updater answers as the app does (sidevoice-desktop #56): its check pushes what it found, and in
 * automatic its download follows by itself. */

const local: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.8.1", api: 1 }, calls: 0, product_version: "0.8.1" };
const CURRENT: LocalHostVersion = { bridge: 3, bundled: { version: "0.8.1" }, installed: { version: "0.8.1" }, core_api: 1, update: "current" };
const FOUND: UpdaterStatus = { state: "available", version: "0.4.0" };

/** The app, idle in `mode`, its updater answering as the app does: a check finds 0.4.0; in automatic it then downloads
 *  by itself (`finish` brings it to ready, as the app's download would). */
function app(mode: UpdateMode) {
  const fake = fakeUpdater({ mode });
  fake.updater.check.mockImplementation(async () => {
    fake.push(FOUND);
    if (mode === "manual") return FOUND;
    const downloading: UpdaterStatus = { ...FOUND, state: "downloading", progress: 0.3 };
    fake.push(downloading);
    return downloading;
  });
  fake.updater.download.mockImplementation(async () => {
    const downloading: UpdaterStatus = { ...FOUND, state: "downloading", progress: 0.3 };
    fake.push(downloading);
    return downloading;
  });
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { build: { channel: "release", version: "0.3.0" }, updater: fake.updater,
    localHost: { state: vi.fn(async () => running), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(), version: vi.fn(async () => CURRENT), update: vi.fn() } } } });
  window.sidevoiceActions = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), machineDevices: vi.fn().mockResolvedValue([]),
    loadHostAgents: vi.fn(), loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local], machinesReady: true, inApp: true, localHostAvailable: true, localHostStatus: running, settingsSection: "updates",
    machineLinks: { "fp-local": { reach: "ok", via: "node" } } } as never); });
  render(<RoomProvider store={store}><ConversationSidebar /><SettingsDialog /></RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  const finish = () => act(async () => { fake.push({ ...FOUND, state: "ready" }); });
  return { fake, finish };
}

const updates = () => within(document.getElementById("pane-updates")!);
const appRow = () => document.getElementById("updates-app");
const chip = () => document.querySelector<HTMLElement>(".sidebar-foot .update-chip");
const deviceLine = () => document.getElementById("pane-this-computer")!.querySelector(".this-device-version");
/** Everywhere the app's update shows, in words. */
const shown = () => [document.getElementById("pane-updates")!, chip(), deviceLine()].map((place) => place?.textContent ?? "").join(" | ");
const check = () => act(async () => { fireEvent.click(updates().getByRole("button", { name: "Check for updates" })); });
/** Every button's name, as a person hears it. */
const buttons = () => [...document.querySelectorAll("button")].map((button) => button.getAttribute("aria-label") || button.textContent || "");
/** No restart into an update offered anywhere (This computer's service has a Restart of its own: not this). */
function noRestart() {
  expect(buttons().filter((name) => /Restart to update|· Restart/.test(name))).toEqual([]);
  expect(shown()).not.toMatch(/Restart to update|ready to install|is ready|· Restart/);
}

test("manual: a check that finds one says Version 0.4.0 available · Download, nothing more; Download, its progress, then Restart to update, pressed only by the person", async () => {
  const { fake, finish } = app("manual");
  await waitFor(() => expect(updates().getByRole("radio", { name: "Manual" })).toHaveAttribute("aria-checked", "true"));
  expect(chip()).toBeNull();
  await check();
  // Found: available, nothing downloaded, nothing to restart into; the chip says it at once.
  await waitFor(() => expect(appRow()).toHaveTextContent("Version 0.4.0 available"));
  expect(fake.updater.download).not.toHaveBeenCalled();
  expect(within(appRow()!).getByRole("button", { name: "Download", description: "Version 0.4.0 available" })).toBeInTheDocument();
  expect(chip()).toHaveAccessibleName("Version 0.4.0 available · Download");
  expect(deviceLine()).toHaveTextContent(/^Sidevoice 0\.3\.0 · Update available$/);
  noRestart();
  // Download: its progress, in Updates and in the chip; still nothing to restart into.
  await act(async () => { fireEvent.click(within(appRow()!).getByRole("button", { name: "Download" })); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  expect(within(appRow()!).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
  expect(within(appRow()!).queryByRole("button")).toBeNull();
  expect(chip()).toHaveTextContent(/^Downloading… 30\s?%$/);
  noRestart();
  // Downloaded: Restart to update, everywhere it shows; the app restarts only when it is pressed.
  await finish();
  expect(within(appRow()!).getByRole("button", { name: "Restart to update Sidevoice" })).toBeInTheDocument();
  expect(chip()).toHaveAccessibleName("Sidevoice 0.4.0 · Restart to update Sidevoice");
  expect(fake.updater.restart).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(within(appRow()!).getByRole("button", { name: "Restart to update Sidevoice" })); });
  expect(fake.updater.restart).toHaveBeenCalledOnce();
});

test("automatic: a found one downloads by itself — no Download, no chip while it does — then Restart to update, pressed only by the person", async () => {
  const { fake, finish } = app("automatic");
  await waitFor(() => expect(updates().getByRole("radio", { name: "Automatic (recommended)" })).toHaveAttribute("aria-checked", "true"));
  await check();
  // Downloading by itself: its progress in Updates; no Download anywhere, and the room says nothing yet.
  await waitFor(() => expect(within(appRow()!).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30"));
  expect(fake.updater.download).not.toHaveBeenCalled();
  expect(buttons().filter((name) => /Download/.test(name))).toEqual([]);
  expect(chip()).toBeNull();
  expect(document.querySelector(".sidebar-foot .update-beside")).toBeNull();
  noRestart();
  // Ready: Restart to update in Updates and in the chip, never pressed for the person.
  await finish();
  expect(within(appRow()!).getByRole("button", { name: "Restart to update Sidevoice" })).toBeInTheDocument();
  expect(chip()).toHaveAccessibleName("Sidevoice 0.4.0 · Restart to update Sidevoice");
  expect(deviceLine()).toHaveTextContent(/· Update available$/);
  expect(fake.updater.restart).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(chip()!); });
  expect(fake.updater.restart).toHaveBeenCalledOnce();
});
