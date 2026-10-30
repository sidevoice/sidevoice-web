import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { fakeUpdater } from "../../test/updater";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus, LocalHostVersion } from "../../host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => {
  cleanup();
  for (const key of ["sidevoice.update-continue", "sidevoice.updates-checked-at"]) localStorage.removeItem(key);
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
});

/* This computer in Updates (decided): ONE row, Sidevoice, in one state — Automatic or Manual first; then the version
 * installed (the app's, the Sidevoice the person installed: no Version line, no hint), Sidevoice 0.3.0, with Up to date
 * once a check says so, beside Check for updates; then, only while a newer one waits, its line with just the new version
 * and its one button that updates the app (Sidevoice 0.4.0 available · Download in manual, then Sidevoice 0.4.0 ready ·
 * Restart to update), or this computer's service (Update available · Update Sidevoice, where only it is behind), in
 * order. Restarting into the app's update is the app's last step, so the service follows by itself in the page the new
 * app opens, once nothing stands in the way. The service's own number is not said: the row's is the app's. The rest of
 * Updates is UpdatesSettings.test.tsx. */

const local: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.8.1", api: 1 }, calls: 0, product_version: "0.8.1" };
const BEHIND: LocalHostVersion = { bridge: 3, bundled: { version: "0.9.0" }, installed: { version: "0.8.1" }, core_api: 1, update: "available" };
const CURRENT: LocalHostVersion = { ...BEHIND, bundled: { version: "0.8.1" }, update: "current" };

function open({ updater = {}, service = CURRENT, status = running, update = vi.fn(async () => running) }: { updater?: Parameters<typeof fakeUpdater>[0];
  service?: LocalHostVersion | (() => Promise<LocalHostVersion>); status?: LocalHostStatus; update?: ReturnType<typeof vi.fn> } = {}) {
  const fake = fakeUpdater(updater);
  const version = vi.fn(typeof service === "function" ? service : async () => service);
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { build: { channel: "release", version: "0.3.0" }, updater: fake.updater,
    localHost: { state: vi.fn(async () => status), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(), version, update } } } });
  window.sidevoiceActions = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), machineDevices: vi.fn().mockResolvedValue([]),
    loadHostAgents: vi.fn(), loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local], machinesReady: true, inApp: true, localHostAvailable: true, localHostStatus: status, settingsSection: "updates",
    machineLinks: { "fp-local": { reach: "ok", via: "node" } } } as never); });
  render(<RoomProvider store={store}><SettingsDialog /></RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  return { store, fake, update, version };
}
const pane = () => document.getElementById("pane-updates")!;
const groups = () => [...pane().querySelectorAll(".ui-group-title")].map((title) => title.textContent);
const row = () => within(pane().querySelector<HTMLElement>(".ui-group")!);
const settle = () => act(async () => {});
/** The installed version's line, holding Check for updates; its words. */
const installedLine = () => pane().querySelector<HTMLElement>(".app-update-installed");
const installed = () => installedLine()!.querySelector<HTMLElement>(".update-action-copy");
/** The newer version's line, only while one is in view. */
const appRow = () => pane().querySelector<HTMLElement>(".update-action-row#updates-app");

test("one row, Sidevoice: Automatic/Manual first, then Sidevoice 0.3.0 · Up to date beside Check for updates once checked and the app and its service both say so; no Version line, no hint", async () => {
  localStorage.setItem("sidevoice.updates-checked-at", String(Date.parse("2026-10-12T09:30:00Z")));
  open();
  await waitFor(() => expect(installed()).toHaveTextContent(/^Sidevoice 0\.3\.0 · Up to date$/));
  // The version is said once, on the installed version's line: no Version line above it.
  expect(pane().querySelector(".host-status-product, .updates-settings-version")).toBeNull();
  expect(pane().querySelector(".update-action-row")).toBeNull();
  expect(document.getElementById("updates-app")).toBe(installedLine());
  expect(groups()).toEqual(["Sidevoice"]);
  expect(pane().querySelector(".updates-part-hint")).toBeNull();
  // Automatic or Manual first, then the installed version with Check for updates; no second row, no service number.
  const modes = row().getByRole("radiogroup", { name: "Updates" });
  const check = row().getByRole("button", { name: "Check for updates" });
  expect(installedLine()).toContainElement(check);
  expect(modes.compareDocumentPosition(installedLine()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(pane()).not.toHaveTextContent("0.8.1");
});

test("the app's update first, in the row's one button: Sidevoice 0.4.0 available · Download downloads, Restart to update restarts and asks the service to follow", async () => {
  const { fake, update } = open({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } }, service: BEHIND });
  await settle();
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.4\.0 availableDownload$/);
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.3\.0$/);
  // One button: the service's waits behind the app's.
  expect(row().getAllByRole("button", { name: /^(Download|Update|Restart|Retry)/ }).map((button) => button.textContent)).toEqual(["Download"]);
  // Only up to date while nothing waits: the service behind, the line doesn't say it.
  expect(pane()).not.toHaveTextContent("Up to date");
  await act(async () => { fireEvent.click(row().getByRole("button", { name: "Download" })); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  await act(async () => { fake.push({ state: "ready", version: "0.4.0" }); });
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.4\.0 readyRestart to update$/);
  await act(async () => { fireEvent.click(row().getByRole("button", { name: "Restart to update" })); });
  expect(fake.updater.restart).toHaveBeenCalledOnce();
  expect(Number(localStorage.getItem("sidevoice.update-continue"))).toBeGreaterThan(0);
  expect(update).not.toHaveBeenCalled();
});

test("only the service behind: Update available · Update Sidevoice under Sidevoice 0.3.0, no version in its words and the service's own number not said; Update Sidevoice updates it; a failure, Retry updating Sidevoice", async () => {
  const update = vi.fn().mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "update-failed" })).mockResolvedValue(running);
  open({ service: BEHIND, update });
  const button = await row().findByRole("button", { name: "Update Sidevoice" });
  expect(button.closest(".update-action")).toHaveTextContent(/^Update availableUpdate Sidevoice$/);
  // Sidevoice's version said once, on the installed version's line above it; never beside Up to date.
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.3\.0$/);
  expect(installedLine()!.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(appRow()).toBeNull();
  expect(pane()).not.toHaveTextContent("0.9.0");
  expect(pane()).not.toHaveTextContent("Up to date");
  expect(button).toHaveAttribute("id", "updates-this-computer");
  await act(async () => { fireEvent.click(button); });
  expect(update).toHaveBeenCalledOnce();
  expect(await row().findByRole("button", { name: "Retry updating Sidevoice" })).toBeInTheDocument();
});

test("after the app restarted into its update, the service follows by itself — once no call is on — and the request is forgotten", async () => {
  localStorage.setItem("sidevoice.update-continue", String(Date.now()));
  const { store, update } = open({ service: BEHIND, status: { ...running, calls: 1 } });
  await settle();
  // A call on: it waits, and says why.
  expect(update).not.toHaveBeenCalled();
  expect(row().getByRole("button", { name: "Update Sidevoice" })).toBeDisabled();
  expect(localStorage.getItem("sidevoice.update-continue")).not.toBeNull();
  await act(async () => { store.patch({ localHostStatus: { ...running, calls: 0 } } as never); });
  await waitFor(() => expect(update).toHaveBeenCalledOnce());
  expect(localStorage.getItem("sidevoice.update-continue")).toBeNull();
});

test("a request to follow with nothing to follow (the service current) is forgotten; one from long ago is not acted on", async () => {
  localStorage.setItem("sidevoice.update-continue", String(Date.now()));
  const { update } = open();
  await waitFor(() => expect(localStorage.getItem("sidevoice.update-continue")).toBeNull());
  expect(update).not.toHaveBeenCalled();
  cleanup();
  localStorage.setItem("sidevoice.update-continue", String(Date.now() - 2 * 60 * 60 * 1000));
  const old = open({ service: BEHIND });
  await row().findByRole("button", { name: "Update Sidevoice" });
  expect(old.update).not.toHaveBeenCalled();
});

test("in Spanish: Sidevoice 0.3.0 with no Versión line, Sidevoice 0.4.0 disponible · Descargar, then Sidevoice 0.4.0 lista · Reiniciar para actualizar", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  onTestFinished(() => localStorage.removeItem("sidevoice.settings"));
  const { fake } = open({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } } });
  await settle();
  expect(groups()).toEqual(["Sidevoice"]);
  expect(pane().querySelector(".updates-part-hint")).toBeNull();
  expect(pane().querySelector(".host-status-product")).toBeNull();
  expect(pane()).not.toHaveTextContent("Versión");
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.3\.0$/);
  expect(row().getByRole("button", { name: "Descargar", description: "Sidevoice 0.4.0 disponible" })).toBeInTheDocument();
  await act(async () => { fake.push({ state: "ready", version: "0.4.0" }); });
  expect(row().getByRole("button", { name: "Reiniciar para actualizar" })).toBeInTheDocument();
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.4\.0 listaReiniciar para actualizar$/);
});
