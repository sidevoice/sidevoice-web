import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { fakeUpdater } from "../../test/updater";
import { CallStage } from "../call/CallStage";
import { ConversationSidebar } from "../room/ConversationSidebar";
import { SettingsDialog } from "../settings/SettingsDialog";
import { UpdateNotice } from "./UpdateNotice";
import type { UpdaterStatus } from "./useUpdates";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus, LocalHostVersion } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => {
  cleanup();
  for (const key of ["sidevoice.variants", "sidevoice.settings", "sidevoice.updates-checked-at", "sidevoice.update-continue"]) localStorage.removeItem(key);
  // What × hid is this test's window's.
  sessionStorage.removeItem("sidevoice.update-notice-hidden");
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
  delete (window as { sidevoiceActions?: unknown }).sidevoiceActions;
});

/* Where the room says an update waits, a desktop's: a pill floating at the top centre of the stage's tile (decided: the
 * update-notice variant is gone, and a value still stored for it changes nothing). It takes no room of its own. It says
 * the most pressing update, its action, then ×, which hides it until a newer version (the next one waiting
 * shows instead). Manual: nothing by itself — once a check found one, Version 0.4.0 available · Download; nothing while
 * it downloads (its progress is Updates'); then Sidevoice 0.4.0 is ready · Restart to update. Automatic: nothing while
 * it downloads by itself; once downloaded, the same ready. Nothing while the person's own check runs. Only this
 * computer's: a remote machine behind is its row's in Settings › Updates, never the room's; this computer's service is
 * folded into Sidevoice's row there, with no notice of its own. The steps on the app's clock, in Updates too, are
 * UpdateFlow.test.tsx. */

const local: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
const lab: PairingSummary = { fp: "fp-lab", host: "Lab box", urls: ["https://lab.example"], rv: null, device_id: "d-lab", paired_at: 1_700_000_100, revoked: false };
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.8.1", api: 1 }, calls: 0, product_version: "0.8.1" };
const BEHIND: LocalHostVersion = { bridge: 3, bundled: { version: "0.9.0" }, installed: { version: "0.8.1" }, core_api: 1, update: "available" };
const CURRENT: LocalHostVersion = { ...BEHIND, bundled: { version: "0.8.1" }, update: "current" };
const FOUND: UpdaterStatus = { state: "available", version: "0.4.0" };
const READY: UpdaterStatus = { state: "ready", version: "0.4.0" };
/** What a page may still have stored for the update-notice variant, now gone: none of it changes anything. */
const NOTICES = [undefined, "pill", "title", "two-lines", "banner"] as const;
/** Two of them, for the flows: none stored, and a gone value. */
const STALE = [undefined, "two-lines"] as const;

/** The desktop app (a release, its updater as fakeUpdater makes it), its service as `service` says, the stage with a
 *  conversation on it (none: `stage` false) and Settings, the room's notice where App puts it; `notice` picked. */
function room({ updater = {}, service = CURRENT, remote = {}, facts = {}, stage = true, notice, sidebar = false }: { updater?: Parameters<typeof fakeUpdater>[0]; service?: LocalHostVersion;
  remote?: Record<string, unknown>; facts?: Record<string, unknown>; stage?: boolean; notice?: string; sidebar?: boolean } = {}) {
  if (notice) localStorage.setItem("sidevoice.variants", JSON.stringify({ "update-notice": notice }));
  const fake = fakeUpdater(updater);
  const update = vi.fn(async () => running);
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { build: { channel: "release", version: "0.3.0" }, updater: fake.updater,
    localHost: { state: vi.fn(async () => running), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(), version: vi.fn(async () => service), update } } } });
  const reloadToUpdate = vi.fn();
  window.sidevoiceActions = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), machineDevices: vi.fn().mockResolvedValue([]),
    loadHostAgents: vi.fn(), loadMachineInfo: vi.fn(), loadVoiceCatalogue: vi.fn(), reloadToUpdate } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  const machines = Object.keys(remote).length ? [local, lab] : [local];
  act(() => { store.patch({ pairings: machines, machinesReady: true, inApp: true, localHostAvailable: true, localHostStatus: running, remoteHostStatus: remote as never,
    machineLinks: Object.fromEntries(machines.map((pairing) => [pairing.fp, { reach: "ok", via: "node" }])),
    ...(stage ? { callNode: "fp-local", roomBinding: { thread_id: "t-login", title: "Fix the slow login", binding_id: "b1" },
      people: [{ thread_id: "t-login", title: "Fix the slow login", available: true, reach: { state: "listening" }, node: "fp-local", machine: { host: "MacBook", id: "m1" } }] } : {}),
    ...facts } as never); });
  // As App lays it out: the conversations and the stage in the room's main region.
  render(<RoomProvider store={store}><main>{sidebar && <ConversationSidebar />}
    <CallStage notice={<UpdateNotice />} /></main><SettingsDialog /></RoomProvider>);
  return { store, fake, update, reloadToUpdate };
}
const settle = () => act(async () => {});
/** The notice shown (one going is not). */
const notice = () => document.querySelector<HTMLElement>(".update-notice:not([data-leaving])");
/** Where it is: over the stage's tile ("pill"), or anywhere else (its parent's class). */
const where = () => notice()?.parentElement?.classList.contains("stage-notice") ? "pill" : notice()?.parentElement?.className ?? null;
const words = () => notice()?.querySelector(".update-notice-text")?.textContent ?? null;
const action = () => within(notice()!).getAllByRole("button")[0];
const hide = () => within(notice()!).getByRole("button", { name: /Hide until a newer version|Ocultar hasta una versión más nueva/ });
/** The notice in words: what it says · its action. */
const said = () => notice() ? `${words()} · ${action().textContent}` : null;
/** Gone, once it has left. */
const gone = () => waitFor(() => expect(document.querySelector(".update-notice")).toBeNull());

test("the pill, over the stage's tile at its top, whatever update-notice value is still stored: nothing in the title row nor at the sidebar's foot", async () => {
  for (const picked of NOTICES) {
    room({ updater: { status: READY }, notice: picked, sidebar: true });
    await waitFor(() => expect(where()).toBe("pill"));
    const tile = document.querySelector(".stage-tile")!;
    // Over the tile, its first child, before the scene: it takes no room of the tile's grid.
    expect(tile.firstElementChild).toBe(notice()!.parentElement);
    expect(document.querySelectorAll(".update-notice")).toHaveLength(1);
    expect(document.querySelector(".stage-title .update-notice, .stage-title-end, .sidebar-foot .update-notice")).toBeNull();
    // The title row as it was: the conversation's name and its machine.
    expect([...document.querySelector(".stage-title")!.children].map((child) => child.tagName)).toEqual(["H2", "SPAN"]);
    expect(notice()).toHaveAccessibleName("Updates");
    cleanup();
  }
});

test("with no conversation on the stage, the pill at the empty tile's top", async () => {
  room({ updater: { status: READY }, notice: "title", stage: false });
  await waitFor(() => expect(where()).toBe("pill"));
  expect(document.querySelector(".stage-empty")!.firstElementChild).toBe(notice()!.parentElement);
});

test("manual, whatever update-notice value is stored: nothing by itself; once a check found one, Version 0.4.0 available · Download; nothing while it downloads; then Sidevoice 0.4.0 is ready · Restart to update", async () => {
  for (const picked of STALE) {
    const { fake } = room({ updater: { mode: "manual" }, notice: picked });
    await settle();
    expect(notice()).toBeNull();
    await act(async () => { fake.push(FOUND); });
    await waitFor(() => expect(said()).toBe("Version 0.4.0 available · Download"));
    expect(where()).toBe("pill");
    // Its action reads the words as its description.
    expect(within(notice()!).getByRole("button", { name: "Download", description: "Version 0.4.0 available" })).toBeInTheDocument();
    expect(fake.updater.download).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(action()); });
    expect(fake.updater.download).toHaveBeenCalledTimes(1);
    await act(async () => { fake.push({ ...FOUND, state: "downloading", progress: 0.4 }); });
    // Its progress is Updates' to show: the room says nothing until it is ready.
    expect(notice()).toBeNull();
    await gone();
    await act(async () => { fake.push(READY); });
    await waitFor(() => expect(said()).toBe("Sidevoice 0.4.0 is ready · Restart to update"));
    expect(fake.updater.restart).not.toHaveBeenCalled();
    cleanup();
  }
});

test("automatic, whatever update-notice value is stored: nothing while the app's update is found or downloads by itself; once downloaded, Sidevoice 0.4.0 is ready · Restart to update, which restarts and has the service follow", async () => {
  for (const picked of STALE) {
    const { fake } = room({ updater: { mode: "automatic", status: FOUND }, notice: picked });
    await settle();
    expect(notice()).toBeNull();
    await act(async () => { fake.push({ ...FOUND, state: "downloading", progress: 0.4 }); });
    expect(document.querySelector(".update-notice")).toBeNull();
    await act(async () => { fake.push(READY); });
    await waitFor(() => expect(said()).toBe("Sidevoice 0.4.0 is ready · Restart to update"));
    expect(where()).toBe("pill");
    await act(async () => { fireEvent.click(action()); });
    expect(fake.updater.restart).toHaveBeenCalledTimes(1);
    // Sidevoice as one: the app's restart asks its service to follow.
    expect(Number(localStorage.getItem("sidevoice.update-continue"))).toBeGreaterThan(0);
    cleanup();
  }
});

test("while the person's own check runs, nothing: the notice there before goes, and comes back once the check finds it again", async () => {
  const { fake } = room({ updater: { mode: "manual", status: FOUND }, facts: { settingsSection: "updates" } });
  await waitFor(() => expect(said()).toBe("Version 0.4.0 available · Download"));
  let answer!: (status: UpdaterStatus) => void;
  fake.updater.check.mockImplementationOnce(() => new Promise<UpdaterStatus>((resolve) => { answer = resolve; }));
  const check = within(document.getElementById("pane-updates")!).getByRole("button", { name: "Check for updates", hidden: true });
  await act(async () => { fireEvent.click(check); });
  expect(notice()).toBeNull();
  await act(async () => { answer(FOUND); });
  await waitFor(() => expect(said()).toBe("Version 0.4.0 available · Download"));
});

test("a failed download (manual) is said under it, its action Retry download; a failed install, under ready, Restart to update tried again", async () => {
  const { fake } = room({ updater: { mode: "manual", status: { ...FOUND, error: { code: "update-download-failed" } } } });
  await waitFor(() => expect(said()).toBe("Version 0.4.0 available · Retry download"));
  expect(within(notice()!).getByRole("alert")).toHaveTextContent("The update couldn't be downloaded.");
  await act(async () => { fireEvent.click(action()); });
  expect(fake.updater.download).toHaveBeenCalledTimes(1);
  await act(async () => { fake.push({ ...READY, error: { code: "update-install-failed" } }); });
  await waitFor(() => expect(said()).toBe("Sidevoice 0.4.0 is ready · Restart to update"));
  expect(within(notice()!).getByRole("alert")).toHaveTextContent("The update couldn't be installed.");
  // A failed check is Updates' to say, never the room's.
  await act(async () => { fake.push({ ...READY, error: { code: "update-check-failed" } }); });
  expect(within(notice()!).queryByRole("alert")).toBeNull();
});

test("×: hidden until a newer version, not as the same one moves on; focus goes to the room's main region, never on the stage's chips; a new window shows it again", async () => {
  for (const picked of STALE) {
    const { fake } = room({ updater: { mode: "manual", status: FOUND }, notice: picked });
    await waitFor(() => expect(said()).toBe("Version 0.4.0 available · Download"));
    // The × at its end, inside it.
    expect(notice()!.lastElementChild).toBe(hide());
    hide().focus();
    await act(async () => { fireEvent.click(hide()); });
    expect(notice()).toBeNull();
    await gone();
    expect(document.activeElement).toBe(within(document.body).getByRole("main"));
    // The same update, downloaded: still hidden.
    await act(async () => { fake.push(READY); });
    expect(notice()).toBeNull();
    // A newer one: shown.
    await act(async () => { fake.push({ state: "ready", version: "0.4.1" }); });
    await waitFor(() => expect(said()).toBe("Sidevoice 0.4.1 is ready · Restart to update"));
    cleanup();
    // A new window (the app restarted) starts over.
    sessionStorage.removeItem("sidevoice.update-notice-hidden");
    room({ updater: { mode: "manual", status: FOUND }, notice: picked });
    await waitFor(() => expect(said()).toBe("Version 0.4.0 available · Download"));
    cleanup();
  }
});

test("× hides the update it says; the next one waiting shows in its place — the page's Reload; a remote machine's never", async () => {
  const { reloadToUpdate } = room({ updater: { mode: "manual", status: READY }, facts: { webUpdate: "b2" },
    remote: { [lab.fp]: { state: "connected", checkedAt: 1, version: "0.4.0", update: { latest: "0.5.0", command: "x" } } } });
  await waitFor(() => expect(said()).toBe("Sidevoice 0.4.0 is ready · Restart to update"));
  await act(async () => { fireEvent.click(hide()); });
  await waitFor(() => expect(said()).toBe("A new version of Sidevoice is ready · Reload"));
  expect(action()).toHaveAccessibleName("Reload Sidevoice");
  await act(async () => { fireEvent.click(action()); });
  expect(reloadToUpdate).toHaveBeenCalledTimes(1);
  await act(async () => { fireEvent.click(hide()); });
  // Nothing of this computer's waits: the remote machine behind is not the room's to say.
  await gone();
  await settle();
  expect(document.querySelector(".update-notice")).toBeNull();
});

test("a remote machine behind, alone: no notice, with or without a conversation on the stage — its row in Settings › Updates says it, with its command", async () => {
  for (const picked of STALE) for (const stage of [true, false]) {
    room({ notice: picked, stage, facts: { settingsSection: "updates" },
      remote: { [lab.fp]: { state: "connected", checkedAt: 1, version: "0.4.0", update: { latest: "0.5.0", command: "npx sidevoice@latest install" } } } });
    const row = await waitFor(() => { const found = document.getElementById("updates-machine-fp-lab"); expect(found).not.toBeNull(); return found!; });
    expect(row).toHaveTextContent("Lab box");
    expect(row).toHaveTextContent("npx sidevoice@latest install");
    await settle();
    expect(document.querySelector(".update-notice")).toBeNull();
    cleanup();
  }
});

test("this computer's service behind the one the app bundles: no notice of its own — folded into Sidevoice's row in Settings › Updates; with a remote machine behind too, still none", async () => {
  for (const picked of STALE) {
    room({ service: BEHIND, notice: picked, facts: { settingsSection: "updates" } });
    await waitFor(() => expect(within(document.getElementById("pane-updates")!).getByRole("button", { name: "Update Sidevoice", hidden: true })).toBeInTheDocument());
    await settle();
    expect(document.querySelector(".update-notice")).toBeNull();
    cleanup();
  }
  room({ service: BEHIND, remote: { [lab.fp]: { state: "connected", checkedAt: 1, version: "0.4.0", update: { latest: "0.5.0", command: "x" } } } });
  await waitFor(() => expect(document.getElementById("updates-machine-fp-lab") ?? document.querySelector(".stage-notice")).not.toBeNull());
  await settle();
  expect(document.querySelector(".update-notice")).toBeNull();
});

test("this computer's app update shows next to a remote machine behind: the app's, never the machine's", async () => {
  room({ updater: { mode: "manual", status: FOUND }, service: BEHIND, remote: { [lab.fp]: { state: "connected", checkedAt: 1, version: "0.4.0", update: { latest: "0.5.0", command: "x" } } } });
  await waitFor(() => expect(said()).toBe("Version 0.4.0 available · Download"));
  await act(async () => { fireEvent.click(hide()); });
  await gone();
  await settle();
  expect(document.querySelector(".update-notice")).toBeNull();
});

test("× spent once the app says none waits (idle): the same version found again shows", async () => {
  const { fake } = room({ updater: { mode: "manual", status: FOUND } });
  await waitFor(() => expect(said()).toBe("Version 0.4.0 available · Download"));
  await act(async () => { fireEvent.click(hide()); });
  await gone();
  await act(async () => { fake.push(READY); });
  expect(notice()).toBeNull();
  await act(async () => { fake.push({ state: "idle" }); });
  await waitFor(() => expect(sessionStorage.getItem("sidevoice.update-notice-hidden")).toBe("[]"));
  await act(async () => { fake.push(FOUND); });
  await waitFor(() => expect(said()).toBe("Version 0.4.0 available · Download"));
});

test("in Spanish: Versión 0.4.0 disponible · Descargar, then Sidevoice 0.4.0 está listo · Reiniciar para actualizar; its × Ocultar hasta una versión más nueva", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  const { fake } = room({ updater: { mode: "manual", status: FOUND } });
  await waitFor(() => expect(said()).toBe("Versión 0.4.0 disponible · Descargar"));
  await act(async () => { fake.push(READY); });
  await waitFor(() => expect(said()).toBe("Sidevoice 0.4.0 está listo · Reiniciar para actualizar"));
  expect(notice()).toHaveAccessibleName("Actualizaciones");
  expect(hide()).toBeInTheDocument();
});

test("it goes softly: a moment leaving, out of reach, then gone; at once under reduced motion", async () => {
  const { fake } = room({ updater: { mode: "manual", status: FOUND } });
  await waitFor(() => expect(notice()).not.toBeNull());
  await act(async () => { fake.push({ state: "idle" }); });
  const leaving = document.querySelector<HTMLElement>(".update-notice[data-leaving]");
  expect(leaving).not.toBeNull();
  expect(leaving).toHaveAttribute("inert");
  await gone();
  cleanup();
  const matchMedia = window.matchMedia;
  window.matchMedia = ((media: string) => ({ ...matchMedia(media), matches: media.includes("reduce") })) as typeof window.matchMedia;
  onTestFinished(() => { window.matchMedia = matchMedia; });
  const again = room({ updater: { mode: "manual", status: FOUND } });
  await waitFor(() => expect(notice()).not.toBeNull());
  await act(async () => { again.fake.push({ state: "idle" }); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(document.querySelector(".update-notice")).toBeNull();
});

test("no notice on a phone", async () => {
  const matchMedia = window.matchMedia;
  window.matchMedia = ((media: string) => ({ ...matchMedia(media), matches: media.includes("max-width: 899px") })) as typeof window.matchMedia;
  onTestFinished(() => { window.matchMedia = matchMedia; });
  for (const picked of STALE) {
    room({ updater: { status: READY }, notice: picked });
    await settle();
    expect(document.querySelector(".update-notice")).toBeNull();
    cleanup();
  }
});
