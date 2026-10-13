import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { fakeUpdater } from "../../test/updater";
import { UpdatesEntry } from "../updates/UpdatesEntry";
import type { UpdaterStatus } from "../updates/useUpdates";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus, LocalHostVersion } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
const CHECKED = "sidevoice.updates-checked-at";
afterEach(() => {
  cleanup();
  localStorage.removeItem("sidevoice.settings"); localStorage.removeItem(CHECKED);
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
});

/* Updates (decided): a Settings section of their own, holding everything that updates, each row with its action right
 * there once an update is found — the app (its version, Automatic or Manual, Check for updates; Download in manual,
 * its progress, Restart to update in either mode), Sidevoice on this computer (Update when the app bundles a newer
 * one), and each remote machine that is behind, with the command to run there. In the desktop app always; in a browser
 * only while a machine is behind, with only those machines. The sidebar's entry, the rail's rows and a check that finds
 * one land on the row's action, in view and focused. This device's card keeps its version and See updates. */

const local: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
const lab: PairingSummary = { fp: "fp-lab", host: "Lab box", urls: ["https://lab.example"], rv: null, device_id: "d-lab", paired_at: 1_700_000_100, revoked: false };
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.1.0", api: 1 }, calls: 0, product_version: "0.9.0" };
const RELEASE = { channel: "release", version: "0.9.0", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" };
const NIGHTLY = { channel: "nightly", version: "0.10.0-nightly", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" };
const DEV = { channel: "dev", version: "0.10.0-dev" };
const COMMAND = "curl -fsSL https://sidevoice.app/install | sh";
/** What a remote machine says when its Sidevoice is behind (loadMachineInfo, contract gap #57). */
const behind = (version: string | null = "0.4.0", command = COMMAND) => ({ state: "connected", checkedAt: 1, version, update: { latest: "0.5.0", command } });
/** This computer's service, as the bridge says it when the app bundles a newer one. */
const BUNDLED: LocalHostVersion = { bridge: 3, bundled: { version: "0.9.1" }, installed: { version: "0.9.0" }, core_api: 1, update: "available" };

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
  /** The sidebar's foot ("foot") or the rail's icon ("rail") beside Settings. */
  entry?: "foot" | "rail";
  /** Readies the fake updater before the page first asks it. */
  prepare?: (fake: ReturnType<typeof fakeUpdater>) => void;
}

/** The desktop app (its build, its updater on a release), or a browser (`build` null), with Settings at `section`. */
function open({ build = RELEASE, updater, section = "this-computer", machines = [], remote = {}, service = null, update = vi.fn(async () => running), status = running, entry, prepare }: Open = {}) {
  const withUpdater = updater === undefined ? build?.channel === "release" : updater !== false;
  const fake = fakeUpdater(updater || undefined);
  prepare?.(fake);
  const version = typeof service === "function" ? vi.fn(service) : vi.fn(async () => service!);
  if (build) Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { build,
    ...(withUpdater ? { updater: fake.updater } : {}),
    localHost: { state: vi.fn(async () => status), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(),
      ...(service ? { version, update } : {}) } } } });
  window.sidevoiceActions = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), machineDevices: vi.fn().mockResolvedValue([]),
    loadHostAgents: vi.fn(), loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [...(build ? [local] : []), ...machines], machinesReady: true, inApp: !!build, localHostAvailable: !!build,
    localHostStatus: status, remoteHostStatus: remote as never, settingsSection: section,
    machineLinks: Object.fromEntries([...(build ? [local] : []), ...machines].map((pairing) => [pairing.fp, { reach: "ok", via: "node" }])) }); });
  render(<RoomProvider store={store}><SettingsDialog />{entry && <UpdatesEntry compact={entry === "rail"} />}</RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  return { store, fake, update, version };
}

const entry = () => document.getElementById("settings-updates");
const pane = (id: string) => document.getElementById("pane-" + id)!;
const updates = () => within(pane("updates"));
const groups = () => [...pane("updates").querySelectorAll(".ui-group-title")].map((title) => title.textContent);
const group = (name: string) => [...pane("updates").querySelectorAll<HTMLElement>(".ui-group")].find((item) => item.querySelector(".ui-group-title")?.textContent === name)!;
const navOrder = () => [...document.querySelectorAll(".settings-nav > button.ui-nav-item")].map((item) => item.id.replace("settings-", ""));
/** The app's update row, once one is found. */
const appRow = () => document.getElementById("updates-app");
/** Each machine behind as Updates says it: its name, its versions, where to run the command, the command. */
const machineRows = () => [...pane("updates").querySelectorAll(".updates-machine")].map((row) => [
  row.querySelector(".host-status-product")?.textContent, row.querySelector(".host-status-build")?.textContent,
  row.querySelector(".host-agent-where")?.textContent, row.querySelector(".ui-snippet-text")?.textContent]);
const settle = () => act(async () => {});
const inSpanish = () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  onTestFinished(() => localStorage.removeItem("sidevoice.settings"));
};
/** Focus lands where a landing asked, its row lit for a moment. */
async function landsOn(control: () => HTMLElement | null, row?: () => HTMLElement | null) {
  await waitFor(() => expect(document.activeElement).toBe(control()), { timeout: 3000 });
  if (row) expect(row()).toHaveClass("settings-highlight");
}

test("Updates is a section of its own, before Advanced: the app's version, Automatic/Manual and Check for updates, then Sidevoice on this computer", async () => {
  open({ section: "updates" });
  await settle();
  expect(entry()).toHaveTextContent(/^Updates$/);
  expect(navOrder().slice(-3)).toEqual(["machines", "updates", "advanced"]);
  expect(entry()).toHaveAttribute("aria-current", "page");
  expect(updates().getByRole("heading", { name: "Updates", level: 2 })).toBeInTheDocument();
  expect(updates().getByText("The Sidevoice app on this computer: its version, and how it updates.")).toBeInTheDocument();
  // The app, then Sidevoice on this computer; no machine is behind, so no Remote machines.
  expect(groups()).toEqual(["Sidevoice app", "Sidevoice on this computer"]);
  expect(group("Sidevoice app").querySelector(".host-status-product")).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  expect(await updates().findByRole("radiogroup", { name: "Updates" })).toBeInTheDocument();
  expect(updates().getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
  // Nothing found yet: no update row.
  expect(appRow()).toBeNull();
});

test("This device's card keeps only its version and See updates, which opens Updates: no Automatic/Manual, no Check, no Update, no build note", async () => {
  const { store } = open({ build: NIGHTLY, service: BUNDLED, updater: {} });
  await settle();
  const card = pane("this-computer");
  expect(card.querySelector(".host-status-product")).toHaveTextContent("Sidevoice 0.9.0");
  const see = within(card).getByRole("button", { name: "See updates" });
  expect(card.querySelector(".host-status-facts")).toContainElement(see);
  expect(within(card).queryByRole("radiogroup", { name: "Updates" })).toBeNull();
  expect(within(card).queryByRole("button", { name: /Check for updates|Update this machine/ })).toBeNull();
  expect(card.querySelector(".host-status-build, .app-update-settings, .host-update-control")).toBeNull();
  await act(async () => { fireEvent.click(see); });
  expect([store.getState().facts.settingsSection, store.getState().facts.settingsLevel]).toEqual(["updates", "page"]);
  expect(entry()).toHaveAttribute("aria-current", "page");
});

test("manual: an update found shows its row with Download right there; its progress in the row; then Restart to update", async () => {
  const { fake } = open({ section: "updates", updater: { mode: "manual", status: { state: "available", version: "0.10.0" } } });
  await settle();
  const download = within(appRow()!).getByRole("button", { name: "Download Sidevoice 0.10.0" });
  expect(appRow()).toHaveTextContent("Version 0.10.0 available");
  // The row comes before Automatic/Manual and Check, under the version.
  expect(appRow()!.compareDocumentPosition(updates().getByRole("button", { name: "Check for updates" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await act(async () => { fireEvent.click(download); });
  expect(fake.updater.download).toHaveBeenCalledTimes(1);
  act(() => fake.push({ state: "downloading", version: "0.10.0", progress: 0.4 }));
  expect(appRow()).toHaveTextContent(/Downloading 0\.10\.0… ?40\s?%/);
  expect(within(appRow()!).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
  expect(within(appRow()!).queryByRole("button")).toBeNull();
  act(() => fake.push({ state: "ready", version: "0.10.0" }));
  expect(appRow()).toHaveTextContent("Version 0.10.0 ready to install");
  await act(async () => { fireEvent.click(within(appRow()!).getByRole("button", { name: "Restart to update" })); });
  expect(fake.updater.restart).toHaveBeenCalledTimes(1);
});

test("automatic: found, it downloads by itself — no Download, its progress in the row — and ready, Restart to update there too", async () => {
  const { fake } = open({ section: "updates", updater: { mode: "automatic", status: { state: "available", version: "0.10.0" } } });
  await settle();
  expect(appRow()).toHaveTextContent("Version 0.10.0 available");
  expect(within(appRow()!).queryByRole("button")).toBeNull();
  act(() => fake.push({ state: "downloading", version: "0.10.0", progress: 0.7 }));
  expect(within(appRow()!).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "70");
  act(() => fake.push({ state: "ready", version: "0.10.0" }));
  await act(async () => { fireEvent.click(within(appRow()!).getByRole("button", { name: "Restart to update" })); });
  expect(fake.updater.restart).toHaveBeenCalledTimes(1);
  // An update with no version said: said all the same.
  act(() => fake.push({ state: "ready" }));
  expect(appRow()).toHaveTextContent("An update is ready to install");
});

const FAILURES = [
  { code: "update-check-failed", state: "idle", en: "Couldn't check for updates.", es: "No se pudo comprobar si hay actualizaciones.", retry: "check" },
  { code: "update-download-failed", state: "available", en: "The update couldn't be downloaded.", es: "No se pudo descargar la actualización.", retry: "download" },
  { code: "update-install-failed", state: "ready", en: "The update couldn't be installed.", es: "No se pudo instalar la actualización.", retry: null },
] as const;

test("each failure is said where it happened, with Retry for a check or a download; an install is tried again by Restart to update", async () => {
  for (const { code, state, en, retry } of FAILURES) {
    const { fake } = open({ section: "updates", updater: { status: { state, version: "0.10.0", error: { code } }, mode: "manual" } });
    const alert = await updates().findByRole("alert");
    expect(alert, code).toHaveTextContent(en);
    // A check's is under Check for updates; a download's or an install's in the update's row.
    if (code === "update-check-failed") expect(appRow()).toBeNull();
    else expect(appRow()).toContainElement(alert);
    if (retry) {
      await act(async () => { fireEvent.click(updates().getByRole("button", { name: "Retry" })); });
      expect(fake.updater[retry], code).toHaveBeenCalledTimes(1);
    } else {
      expect(updates().queryByRole("button", { name: "Retry" })).toBeNull();
      await act(async () => { fireEvent.click(within(appRow()!).getByRole("button", { name: "Restart to update" })); });
      expect(fake.updater.restart).toHaveBeenCalledTimes(1);
    }
    cleanup();
  }
});

test("a check or a download the app rejected is said as that failure, its own words behind Details", async () => {
  const { fake } = open({ section: "updates", updater: { status: { state: "available", version: "0.10.0", error: { code: "update-download-failed" } }, mode: "manual" } });
  fake.updater.check.mockRejectedValueOnce(new Error("socket hang up"));
  fake.updater.download.mockRejectedValueOnce(new Error("disk full"));
  await settle();
  await act(async () => { fireEvent.click(updates().getByRole("button", { name: "Check for updates" })); });
  const alert = updates().getAllByRole("alert").find((item) => item.textContent?.includes("Couldn't check for updates."))!;
  expect(alert.querySelector("details")).toHaveTextContent("socket hang up");
  await act(async () => { fireEvent.click(within(alert).getByRole("button", { name: "Retry" })); });
  expect(fake.updater.check).toHaveBeenCalledTimes(2);
  // The app's status says the download failed: the row's Retry downloads, and a rejected download says so there.
  await act(async () => { fireEvent.click(within(appRow()!).getByRole("button", { name: "Retry" })); });
  expect(fake.updater.download).toHaveBeenCalledTimes(1);
  expect(within(appRow()!).getByRole("alert")).toHaveTextContent("The update couldn't be downloaded.");
  expect(within(appRow()!).getByRole("alert").querySelector("details")).toHaveTextContent("disk full");
});

test("Check for updates is busy while the app checks, then says it is up to date and when it last checked", async () => {
  const { fake } = open({ section: "updates" });
  let answer!: (status: UpdaterStatus) => void;
  fake.updater.check.mockImplementationOnce(() => new Promise<UpdaterStatus>((resolve) => { answer = resolve; }));
  const button = await updates().findByRole("button", { name: "Check for updates" });
  expect(pane("updates")).not.toHaveTextContent("Last checked");
  await act(async () => { fireEvent.click(button); });
  expect(button).toHaveAttribute("aria-busy", "true");
  await act(async () => { answer({ state: "idle" }); });
  expect(button).not.toHaveAttribute("aria-busy");
  expect(pane("updates")).toHaveTextContent("Sidevoice is up to date.");
  expect(pane("updates")).toHaveTextContent(/Last checked: \S/);
  expect(Number(localStorage.getItem(CHECKED))).toBeGreaterThan(0);
});

test("Check for updates in manual mode that finds one: its row's Download in view and focused, the row lit", async () => {
  const { fake } = open({ section: "updates", updater: { mode: "manual" } });
  await settle();
  fake.updater.check.mockResolvedValueOnce({ state: "available", version: "0.10.0" });
  await act(async () => { fireEvent.click(updates().getByRole("button", { name: "Check for updates" })); });
  await landsOn(() => within(appRow()!).getByRole("button", { name: "Download Sidevoice 0.10.0" }), appRow);
  expect(pane("updates")).not.toHaveTextContent("Sidevoice is up to date.");
});

test("Check for updates in automatic mode that finds one: its row, and focus stays on Check (it downloads by itself)", async () => {
  const { fake } = open({ section: "updates", updater: { mode: "automatic" } });
  await settle();
  fake.updater.check.mockResolvedValueOnce({ state: "available", version: "0.10.0" });
  const check = updates().getByRole("button", { name: "Check for updates" });
  check.focus();
  await act(async () => { fireEvent.click(check); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
  expect(appRow()).toHaveTextContent("Version 0.10.0 available");
  expect(document.activeElement).toBe(check);
});

test("when it last checked is kept: shown on the next visit; an update the app found by itself counts, a failed check doesn't", async () => {
  const before = Date.parse("2026-10-12T09:30:00Z");
  localStorage.setItem(CHECKED, String(before));
  const { fake } = open({ section: "updates" });
  await updates().findByRole("button", { name: "Check for updates" });
  expect(pane("updates")).toHaveTextContent(/Last checked: .*2026/);
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

test("Sidevoice on this computer behind what the app bundles: Version X available and Update in its row, which updates it", async () => {
  const { update } = open({ section: "updates", service: BUNDLED });
  const service = group("Sidevoice on this computer");
  expect(service.querySelector(".host-status-product")).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  const button = await within(service).findByRole("button", { name: "Update this machine" });
  expect(button.closest(".update-action")).toHaveTextContent("Version 0.9.1 available");
  expect(screen.getAllByRole("button", { name: "Update this machine" })).toHaveLength(1);
  await act(async () => { fireEvent.click(button); });
  expect(update).toHaveBeenCalledTimes(1);
});

test("this computer's Update waits for active calls", async () => {
  const { update } = open({ section: "updates", service: BUNDLED, status: { ...running, calls: 2 } });
  expect(await updates().findByText("Wait for 2 active calls to finish before updating.")).toBeInTheDocument();
  expect(updates().getByRole("button", { name: "Update this machine" })).toBeDisabled();
  expect(update).not.toHaveBeenCalled();
});

test("this computer's Update, done: asked again, and gone once current", async () => {
  const current: LocalHostVersion = { ...BUNDLED, update: "current" };
  const answers = [BUNDLED, BUNDLED, current];
  const { update, version } = open({ section: "updates", service: async () => answers.shift() ?? current });
  const button = await updates().findByRole("button", { name: "Update this machine" });
  await act(async () => { fireEvent.click(button); });
  expect(update).toHaveBeenCalledOnce();
  await waitFor(() => expect(updates().queryByRole("button", { name: "Update this machine" })).toBeNull());
  expect(version).toHaveBeenCalledTimes(3);
});

test("this computer's Update failing: said, with details to copy that leave out what the bridge must not repeat", async () => {
  const update = vi.fn().mockRejectedValue({ key: "SV1.private-pairing-code", step: "token-secret", params: { check: "archive-link", token: "raw-token" } });
  open({ section: "updates", service: BUNDLED, update });
  const writeText = vi.fn(async (_value: string) => {});
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    const button = await updates().findByRole("button", { name: "Update this machine" });
  await act(async () => { fireEvent.click(button); });
    expect(await updates().findByRole("alert")).toHaveTextContent("Sidevoice could not prepare this computer.");
    expect(updates().getByRole("button", { name: "Retry update" })).toBeInTheDocument();
    await act(async () => { fireEvent.click(updates().getByRole("button", { name: "Copy details" })); });
    const copied = writeText.mock.calls[0][0];
    expect(JSON.parse(copied)).toEqual({ key: "install.unknown", params: { check: "archive-link" } });
    expect(copied).not.toMatch(/SV1\.private-pairing-code|token-secret|raw-token/);
  } finally {
    if (previous) Object.defineProperty(navigator, "clipboard", previous);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

test("a newer one installed when Update is pressed is never downgraded", async () => {
  const newer: LocalHostVersion = { ...BUNDLED, update: "newer-installed" };
  const answers = [BUNDLED, newer];
  const { update } = open({ section: "updates", service: async () => answers.shift() ?? newer });
  const button = await updates().findByRole("button", { name: "Update this machine" });
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
  expect(updates().queryByRole("button", { name: "Update this machine" })).toBeNull();
});

test("Sidevoice on this computer with no version and no update to say: no empty card", async () => {
  open({ section: "updates", status: { ...running, product_version: undefined }, service: { ...BUNDLED, update: "current" } });
  await settle();
  expect(groups()).toEqual(["Sidevoice app"]);
});

test("a nightly with no updater: Updates says so under its version, updated by hand; no Automatic/Manual, no Check, no Update", async () => {
  open({ build: NIGHTLY, section: "updates", service: BUNDLED });
  await settle();
  const note = pane("updates").querySelector(".host-status-build")!;
  expect(note).toHaveTextContent("Nightly · abcdef0 · 2026-10-13 — updates by hand");
  const link = within(note as HTMLElement).getByRole("link", { name: /updates by hand/ });
  expect(link).toHaveAttribute("href", "https://github.com/sidevoice/sidevoice-desktop/releases/tag/nightly");
  expect(link).toHaveAttribute("target", "_blank");
  expect(screen.queryByRole("radiogroup", { name: "Updates" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Check for updates|Update this machine/ })).toBeNull();
});

test("a nightly with an updater (desktop #56, for now) updates as a release: no 'by hand', its controls, its found update and this computer's Update", async () => {
  open({ build: NIGHTLY, section: "updates", service: BUNDLED, updater: { mode: "manual", status: { state: "available", version: "0.11.0-nightly" } } });
  await settle();
  const note = pane("updates").querySelector(".host-status-build")!;
  expect(note).toHaveTextContent(/^Nightly · abcdef0 · 2026-10-13$/);
  expect(within(note as HTMLElement).queryByRole("link")).toBeNull();
  expect(await updates().findByRole("radiogroup", { name: "Updates" })).toBeInTheDocument();
  expect(updates().getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
  expect(within(appRow()!).getByRole("button", { name: "Download Sidevoice 0.11.0-nightly" })).toBeInTheDocument();
  expect(await updates().findByRole("button", { name: "Update this machine" })).toBeInTheDocument();
});

test("a development build: Development build under its version, no updater's controls, no Update", async () => {
  open({ build: DEV, section: "updates", service: BUNDLED });
  await settle();
  expect(pane("updates").querySelector(".host-status-build")).toHaveTextContent(/^Development build$/);
  expect(screen.queryByRole("link", { name: /updates by hand/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Check for updates|Update this machine/ })).toBeNull();
});

test("in the desktop app, a remote machine behind: the app, this computer, then the machine — its versions, the command to run there — and the description says machines too", async () => {
  const other: PairingSummary = { ...lab, fp: "fp-nuc", host: "NUC", device_id: "d-nuc" };
  open({ section: "updates", machines: [lab, other], remote: { "fp-lab": behind(), "fp-nuc": { state: "connected", checkedAt: 1, version: "0.5.0", update: null } } });
  await settle();
  expect(groups()).toEqual(["Sidevoice app", "Sidevoice on this computer", "Remote machines"]);
  expect(updates().getByText("The Sidevoice app on this computer, and the machines whose Sidevoice is behind: their versions, and how they update.")).toBeInTheDocument();
  // Only the one behind; the one up to date is not listed.
  expect(machineRows()).toEqual([["Lab box", "0.4.0 · 0.5.0 available", "Run this on Lab box:", COMMAND]]);
  expect(updates().getByRole("button", { name: "Copy the command for Lab box" })).toBeInTheDocument();
});

test("in a browser: no Updates section while no machine is behind", () => {
  open({ build: null, section: "general", machines: [lab], remote: { "fp-lab": { state: "connected", checkedAt: 1, version: "0.5.0", update: null } } });
  expect(entry()).toBeNull();
  expect(document.getElementById("pane-updates")).toBeNull();
});

test("in a browser, a machine behind: Updates lists only the machines — no app, no service — and goes as the machine is updated", async () => {
  const unnamed: PairingSummary = { ...lab, fp: "fp-x", host: "", device_id: "d-x" };
  const { store } = open({ build: null, section: "updates", machines: [lab, unnamed], remote: { "fp-lab": behind(), "fp-x": behind(null, "sidevoice update") } });
  await settle();
  expect(entry()).toHaveTextContent(/^Updates$/);
  expect(updates().getByText("Machines whose Sidevoice is behind, and how to update them.")).toBeInTheDocument();
  expect(groups()).toEqual(["Remote machines"]);
  expect(pane("updates").querySelector(".app-update-settings")).toBeNull();
  expect(machineRows()).toEqual([
    ["Lab box", "0.4.0 · 0.5.0 available", "Run this on Lab box:", COMMAND],
    ["Unnamed machine", "Version 0.5.0 available", "Run this on Unnamed machine:", "sidevoice update"],
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

/* Landing: the sidebar's row, the rail's rows, open Updates on the row's action, in view and focused, the row lit. */

test("the sidebar's row, an app update found in manual mode: Updates, its Download focused", async () => {
  const { store } = open({ section: "general", updater: { mode: "manual", status: { state: "available", version: "0.10.0" } }, entry: "foot" });
  await settle();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Version 0.10.0 available" })); });
  expect([store.getState().facts.settingsSection, store.getState().facts.settingsLevel]).toEqual(["updates", "page"]);
  await landsOn(() => appRow() && within(appRow()!).getByRole("button", { name: "Download Sidevoice 0.10.0" }), appRow);
  expect(store.getState().facts.settingsFocus).toBeNull();
});

test("the sidebar's row, ready (either mode): Updates, its Restart to update focused", async () => {
  open({ section: "general", updater: { mode: "automatic", status: { state: "ready", version: "0.10.0" } }, entry: "foot" });
  await settle();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Restart to update · 0.10.0" })); });
  await landsOn(() => appRow() && within(appRow()!).getByRole("button", { name: "Restart to update" }), appRow);
});

test("the sidebar's row, this computer's Sidevoice behind: Updates, its Update focused", async () => {
  open({ section: "general", service: BUNDLED, entry: "foot" });
  const row = await screen.findByRole("button", { name: "Updates available" });
  await act(async () => { fireEvent.click(row); });
  await landsOn(() => document.getElementById("updates-this-computer"), () => group("Sidevoice on this computer").querySelector(".updates-settings"));
  expect(document.activeElement).toHaveAccessibleName("Update this machine");
});

test("the sidebar's row, a remote machine behind: Updates, its command's Copy focused, its row lit", async () => {
  open({ section: "general", machines: [lab], remote: { "fp-lab": behind() }, entry: "foot" });
  const row = await screen.findByRole("button", { name: "Updates available" });
  await act(async () => { fireEvent.click(row); });
  await landsOn(() => updates().getByRole("button", { name: "Copy the command for Lab box" }), () => document.getElementById("updates-machine-fp-lab"));
});

test("the rail: every update counted, the remote machine's too; each row opens Updates on its own action", async () => {
  open({ section: "general", machines: [lab], remote: { "fp-lab": behind() }, updater: { mode: "manual", status: { state: "available", version: "0.10.0" } }, entry: "rail" });
  await settle();
  const icon = () => screen.getByRole("button", { name: "Updates, 2 waiting" });
  await act(async () => { fireEvent.click(icon()); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "See updates", description: "Lab box needs an update" })); });
  await landsOn(() => updates().getByRole("button", { name: "Copy the command for Lab box" }));
  await act(async () => { fireEvent.click(icon()); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "See updates", description: "Version 0.10.0 available" })); });
  await landsOn(() => within(appRow()!).getByRole("button", { name: "Download Sidevoice 0.10.0" }));
});

test("in Spanish: Actualizaciones, its groups, the app's row, this computer's, a machine behind and This device's Ver actualizaciones", async () => {
  inSpanish();
  open({ section: "updates", machines: [lab], remote: { "fp-lab": behind() }, service: BUNDLED, updater: { mode: "manual", status: { state: "available", version: "0.10.0" } } });
  await settle();
  expect(entry()).toHaveTextContent(/^Actualizaciones$/);
  expect(groups()).toEqual(["App de Sidevoice", "Sidevoice en este ordenador", "Máquinas remotas"]);
  expect(updates().getByText("La app de Sidevoice en este ordenador y las máquinas con un Sidevoice anterior: sus versiones y cómo se actualizan.")).toBeInTheDocument();
  expect(appRow()).toHaveTextContent("Versión 0.10.0 disponible");
  expect(within(appRow()!).getByRole("button", { name: "Descargar Sidevoice 0.10.0" })).toBeInTheDocument();
  expect(await updates().findByRole("button", { name: "Actualizar esta máquina" })).toBeInTheDocument();
  expect(group("Sidevoice en este ordenador")).toHaveTextContent("Versión 0.9.1 disponible");
  expect(machineRows()).toEqual([["Lab box", "0.4.0 · 0.5.0 disponible", "Ejecuta esto en Lab box:", COMMAND]]);
  expect(updates().getByRole("button", { name: "Copiar el comando para Lab box" })).toBeInTheDocument();
  expect(within(pane("this-computer")).getByRole("button", { name: "Ver actualizaciones", hidden: true })).toBeInTheDocument();
});

test("in Spanish: Automáticas (recomendado) | Manuales, Buscar actualizaciones, Última comprobación, each failure, and a nightly que se actualiza a mano", async () => {
  inSpanish();
  localStorage.setItem(CHECKED, String(Date.parse("2026-10-12T09:30:00Z")));
  for (const { code, state, es, retry } of FAILURES) {
    open({ section: "updates", updater: { status: { state, version: "0.10.0", error: { code } }, mode: "manual" } });
    const modes = await updates().findByRole("radiogroup", { name: "Actualizaciones" });
    expect(within(modes).getByRole("radio", { name: "Manuales" })).toHaveAttribute("aria-checked", "true");
    expect(within(modes).getByRole("radio", { name: "Automáticas (recomendado)" })).toBeInTheDocument();
    expect(updates().getByRole("button", { name: "Buscar actualizaciones" })).toBeInTheDocument();
    expect(pane("updates")).toHaveTextContent("Última comprobación:");
    expect(updates().getByRole("alert")).toHaveTextContent(es);
    if (retry) expect(updates().getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    else expect(within(appRow()!).getByRole("button", { name: "Reiniciar para actualizar" })).toBeInTheDocument();
    cleanup();
  }
  open({ build: NIGHTLY, section: "updates" });
  expect(pane("updates").querySelector(".host-status-build")).toHaveTextContent("Nightly · abcdef0 · 2026-10-13 — se actualiza a mano (se abre en una pestaña nueva)");
  cleanup();
  open({ build: DEV, section: "updates" });
  expect(pane("updates").querySelector(".host-status-build")).toHaveTextContent(/^Versión de desarrollo$/);
});
