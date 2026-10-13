import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { fakeUpdater, withUpdater } from "../../test/updater";
import { UpdatesEntry } from "./UpdatesEntry";
import { useUpdates, type UpdaterStatus } from "./useUpdates";

afterEach(() => {
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
  delete (window as { sidevoiceActions?: unknown }).sidevoiceActions;
  localStorage.removeItem("sidevoice.updates-checked-at");
});

/* The sidebar's foot: one row, the most pressing update's words — the desktop app's first (automatic: nothing until it
 * is ready; manual: available, its download's percentage, ready), then the page's Reload, then a machine's. Each lands
 * on its own row in Settings › Updates, where it is done (settingsFocus: UPDATE_PLACE); only the page's Reload acts
 * where it is. The rail's icon keeps them all behind it, every one counted. Nothing waits for a call. */

function Items() {
  const { items } = useUpdates();
  return <p data-testid="items">{items.map((item) => item.id).join(",")}</p>;
}

/** The sidebar's foot (or the rail's icon) with `updater` (as the app's host gives it), in a room with `facts`. */
function foot(updater?: Parameters<typeof withUpdater>[0], facts: Record<string, unknown> = {}, compact = false) {
  withUpdater(updater);
  const store = createRoomStore();
  act(() => store.patch(facts as never));
  render(<RoomProvider store={store} runtime={false}><UpdatesEntry compact={compact} /><Items /></RoomProvider>);
  return store;
}
const line = () => document.querySelector(".update-line");
const settle = () => act(async () => {});
const inSpanish = () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  onTestFinished(() => localStorage.removeItem("sidevoice.settings"));
};
/** Where Settings was asked to open: its section, at its page, on the place to focus. */
const landed = (store: ReturnType<typeof foot>) => {
  const facts = store.getState().facts;
  return [facts.settingsSection, facts.settingsLevel, facts.settingsFocus];
};

test("nothing waits: no row; a newer build of the page in a call is Reload to update, which reloads at once", async () => {
  const reloadToUpdate = vi.fn();
  window.sidevoiceActions = { reloadToUpdate } as unknown as typeof window.sidevoiceActions;
  const store = foot();
  await settle();
  expect(line()).toBeNull();
  act(() => store.patch({ ws: {}, webUpdate: "b2" } as never));
  const reload = screen.getByRole("button", { name: "Reload to update" });
  expect(document.body).not.toHaveTextContent(/when the call ends|when voice is off/i);
  fireEvent.click(reload);
  expect(reloadToUpdate).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("items")).toHaveTextContent("web");
});

test("automatic: nothing while the app finds and downloads it; ready, Restart to update, which lands on its row in Updates", async () => {
  const { updater, push } = fakeUpdater({ mode: "automatic" });
  const store = foot(updater);
  await settle();
  for (const status of [{ state: "idle" }, { state: "available", version: "0.5.0" }, { state: "downloading", version: "0.5.0", progress: 0.4 }] as UpdaterStatus[]) {
    act(() => push(status));
    expect(line(), status.state).toBeNull();
  }
  act(() => push({ state: "ready", version: "0.5.0" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Restart to update · 0.5.0" })); });
  expect(landed(store)).toEqual(["updates", "page", "updates-app"]);
  // Restarting is done there, by its button: never by the foot.
  expect(updater.restart).not.toHaveBeenCalled();
});

test("manual: the row says each step — available, its download's percentage, ready — in the same place, each landing on the app's row", async () => {
  const { updater, push } = fakeUpdater({ mode: "manual", status: { state: "idle" } });
  const store = foot(updater);
  await settle();
  expect(line()).toBeNull();
  for (const [status, words] of [
    [{ state: "available", version: "0.5.0" }, "Version 0.5.0 available"],
    [{ state: "downloading", version: "0.5.0", progress: 0.4 }, /^Downloading… 40\s?%$/],
    [{ state: "ready", version: "0.5.0" }, "Restart to update · 0.5.0"],
    [{ state: "ready" }, "Restart to update"],
  ] as [UpdaterStatus, string | RegExp][]) {
    act(() => push(status));
    const row = screen.getByRole("button", { name: words });
    expect(row).toHaveClass("update-line");
    store.patch({ settingsSection: "general", settingsFocus: null });
    await act(async () => { fireEvent.click(row); });
    expect(landed(store)).toEqual(["updates", "page", "updates-app"]);
  }
  expect(updater.download).not.toHaveBeenCalled();
  expect(updater.restart).not.toHaveBeenCalled();
  // Nothing else opens: no dialog, no panel.
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a download or an install that failed is said under the row; a failed check is Updates' to say", async () => {
  const failed = fakeUpdater({ mode: "manual", status: { state: "available", version: "0.5.0", error: { code: "update-download-failed" } } });
  foot(failed.updater);
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent("The update couldn't be downloaded.");
  cleanup();
  const install = fakeUpdater({ status: { state: "ready", version: "0.5.0", error: { code: "update-install-failed" } } });
  foot(install.updater);
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent("The update couldn't be installed.");
  expect(screen.getByRole("button", { name: "Restart to update · 0.5.0" })).toBeInTheDocument();
  cleanup();
  const check = fakeUpdater({ mode: "manual", status: { state: "idle", error: { code: "update-check-failed" } } });
  foot(check.updater);
  await settle();
  expect(line()).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("in Spanish: Versión X disponible, Descargando…, Reiniciar para actualizar, and the failures", async () => {
  inSpanish();
  const { updater, push } = fakeUpdater({ mode: "manual", status: { state: "available", version: "0.5.0" } });
  foot(updater);
  await settle();
  expect(screen.getByRole("button", { name: "Versión 0.5.0 disponible" })).toBeInTheDocument();
  act(() => push({ state: "downloading", version: "0.5.0", progress: 0.4 }));
  expect(line()).toHaveTextContent(/Descargando… 40\s?%/);
  act(() => push({ state: "ready", version: "0.5.0", error: { code: "update-install-failed" } }));
  expect(screen.getByRole("button", { name: "Reiniciar para actualizar · 0.5.0" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo instalar la actualización.");
  act(() => push({ state: "available", version: "0.5.0", error: { code: "update-download-failed" } }));
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo descargar la actualización.");
});

test("no updater (a development build, an older app): nothing of the app's shows", async () => {
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

test("the app's update goes first; the rail's icon keeps every update behind it: the app's lands on its row, the page's reloads", async () => {
  const reloadToUpdate = vi.fn();
  window.sidevoiceActions = { reloadToUpdate } as unknown as typeof window.sidevoiceActions;
  const { updater } = fakeUpdater({ status: { state: "ready", version: "0.5.0" } });
  foot(updater, { webUpdate: "b2" });
  await settle();
  expect(screen.getByRole("button", { name: "Restart to update · 0.5.0" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reload to update" })).toBeNull();
  cleanup();
  const rail = fakeUpdater({ status: { state: "ready", version: "0.5.0" } });
  const store = foot(rail.updater, { webUpdate: "b2" }, true);
  await settle();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Updates, 2 waiting" })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reload Sidevoice" })); });
  expect(reloadToUpdate).toHaveBeenCalledTimes(1);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "See updates", description: "Restart to update · 0.5.0" })); });
  expect(landed(store)).toEqual(["updates", "page", "updates-app"]);
  expect(rail.updater.restart).not.toHaveBeenCalled();
});

/** This computer with an update for its Sidevoice, as the desktop app's bridge says it. */
function withMachineUpdate() {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { build: { channel: "release", version: "0.9.0" }, localHost: {
    state: async () => ({ state: "running" }), subscribe: () => () => {}, pairing: async () => null,
    version: async () => ({ update: "available", bundled: { version: "0.9.0" } }), update: async () => undefined,
  } } } });
}
const local = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local", paired_at: 1, revoked: false };

test("this computer's Sidevoice behind: Updates available at the foot, This computer in the rail; both land on its Update", async () => {
  for (const compact of [false, true]) {
    withMachineUpdate();
    const store = createRoomStore();
    act(() => store.patch({ inApp: true, localHostAvailable: true, localHostStatus: { state: "running" }, pairings: [local], machinesReady: true } as never));
    render(<RoomProvider store={store} runtime={false}><UpdatesEntry compact={compact} /></RoomProvider>);
    if (compact) {
      const entry = await screen.findByRole("button", { name: "Updates, 1 waiting" });
      await act(async () => { entry.click(); });
      await act(async () => { screen.getByRole("button", { name: "See updates", description: "This computer needs an update" }).click(); });
    } else {
      const row = await screen.findByRole("button", { name: "Updates available" });
      await act(async () => { row.click(); });
    }
    expect(landed(store)).toEqual(["updates", "page", "updates-this-computer"]);
    cleanup();
  }
});

const lab = { fp: "fp-lab", host: "Lab box", local: false, urls: ["https://lab.example"], rv: null, device_id: "d-lab", paired_at: 2, revoked: false };
const labBehind = (host = "Lab box") => ({ pairings: [{ ...lab, host }], machinesReady: true, machineLinks: { "fp-lab": { reach: "ok", via: "node" } },
  remoteHostStatus: { "fp-lab": { state: "connected", checkedAt: 1, version: "0.4.0", update: { latest: "0.5.0", command: "sidevoice update" } } } });

test("a remote machine behind, in a browser too: Updates available at the foot, landing on its row in Updates", async () => {
  window.sidevoiceActions = { loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = foot(undefined, labBehind());
  await settle();
  expect(screen.getByTestId("items")).toHaveTextContent("machine:fp-lab");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Updates available" })); });
  expect(landed(store)).toEqual(["updates", "page", "updates-machine-fp-lab"]);
});

test("the rail: a remote machine counted, by its name, an unnamed one as such; its row lands on it in Updates", async () => {
  window.sidevoiceActions = { loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
  for (const host of ["Lab box", ""]) {
    const store = foot(undefined, labBehind(host), true);
    await settle();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Updates, 1 waiting" })); });
    const name = host ? "Lab box needs an update" : "Unnamed machine needs an update";
    expect(screen.getByText(name)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "See updates", description: name })); });
    expect(landed(store)).toEqual(["updates", "page", "updates-machine-fp-lab"]);
    cleanup();
  }
});

test("a machine forgotten while it was behind is not listed: no item, no count, no row", async () => {
  const facts = labBehind();
  foot(undefined, { ...facts, pairings: [] }, true);
  await settle();
  expect(screen.getByTestId("items")).toHaveTextContent(/^$/);
  expect(screen.queryByRole("button", { name: /^Updates, / })).toBeNull();
});

test("each paired machine elsewhere, once connected, is asked whether it is behind; this computer's and one not connected are not", async () => {
  const loadMachineInfo = vi.fn();
  window.sidevoiceActions = { loadMachineInfo } as unknown as typeof window.sidevoiceActions;
  const away = { ...lab, fp: "fp-away", host: "Away", device_id: "d-away" };
  const store = foot(undefined, { pairings: [local, lab, away], machinesReady: true, machineLinks: { "fp-local": { reach: "ok", via: "node" }, "fp-lab": { reach: "ok", via: "node" }, "fp-away": { reach: "away", via: "" } } });
  await settle();
  // Each place the updates show asks (the controller makes it one request per machine at a time).
  const asked = () => new Set(loadMachineInfo.mock.calls.map(([fp]) => fp));
  expect(asked()).toEqual(new Set(["fp-lab"]));
  loadMachineInfo.mockClear();
  // The other one connects: asked then.
  act(() => store.patch({ machineLinks: { ...store.getState().facts.machineLinks, "fp-away": { reach: "ok", via: "node" } } } as never));
  await settle();
  expect(asked()).toContain("fp-away");
  expect(asked()).not.toContain("fp-local");
});
