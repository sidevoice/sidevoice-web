import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { fakeUpdater } from "../../test/updater";
import { UpdateNotice } from "../updates/UpdateNotice";
import { SIDEVOICE_UPDATE_COMMAND } from "../updates/useUpdates";
import type { UpdaterStatus } from "../../host";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus, LocalHostVersion } from "../../host";
import { DEVELOPER_MODE_KEY } from "./developer-mode";

vi.mock("../../services/room-session-controller.js", () => ({}));
const CHECKED = "sidevoice.updates-checked-at";
afterEach(() => {
  cleanup();
  // A restart into the app's update asks the service to follow (one row): never into the next test.
  for (const key of ["sidevoice.settings", CHECKED, "sidevoice.update-continue"]) localStorage.removeItem(key);
  delete (window as { __sidevoiceHost?: unknown }).__sidevoiceHost;
});

/* Updates (decided): a Settings section of their own, holding everything that updates, each row with its action right
 * there once an update is found — this computer as one row, Sidevoice (decided), top to bottom: Automatic or Manual;
 * the installed version, Sidevoice 0.9.0 (· Up to date once a check says so, · Checking… while the person's runs)
 * beside Check for updates, with no Version line above it (only a nightly's or development build's note); then, only
 * while a newer one is in view, its own line with just the new version and its one action — Sidevoice 0.10.0
 * available · Download in manual, Sidevoice 0.10.0 · Downloading… with its progress, Sidevoice 0.10.0 ready · Restart
 * to update in either mode — or, where only this computer's service is behind the one the app bundles, Update available
 * · Update Sidevoice; then each remote machine that is behind, with the command to run there (the room's notice never
 * says those). The one row's own steps (the service following the app's restart) are UpdatesSidevoiceRow.test.tsx. In
 * the desktop app always; in a browser only while a machine is behind, with only those machines. A check that finds
 * one and This device's Update available land on the row's action, in view and focused. */

const local: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
const lab: PairingSummary = { fp: "fp-lab", host: "Lab box", urls: ["https://lab.example"], device_id: "d-lab", paired_at: 1_700_000_100, revoked: false };
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.1.0", api: 1 }, calls: 0, product_version: "0.9.0" };
const RELEASE = { channel: "release", version: "0.9.0", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" };
const NIGHTLY = { channel: "nightly", version: "0.10.0-nightly", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" };
const DEV = { channel: "dev", version: "0.10.0-dev" };
const COMMAND = "curl -fsSL https://sidevoice.app/install | sh";
/** What a remote machine says when its Sidevoice is behind (loadMachineInfo, contract gap #57). */
const behind = (version: string | null = "0.4.0", command = COMMAND) => ({ state: "connected", checkedAt: 1, version, update: { latest: "0.5.0", command } });
/** This computer's service, as the bridge says it when the app bundles a newer one. */
const BUNDLED: LocalHostVersion = { bridge: 3, bundled: { version: "0.9.1" }, installed: { version: "0.9.0" }, core_api: 1, update: "available" };
/** This computer's service as the app bundles it: current. The one row says Up to date only with it so. */
const SERVICE_CURRENT: LocalHostVersion = { ...BUNDLED, bundled: { version: "0.9.0" }, update: "current" };

interface Open {
  /** The app's build; null, a browser. */
  build?: Record<string, unknown> | null;
  /** The app's updater (a release's; a nightly's for now), as fakeUpdater makes it; false, none. */
  updater?: Parameters<typeof fakeUpdater>[0] | false;
  section?: string;
  machines?: PairingSummary[];
  /** What each paired machine elsewhere said (remoteHostStatus). */
  remote?: Record<string, unknown>;
  /** What the bridge says of this computer's service (its `version()`), or how it answers. */
  service?: LocalHostVersion | (() => Promise<LocalHostVersion>) | null;
  /** The bridge's `update()`. */
  update?: ReturnType<typeof vi.fn>;
  status?: LocalHostStatus;
  /** The room's notice (UpdateNotice), beside Settings. */
  notice?: boolean;
  /** Readies the fake updater before the page first asks it. */
  prepare?: (fake: ReturnType<typeof fakeUpdater>) => void;
}

/** The desktop app (its build, its updater on a release), or a browser (`build` null), with Settings at `section`. */
function open({ build = RELEASE, updater, section = "this-computer", machines = [], remote = {}, service = null, update = vi.fn(async () => running), status = running, notice, prepare }: Open = {}) {
  const withUpdater = updater === undefined ? build?.channel === "release" : updater !== false;
  const fake = fakeUpdater(updater || undefined);
  prepare?.(fake);
  const version = typeof service === "function" ? vi.fn(service) : vi.fn(async () => service!);
  if (build) Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: { build,
    ...(withUpdater ? { updater: fake.updater } : {}),
    localHost: { state: vi.fn(async () => status), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(),
      ...(service ? { version, update } : {}) } } } });
  window.sidevoiceActions = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), machineDevices: vi.fn().mockResolvedValue([]),
    loadHostAgents: vi.fn(), loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [...(build ? [local] : []), ...machines], machinesReady: true, inApp: !!build, localHostAvailable: !!build,
    localHostStatus: status, remoteHostStatus: remote as never, settingsSection: section,
    machineLinks: Object.fromEntries([...(build ? [local] : []), ...machines].map((pairing) => [pairing.fp, { reach: "ok", via: "node" }])) }); });
  render(<RoomProvider store={store}><SettingsDialog />{notice && <UpdateNotice />}</RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  return { store, fake, update, version };
}

const entry = () => document.getElementById("settings-updates");
const pane = (id: string) => document.getElementById("pane-" + id)!;
const updates = () => within(pane("updates"));
const groups = () => [...pane("updates").querySelectorAll(".ui-group-title")].map((title) => title.textContent);
const group = (name: string) => [...pane("updates").querySelectorAll<HTMLElement>(".ui-group")].find((item) => item.querySelector(".ui-group-title")?.textContent === name)!;
const navOrder = () => [...document.querySelectorAll(".settings-nav > button.ui-nav-item")].map((item) => item.id.replace("settings-", ""));
/** The app's newer version's line, only while one is in view (the installed version's line holds the id otherwise). */
const appRow = () => document.querySelector<HTMLElement>("#pane-updates .update-action-row#updates-app");
/** The installed version's line, holding Check for updates. */
const installedLine = () => pane("updates").querySelector<HTMLElement>(".app-update-installed");
/** Its words: Sidevoice 0.9.0, with · Up to date or · Checking…. */
const installed = () => installedLine()!.querySelector<HTMLElement>(".update-action-copy")!;
/** Each machine behind as Updates says it: its name, its versions, where to run the command, the command. */
const machineRows = () => [...pane("updates").querySelectorAll(".updates-machine")].map((row) => [
  row.querySelector(".host-status-product")?.textContent, row.querySelector(".host-status-build")?.textContent,
  row.querySelector(".host-agent-where")?.textContent, row.querySelector(".ui-snippet-text")?.textContent]);
const settle = () => act(async () => {});
const inSpanish = () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  onTestFinished(() => localStorage.removeItem("sidevoice.settings"));
};
/** Focus lands where a landing asked, its row lit for a moment — that row alone: never the version, never the card. */
async function landsOn(control: () => HTMLElement | null, row?: () => HTMLElement | null) {
  await waitFor(() => expect(document.activeElement).toBe(control()), { timeout: 3000 });
  if (!row) return;
  expect(row()).toHaveClass("settings-highlight");
  expect([...document.querySelectorAll(".settings-highlight")]).toEqual([row()]);
}
/** The line an update is acted on in, holding `control`: its words and its button. */
const lineOf = (control: () => HTMLElement | null) => () => control()?.closest<HTMLElement>(".update-action-row") ?? null;

test("Updates is a section of its own, before Advanced: this computer as one row, Sidevoice — Automatic/Manual first, then Sidevoice 0.9.0 with Check for updates; no Version line", async () => {
  open({ section: "updates" });
  await settle();
  expect(entry()).toHaveTextContent(/^Updates$/);
  expect(navOrder().slice(-3)).toEqual(["machines", "updates", "advanced"]);
  expect(entry()).toHaveAttribute("aria-current", "page");
  expect(updates().getByRole("heading", { name: "Updates", level: 2 })).toBeInTheDocument();
  expect(updates().getByText("Sidevoice on this computer: its versions, and how it updates.")).toBeInTheDocument();
  // One row, Sidevoice, the app and its service as one; no machine is behind, so no Remote machines.
  expect(groups()).toEqual(["Sidevoice"]);
  // The app's version said once, on the installed version's line, with no hint and no service's number: no Version
  // line above it, with the app's updater.
  expect(group("Sidevoice").querySelector(".host-status-product, .updates-settings-version")).toBeNull();
  expect(group("Sidevoice").querySelector(".updates-part-hint")).toBeNull();
  expect(group("Sidevoice").querySelector(".updates-up-to-date")).toBeNull();
  const modes = await updates().findByRole("radiogroup", { name: "Updates" });
  const check = updates().getByRole("button", { name: "Check for updates" });
  // Never checked here: the version alone, nothing claims Up to date yet, and no line says when it checked; no
  // colour, no badge, no update's line.
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  expect(installedLine()).toContainElement(check);
  expect(pane("updates")).not.toHaveTextContent(/Not checked yet|Last checked|Up to date/);
  expect(appRow()).toBeNull();
  expect(group("Sidevoice").querySelector(".update-action-row, .ui-badge")).toBeNull();
  // Nothing newer in view: a landing on the app goes to the installed version's line.
  expect(document.getElementById("updates-app")).toBe(installedLine());
  // In order: Automatic or Manual, then the installed version with Check for updates.
  expect(modes.compareDocumentPosition(installedLine()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("Sidevoice 0.9.0 · Up to date on the installed version's line once checked and the app and its service both current; never with its service behind", async () => {
  localStorage.setItem(CHECKED, String(Date.parse("2026-10-12T09:30:00Z")));
  open({ section: "updates", service: SERVICE_CURRENT });
  await settle();
  await waitFor(() => expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0 · Up to date$/));
  expect(group("Sidevoice").querySelector(".host-status-product")).toBeNull();
  // Up to date is never a colour, nor a badge.
  expect(group("Sidevoice").querySelector(".update-action-row, .ui-badge")).toBeNull();
  cleanup();
  // Its service behind what the app bundles: checked, but not Up to date.
  open({ section: "updates", service: BUNDLED });
  await updates().findByRole("button", { name: "Update Sidevoice" });
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  expect(pane("updates")).not.toHaveTextContent("Up to date");
});

test("Up to date only after a check that went through and found nothing: never before any check, never after a failure — which Check for updates itself tries again", async () => {
  // Its service current, as the app bundles it: what the line says is the app's check.
  const { fake } = open({ section: "updates", service: SERVICE_CURRENT, updater: { mode: "manual", status: { state: "available", version: "0.10.0" } } });
  const check = await updates().findByRole("button", { name: "Check for updates" });
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  expect(pane("updates")).not.toHaveTextContent("Up to date");
  // Installed elsewhere and checked again: nothing waits.
  fake.updater.check.mockResolvedValueOnce({ state: "idle" });
  await act(async () => { fake.push({ state: "idle" }); });
  await act(async () => { fireEvent.click(check); });
  // The line, then what a screen reader is told of the check.
  await waitFor(() => expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0 · Up to date(Sidevoice is up to date\.)?$/));
  expect(appRow()).toBeNull();
  // The next check fails: what failed, under the installed version — not Up to date, and no Retry of its own.
  fake.updater.check.mockResolvedValueOnce({ state: "idle", error: { code: "update-check-failed" } });
  await act(async () => { fireEvent.click(check); });
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  expect(pane("updates")).not.toHaveTextContent("Up to date");
  const alert = updates().getByRole("alert");
  expect(alert).toHaveTextContent("Couldn't check for updates.");
  expect(alert).toHaveClass("app-update-failure");
  expect(installedLine()!.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(updates().queryByRole("button", { name: /^Retry/ })).toBeNull();
  // Check for updates is what tries again; a check that goes through says Up to date again.
  await act(async () => { fireEvent.click(check); });
  expect(fake.updater.check).toHaveBeenCalledTimes(3);
  await waitFor(() => expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0 · Up to date/));
  expect(updates().queryByRole("alert")).toBeNull();
  cleanup();
  // Idle and never checked, its service current: not Up to date either.
  localStorage.removeItem(CHECKED);
  open({ section: "updates", service: SERVICE_CURRENT });
  await updates().findByRole("button", { name: "Check for updates" });
  await settle();
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
});

test("in Spanish: Sidevoice 0.9.0 · Al día beside Buscar actualizaciones once checked; never checked, Sidevoice 0.9.0 alone, then its update's line", async () => {
  inSpanish();
  localStorage.setItem(CHECKED, String(Date.parse("2026-10-12T09:30:00Z")));
  open({ section: "updates", service: SERVICE_CURRENT });
  let check = await updates().findByRole("button", { name: "Buscar actualizaciones" });
  await waitFor(() => expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0 · Al día$/));
  expect(installedLine()).toContainElement(check);
  cleanup();
  localStorage.removeItem(CHECKED);
  open({ section: "updates", updater: { mode: "manual", status: { state: "available", version: "0.10.0" } } });
  check = await updates().findByRole("button", { name: "Buscar actualizaciones" });
  await settle();
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  expect(pane("updates")).not.toHaveTextContent(/Aún sin comprobar|Última comprobación|Al día/);
  expect(check.compareDocumentPosition(appRow()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

/** This device's version line, as its card says it. */
const deviceLine = () => pane("this-computer").querySelector(".this-device-version");

test("This device says its version and Update available, a link to the row's button in Updates: no Automatic/Manual, no Check, no Update, no build note", async () => {
  const { store } = open({ build: NIGHTLY, service: BUNDLED, updater: {} });
  await settle();
  const card = pane("this-computer");
  // The app's number (the Sidevoice the person installed); the service is behind what the app bundles.
  await waitFor(() => expect(deviceLine()).toHaveTextContent(/^Sidevoice 0\.10\.0-nightly · Update available$/));
  const link = within(card).getByRole("button", { name: "Update available, see it in Updates" });
  expect(card.querySelector(".host-status-facts")).toContainElement(link);
  expect(within(card).queryByRole("button", { name: "See updates" })).toBeNull();
  expect(within(card).queryByRole("radiogroup", { name: "Updates" })).toBeNull();
  expect(within(card).queryByRole("button", { name: /Check for updates|Update Sidevoice/ })).toBeNull();
  expect(card.querySelector(".host-status-build, .app-update-settings, .host-update-control")).toBeNull();
  await act(async () => { fireEvent.click(link); });
  expect([store.getState().facts.settingsSection, store.getState().facts.settingsLevel]).toEqual(["updates", "page"]);
  expect(entry()).toHaveAttribute("aria-current", "page");
  await landsOn(() => document.getElementById("updates-this-computer"), lineOf(() => document.getElementById("updates-this-computer")));
});

test("This device says what it always said of the app's update, whatever Updates shows for Cancel: automatic's download by itself and its cancel say nothing, manual's download says Update available", async () => {
  const version = "0.10.0";
  const auto = open({ notice: true, updater: { mode: "automatic", status: { state: "available", version } } });
  await settle();
  expect(deviceLine()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  act(() => auto.fake.push({ state: "downloading", version, progress: 0.4 }));
  expect(deviceLine()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  auto.fake.updater.cancel.mockImplementationOnce(async () => { auto.fake.push({ state: "available", version }); });
  await act(async () => { fireEvent.click(within(noticeBox()).getByRole("button", { name: "Cancel download" })); });
  expect(auto.fake.updater.cancel).toHaveBeenCalledTimes(1);
  expect(deviceLine()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  act(() => auto.fake.push({ state: "ready", version }));
  expect(deviceLine()).toHaveTextContent(/^Sidevoice 0\.9\.0 · Update available$/);
  cleanup();
  delete (window as { __sidevoiceHost?: unknown }).__sidevoiceHost;
  const manual = open({ updater: { mode: "manual", status: { state: "available", version } } });
  await settle();
  expect(deviceLine()).toHaveTextContent(/^Sidevoice 0\.9\.0 · Update available$/);
  act(() => manual.fake.push({ state: "downloading", version, progress: 0.4 }));
  expect(deviceLine()).toHaveTextContent(/^Sidevoice 0\.9\.0 · Update available$/);
});

test("This device: Up to date where the app (after a check) and its service both say so, with no link; nothing said where neither can", async () => {
  // Before any check, the app cannot say it is current: the line says the version alone.
  open({ service: { ...BUNDLED, bundled: { version: "0.9.0" }, update: "current" } });
  await settle();
  expect(deviceLine()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  cleanup();
  localStorage.setItem("sidevoice.updates-checked-at", String(Date.now()));
  open({ service: { ...BUNDLED, bundled: { version: "0.9.0" }, update: "current" } });
  await waitFor(() => expect(deviceLine()).toHaveTextContent(/^Sidevoice 0\.9\.0 · Up to date$/));
  expect(within(pane("this-computer")).queryByRole("button", { name: /Update available/ })).toBeNull();
  cleanup();
  // The app's update found: Update available, landing on the new version's line.
  const { fake, store } = open({ service: { ...BUNDLED, update: "current" }, updater: { status: { state: "ready", version: "0.10.0" } } });
  await waitFor(() => expect(deviceLine()).toHaveTextContent(/· Update available$/));
  await act(async () => { fireEvent.click(within(pane("this-computer")).getByRole("button", { name: "Update available, see it in Updates" })); });
  await landsOn(() => appRow() && within(appRow()!).getByRole("button", { name: "Restart to update" }), appRow);
  expect(store.getState().facts.settingsSection).toBe("updates");
  expect(fake.updater.restart).not.toHaveBeenCalled();
  cleanup();
  // A development build: no updater and no update of its service from here: its version alone.
  open({ build: DEV, service: BUNDLED });
  await settle();
  expect(deviceLine()).toHaveTextContent(/^Sidevoice 0\.10\.0-dev$/);
});

test("manual: an update found has its own line under the installed version, Sidevoice 0.10.0 available · Download; Sidevoice 0.10.0 · Downloading… with its progress in that line; then Sidevoice 0.10.0 ready · Restart to update", async () => {
  const { fake } = open({ section: "updates", updater: { mode: "manual", status: { state: "available", version: "0.10.0" } } });
  await settle();
  const download = within(appRow()!).getByRole("button", { name: "Download", description: "Sidevoice 0.10.0 available" });
  // Each version said once: the installed one on its line, the new one on its own, never 0.9.0 · 0.10.0.
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.10\.0 availableDownload$/);
  expect(appRow()).toHaveAttribute("data-state", "available");
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  expect(pane("updates")).not.toHaveTextContent("0.9.0 · 0.10.0");
  // The id is the new version's line now: a landing goes there, not to the installed version.
  expect(installedLine()).not.toHaveAttribute("id");
  // The line comes after Automatic/Manual and the installed version with Check, last.
  expect(appRow()!.compareDocumentPosition(updates().getByRole("radiogroup", { name: "Updates" })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  expect(appRow()!.compareDocumentPosition(updates().getByRole("button", { name: "Check for updates" })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  expect(group("Sidevoice").querySelector(".app-update-settings")!.lastElementChild).toBe(appRow());
  await act(async () => { fireEvent.click(download); });
  expect(fake.updater.download).toHaveBeenCalledTimes(1);
  act(() => fake.push({ state: "downloading", version: "0.10.0", progress: 0.4 }));
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.10\.0 · Downloading…\s?40\s?%Cancel download$/);
  const progress = within(appRow()!).getByRole("progressbar");
  expect(progress).toHaveAttribute("aria-valuenow", "40");
  // Its progress and its percent in the same line as its words.
  expect(progress.closest(".update-action")).toHaveTextContent(/^Sidevoice 0\.10\.0 · Downloading…\s?40\s?%Cancel download$/);
  // Only Cancel while it downloads.
  expect(within(appRow()!).getAllByRole("button").map((button) => button.textContent)).toEqual(["Cancel download"]);
  act(() => fake.push({ state: "ready", version: "0.10.0" }));
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.10\.0 readyRestart to update$/);
  expect(updates().queryByRole("button", { name: "Restart to update Sidevoice" })).toBeNull();
  await act(async () => { fireEvent.click(within(appRow()!).getByRole("button", { name: "Restart to update" })); });
  expect(fake.updater.restart).toHaveBeenCalledTimes(1);
});

test("automatic, what the app found by itself: nothing while it is available; Cancel while it downloads; then Sidevoice 0.10.0 ready · Restart to update; no version known, Update ready", async () => {
  const { fake } = open({ section: "updates", updater: { mode: "automatic", status: { state: "available", version: "0.10.0" } } });
  await settle();
  expect(appRow()).toBeNull();
  // A download the app runs by itself, unasked: its line, its progress and its Cancel all the same.
  act(() => fake.push({ state: "downloading", version: "0.10.0", progress: 0.7 }));
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.10\.0 · Downloading…\s?70\s?%Cancel download$/);
  expect(within(appRow()!).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "70");
  act(() => fake.push({ state: "ready", version: "0.10.0" }));
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.10\.0 readyRestart to update$/);
  await act(async () => { fireEvent.click(within(appRow()!).getByRole("button", { name: "Restart to update" })); });
  expect(fake.updater.restart).toHaveBeenCalledTimes(1);
  // An update whose version the app does not say (a gap of the seam): what is known; the installed version on its line.
  act(() => fake.push({ state: "ready" }));
  expect(appRow()).toHaveTextContent(/^Update readyRestart to update$/);
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
});

test("with no version known: Update available · Download, then Downloading the update…, then Update ready", async () => {
  const { fake } = open({ section: "updates", updater: { mode: "manual", status: { state: "available" } } });
  await settle();
  expect(appRow()).toHaveTextContent(/^Update availableDownload$/);
  act(() => fake.push({ state: "downloading", progress: 0.5 }));
  expect(appRow()).toHaveTextContent(/^Downloading the update…\s?50\s?%Cancel download$/);
  act(() => fake.push({ state: "ready" }));
  expect(appRow()).toHaveTextContent(/^Update readyRestart to update$/);
});

const noticeBox = () => document.querySelector<HTMLElement>(".update-notice")!;

test("a download in progress has a Cancel: it calls cancel once and the line is available again, with its Download", async () => {
  const { fake } = open({ section: "updates", updater: { mode: "manual", status: { state: "available", version: "0.10.0" } } });
  await settle();
  expect(within(appRow()!).queryByRole("button", { name: "Cancel download" })).toBeNull();
  act(() => fake.push({ state: "downloading", version: "0.10.0", progress: 0.4 }));
  const cancel = within(appRow()!).getByRole("button", { name: "Cancel download", description: "Sidevoice 0.10.0 · Downloading…" });
  fake.updater.cancel.mockImplementationOnce(async () => { fake.push({ state: "available", version: "0.10.0" }); });
  await act(async () => { fireEvent.click(cancel); });
  expect(fake.updater.cancel).toHaveBeenCalledTimes(1);
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.10\.0 availableDownload$/);
  expect(within(appRow()!).queryByRole("progressbar")).toBeNull();
  expect(within(appRow()!).queryByRole("button", { name: "Cancel download" })).toBeNull();
});

test("automatic: a background download is cancelled from Settings and from the room's notice; either way it is available again with its Download in both, until they ask", async () => {
  for (const from of ["settings", "notice"] as const) {
    const { fake } = open({ section: "updates", notice: true, updater: { mode: "automatic", status: { state: "available", version: "0.10.0" } } });
    await settle();
    // Nothing asked: the app downloads it by itself, and both places offer Cancel.
    act(() => fake.push({ state: "downloading", version: "0.10.0", progress: 0.4 }));
    expect(within(noticeBox()).getByRole("button", { name: "Cancel download" })).toBeInTheDocument();
    expect(within(appRow()!).getByRole("button", { name: "Cancel download" })).toBeInTheDocument();
    fake.updater.cancel.mockImplementationOnce(async () => { fake.push({ state: "available", version: "0.10.0" }); });
    await act(async () => { fireEvent.click(within(from === "settings" ? appRow()! : noticeBox()).getByRole("button", { name: "Cancel download" })); });
    expect(fake.updater.cancel).toHaveBeenCalledTimes(1);
    expect(appRow()).toHaveTextContent(/^Sidevoice 0\.10\.0 availableDownload$/);
    expect(noticeBox()).toHaveTextContent(/^Version 0\.10\.0 availableDownload/);
    await act(async () => { fireEvent.click(within(noticeBox()).getByRole("button", { name: "Download" })); });
    expect(fake.updater.download).toHaveBeenCalledTimes(1);
    cleanup();
    delete (window as { __sidevoiceHost?: unknown }).__sidevoiceHost;
  }
});

test("a manual download started from the room's notice is cancelled there too", async () => {
  const { fake } = open({ section: "updates", notice: true, updater: { mode: "manual", status: { state: "available", version: "0.10.0" } } });
  await settle();
  await act(async () => { fireEvent.click(within(noticeBox()).getByRole("button", { name: "Download" })); });
  act(() => fake.push({ state: "downloading", version: "0.10.0", progress: 0.2 }));
  expect(noticeBox()).toHaveTextContent(/^Sidevoice 0\.10\.0 · Downloading…Cancel download/);
  fake.updater.cancel.mockImplementationOnce(async () => { fake.push({ state: "available", version: "0.10.0" }); });
  await act(async () => { fireEvent.click(within(noticeBox()).getByRole("button", { name: "Cancel download" })); });
  expect(fake.updater.cancel).toHaveBeenCalledTimes(1);
  expect(within(noticeBox()).getByRole("button", { name: "Download" })).toBeInTheDocument();
});

test("a fresh page after a cancel (the app still available, nothing remembered here): Check shows it available with its Download, never Downloading… with no action", async () => {
  const { fake } = open({ section: "updates", updater: { mode: "automatic", status: { state: "available", version: "0.10.0" } } });
  await settle();
  fake.updater.check.mockResolvedValueOnce({ state: "available", version: "0.10.0" });
  await act(async () => { fireEvent.click(updates().getByRole("button", { name: "Check for updates" })); });
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.10\.0 availableDownload$/);
  expect(within(appRow()!).queryByRole("progressbar")).toBeNull();
  await act(async () => { fireEvent.click(within(appRow()!).getByRole("button", { name: "Download" })); });
  expect(fake.updater.download).toHaveBeenCalledTimes(1);
});

test("focus stays on the action it was on when the app says available before it answers the cancel: the Download that replaces Cancel has it", async () => {
  for (const place of ["settings", "notice"] as const) {
    const { fake } = open({ section: "updates", notice: true, updater: { mode: "automatic", status: { state: "downloading", version: "0.10.0", progress: 0.4 } } });
    await settle();
    const home = () => place === "settings" ? appRow()! : noticeBox();
    const cancel = within(home()).getByRole("button", { name: "Cancel download" });
    cancel.focus();
    let answer!: () => void;
    fake.updater.cancel.mockImplementationOnce(() => new Promise<void>((resolve) => { answer = resolve; }));
    await act(async () => { fireEvent.click(cancel); });
    // The status arrives first, on its own; the answer to the call after it.
    act(() => fake.push({ state: "available", version: "0.10.0" }));
    expect(document.activeElement).toBe(within(home()).getByRole("button", { name: "Download" }));
    await act(async () => { answer(); });
    expect(document.activeElement).toBe(within(home()).getByRole("button", { name: "Download" }));
    cleanup();
    delete (window as { __sidevoiceHost?: unknown }).__sidevoiceHost;
  }
});

test("a download that cannot be cancelled says so in its line and in the room's notice, and goes on downloading", async () => {
  const { fake } = open({ section: "updates", notice: true, updater: { mode: "manual", status: { state: "downloading", version: "0.10.0", progress: 0.4 } } });
  await settle();
  for (const home of [() => appRow()!, noticeBox]) {
    fake.updater.cancel.mockRejectedValueOnce(new Error("boom"));
    await act(async () => { fireEvent.click(within(home()).getByRole("button", { name: "Cancel download" })); });
    expect(within(home()).getByRole("alert")).toHaveTextContent("The download couldn't be cancelled.");
    expect(within(home()).getByRole("button", { name: "Cancel download" })).toBeInTheDocument();
  }
  expect(within(appRow()!).getByRole("progressbar")).toBeInTheDocument();
});

test.each(["en", "es", "de", "fr", "it", "pl", "ja", "zh-Hans"])("Cancel's accessible name is its visible label, described by the line (%s)", async (language) => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: language }));
  onTestFinished(() => localStorage.removeItem("sidevoice.settings"));
  open({ section: "updates", updater: { mode: "manual", status: { state: "downloading", version: "0.10.0", progress: 0.4 } } });
  await settle();
  const cancel = within(appRow()!).getByRole("button");
  expect(cancel).not.toHaveAttribute("aria-label");
  expect(within(appRow()!).getByRole("button", { name: cancel.textContent!.trim() })).toBe(cancel);
  expect(cancel).toHaveAccessibleDescription(appRow()!.querySelector(".update-action-copy")!.textContent!);
});

const FAILURES = [
  { code: "update-check-failed", state: "idle", en: "Couldn't check for updates.", es: "No se pudo comprobar si hay actualizaciones.", retry: "check", button: "Check for updates", boton: "Buscar actualizaciones" },
  { code: "update-download-failed", state: "available", en: "The update couldn't be downloaded.", es: "No se pudo descargar la actualización.", retry: "download", button: "Retry download", boton: "Reintentar la descarga" },
  { code: "update-install-failed", state: "ready", en: "The update couldn't be installed.", es: "No se pudo instalar la actualización.", retry: null, button: null, boton: null },
] as const;

test("each failure is said where it happened: a check's under the installed version, Check for updates trying it again (no Retry of its own); a download's in its line, with Retry download; an install is tried again by Restart to update", async () => {
  for (const { code, state, en, retry, button } of FAILURES) {
    const { fake } = open({ section: "updates", updater: { status: { state, version: "0.10.0", error: { code } }, mode: "manual" } });
    const alert = await updates().findByRole("alert");
    expect(alert, code).toHaveTextContent(en);
    // A check's is under the installed version's line; a download's or an install's in the new version's line.
    if (code === "update-check-failed") {
      // Nothing found to have a line; never Up to date beside a failure; no Retry: Check for updates retries.
      expect(appRow()).toBeNull();
      expect(alert).toHaveClass("app-update-failure");
      expect(alert.closest(".app-update-settings")).not.toBeNull();
      expect(installedLine()!.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(pane("updates")).not.toHaveTextContent("Up to date");
      expect(updates().queryByRole("button", { name: /^Retry/ })).toBeNull();
    } else {
      expect(appRow()).toContainElement(alert);
      expect(alert.closest(".update-action")).toBeNull();
    }
    if (retry) {
      await act(async () => { fireEvent.click(updates().getByRole("button", { name: button! })); });
      expect(fake.updater[retry], code).toHaveBeenCalledTimes(1);
    } else {
      expect(updates().queryByRole("button", { name: /^Retry/ })).toBeNull();
      await act(async () => { fireEvent.click(within(appRow()!).getByRole("button", { name: "Restart to update" })); });
      expect(fake.updater.restart).toHaveBeenCalledTimes(1);
    }
    cleanup();
  }
});

test("a check or a download the app rejected is said as that failure, its own words behind Details; Check for updates tries the check again", async () => {
  const { fake } = open({ section: "updates", updater: { status: { state: "available", version: "0.10.0", error: { code: "update-download-failed" } }, mode: "manual" } });
  fake.updater.check.mockRejectedValueOnce(new Error("socket hang up"));
  fake.updater.download.mockRejectedValueOnce(new Error("disk full"));
  await settle();
  await act(async () => { fireEvent.click(updates().getByRole("button", { name: "Check for updates" })); });
  const alert = updates().getAllByRole("alert").find((item) => item.textContent?.includes("Couldn't check for updates."))!;
  expect(alert.querySelector("details")).toHaveTextContent("socket hang up");
  expect(within(alert).queryByRole("button", { name: "Retry" })).toBeNull();
  await act(async () => { fireEvent.click(updates().getByRole("button", { name: "Check for updates" })); });
  expect(fake.updater.check).toHaveBeenCalledTimes(2);
  // The app's status says the download failed: the line's Retry downloads, and a rejected download says so there.
  await act(async () => { fireEvent.click(within(appRow()!).getByRole("button", { name: "Retry download" })); });
  expect(fake.updater.download).toHaveBeenCalledTimes(1);
  expect(within(appRow()!).getByRole("alert")).toHaveTextContent("The update couldn't be downloaded.");
  expect(within(appRow()!).getByRole("alert").querySelector("details")).toHaveTextContent("disk full");
});

test("Check for updates is busy while the app checks — Sidevoice 0.9.0 · Checking… — then Sidevoice 0.9.0 · Up to date, said to a screen reader too, and when it checked is kept", async () => {
  const { fake } = open({ section: "updates", service: SERVICE_CURRENT });
  let answer!: (status: UpdaterStatus) => void;
  fake.updater.check.mockImplementationOnce(() => new Promise<UpdaterStatus>((resolve) => { answer = resolve; }));
  const button = await updates().findByRole("button", { name: "Check for updates" });
  await settle();
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  await act(async () => { fireEvent.click(button); });
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0 · Checking…$/);
  await act(async () => { answer({ state: "idle" }); });
  expect(button).not.toHaveAttribute("aria-busy");
  expect(updates().getByRole("status")).toHaveTextContent(/^Sidevoice is up to date\.$/);
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0 · Up to date(Sidevoice is up to date\.)?$/);
  expect(pane("updates")).not.toHaveTextContent(/Last checked|Not checked yet|Checking…/);
  expect(Number(localStorage.getItem(CHECKED))).toBeGreaterThan(0);
});

test("Check for updates in manual mode that finds one: its row's Download in view and focused, the row lit", async () => {
  const { fake } = open({ section: "updates", updater: { mode: "manual" } });
  await settle();
  fake.updater.check.mockResolvedValueOnce({ state: "available", version: "0.10.0" });
  await act(async () => { fireEvent.click(updates().getByRole("button", { name: "Check for updates" })); });
  await landsOn(() => within(appRow()!).getByRole("button", { name: "Download" }), appRow);
  expect(pane("updates")).not.toHaveTextContent("Sidevoice is up to date.");
});

test("Check for updates in automatic mode that finds one: Sidevoice 0.10.0 available · Download, in view and focused — the app's status is the truth, whether or not it downloads by itself", async () => {
  const { fake } = open({ section: "updates", updater: { mode: "automatic" } });
  await settle();
  fake.updater.check.mockResolvedValueOnce({ state: "available", version: "0.10.0" });
  await act(async () => { fireEvent.click(updates().getByRole("button", { name: "Check for updates" })); });
  await landsOn(() => within(appRow()!).getByRole("button", { name: "Download" }), appRow);
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.10\.0 availableDownload$/);
  expect(appRow()).toHaveAttribute("data-state", "available");
});

test("when it last checked is kept: on the next visit, Up to date at once; an update the app found by itself counts as a check, a failed check doesn't", async () => {
  const before = Date.parse("2026-10-12T09:30:00Z");
  localStorage.setItem(CHECKED, String(before));
  const { fake } = open({ section: "updates", service: SERVICE_CURRENT });
  await updates().findByRole("button", { name: "Check for updates" });
  await waitFor(() => expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0 · Up to date$/));
  await settle();
  await act(async () => { fake.push({ state: "available", version: "0.10.0" }); });
  expect(Number(localStorage.getItem(CHECKED))).toBeGreaterThan(before);
  localStorage.setItem(CHECKED, String(before));
  fake.updater.check.mockResolvedValueOnce({ state: "idle", error: { code: "update-check-failed" } });
  await act(async () => { fireEvent.click(updates().getByRole("button", { name: "Check for updates" })); });
  expect(Number(localStorage.getItem(CHECKED))).toBe(before);
});

test("Updates says the app's mode with its hint, and a change shows what the app answers", async () => {
  const { fake } = open({ section: "updates", updater: { mode: "manual" } });
  const modes = await updates().findByRole("radiogroup", { name: "Updates" });
  const radio = (name: string) => within(modes).getByRole("radio", { name });
  expect(radio("Manual")).toHaveAttribute("aria-checked", "true");
  expect(pane("updates")).toHaveTextContent("You're told when one is out, and download it when you choose.");
  await act(async () => { fireEvent.click(radio("Automatic (recommended)")); });
  expect(fake.updater.setMode).toHaveBeenCalledWith("automatic");
  expect(radio("Automatic (recommended)")).toHaveAttribute("aria-checked", "true");
  expect(pane("updates")).toHaveTextContent("They download by themselves; you restart when it suits you.");
  // The app kept automatic when asked for manual: automatic is what shows.
  fake.updater.setMode.mockResolvedValueOnce({ mode: "automatic" });
  await act(async () => { fireEvent.click(radio("Manual")); });
  expect(radio("Automatic (recommended)")).toHaveAttribute("aria-checked", "true");
  expect(updates().queryByRole("alert")).toBeNull();
});

test("an app that can't say its mode is on automatic; a change it couldn't make goes back and says so", async () => {
  open({ section: "updates", updater: {}, prepare: (fake) => {
    fake.updater.settings.mockRejectedValueOnce(new Error("nope"));
    fake.updater.setMode.mockRejectedValueOnce(new Error("disk"));
  } });
  const modes = await updates().findByRole("radiogroup", { name: "Updates" });
  const radio = (name: string) => within(modes).getByRole("radio", { name });
  expect(radio("Automatic (recommended)")).toHaveAttribute("aria-checked", "true");
  await act(async () => { fireEvent.click(radio("Manual")); });
  expect(radio("Automatic (recommended)")).toHaveAttribute("aria-checked", "true");
  expect(updates().getByRole("alert")).toHaveTextContent("Couldn't change it. Try again.");
  await act(async () => { fireEvent.click(radio("Manual")); });
  expect(radio("Manual")).toHaveAttribute("aria-checked", "true");
  expect(updates().queryByRole("alert")).toBeNull();
});

test("each part shows where the app has its method: no settings or setMode, no Updates; no check, no Check for updates", async () => {
  const { fake } = open({ section: "updates", updater: { without: ["settings"] } });
  expect(await updates().findByRole("button", { name: "Check for updates" })).toBeInTheDocument();
  await settle();
  expect(updates().queryByRole("radiogroup", { name: "Updates" })).toBeNull();
  expect(fake.updater.status).toHaveBeenCalled();
  cleanup();
  open({ section: "updates", updater: { without: ["check"] } });
  expect(await updates().findByRole("radiogroup", { name: "Updates" })).toBeInTheDocument();
  expect(updates().queryByRole("button", { name: "Check for updates" })).toBeNull();
});

test("this computer's service behind what the app bundles: under Sidevoice 0.9.0, Update available · Update Sidevoice, which updates it; no version in its words, no number of its own", async () => {
  const { update } = open({ section: "updates", service: BUNDLED });
  const row = group("Sidevoice");
  const button = await within(row).findByRole("button", { name: "Update Sidevoice" });
  // Sidevoice's version said once, on the installed version's line above (no Version line); the service's new one is
  // not the app's, so it is not said; its line says no version at all.
  expect(row.querySelector(".host-status-product")).toBeNull();
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  expect(button.closest(".update-action")).toHaveTextContent(/^Update availableUpdate Sidevoice$/);
  expect(button.closest(".update-action-row")).not.toHaveAttribute("id");
  expect(installedLine()!.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(pane("updates")).not.toHaveTextContent("0.9.1");
  expect(screen.getAllByRole("button", { name: "Update Sidevoice" })).toHaveLength(1);
  await act(async () => { fireEvent.click(button); });
  expect(update).toHaveBeenCalledTimes(1);
});

test("this computer's Update waits for active calls", async () => {
  const { update } = open({ section: "updates", service: BUNDLED, status: { ...running, calls: 2 } });
  expect(await updates().findByText("Wait for 2 active calls to finish before updating.")).toBeInTheDocument();
  expect(updates().getByRole("button", { name: "Update Sidevoice" })).toBeDisabled();
  expect(update).not.toHaveBeenCalled();
});

test("this computer's Update, done: asked again, and gone once current", async () => {
  const current: LocalHostVersion = { ...BUNDLED, update: "current" };
  const answers = [BUNDLED, BUNDLED, current];
  const { update, version } = open({ section: "updates", service: async () => answers.shift() ?? current });
  const button = await updates().findByRole("button", { name: "Update Sidevoice" });
  await act(async () => { fireEvent.click(button); });
  expect(update).toHaveBeenCalledOnce();
  await waitFor(() => expect(updates().queryByRole("button", { name: "Update Sidevoice" })).toBeNull());
  expect(version).toHaveBeenCalledTimes(3);
});

test("this computer's Update failing: said, with details to copy that leave out what the bridge must not repeat and the installer's log redacted", async () => {
  const update = vi.fn().mockRejectedValue({ key: "SV1.private-pairing-code", step: "token-secret", params: { check: "archive-link", token: "raw-token" },
    log_tail: ["staging C:\\Users\\Demo Person\\AppData\\Local\\Sidevoice", "secret=demo-secret", "service exited with code 1"] });
  open({ section: "updates", service: BUNDLED, update });
  const writeText = vi.fn(async (_value: string) => {});
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    const button = await updates().findByRole("button", { name: "Update Sidevoice" });
  await act(async () => { fireEvent.click(button); });
    expect(await updates().findByRole("alert")).toHaveTextContent("Sidevoice could not prepare this computer.");
    expect(updates().getByRole("button", { name: "Retry updating Sidevoice" })).toBeInTheDocument();
    await act(async () => { fireEvent.click(updates().getByRole("button", { name: "Copy details" })); });
    const copied = writeText.mock.calls[0][0];
    expect(JSON.parse(copied)).toEqual({ key: "install.unknown", params: { check: "archive-link" },
      log_tail: ["staging ~\\AppData\\Local\\Sidevoice", "secret=•••", "service exited with code 1"] });
    expect(copied).not.toMatch(/SV1\.private-pairing-code|token-secret|raw-token|Demo Person|demo-secret/);
    // Copied only: no log line on screen.
    expect(updates().queryByText(/staging|secret=|exited with code/)).toBeNull();
  } finally {
    if (previous) Object.defineProperty(navigator, "clipboard", previous);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

test("a newer one installed when Update is pressed is never downgraded", async () => {
  const newer: LocalHostVersion = { ...BUNDLED, update: "newer-installed" };
  const answers = [BUNDLED, newer];
  const { update } = open({ section: "updates", service: async () => answers.shift() ?? newer });
  const button = await updates().findByRole("button", { name: "Update Sidevoice" });
  await act(async () => { fireEvent.click(button); });
  expect(await updates().findByText("A newer Sidevoice core is already installed. Update the desktop app to use it.")).toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
});

test.each([
  ["newer-installed", "A newer Sidevoice core is already installed. Update the desktop app to use it."],
  ["incompatible", "This machine reports core API 9, which this app cannot use."],
] as const)("no Update when the bridge says %s: why, instead", async (state, copy) => {
  open({ section: "updates", service: { ...BUNDLED, core_api: 9, update: state } });
  expect(await updates().findByText(copy)).toBeInTheDocument();
  expect(updates().queryByRole("button", { name: "Update Sidevoice" })).toBeNull();
});

test("this computer's service with no version and nothing to say: the one row is the app's alone, Sidevoice 0.9.0", async () => {
  open({ section: "updates", status: { ...running, product_version: undefined }, service: { ...BUNDLED, update: "current" } });
  await settle();
  expect(groups()).toEqual(["Sidevoice"]);
  expect(group("Sidevoice").querySelector(".host-status-product, .updates-settings-version")).toBeNull();
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  expect(group("Sidevoice").querySelector(".update-action-row")).toBeNull();
  expect(updates().queryByRole("button", { name: /Update Sidevoice/ })).toBeNull();
});

test("a nightly with no updater: Updates says so under its version, updated by hand; no Automatic/Manual, no Check, no Update", async () => {
  open({ build: NIGHTLY, section: "updates", service: BUNDLED });
  await settle();
  // With no updater, its Version line, as before, its note under it.
  expect(group("Sidevoice").querySelector(".updates-settings-version .host-status-product")).toHaveTextContent(/^Version 0\.10\.0-nightly$/);
  expect(installedLine()).toBeNull();
  const note = pane("updates").querySelector(".host-status-build")!;
  expect(note).toHaveTextContent("Nightly · abcdef0 · 2026-10-13 — updates by hand");
  const link = within(note as HTMLElement).getByRole("link", { name: /updates by hand/ });
  expect(link).toHaveAttribute("href", "https://github.com/sidevoice/sidevoice-desktop/releases/tag/nightly");
  expect(link).toHaveAttribute("target", "_blank");
  expect(screen.queryByRole("radiogroup", { name: "Updates" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Check for updates|Update Sidevoice/ })).toBeNull();
});

test("a nightly with an updater (desktop #56, for now) updates as a release: no 'by hand', its controls, its found update first, then this computer's Update", async () => {
  open({ build: NIGHTLY, section: "updates", service: BUNDLED, updater: { mode: "manual", status: { state: "available", version: "0.11.0-nightly" } } });
  await settle();
  const note = pane("updates").querySelector(".host-status-build")!;
  expect(note).toHaveTextContent(/^Nightly · abcdef0 · 2026-10-13$/);
  expect(within(note as HTMLElement).queryByRole("link")).toBeNull();
  // Its note alone above the row, no Version line: its version is the installed version's line's to say.
  expect(group("Sidevoice").querySelector(".host-status-product")).toBeNull();
  const modes = await updates().findByRole("radiogroup", { name: "Updates" });
  expect(note.compareDocumentPosition(modes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.10\.0-nightly$/);
  expect(updates().getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.11\.0-nightly availableDownload$/);
  expect(within(appRow()!).getByRole("button", { name: "Download" })).toBeInTheDocument();
  // The one row's one button: the service's waits behind the app's.
  expect(updates().queryByRole("button", { name: "Update Sidevoice" })).toBeNull();
  cleanup();
  open({ build: NIGHTLY, section: "updates", service: BUNDLED, updater: { mode: "manual" } });
  expect(await updates().findByRole("button", { name: "Update Sidevoice" })).toBeInTheDocument();
});

test("a development build: Development build under its version, no updater's controls, no Update", async () => {
  open({ build: DEV, section: "updates", service: BUNDLED });
  await settle();
  expect(group("Sidevoice").querySelector(".updates-settings-version .host-status-product")).toHaveTextContent(/^Version 0\.10\.0-dev$/);
  expect(pane("updates").querySelector(".host-status-build")).toHaveTextContent(/^Development build$/);
  expect(screen.queryByRole("link", { name: /updates by hand/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Check for updates|Update Sidevoice/ })).toBeNull();
});

test("in the desktop app, a remote machine behind: this computer's one row, then the machine — its versions, the command to run there — and the description says machines too", async () => {
  const other: PairingSummary = { ...lab, fp: "fp-nuc", host: "NUC", device_id: "d-nuc" };
  open({ section: "updates", machines: [lab, other], remote: { "fp-lab": behind(), "fp-nuc": { state: "connected", checkedAt: 1, version: "0.5.0", update: null } } });
  await settle();
  expect(groups()).toEqual(["Sidevoice", "Remote machines"]);
  expect(updates().getByText("Sidevoice on this computer, and the machines whose Sidevoice is behind: their versions, and how they update.")).toBeInTheDocument();
  // Only the one behind; the one up to date is not listed.
  expect(machineRows()).toEqual([["Lab box", "0.4.0 · 0.5.0 available", "Run this on Lab box:", COMMAND]]);
  expect(updates().getByRole("button", { name: "Copy the command for Lab box" })).toBeInTheDocument();
});

test("a machine behind that names no command of its own: the documented one, npx sidevoice@latest install — never a placeholder", async () => {
  open({ section: "updates", machines: [lab], remote: { "fp-lab": { state: "connected", checkedAt: 1, version: "0.4.0", update: { latest: "0.5.0", command: null } } } });
  await settle();
  expect(SIDEVOICE_UPDATE_COMMAND).toBe("npx sidevoice@latest install");
  expect(machineRows()).toEqual([["Lab box", "0.4.0 · 0.5.0 available", "Run this on Lab box:", "npx sidevoice@latest install"]]);
  expect(updates().getByRole("button", { name: "Copy the command for Lab box" })).toBeInTheDocument();
});

test("in a browser: no Updates section while no machine is behind", () => {
  open({ build: null, section: "general", machines: [lab], remote: { "fp-lab": { state: "connected", checkedAt: 1, version: "0.5.0", update: null } } });
  expect(entry()).toBeNull();
  expect(document.getElementById("pane-updates")).toBeNull();
});

test("in a browser, a machine behind: Updates lists only the machines — no app, no service — and goes as the machine is updated", async () => {
  const unnamed: PairingSummary = { ...lab, fp: "fp-x", host: "", device_id: "d-x" };
  const { store } = open({ build: null, section: "updates", machines: [lab, unnamed], remote: { "fp-lab": behind(), "fp-x": behind(null, "npx sidevoice@latest install") } });
  await settle();
  expect(entry()).toHaveTextContent(/^Updates$/);
  expect(updates().getByText("Machines whose Sidevoice is behind, and how to update them.")).toBeInTheDocument();
  expect(groups()).toEqual(["Remote machines"]);
  expect(pane("updates").querySelector(".app-update-settings")).toBeNull();
  expect(machineRows()).toEqual([
    ["Lab box", "0.4.0 · 0.5.0 available", "Run this on Lab box:", COMMAND],
    ["Unnamed machine", "Version 0.5.0 available", "Run this on Unnamed machine:", "npx sidevoice@latest install"],
  ]);
  // Updated (and the other forgotten): no machine behind, no section, and Settings is back where the person can be.
  act(() => { store.patch({ pairings: [lab], remoteHostStatus: { "fp-lab": { state: "connected", checkedAt: 2, version: "0.5.0", update: null } } } as never); });
  expect(entry()).toBeNull();
  expect(document.getElementById("pane-updates")).toBeNull();
  expect(store.getState().facts.settingsSection).toBe("general");
});

test("a machine forgotten while it was behind: no longer listed, and in a browser no section for it", async () => {
  open({ build: null, section: "general", machines: [], remote: { "fp-lab": behind() } });
  await settle();
  expect(entry()).toBeNull();
});

/* Landing: This device's Update available and a link to a machine's row open Updates on the row's action, in view
 * and focused, the row lit; the room's notice is this computer's alone, the app's Download and Restart done in place
 * (UpdateNotice.test.tsx). */

test("This device's Update available, this computer's service behind: Updates, its Update Sidevoice focused, its line lit — not the version, not the card", async () => {
  const { store } = open({ service: BUNDLED, notice: true });
  // The room says nothing of it: the service is Sidevoice's, said here.
  await settle();
  expect(document.querySelector(".update-notice")).toBeNull();
  const link = await within(pane("this-computer")).findByRole("button", { name: "Update available, see it in Updates" });
  await act(async () => { fireEvent.click(link); });
  expect([store.getState().facts.settingsSection, store.getState().facts.settingsLevel]).toEqual(["updates", "page"]);
  await landsOn(() => document.getElementById("updates-this-computer"), lineOf(() => document.getElementById("updates-this-computer")));
  expect(document.activeElement).toHaveAccessibleName("Update Sidevoice");
  expect(store.getState().facts.settingsFocus).toBeNull();
});

test("a remote machine behind: the room's notice says nothing of it; Updates has its row and its command, a landing there focusing its Copy, its row lit", async () => {
  const { store } = open({ section: "general", machines: [lab], remote: { "fp-lab": behind() }, notice: true });
  await settle();
  // The room: no notice, no See updates, no words for the machine; it is its row's in Updates to say.
  expect(document.querySelector(".update-notice")).toBeNull();
  expect(screen.queryByRole("button", { name: "See updates" })).toBeNull();
  expect(document.body).not.toHaveTextContent("Lab box needs an update");
  expect(machineRows()).toEqual([["Lab box", "0.4.0 · 0.5.0 available", "Run this on Lab box:", COMMAND]]);
  // A landing on the machine's row (as a link to it asks): its command's Copy, in view and focused, its row lit.
  act(() => { store.patch({ settingsSection: "updates", settingsLevel: "page", settingsFocus: "updates-machine-fp-lab" }); });
  await landsOn(() => updates().getByRole("button", { name: "Copy the command for Lab box" }), () => document.getElementById("updates-machine-fp-lab"));
  expect(document.querySelector(".update-notice")).toBeNull();
});

test("the room's notice: the app's Download downloads in place, Settings left where it was", async () => {
  const { fake, store } = open({ section: "general", updater: { mode: "manual", status: { state: "available", version: "0.10.0" } }, notice: true });
  const download = await screen.findByRole("button", { name: "Download", description: "Version 0.10.0 available" });
  await act(async () => { fireEvent.click(download); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  expect(store.getState().facts.settingsSection).toBe("general");
});

test("in Spanish: Actualizaciones, its one row, Sidevoice — Sidevoice 0.10.0 disponible · Descargar, then the service's Actualización disponible · Actualizar Sidevoice — a machine behind and This device's Actualización disponible", async () => {
  inSpanish();
  open({ section: "updates", machines: [lab], remote: { "fp-lab": behind() }, service: BUNDLED, updater: { mode: "manual", status: { state: "available", version: "0.10.0" } } });
  await settle();
  expect(entry()).toHaveTextContent(/^Actualizaciones$/);
  expect(groups()).toEqual(["Sidevoice", "Máquinas remotas"]);
  expect(updates().getByText("Sidevoice en este ordenador y las máquinas con un Sidevoice anterior: sus versiones y cómo se actualizan.")).toBeInTheDocument();
  expect(group("Sidevoice").querySelector(".updates-part-hint")).toBeNull();
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.10\.0 disponibleDescargar$/);
  expect(within(appRow()!).getByRole("button", { name: "Descargar", description: "Sidevoice 0.10.0 disponible" })).toBeInTheDocument();
  expect(machineRows()).toEqual([["Lab box", "0.4.0 · 0.5.0 disponible", "Ejecuta esto en Lab box:", COMMAND]]);
  expect(updates().getByRole("button", { name: "Copiar el comando para Lab box" })).toBeInTheDocument();
  expect(within(pane("this-computer")).getByRole("button", { name: "Actualización disponible, verla en Actualizaciones", hidden: true })).toHaveTextContent(/^Actualización disponible$/);
  cleanup();
  // Only the service behind: the row's one button, Actualizar Sidevoice, with no version in its words.
  open({ section: "updates", service: BUNDLED });
  const button = await updates().findByRole("button", { name: "Actualizar Sidevoice" });
  expect(button.closest(".update-action")).toHaveTextContent(/^Actualización disponibleActualizar Sidevoice$/);
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
});

test("in Spanish: Automáticas (recomendado) | Manuales, Buscar actualizaciones (which tries a failed check again), each failure — never Al día beside one — and a nightly que se actualiza a mano", async () => {
  inSpanish();
  localStorage.setItem(CHECKED, String(Date.parse("2026-10-12T09:30:00Z")));
  for (const { code, state, es, retry, boton } of FAILURES) {
    open({ section: "updates", service: SERVICE_CURRENT, updater: { status: { state, version: "0.10.0", error: { code } }, mode: "manual" } });
    const modes = await updates().findByRole("radiogroup", { name: "Actualizaciones" });
    expect(within(modes).getByRole("radio", { name: "Manuales" })).toHaveAttribute("aria-checked", "true");
    expect(within(modes).getByRole("radio", { name: "Automáticas (recomendado)" })).toBeInTheDocument();
    expect(updates().getByRole("button", { name: "Buscar actualizaciones" })).toBeInTheDocument();
    expect(installed()).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
    expect(pane("updates")).not.toHaveTextContent(/Última comprobación|Al día/);
    expect(updates().getByRole("alert")).toHaveTextContent(es);
    if (retry) expect(updates().getByRole("button", { name: boton! })).toBeInTheDocument();
    else {
      expect(appRow()).toHaveTextContent(/^Sidevoice 0\.10\.0 listaReiniciar para actualizar/);
      expect(within(appRow()!).getByRole("button", { name: "Reiniciar para actualizar" })).toBeInTheDocument();
    }
    if (retry === "check") expect(updates().queryByRole("button", { name: /^Reintentar/ })).toBeNull();
    cleanup();
  }
  open({ build: NIGHTLY, section: "updates" });
  expect(pane("updates").querySelector(".host-status-build")).toHaveTextContent("Nightly · abcdef0 · 2026-10-13 — se actualiza a mano (se abre en una pestaña nueva)");
  cleanup();
  open({ build: DEV, section: "updates" });
  expect(pane("updates").querySelector(".host-status-build")).toHaveTextContent(/^Versión de desarrollo$/);
});

/* Developer mode (developer-mode.ts): ten clicks within five seconds on the version in Updates, in a nightly only. The
 * version is Sidevoice's installed line with the app's updater, else the Version line of this computer's card. */

const developerKept = () => {
  onTestFinished(() => localStorage.removeItem(DEVELOPER_MODE_KEY));
  return () => localStorage.getItem(DEVELOPER_MODE_KEY);
};
const clickTimes = (element: Element, times: number) => { for (let i = 0; i < times; i++) fireEvent.click(element); };

test("ten clicks on the installed version of a nightly turn developer mode on and add Developer options below Advanced; ten more turn it off", async () => {
  const kept = developerKept();
  open({ build: NIGHTLY, section: "updates", updater: {} });
  await settle();
  expect(navOrder().at(-1)).toBe("advanced");
  clickTimes(installed(), 9);
  expect(navOrder().at(-1)).toBe("advanced");
  expect(within(installed()).queryByRole("status")).toBeNull();
  clickTimes(installed(), 1);
  expect(navOrder().slice(-2)).toEqual(["advanced", "developer"]);
  expect(kept()).toBe("1");
  // Said beside the version, and to a screen reader once.
  expect(installed()).toHaveTextContent(/^Sidevoice 0\.10\.0-nightly · Developer mode on/);
  expect(within(installed()).getByRole("status")).toHaveTextContent("Developer mode on");
  clickTimes(installed(), 10);
  expect(navOrder().at(-1)).toBe("advanced");
  expect(kept()).toBeNull();
  expect(within(installed()).getByRole("status")).toHaveTextContent("Developer mode off");
});

test("the version of a nightly with no updater is the way in too", async () => {
  const kept = developerKept();
  open({ build: NIGHTLY, section: "updates" });
  await settle();
  const version = pane("updates").querySelector<HTMLElement>(".updates-settings-version .host-status-product")!;
  expect(version).toHaveTextContent(/^Version 0\.10\.0-nightly/);
  clickTimes(version, 10);
  expect(navOrder().slice(-2)).toEqual(["advanced", "developer"]);
  expect(kept()).toBe("1");
  expect(within(version).getByRole("status")).toHaveTextContent("Developer mode on");
});

test.each([["release", RELEASE], ["development", DEV]])("on a %s build the version is only text: ten clicks add nothing and keep nothing", async (_, build) => {
  const kept = developerKept();
  open({ build, section: "updates", updater: {} });
  await settle();
  clickTimes(installed(), 10);
  expect(navOrder().at(-1)).toBe("advanced");
  expect(kept()).toBeNull();
  expect(within(installed()).queryByRole("status")).toBeNull();
});

test("This device's card does not take the gesture: its version is only text", async () => {
  const kept = developerKept();
  open({ build: NIGHTLY, service: BUNDLED, updater: {} });
  await settle();
  await waitFor(() => expect(deviceLine()).toHaveTextContent(/^Sidevoice 0\.10\.0-nightly/));
  clickTimes(deviceLine()!, 10);
  expect(navOrder().at(-1)).toBe("advanced");
  expect(kept()).toBeNull();
});
