import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { fakeUpdater, withUpdater } from "../../test/updater";
import { UpdatesEntry, useUpdatesWaiting } from "./UpdatesEntry";
import { useUpdates, type UpdaterStatus } from "./useUpdates";

afterEach(() => {
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
  delete (window as { sidevoiceActions?: unknown }).sidevoiceActions;
  localStorage.removeItem("sidevoice.updates-checked-at");
});

/* The sidebar's foot: one row, the most pressing update's, acting where it is. The desktop app's first (automatic:
 * nothing until it is ready; manual: available, Download, its progress, ready), then the page's Reload, then this
 * computer's machine. Nothing waits for a call. The rail's icon keeps them all behind it. */

function Items() {
  const { items } = useUpdates();
  return <p data-testid="items">{items.map((item) => item.id).join(",")}</p>;
}
function Waiting() {
  return <p data-testid="waiting">{String(useUpdatesWaiting())}</p>;
}

/** The sidebar's foot with `updater` (as the app's host gives it), in a room with `facts`. */
function foot(updater?: Parameters<typeof withUpdater>[0], facts: Record<string, unknown> = {}, compact = false) {
  withUpdater(updater);
  const store = createRoomStore();
  act(() => store.patch(facts as never));
  render(<RoomProvider store={store} runtime={false}><UpdatesEntry compact={compact} /><Items /><Waiting /></RoomProvider>);
  return store;
}
const line = () => document.querySelector(".update-line");
const settle = () => act(async () => {});
const inSpanish = () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  onTestFinished(() => localStorage.removeItem("sidevoice.settings"));
};

test("nothing waits: no row; a newer build of the page in a call is Reload to update, which reloads at once", async () => {
  const reloadToUpdate = vi.fn();
  window.sidevoiceActions = { reloadToUpdate } as unknown as typeof window.sidevoiceActions;
  const store = foot();
  await settle();
  expect(line()).toBeNull();
  expect(screen.getByTestId("waiting")).toHaveTextContent("false");
  act(() => store.patch({ ws: {}, webUpdate: "b2" } as never));
  const reload = screen.getByRole("button", { name: "Reload to update" });
  expect(reload).toBeEnabled();
  expect(document.body).not.toHaveTextContent(/when the call ends|when voice is off/i);
  fireEvent.click(reload);
  expect(reloadToUpdate).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("items")).toHaveTextContent("web");
});

test("automatic: nothing while the app finds and downloads it; ready, a quiet Restart to update that restarts at once", async () => {
  const { updater, push } = fakeUpdater({ mode: "automatic" });
  foot(updater);
  await settle();
  for (const status of [{ state: "idle" }, { state: "available", version: "0.5.0" }, { state: "downloading", version: "0.5.0", progress: 0.4 }] as UpdaterStatus[]) {
    act(() => push(status));
    expect(line(), status.state).toBeNull();
    expect(screen.getByTestId("waiting")).toHaveTextContent("false");
  }
  act(() => push({ state: "ready", version: "0.5.0" }));
  const restart = screen.getByRole("button", { name: "Restart to update · 0.5.0" });
  expect(screen.getByTestId("waiting")).toHaveTextContent("true");
  await act(async () => { fireEvent.click(restart); });
  expect(updater.restart).toHaveBeenCalledTimes(1);
  expect(updater.restart).toHaveBeenCalledWith();
});

test("manual: Version X available · Download acts in place: the same row shows its progress, then Restart to update", async () => {
  const { updater, push } = fakeUpdater({ mode: "manual", status: { state: "idle" } });
  foot(updater);
  await settle();
  expect(line()).toBeNull();
  act(() => push({ state: "available", version: "0.5.0" }));
  const foot0 = document.querySelector(".update-foot");
  const download = screen.getByRole("button", { name: "Download Sidevoice 0.5.0" });
  expect(download).toHaveTextContent("Version 0.5.0 available");
  expect(download).toHaveTextContent("Download");
  await act(async () => { fireEvent.click(download); });
  expect(updater.download).toHaveBeenCalledTimes(1);
  // Nothing else opens: no dialog, no panel, no other view.
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => push({ state: "downloading", version: "0.5.0", progress: 0.4 }));
  expect(document.querySelector(".update-foot")).toBe(foot0);
  const row = line()!;
  expect(row).toHaveTextContent(/Downloading… 40\s?%/);
  expect(within(row as HTMLElement).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
  act(() => push({ state: "downloading", version: "0.5.0", progress: 0.85 }));
  expect(within(line() as HTMLElement).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "85");
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => push({ state: "ready", version: "0.5.0" }));
  expect(document.querySelector(".update-foot")).toBe(foot0);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Restart to update · 0.5.0" })); });
  expect(updater.restart).toHaveBeenCalledTimes(1);
});

test("in a call or with the voice on, Restart to update restarts at once, asking nothing", async () => {
  for (const facts of [{ ws: {} }, { callModel: "voice-switch", voiceOn: true }]) {
    const { updater } = fakeUpdater({ status: { state: "ready", version: "0.5.0" } });
    foot(updater, facts);
    await settle();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Restart to update · 0.5.0" })); });
    expect(updater.restart).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
  }
});

test("a download or an install that failed is said under the row; a failed check is This device's to say", async () => {
  // Manual, the download failed: said, and the row's Download is a Retry.
  const failed = fakeUpdater({ mode: "manual", status: { state: "available", version: "0.5.0", error: { code: "update-download-failed" } } });
  foot(failed.updater);
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent("The update couldn't be downloaded.");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Retry/ })); });
  expect(failed.updater.download).toHaveBeenCalledTimes(1);
  cleanup();
  // Ready, the install failed: said, and Restart to update tries again.
  const install = fakeUpdater({ status: { state: "ready", version: "0.5.0", error: { code: "update-install-failed" } } });
  foot(install.updater);
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent("The update couldn't be installed.");
  expect(screen.getByRole("button", { name: "Restart to update · 0.5.0" })).toBeInTheDocument();
  cleanup();
  // A check that failed: nothing here.
  const check = fakeUpdater({ mode: "manual", status: { state: "idle", error: { code: "update-check-failed" } } });
  foot(check.updater);
  await settle();
  expect(line()).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a download or a restart the app rejected is said as that failure", async () => {
  const { updater } = fakeUpdater({ mode: "manual", status: { state: "available", version: "0.5.0" } });
  updater.download.mockRejectedValueOnce(new Error("disk full"));
  foot(updater);
  await settle();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Download Sidevoice 0.5.0" })); });
  expect(screen.getByRole("alert")).toHaveTextContent("The update couldn't be downloaded.");
  cleanup();
  const ready = fakeUpdater({ status: { state: "ready", version: "0.5.0" } });
  ready.updater.restart.mockRejectedValueOnce(new Error("locked"));
  foot(ready.updater);
  await settle();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Restart to update · 0.5.0" })); });
  expect(screen.getByRole("alert")).toHaveTextContent("The update couldn't be installed.");
});

test("in Spanish: Versión X disponible · Descargar, Descargando…, Reiniciar para actualizar, and the failures", async () => {
  inSpanish();
  const { updater, push } = fakeUpdater({ mode: "manual", status: { state: "available", version: "0.5.0" } });
  foot(updater);
  await settle();
  const download = screen.getByRole("button", { name: "Descargar Sidevoice 0.5.0" });
  expect(download).toHaveTextContent("Versión 0.5.0 disponible");
  act(() => push({ state: "downloading", version: "0.5.0", progress: 0.4 }));
  expect(line()).toHaveTextContent(/Descargando… 40\s?%/);
  act(() => push({ state: "ready", version: "0.5.0", error: { code: "update-install-failed" } }));
  expect(screen.getByRole("button", { name: "Reiniciar para actualizar · 0.5.0" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo instalar la actualización.");
  act(() => push({ state: "available", version: "0.5.0", error: { code: "update-download-failed" } }));
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo descargar la actualización.");
  expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
});

test("no updater (a nightly, a development build, an older app): nothing of the app's shows", async () => {
  foot(undefined);
  await settle();
  expect(line()).toBeNull();
  cleanup();
  // An updater without its mode is on automatic: nothing until ready.
  const { updater } = fakeUpdater({ status: { state: "available", version: "0.5.0" }, without: ["settings", "setMode"] });
  foot(updater);
  await settle();
  expect(line()).toBeNull();
});

test("the app's update goes first; the rail's icon keeps every update behind it, the app's acting there too", async () => {
  const reloadToUpdate = vi.fn();
  window.sidevoiceActions = { reloadToUpdate } as unknown as typeof window.sidevoiceActions;
  const { updater } = fakeUpdater({ status: { state: "ready", version: "0.5.0" } });
  foot(updater, { webUpdate: "b2" });
  await settle();
  expect(screen.getByRole("button", { name: "Restart to update · 0.5.0" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reload to update" })).toBeNull();
  cleanup();
  const rail = fakeUpdater({ status: { state: "ready", version: "0.5.0" } });
  foot(rail.updater, { webUpdate: "b2" }, true);
  await settle();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Updates, 2 waiting" })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Restart to update/ })); });
  expect(rail.updater.restart).toHaveBeenCalledTimes(1);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reload Sidevoice" })); });
  expect(reloadToUpdate).toHaveBeenCalledTimes(1);
});

/** This computer with an update for its Sidevoice, as the desktop app's bridge says it. */
function withMachineUpdate() {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: async () => ({ state: "running" }), subscribe: () => () => {}, pairing: async () => null,
    version: async () => ({ update: "available", bundled: { version: "0.9.0" } }), update: async () => undefined,
  } } } });
}
const local = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local", paired_at: 1, revoked: false };

test("this computer's update, Updates available, opens This device where it has a section of its own, else its page under Machines", async () => {
  for (const compact of [false, true]) for (const app of [true, false]) {
    withMachineUpdate();
    const store = createRoomStore();
    act(() => store.patch({ inApp: app, localHostAvailable: true, localHostStatus: { state: "running" }, pairings: [local], machinesReady: true } as never));
    const { unmount } = render(<RoomProvider store={store} runtime={false}><UpdatesEntry compact={compact} /></RoomProvider>);
    if (compact) {
      const entry = await screen.findByRole("button", { name: "Updates, 1 waiting" });
      await act(async () => { entry.click(); });
      await act(async () => { screen.getByRole("button", { name: app ? "Open This device" : "Open This computer in Machines" }).click(); });
    } else {
      const row = await screen.findByRole("button", { name: "Updates available" });
      await act(async () => { row.click(); });
    }
    const facts = store.getState().facts;
    expect([facts.settingsSection, facts.settingsLevel]).toEqual([app ? "this-computer" : "machines", "page"]);
    if (!app) expect(facts.machinesView.machine).toBe(store.getState().machines.find((machine) => machine.local)?.id);
    unmount();
  }
});
