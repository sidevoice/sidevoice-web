import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { fakeUpdater } from "../../test/updater";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus, LocalHostVersion } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => {
  cleanup();
  for (const key of ["sidevoice.variants", "sidevoice.update-continue", "sidevoice.updates-checked-at"]) localStorage.removeItem(key);
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
});

/* Updates' rows, VARIANTS `updates-rows` A: this computer as ONE row, Sidevoice — one version (the app's, the Sidevoice
 * the person installed) and one button, Update Sidevoice, that updates the app and then this computer's service, in
 * order. Restarting into the app's update is the app's last step, so the service follows by itself in the page the new
 * app opens, once nothing stands in the way. The service's own number is not said: the row's is the app's. B, two
 * rows, is UpdatesSettings.test.tsx. */

const local: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.8.1", api: 1 }, calls: 0, product_version: "0.8.1" };
const BEHIND: LocalHostVersion = { bridge: 3, bundled: { version: "0.9.0" }, installed: { version: "0.8.1" }, core_api: 1, update: "available" };
const CURRENT: LocalHostVersion = { ...BEHIND, bundled: { version: "0.8.1" }, update: "current" };

function open({ updater = {}, service = CURRENT, status = running, update = vi.fn(async () => running) }: { updater?: Parameters<typeof fakeUpdater>[0];
  service?: LocalHostVersion | (() => Promise<LocalHostVersion>); status?: LocalHostStatus; update?: ReturnType<typeof vi.fn> } = {}) {
  localStorage.setItem("sidevoice.variants", JSON.stringify({ "updates-rows": "one" }));
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

test("one row, Sidevoice: what it is, the app's version, Up to date once the app and its service both say so", async () => {
  open();
  await waitFor(() => expect(pane().querySelector(".host-status-product")).toHaveTextContent(/^Version 0\.3\.0 · Up to date$/));
  expect(groups()).toEqual(["Sidevoice"]);
  expect(row().getByText("The app, and the service that connects your agents")).toBeInTheDocument();
  // The app's settings stay under it; no second row, no service number.
  expect(row().getByRole("radiogroup", { name: "Updates" })).toBeInTheDocument();
  expect(row().getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
  expect(pane()).not.toHaveTextContent("0.8.1");
});

test("the app's update first, in the row's one button: Update Sidevoice downloads, Restart to update Sidevoice restarts and asks the service to follow", async () => {
  const { fake, update } = open({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } }, service: BEHIND });
  await settle();
  expect(document.getElementById("updates-app")).toHaveTextContent("Version 0.4.0 available");
  // One button: the service's waits behind the app's.
  expect(row().getAllByRole("button", { name: /Sidevoice|the app|the service/ }).map((button) => button.textContent)).toEqual(["Update Sidevoice"]);
  await act(async () => { fireEvent.click(row().getByRole("button", { name: "Update Sidevoice" })); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  await act(async () => { fake.push({ state: "ready", version: "0.4.0" }); });
  await act(async () => { fireEvent.click(row().getByRole("button", { name: "Restart to update Sidevoice" })); });
  expect(fake.updater.restart).toHaveBeenCalledOnce();
  expect(Number(localStorage.getItem("sidevoice.update-continue"))).toBeGreaterThan(0);
  expect(update).not.toHaveBeenCalled();
});

test("only the service behind: An update is available, no number of its own, and Update Sidevoice updates it; a failure, Retry updating Sidevoice", async () => {
  const update = vi.fn().mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "update-failed" })).mockResolvedValue(running);
  open({ service: BEHIND, update });
  const button = await row().findByRole("button", { name: "Update Sidevoice" });
  expect(button.closest(".update-action")).toHaveTextContent(/^An update is available/);
  expect(pane()).not.toHaveTextContent("0.9.0");
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

test("in Spanish: Sidevoice, Versión 0.3.0, Actualizar Sidevoice and Reiniciar para actualizar Sidevoice", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  onTestFinished(() => localStorage.removeItem("sidevoice.settings"));
  const { fake } = open({ updater: { mode: "manual", status: { state: "available", version: "0.4.0" } } });
  await settle();
  expect(groups()).toEqual(["Sidevoice"]);
  expect(row().getByText("La app, y el servicio que conecta tus agentes")).toBeInTheDocument();
  expect(pane().querySelector(".host-status-product")).toHaveTextContent(/^Versión 0\.3\.0$/);
  expect(row().getByRole("button", { name: "Actualizar Sidevoice" })).toBeInTheDocument();
  await act(async () => { fake.push({ state: "ready", version: "0.4.0" }); });
  expect(row().getByRole("button", { name: "Reiniciar para actualizar Sidevoice" })).toBeInTheDocument();
});
