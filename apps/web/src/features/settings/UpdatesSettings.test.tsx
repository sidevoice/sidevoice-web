import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { fakeUpdater } from "../../test/updater";
import { UpdateNotice } from "../updates/UpdateNotice";
import type { UpdaterStatus } from "../../host";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus, LocalHostVersion } from "../../host";
import { resetLocalService } from "../../services/local-service";
import { DEVELOPER_MODE_KEY } from "./developer-mode";

vi.mock("../../services/room-session-controller.js", () => ({}));
const CHECKED = "sidevoice.updates-checked-at";
afterEach(() => {
  cleanup();
  for (const key of ["sidevoice.settings", CHECKED, "sidevoice.service-last-seen", "sidevoice.service-notice-dismissed"]) localStorage.removeItem(key);
  delete (window as { __sidevoiceHost?: unknown }).__sidevoiceHost;
  resetLocalService();
});

/* Updates (decided; sidevoice-desktop#67, U3): a Settings section of their own, holding everything that updates. The app
 * first, as a row of its own — its icon, its name and its version, with Automatic or Manual, Check for updates (and Up to
 * date once a check says so, Checking… while the person's runs) and, only while a newer one is in view, its own line with
 * just the new version and its one action — Sidevoice 0.10.0 available · Download in manual, Sidevoice 0.10.0 ·
 * Downloading… with its progress, Sidevoice 0.10.0 ready · Restart to update in either mode. Then the machines, one link
 * row each — this device's and every paired machine's: its name, its service's version and where that stands, a
 * chevron to its page; no notice in this view. In the desktop app always; in a browser only while a machine is out of
 * date, with only the machines. */

const local: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
const lab: PairingSummary = { fp: "fp-lab", host: "Lab box", urls: ["https://lab.example"], device_id: "d-lab", paired_at: 1_700_000_100, revoked: false };
const nuc: PairingSummary = { ...lab, fp: "fp-nuc", host: "NUC", device_id: "d-nuc" };
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.1.0", api: 1 }, calls: 0, product_version: "0.9.0" };
const RELEASE = { channel: "release", version: "0.9.0", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" };
const NIGHTLY = { channel: "nightly", version: "0.10.0-nightly", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" };
const DEV = { channel: "dev", version: "0.10.0-dev" };
/** What a remote machine says of its Sidevoice (loadMachineInfo): its version. The app pins 0.20 (public/service.pin.json). */
const says = (version: string | null) => ({ state: "connected", checkedAt: 1, version });
/** This computer's service as the bridge reports it. */
const SERVICE_CURRENT: LocalHostVersion = { bridge: 3, bundled: { minor: "0.20" }, installed: { version: "0.9.0" }, core_api: 1, update: "current", latest: null, progress: null };

interface Open {
  /** The app's build; null, a browser. */
  build?: Record<string, unknown> | null;
  /** The app's updater (a release's; a nightly's for now), as fakeUpdater makes it; false, none. */
  updater?: Parameters<typeof fakeUpdater>[0] | false;
  section?: string;
  machines?: PairingSummary[];
  /** What each paired machine elsewhere said (remoteHostStatus). */
  remote?: Record<string, unknown>;
  /** How each paired machine is reached (machineLinks' `reach`); connected where none is said. */
  reach?: Record<string, string>;
  /** What the bridge says of this computer's service (its `version()`), or how it answers. */
  service?: LocalHostVersion | (() => Promise<LocalHostVersion>) | null;
  status?: LocalHostStatus;
  /** The room's notice (UpdateNotice), beside Settings. */
  notice?: boolean;
  /** Readies the fake updater before the page first asks it. */
  prepare?: (fake: ReturnType<typeof fakeUpdater>) => void;
}

/** The desktop app (its build, its updater on a release), or a browser (`build` null), with Settings at `section`. */
function open({ build = RELEASE, updater, section = "this-computer", machines = [], remote = {}, reach = {}, service = null, status = running, notice, prepare }: Open = {}) {
  const withUpdater = updater === undefined ? build?.channel === "release" : updater !== false;
  const fake = fakeUpdater(updater || undefined);
  prepare?.(fake);
  const version = typeof service === "function" ? vi.fn(service) : vi.fn(async () => service!);
  if (build) Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: { build,
    ...(withUpdater ? { updater: fake.updater } : {}),
    localHost: { state: vi.fn(async () => status), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(),
      ...(service ? { version } : {}) } } } });
  window.sidevoiceActions = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), machineDevices: vi.fn().mockResolvedValue([]),
    loadHostAgents: vi.fn(), loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [...(build ? [local] : []), ...machines], machinesReady: true, inApp: !!build, localHostAvailable: !!build,
    localHostStatus: status, remoteHostStatus: remote as never, settingsSection: section,
    machineLinks: Object.fromEntries([...(build ? [local] : []), ...machines].map((pairing) => [pairing.fp, { reach: reach[pairing.fp] ?? "ok", via: "node" }])) as never }); });
  render(<RoomProvider store={store}><SettingsDialog />{notice && <UpdateNotice />}</RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  return { store, fake, version };
}

const entry = () => document.getElementById("settings-updates");
const pane = (id: string) => document.getElementById("pane-" + id)!;
const updates = () => within(pane("updates"));
const groups = () => [...pane("updates").querySelectorAll(".ui-group-title")].map((title) => title.textContent);
/** The app's group (the first); its name is only for the tests' reading. */
const group = (_name: string) => pane("updates").querySelector<HTMLElement>(".ui-group")!;
const navOrder = () => [...document.querySelectorAll(".settings-nav > button.ui-nav-item")].map((item) => item.id.replace("settings-", ""));
/** The app's newer version's line, only while one is in view (the installed version's line holds the id otherwise). */
const appRow = () => document.querySelector<HTMLElement>("#pane-updates .update-action-row#updates-app");
/** The app's row, holding Check for updates. */
const installedLine = () => pane("updates").querySelector<HTMLElement>(".app-update-installed");
/** Its words: Version 0.9.0, with · Up to date or · Checking… (what a screen reader is told of a check after it). */
const installed = () => {
  const line = installedLine()!;
  const words = document.createElement("span");
  words.textContent = [line.querySelector(".ui-row-description")?.textContent, line.querySelector(".ui-badge")?.textContent].filter(Boolean).join(" · ")
    + (line.querySelector("[role=status]")?.textContent ?? "");
  return words;
};
/** Each machine's row as Updates says it: its name, its version line, its badge. */
const machineRows = () => [...pane("updates").querySelectorAll<HTMLElement>("[data-machine-row]")].map((row) => [
  row.querySelector(".svc-link-name")?.textContent, row.querySelector(".ui-row-description")?.textContent ?? null, row.querySelector(".ui-badge")?.textContent ?? null]);
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

test("Updates is a section of its own, before Advanced: the app's row — its icon, name and version, Automatic/Manual first, then Check for updates — and the machines as rows", async () => {
  open({ section: "updates" });
  await settle();
  expect(entry()).toHaveTextContent(/^Updates$/);
  expect(navOrder().slice(-3)).toEqual(["machines", "updates", "advanced"]);
  expect(entry()).toHaveAttribute("aria-current", "page");
  expect(updates().getByRole("heading", { name: "Updates", level: 2 })).toBeInTheDocument();
  expect(updates().getByText("Sidevoice on this device and on your machines: their versions, and where each stands.")).toBeInTheDocument();
  // The app, then the machines: this device alone, no other is paired.
  expect(groups()).toEqual(["Machines"]);
  const modes = await updates().findByRole("radiogroup", { name: "Updates" });
  const check = updates().getByRole("button", { name: "Check for updates" });
  // The app's row: its icon, its name, its version said once — never the service's — with Check for updates; never
  // checked here, nothing claims Up to date yet.
  expect(installedLine()!.querySelector("img.svc-app-icon")).not.toBeNull();
  expect(installedLine()!.querySelector(".ui-row-label")).toHaveTextContent(/^Sidevoice app$/);
  expect(installed()).toHaveTextContent(/^Version 0\.9\.0$/);
  expect(installedLine()).toContainElement(check);
  expect(pane("updates")).not.toHaveTextContent(/Not checked yet|Last checked|Up to date/);
  expect(appRow()).toBeNull();
  expect(document.getElementById("updates-app")).toBe(installedLine());
  expect(modes.compareDocumentPosition(installedLine()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // This device's row: its service's version (said by the app, whatever the bridge's report).
  expect(machineRows()).toEqual([[expect.any(String), "Version 0.9.0", null]]);
});

test("Up to date is a badge on the app's row once a check went through and found nothing: never before any check, never after a failure", async () => {
  localStorage.setItem(CHECKED, String(Date.parse("2026-10-12T09:30:00Z")));
  open({ section: "updates" });
  await updates().findByRole("button", { name: "Check for updates" });
  await waitFor(() => expect(installed()).toHaveTextContent(/^Version 0\.9\.0 · Up to date$/));
  // Up to date is the badge's, never an update's line.
  expect(group("app").querySelector(".update-action-row")).toBeNull();
  cleanup();
  localStorage.removeItem(CHECKED);
  open({ section: "updates" });
  await updates().findByRole("button", { name: "Check for updates" });
  await settle();
  expect(installed()).toHaveTextContent(/^Version 0\.9\.0$/);
  expect(installedLine()!.querySelector(".ui-badge")).toBeNull();
});

test.each([
  ["current", "Up to date"], ["available", "Out of date"], ["updating", "Updating…"], ["waiting-call", "After the call"], ["newer-installed", "Newer"],
] as const)("This device's row says where its service stands, as the app reports it: %s is %s", async (update, badge) => {
  const { store } = open({ section: "updates", service: { ...SERVICE_CURRENT, update } });
  await waitFor(() => expect(machineRows()[0][2]).toBe(badge));
  expect(machineRows()[0][1]).toBe("Version 0.9.0");
  // The row is a link: it opens this device's page, where its card is.
  await act(async () => { fireEvent.click(pane("updates").querySelector<HTMLElement>("[data-machine-row=local]")!); });
  expect([store.getState().facts.settingsSection, store.getState().facts.settingsLevel]).toEqual(["this-computer", "page"]);
});

test("This device's row says no badge where the app reports nothing it knows: no version(), a state of a newer app, a failed report", async () => {
  open({ section: "updates", service: { ...SERVICE_CURRENT, update: "something-new" as never } });
  await settle();
  expect(machineRows()[0]).toEqual([expect.any(String), "Version 0.9.0", null]);
  cleanup();
  open({ section: "updates", service: async () => { throw new Error("no"); } });
  await settle();
  expect(machineRows()[0]).toEqual([expect.any(String), "Version 0.9.0", null]);
  cleanup();
  // A service with no version: the row says its name alone.
  open({ section: "updates", status: { ...running, product_version: undefined }, service: { ...SERVICE_CURRENT, installed: null } });
  await settle();
  expect(machineRows()[0]).toEqual([expect.any(String), null, null]);
});

test("each paired machine is a row — its name, its version, where that stands against the minor the app pins (0.20) — and opens its own page; an offline one says Offline and the version it was last seen running", async () => {
  localStorage.setItem("sidevoice.service-last-seen", JSON.stringify({ "fp-offline": "0.19.9" }));
  const offline: PairingSummary = { ...lab, fp: "fp-offline", host: "Attic", device_id: "d-attic" };
  const mac: PairingSummary = { ...lab, fp: "fp-mac", host: "Mac mini", device_id: "d-mac" };
  const { store } = open({ section: "updates", machines: [lab, nuc, mac, offline], reach: { "fp-offline": "offline" },
    remote: { "fp-lab": says("0.19.2"), "fp-nuc": says("0.20.3"), "fp-mac": says("0.21.0") } });
  await settle();
  expect(machineRows().slice(1)).toEqual([
    ["Lab box", "Version 0.19.2", "Out of date"],
    ["NUC", "Version 0.20.3", "Up to date"],
    ["Mac mini", "Version 0.21.0", "Newer"],
    ["Attic", "Version 0.19.9", "Offline"],
  ]);
  // No notice in this view: the machine's page says what to do.
  expect(pane("updates").querySelector(".ui-alert, .ui-snippet")).toBeNull();
  await act(async () => { fireEvent.click(pane("updates").querySelector<HTMLElement>("[data-machine-row=" + store.getState().machines.find((machine) => machine.pairingId === "fp-lab")!.id + "]")!); });
  const facts = store.getState().facts;
  expect([facts.settingsSection, facts.settingsLevel, store.getState().machines.find((machine) => machine.id === facts.machinesView.machine)?.pairingId]).toEqual(["machines", "page", "fp-lab"]);
});

test("a machine is out of date also by a patch, where this device's service knows the newest of the pinned minor", async () => {
  open({ section: "updates", machines: [lab, nuc], service: { ...SERVICE_CURRENT, latest: "0.20.2" }, remote: { "fp-lab": says("0.20.1"), "fp-nuc": says("0.20.2") } });
  await waitFor(() => expect(machineRows().slice(1)).toEqual([["Lab box", "Version 0.20.1", "Out of date"], ["NUC", "Version 0.20.2", "Up to date"]]));
});

test("in a browser: no Updates section while no machine is out of date", () => {
  open({ build: null, section: "general", machines: [lab], remote: { "fp-lab": says("0.20.4") } });
  expect(entry()).toBeNull();
  expect(document.getElementById("pane-updates")).toBeNull();
});

test("in a browser, a machine out of date: Updates lists only the machines — no app, no service — and goes as the machine is updated", async () => {
  const { store } = open({ build: null, section: "updates", machines: [lab, nuc], remote: { "fp-lab": says("0.19.2"), "fp-nuc": says("0.20.0") } });
  await settle();
  expect(entry()).toHaveTextContent(/^Updates$/);
  expect(updates().getByText("Sidevoice on your machines: their versions, and which are out of date.")).toBeInTheDocument();
  expect(groups()).toEqual(["Machines"]);
  expect(pane("updates").querySelector(".app-update-settings, .svc-app-row")).toBeNull();
  expect(machineRows()).toEqual([["Lab box", "Version 0.19.2", "Out of date"], ["NUC", "Version 0.20.0", "Up to date"]]);
  // Updated: none out of date, no section, and Settings is back where the person can be.
  act(() => { store.patch({ remoteHostStatus: { "fp-lab": says("0.20.0"), "fp-nuc": says("0.20.0") } } as never); });
  expect(entry()).toBeNull();
  expect(document.getElementById("pane-updates")).toBeNull();
  expect(store.getState().facts.settingsSection).toBe("general");
});

test("a machine forgotten while it was out of date: no longer listed, and in a browser no section for it", async () => {
  open({ build: null, section: "general", machines: [], remote: { "fp-lab": says("0.19.2") } });
  await settle();
  expect(entry()).toBeNull();
});

test("a remote machine out of date: the room's notice says nothing of it; Updates has its row", async () => {
  open({ section: "general", machines: [lab], remote: { "fp-lab": says("0.19.2") }, notice: true });
  await settle();
  expect(document.querySelector(".update-notice")).toBeNull();
  expect(screen.queryByRole("button", { name: "See updates" })).toBeNull();
  expect(machineRows().slice(1)).toEqual([["Lab box", "Version 0.19.2", "Out of date"]]);
});

test("a nightly with no updater: the app's row, its note under it, updated by hand; no Automatic/Manual, no Check", async () => {
  open({ build: NIGHTLY, section: "updates" });
  await settle();
  const row = group("app").querySelector(".svc-app-row")!;
  expect(row.querySelector(".ui-row-label")).toHaveTextContent(/^Sidevoice app$/);
  expect(row.querySelector(".ui-row-description")).toHaveTextContent(/^Version 0\.10\.0-nightly$/);
  expect(installedLine()).toBeNull();
  const note = pane("updates").querySelector(".host-status-build")!;
  expect(note).toHaveTextContent("Nightly · abcdef0 · 2026-10-13 — updates by hand");
  const link = within(note as HTMLElement).getByRole("link", { name: /updates by hand/ });
  expect(link).toHaveAttribute("href", "https://github.com/sidevoice/sidevoice-desktop/releases/tag/nightly");
  expect(link).toHaveAttribute("target", "_blank");
  expect(screen.queryByRole("radiogroup", { name: "Updates" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Check for updates/ })).toBeNull();
});

test("a nightly with an updater (desktop #56, for now) updates as a release: no 'by hand', its controls, its found update", async () => {
  open({ build: NIGHTLY, section: "updates", updater: { mode: "manual", status: { state: "available", version: "0.11.0-nightly" } } });
  await settle();
  const note = pane("updates").querySelector(".host-status-build")!;
  expect(note).toHaveTextContent(/^Nightly · abcdef0 · 2026-10-13$/);
  expect(within(note as HTMLElement).queryByRole("link")).toBeNull();
  const modes = await updates().findByRole("radiogroup", { name: "Updates" });
  expect(modes.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(installed()).toHaveTextContent(/^Version 0\.10\.0-nightly$/);
  expect(updates().getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.11\.0-nightly availableDownload$/);
  expect(within(appRow()!).getByRole("button", { name: "Download" })).toBeInTheDocument();
});

test("a development build: Development build under its version, no updater's controls", async () => {
  open({ build: DEV, section: "updates" });
  await settle();
  expect(group("app").querySelector(".svc-app-row .ui-row-description")).toHaveTextContent(/^Version 0\.10\.0-dev$/);
  expect(pane("updates").querySelector(".host-status-build")).toHaveTextContent(/^Development build$/);
  expect(screen.queryByRole("link", { name: /updates by hand/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Check for updates/ })).toBeNull();
});

test("in Spanish: Actualizaciones, the app's row, the machines' rows with their badges", async () => {
  inSpanish();
  localStorage.setItem(CHECKED, String(Date.parse("2026-10-12T09:30:00Z")));
  open({ section: "updates", machines: [lab, nuc], service: { ...SERVICE_CURRENT, update: "waiting-call" }, remote: { "fp-lab": says("0.19.2"), "fp-nuc": says("0.21.0") },
    updater: { mode: "manual", status: { state: "idle" } } });
  await settle();
  expect(entry()).toHaveTextContent(/^Actualizaciones$/);
  expect(groups()).toEqual(["Máquinas"]);
  expect(updates().getByText("Sidevoice en este dispositivo y en tus máquinas: sus versiones y en qué punto está cada una.")).toBeInTheDocument();
  expect(installedLine()!.querySelector(".ui-row-label")).toHaveTextContent(/^App de Sidevoice$/);
  await waitFor(() => expect(installed()).toHaveTextContent(/^Versión 0\.9\.0 · Al día$/));
  expect(updates().getByRole("button", { name: "Buscar actualizaciones" })).toBeInTheDocument();
  await waitFor(() => expect(machineRows()).toEqual([[expect.any(String), "Versión 0.9.0", "Tras la llamada"], ["Lab box", "Versión 0.19.2", "Desactualizada"], ["NUC", "Versión 0.21.0", "Más nueva"]]));
});

test("in Spanish: Automáticas (recomendado) | Manuales, Buscar actualizaciones (which tries a failed check again), each failure — never Al día beside one — and a nightly que se actualiza a mano", async () => {
  inSpanish();
  localStorage.setItem(CHECKED, String(Date.parse("2026-10-12T09:30:00Z")));
  for (const { code, state, es, retry, boton } of FAILURES) {
    open({ section: "updates", updater: { status: { state, version: "0.10.0", error: { code } }, mode: "manual" } });
    const modes = await updates().findByRole("radiogroup", { name: "Actualizaciones" });
    expect(within(modes).getByRole("radio", { name: "Manuales" })).toHaveAttribute("aria-checked", "true");
    expect(within(modes).getByRole("radio", { name: "Automáticas (recomendado)" })).toBeInTheDocument();
    expect(updates().getByRole("button", { name: "Buscar actualizaciones" })).toBeInTheDocument();
    expect(installed()).toHaveTextContent(/^Versión 0\.9\.0$/);
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

/* Developer mode (developer-mode.ts) is turned on from the build in Advanced (SettingsDialog.test.tsx), no longer from
 * a version in Updates: there, in any build, the version is only text. */

const developerKept = () => {
  onTestFinished(() => localStorage.removeItem(DEVELOPER_MODE_KEY));
  return () => localStorage.getItem(DEVELOPER_MODE_KEY);
};
const clickTimes = (element: Element, times: number) => { for (let i = 0; i < times; i++) fireEvent.click(element); };

test("the versions in Updates (the app's row, its version with no updater, a machine's row) are only text: ten clicks add nothing and keep nothing", async () => {
  const kept = developerKept();
  open({ build: NIGHTLY, section: "updates", updater: {} });
  await settle();
  clickTimes(installedLine()!.querySelector(".ui-row-description")!, 10);
  expect(navOrder().at(-1)).toBe("advanced");
  expect(within(installedLine()!).queryByRole("status")).toBeNull();
  cleanup();
  open({ build: NIGHTLY, section: "updates" });
  await settle();
  clickTimes(pane("updates").querySelector<HTMLElement>(".svc-app-row .ui-row-description")!, 10);
  expect(navOrder().at(-1)).toBe("advanced");
  expect(kept()).toBeNull();
});



test("Up to date only after a check that went through and found nothing: never before any check, never after a failure — which Check for updates itself tries again", async () => {
  // Its service current, as the app bundles it: what the line says is the app's check.
  const { fake } = open({ section: "updates", service: SERVICE_CURRENT, updater: { mode: "manual", status: { state: "available", version: "0.10.0" } } });
  const check = await updates().findByRole("button", { name: "Check for updates" });
  expect(installed()).toHaveTextContent(/^Version 0\.9\.0$/);
  expect(installedLine()).not.toHaveTextContent("Up to date");
  // Installed elsewhere and checked again: nothing waits.
  fake.updater.check.mockResolvedValueOnce({ state: "idle" });
  await act(async () => { fake.push({ state: "idle" }); });
  await act(async () => { fireEvent.click(check); });
  // The line, then what a screen reader is told of the check.
  await waitFor(() => expect(installed()).toHaveTextContent(/^Version 0\.9\.0 · Up to date(Sidevoice is up to date\.)?$/));
  expect(appRow()).toBeNull();
  // The next check fails: what failed, under the installed version — not Up to date, and no Retry of its own.
  fake.updater.check.mockResolvedValueOnce({ state: "idle", error: { code: "update-check-failed" } });
  await act(async () => { fireEvent.click(check); });
  expect(installed()).toHaveTextContent(/^Version 0\.9\.0$/);
  expect(installedLine()).not.toHaveTextContent("Up to date");
  const alert = updates().getByRole("alert");
  expect(alert).toHaveTextContent("Couldn't check for updates.");
  expect(alert).toHaveClass("app-update-failure");
  expect(installedLine()!.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(updates().queryByRole("button", { name: /^Retry/ })).toBeNull();
  // Check for updates is what tries again; a check that goes through says Up to date again.
  await act(async () => { fireEvent.click(check); });
  expect(fake.updater.check).toHaveBeenCalledTimes(3);
  await waitFor(() => expect(installed()).toHaveTextContent(/^Version 0\.9\.0 · Up to date/));
  expect(updates().queryByRole("alert")).toBeNull();
  cleanup();
  // Idle and never checked, its service current: not Up to date either.
  localStorage.removeItem(CHECKED);
  open({ section: "updates", service: SERVICE_CURRENT });
  await updates().findByRole("button", { name: "Check for updates" });
  await settle();
  expect(installed()).toHaveTextContent(/^Version 0\.9\.0$/);
});





test("manual: an update found has its own line under the installed version, Sidevoice 0.10.0 available · Download; Sidevoice 0.10.0 · Downloading… with its progress in that line; then Sidevoice 0.10.0 ready · Restart to update", async () => {
  const { fake } = open({ section: "updates", updater: { mode: "manual", status: { state: "available", version: "0.10.0" } } });
  await settle();
  const download = within(appRow()!).getByRole("button", { name: "Download", description: "Sidevoice 0.10.0 available" });
  // Each version said once: the installed one on its line, the new one on its own, never 0.9.0 · 0.10.0.
  expect(appRow()).toHaveTextContent(/^Sidevoice 0\.10\.0 availableDownload$/);
  expect(appRow()).toHaveAttribute("data-state", "available");
  expect(installed()).toHaveTextContent(/^Version 0\.9\.0$/);
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
  expect(installed()).toHaveTextContent(/^Version 0\.9\.0$/);
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

test.each(["en", "es", "de", "fr", "it", "pl", "ja", "zh-Hans", "pt-BR", "ko", "hi"])("Cancel's accessible name is its visible label, described by the line (%s)", async (language) => {
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
      expect(installedLine()).not.toHaveTextContent("Up to date");
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
  expect(installed()).toHaveTextContent(/^Version 0\.9\.0$/);
  await act(async () => { fireEvent.click(button); });
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(installed()).toHaveTextContent(/^Version 0\.9\.0 · Checking…$/);
  await act(async () => { answer({ state: "idle" }); });
  expect(button).not.toHaveAttribute("aria-busy");
  expect(updates().getByRole("status")).toHaveTextContent(/^Sidevoice is up to date\.$/);
  expect(installed()).toHaveTextContent(/^Version 0\.9\.0 · Up to date(Sidevoice is up to date\.)?$/);
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
  await waitFor(() => expect(installed()).toHaveTextContent(/^Version 0\.9\.0 · Up to date$/));
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


















test("the room's notice: the app's Download downloads in place, Settings left where it was", async () => {
  const { fake, store } = open({ section: "general", updater: { mode: "manual", status: { state: "available", version: "0.10.0" } }, notice: true });
  const download = await screen.findByRole("button", { name: "Download", description: "Version 0.10.0 available" });
  await act(async () => { fireEvent.click(download); });
  expect(fake.updater.download).toHaveBeenCalledOnce();
  expect(store.getState().facts.settingsSection).toBe("general");
});



