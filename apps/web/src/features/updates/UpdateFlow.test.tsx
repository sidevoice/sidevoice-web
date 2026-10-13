import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { fakeUpdater } from "../../test/updater";
import { CallStage } from "../call/CallStage";
import { SettingsDialog } from "../settings/SettingsDialog";
import { UpdateNotice } from "./UpdateNotice";
import type { UpdateMode, UpdaterStatus } from "./useUpdates";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus, LocalHostVersion } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const key of ["sidevoice.variants", "sidevoice.settings", "sidevoice.updates-checked-at", "sidevoice.update-continue"]) localStorage.removeItem(key);
  sessionStorage.removeItem("sidevoice.update-notice-hidden");
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
  delete (window as { sidevoiceActions?: unknown }).sidevoiceActions;
});

/* The desktop app's update, step by step on the app's clock (fake timers), as the person meets it everywhere it shows —
 * the room's notice, Settings › Updates' Sidevoice row and This device's line — in each mode, whoever checked: the
 * person (Check for updates) or the app by itself (at launch, every 6 h). The updater answers as the app's does
 * (sidevoice-desktop #56): a check takes its time and pushes what it found; automatic's download then starts by itself.
 * The person's check: Checking… on its line; then, automatic, Sidevoice 0.3.0 · 0.4.0 found · Downloading… n%, then
 * Sidevoice 0.3.0 · 0.4.0 ready · Restart to update Sidevoice; manual, Sidevoice 0.3.0 · 0.4.0 available · Download,
 * its progress once pressed, then ready; nothing new, Last checked: just now · Up to date, muted, its date once a minute
 * old. The app's own check never says Checking… nor any progress: automatic shows only once ready, manual as soon as
 * one is found. The room's notice: manual, Version 0.4.0 available · Download, nothing while it downloads; either mode,
 * Sidevoice 0.4.0 is ready · Restart to update; nothing while the person's check runs. Restart is only ever the
 * person's press. */

const local: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.8.1", api: 1 }, calls: 0, product_version: "0.8.1" };
const CURRENT: LocalHostVersion = { bridge: 3, bundled: { version: "0.8.1" }, installed: { version: "0.8.1" }, core_api: 1, update: "current" };
const FOUND: UpdaterStatus = { state: "available", version: "0.4.0" };
const CHECK_MS = 1500;
const STEP_MS = 2000;

/** The app 0.3.0, idle in `mode`, its updater on a clock as the app's runs: a check takes 1.5 s and finds 0.4.0 (none
 *  until `release`, with `finds` false); in automatic its download starts at once, 30 % more every 2 s, ready 8 s on;
 *  in manual it waits for download(). `appChecks` is the app's own check: the page never asked for it. Rendered: the
 *  stage with the room's notice where App puts it, and Settings at Updates. */
function app(mode: UpdateMode, { finds = true }: { finds?: boolean } = {}) {
  const fake = fakeUpdater({ mode });
  const after = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const download = (): UpdaterStatus => {
    const started: UpdaterStatus = { ...FOUND, state: "downloading", progress: 0 };
    fake.push(started);
    void (async () => {
      for (const progress of [0.3, 0.6, 0.9]) { await after(STEP_MS); fake.push({ ...FOUND, state: "downloading", progress }); }
      await after(STEP_MS);
      fake.push({ ...FOUND, state: "ready" });
    })();
    return started;
  };
  let found = finds;
  const check = async (): Promise<UpdaterStatus> => {
    await after(CHECK_MS);
    if (!found) return { state: "idle" };
    fake.push(FOUND);
    return mode === "automatic" ? download() : FOUND;
  };
  fake.updater.check.mockImplementation(check);
  fake.updater.download.mockImplementation(async () => download());
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { build: { channel: "release", version: "0.3.0" }, updater: fake.updater,
    localHost: { state: vi.fn(async () => running), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(), version: vi.fn(async () => CURRENT), update: vi.fn() } } } });
  window.sidevoiceActions = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), machineDevices: vi.fn().mockResolvedValue([]),
    loadHostAgents: vi.fn(), loadMachineInfo: vi.fn(), loadVoiceCatalogue: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local], machinesReady: true, inApp: true, localHostAvailable: true, localHostStatus: running, settingsSection: "updates",
    machineLinks: { "fp-local": { reach: "ok", via: "node" } } } as never); });
  render(<RoomProvider store={store}>
    <CallStage notice={{ room: <UpdateNotice at="room" />, title: <UpdateNotice at="title" /> }} /><SettingsDialog /></RoomProvider>);
  return { fake, appChecks: () => { void check(); }, release: () => { found = true; } };
}

/** The app's clock: 13 October 2026, 10:00 UTC, moved on by `wait`. */
function onTheClock() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
  onTestFinished(() => { vi.useRealTimers(); });
}
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const updates = () => within(document.getElementById("pane-updates")!);
const appRow = () => document.getElementById("updates-app");
const checkButton = () => updates().getByRole("button", { name: /^(Check for updates|Buscar actualizaciones)$/, hidden: true });
/** The muted line beside Check for updates. */
const checkLine = () => checkButton().closest(".app-update-setting")!.querySelector<HTMLElement>(".app-update-setting-copy")!;
const press = () => act(async () => { fireEvent.click(checkButton()); });
const percentOf = () => within(appRow()!).getByRole("progressbar", { hidden: true }).getAttribute("aria-valuenow");
/** The room's notice in words — what it says · its action — or null. */
const notice = () => {
  const shown = document.querySelector<HTMLElement>(".update-notice:not([data-leaving])");
  return shown ? `${shown.querySelector(".update-notice-text")?.textContent} · ${within(shown).getAllByRole("button", { hidden: true })[0].textContent}` : null;
};
const deviceLine = () => document.getElementById("pane-this-computer")!.querySelector(".this-device-version");
/** Every button's name, as a person hears it. */
const buttons = () => [...document.querySelectorAll("button")].map((button) => button.getAttribute("aria-label") || button.textContent || "");
/** No restart into an update offered anywhere (This computer's service has a Restart of its own: not this). */
function noRestart() {
  expect(buttons().filter((name) => /Restart to update/.test(name))).toEqual([]);
}

test("automatic, the person's check: Checking…, then Sidevoice 0.3.0 · 0.4.0 found · Downloading… n% with no notice, then 0.4.0 ready · Restart to update Sidevoice, and the notice", async () => {
  onTheClock();
  const { fake } = app("automatic");
  await wait(0);
  await press();
  // While the app checks: Checking…, muted, the button busy; nothing found yet, nothing in the room.
  expect(checkLine()).toHaveTextContent(/^Checking…$/);
  expect(checkLine()).toHaveClass("muted");
  expect(checkButton()).toHaveAttribute("aria-busy", "true");
  expect(appRow()).toBeNull();
  expect(notice()).toBeNull();
  await wait(CHECK_MS);
  // Found: it downloads by itself, its progress in the row, both versions said; no Download anywhere; the room silent.
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.3\.0 · 0\.4\.0 found · Downloading…\s?0\s?%$/);
  expect(checkLine()).toHaveTextContent(/^Last checked: just now$/);
  expect(buttons().filter((name) => /Download/.test(name))).toEqual([]);
  expect(fake.updater.download).not.toHaveBeenCalled();
  for (const percent of ["30", "60", "90"]) {
    await wait(STEP_MS);
    expect(percentOf()).toBe(percent);
    expect(appRow()).toHaveTextContent(new RegExp(`^Sidevoice 0\\.3\\.0 · 0\\.4\\.0 found · Downloading…\\s?${percent}\\s?%$`));
    expect(notice()).toBeNull();
    noRestart();
  }
  await wait(STEP_MS);
  // Ready: both versions and Restart to update Sidevoice, pressed only by the person; the room says it; This device too.
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.3\.0 · 0\.4\.0 readyRestart to update Sidevoice$/);
  expect(within(appRow()!).queryByRole("progressbar", { hidden: true })).toBeNull();
  expect(notice()).toBe("Sidevoice 0.4.0 is ready · Restart to update");
  expect(deviceLine()).toHaveTextContent(/· Update available$/);
  expect(fake.updater.restart).not.toHaveBeenCalled();
  // A minute after the check, its date.
  await wait(60_000);
  expect(checkLine().textContent).toMatch(/^Last checked: .*2026/);
});

test("manual, the person's check: Checking…, then Sidevoice 0.3.0 · 0.4.0 available · Download and the notice; never downloads by itself; its progress once pressed, the room silent; then ready", async () => {
  onTheClock();
  const { fake } = app("manual");
  await wait(0);
  await press();
  expect(checkLine()).toHaveTextContent(/^Checking…$/);
  expect(appRow()).toBeNull();
  expect(notice()).toBeNull();
  await wait(CHECK_MS);
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.3\.0 · 0\.4\.0 availableDownload$/);
  expect(within(appRow()!).getByRole("button", { name: "Download", description: "Sidevoice 0.3.0 · 0.4.0 available", hidden: true })).toBeInTheDocument();
  expect(notice()).toBe("Version 0.4.0 available · Download");
  expect(within(appRow()!).queryByRole("progressbar", { hidden: true })).toBeNull();
  noRestart();
  // Nothing downloads by itself, however long it waits.
  await wait(60_000);
  expect(fake.updater.download).not.toHaveBeenCalled();
  expect(appRow()).toHaveAttribute("data-state", "available");
  await act(async () => { fireEvent.click(within(appRow()!).getByRole("button", { name: "Download", hidden: true })); });
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.3\.0 · Downloading 0\.4\.0…\s?0\s?%$/);
  // Its progress is the row's: the room says nothing while it downloads.
  await wait(STEP_MS);
  expect(percentOf()).toBe("30");
  expect(within(appRow()!).queryByRole("button", { hidden: true })).toBeNull();
  expect(notice()).toBeNull();
  await wait(3 * STEP_MS);
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.3\.0 · 0\.4\.0 readyRestart to update Sidevoice$/);
  expect(notice()).toBe("Sidevoice 0.4.0 is ready · Restart to update");
  expect(fake.updater.restart).not.toHaveBeenCalled();
});

test("nothing new: Checking…, then Last checked: just now · Up to date, muted; a minute on, its date", async () => {
  onTheClock();
  app("automatic", { finds: false });
  await wait(0);
  await press();
  expect(checkLine()).toHaveTextContent(/^Checking…$/);
  await wait(CHECK_MS);
  expect(checkLine()).toHaveTextContent(/^Last checked: just now · Up to date(Sidevoice is up to date\.)?$/);
  expect(checkLine()).toHaveClass("muted");
  expect(appRow()).toBeNull();
  expect(notice()).toBeNull();
  await wait(59_000);
  expect(checkLine()).toHaveTextContent(/^Last checked: just now · Up to date/);
  await wait(1_100);
  expect(checkLine().textContent).toMatch(/^Last checked: .*2026.* · Up to date/);
  expect(checkLine()).not.toHaveTextContent("just now");
});

test("the app's own check, automatic: no Checking…, no progress anywhere — after the person's check found nothing too; once ready, the row, the notice and This device", async () => {
  onTheClock();
  const { fake, appChecks, release } = app("automatic", { finds: false });
  await wait(0);
  // The person's check finds nothing; then a release comes out, and the app's own check finds it.
  await press();
  await wait(CHECK_MS);
  expect(checkLine()).toHaveTextContent(/· Up to date/);
  release();
  await wait(2 * 60_000);
  act(() => { appChecks(); });
  await wait(0);
  expect(checkLine()).not.toHaveTextContent("Checking…");
  expect(checkButton()).not.toHaveAttribute("aria-busy");
  await wait(CHECK_MS);
  // Downloading by itself: nothing in Updates, the room or This device says so, step after step.
  for (let step = 0; step < 4; step++) {
    expect(appRow()).toBeNull();
    expect(document.querySelector("[role=progressbar]")).toBeNull();
    expect(document.getElementById("pane-updates")).not.toHaveTextContent(/Checking|Downloading|found|0\.4\.0/);
    expect(notice()).toBeNull();
    expect(deviceLine()).toHaveTextContent(/^Sidevoice 0\.3\.0$/);
    if (step === 0) expect(checkLine()).toHaveTextContent(/^Last checked: just now$/);
    await wait(STEP_MS);
  }
  // Ready: the row, both versions, Restart to update Sidevoice; the notice; This device's Update available.
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.3\.0 · 0\.4\.0 readyRestart to update Sidevoice$/);
  expect(notice()).toBe("Sidevoice 0.4.0 is ready · Restart to update");
  expect(deviceLine()).toHaveTextContent(/· Update available$/);
  expect(fake.updater.check).toHaveBeenCalledTimes(1);
  expect(fake.updater.restart).not.toHaveBeenCalled();
});

test("the app's own check, manual: no Checking…; Sidevoice 0.3.0 · 0.4.0 available · Download at once in the row, Version 0.4.0 available · Download in the room; Download from the room, its progress in the row", async () => {
  onTheClock();
  const { fake, appChecks } = app("manual");
  await wait(0);
  act(() => { appChecks(); });
  await wait(0);
  expect(checkLine()).not.toHaveTextContent("Checking…");
  expect(checkButton()).not.toHaveAttribute("aria-busy");
  await wait(CHECK_MS);
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.3\.0 · 0\.4\.0 availableDownload$/);
  expect(notice()).toBe("Version 0.4.0 available · Download");
  expect(fake.updater.check).not.toHaveBeenCalled();
  // The person's own press, in the room: its progress in the row, as when pressed there; the room silent.
  await act(async () => { fireEvent.click(within(document.querySelector<HTMLElement>(".update-notice")!).getByRole("button", { name: "Download", hidden: true })); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.3\.0 · Downloading 0\.4\.0…\s?0\s?%$/);
  await wait(STEP_MS);
  expect(percentOf()).toBe("30");
  expect(notice()).toBeNull();
});

test("in Spanish: Comprobando…, Sidevoice 0.3.0 · 0.4.0 encontrada · Descargando… n %, then 0.4.0 lista; Última comprobación: hace un momento; manual's 0.4.0 disponible · Descargar", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  onTheClock();
  app("automatic");
  await wait(0);
  await press();
  expect(checkLine()).toHaveTextContent(/^Comprobando…$/);
  await wait(CHECK_MS + STEP_MS);
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.3\.0 · 0\.4\.0 encontrada · Descargando…\s?30\s?%$/);
  expect(checkLine()).toHaveTextContent(/^Última comprobación: hace un momento$/);
  await wait(3 * STEP_MS);
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.3\.0 · 0\.4\.0 listaReiniciar para actualizar Sidevoice$/);
  expect(notice()).toBe("Sidevoice 0.4.0 está listo · Reiniciar para actualizar");
  cleanup();
  const { appChecks } = app("manual");
  await wait(0);
  act(() => { appChecks(); });
  await wait(CHECK_MS);
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.3\.0 · 0\.4\.0 disponibleDescargar$/);
  expect(notice()).toBe("Versión 0.4.0 disponible · Descargar");
  await act(async () => { fireEvent.click(within(appRow()!).getByRole("button", { name: "Descargar", hidden: true })); });
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.3\.0 · Descargando 0\.4\.0…\s?0\s?%$/);
});
