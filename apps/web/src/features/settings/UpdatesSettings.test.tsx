import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { VARIANTS_KEY } from "../../lib/variants";
import { fakeUpdater } from "../../test/updater";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostStatus, LocalHostVersion } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => {
  cleanup();
  localStorage.removeItem(VARIANTS_KEY); localStorage.removeItem("sidevoice.settings"); localStorage.removeItem("sidevoice.updates-checked-at");
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
});

/* VARIANTS `updates-section`: the desktop app's version and updates on This device's card (A, the default), or a
 * Settings section of their own, Updates (B), holding everything that updates — the app (the one AppUpdateSettings,
 * mounted in one place or the other, never both), Sidevoice on this computer (its Update on a release), and each
 * remote machine that is behind, with the command to run there. In the desktop app always; in a browser only while a
 * machine is behind, with only those machines. */

const local: PairingSummary = { fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local", paired_at: 1_700_000_000, revoked: false };
const lab: PairingSummary = { fp: "fp-lab", host: "Lab box", urls: ["https://lab.example"], rv: null, device_id: "d-lab", paired_at: 1_700_000_100, revoked: false };
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.1.0", api: 1 }, calls: 0, product_version: "0.9.0" };
const RELEASE = { channel: "release", version: "0.9.0", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" };
const NIGHTLY = { channel: "nightly", version: "0.10.0-nightly", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" };
const COMMAND = "curl -fsSL https://sidevoice.app/install | sh";
/** What a remote machine says when its Sidevoice is behind (loadMachineInfo, contract gap #57). */
const behind = (version: string | null = "0.4.0", command = COMMAND) => ({ state: "connected", checkedAt: 1, version, update: { latest: "0.5.0", command } });
/** This computer's service, as the bridge says it when the app bundles a newer one. */
const BUNDLED: LocalHostVersion = { bridge: 3, bundled: { version: "0.9.1" }, installed: { version: "0.9.0" }, core_api: 1, update: "available" };

/** The desktop app (its build, and a release's updater), or a browser (`build` null), with Settings at `section`;
 *  `remote`: what each paired machine elsewhere said (remoteHostStatus); `service`: what the bridge says of this
 *  computer's service. */
function open(where: "this-device" | "section" | null, { build = RELEASE as Record<string, unknown> | null, section = "this-computer", machines = [] as PairingSummary[],
  remote = {} as Record<string, unknown>, service = null as LocalHostVersion | null } = {}) {
  if (where) localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "updates-section": where }));
  const fake = fakeUpdater();
  const update = vi.fn(async () => running);
  if (build) Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { build,
    ...(build.channel === "release" ? { updater: fake.updater } : {}),
    localHost: { state: vi.fn(async () => running), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install: vi.fn(),
      ...(service ? { version: vi.fn(async () => service), update } : {}) } } } });
  window.sidevoiceActions = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), machineDevices: vi.fn().mockResolvedValue([]),
    loadHostAgents: vi.fn(), loadMachineInfo: vi.fn() } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [...(build ? [local] : []), ...machines], machinesReady: true, inApp: !!build, localHostAvailable: !!build,
    localHostStatus: running, remoteHostStatus: remote as never, settingsSection: section,
    machineLinks: Object.fromEntries([...(build ? [local] : []), ...machines].map((pairing) => [pairing.fp, { reach: "ok", via: "node" }])) }); });
  render(<RoomProvider store={store}><SettingsDialog /></RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  return { store, fake, update };
}

const entry = () => document.getElementById("settings-updates");
const pane = (id: string) => document.getElementById("pane-" + id);
const groups = () => [...pane("updates")!.querySelectorAll(".ui-group-title")].map((title) => title.textContent);
const navOrder = () => [...document.querySelectorAll(".settings-nav > button.ui-nav-item")].map((item) => item.id.replace("settings-", ""));
/** Each machine behind as the Updates section says it: its name, its versions, where to run the command, the command. */
const machineRows = () => [...pane("updates")!.querySelectorAll(".updates-machine")].map((row) => [
  row.querySelector(".host-status-product")?.textContent, row.querySelector(".host-status-build")?.textContent,
  row.querySelector(".host-agent-where")?.textContent, row.querySelector(".ui-snippet-text")?.textContent]);

test("A (the default): no Updates section; the version, Automatic/Manual and Check for updates on This device's card", async () => {
  open(null);
  await act(async () => {});
  expect(entry()).toBeNull();
  expect(pane("updates")).toBeNull();
  const card = within(pane("this-computer")!);
  expect(await card.findByRole("radiogroup", { name: "Updates" })).toBeInTheDocument();
  expect(card.getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
  expect(pane("this-computer")!.querySelector(".host-status-product")).toHaveTextContent("Sidevoice 0.9.0");
  // No way to an Updates section there is not.
  expect(card.queryByRole("button", { name: "See updates" })).toBeNull();
});

test("A, a remote machine behind: still no Updates section, in the app or in a browser", async () => {
  open(null, { machines: [lab], remote: { "fp-lab": behind() } });
  await act(async () => {});
  expect(entry()).toBeNull();
  cleanup();
  open("this-device", { build: null, section: "general", machines: [lab], remote: { "fp-lab": behind() } });
  await act(async () => {});
  expect(entry()).toBeNull();
  expect(pane("updates")).toBeNull();
});

test("B: Updates is a section of its own, before Advanced — the app's version, Automatic/Manual, Check for updates — and This device's card has none of them", async () => {
  open("section", { section: "updates" });
  await act(async () => {});
  expect(entry()).toHaveTextContent(/^Updates$/);
  expect(navOrder().slice(-3)).toEqual(["machines", "updates", "advanced"]);
  expect(entry()).toHaveAttribute("aria-current", "page");
  const updates = within(pane("updates")!);
  expect(updates.getByRole("heading", { name: "Updates", level: 2 })).toBeInTheDocument();
  // The app, then Sidevoice on this computer; no machine is behind, so no Remote machines.
  expect(groups()).toEqual(["Sidevoice app", "Sidevoice on this computer"]);
  expect(pane("updates")!.querySelector(".updates-settings-version .host-status-product")).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  expect(await updates.findByRole("radiogroup", { name: "Updates" })).toBeInTheDocument();
  expect(updates.getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
  // One AppUpdateSettings on the page: Updates', not the card's.
  expect(document.querySelectorAll(".app-update-settings")).toHaveLength(1);
  expect(pane("this-computer")!.querySelector(".app-update-settings")).toBeNull();
  // The card keeps the service's own version.
  expect(pane("this-computer")!.querySelector(".host-status-product")).toHaveTextContent("Sidevoice 0.9.0");
});

test("B: This device's card keeps its version with See updates under it, which opens Updates", async () => {
  const { store } = open("section");
  await act(async () => {});
  const card = pane("this-computer")!;
  const see = within(card).getByRole("button", { name: "See updates" });
  // Under the version, among the card's facts.
  expect(card.querySelector(".host-status-facts")).toContainElement(see);
  await act(async () => { fireEvent.click(see); });
  expect([store.getState().facts.settingsSection, store.getState().facts.settingsLevel]).toEqual(["updates", "page"]);
  expect(entry()).toHaveAttribute("aria-current", "page");
});

test("B, this computer's service behind what the app bundles: its Update is in Updates, under Sidevoice on this computer, and not on the card", async () => {
  const { update } = open("section", { section: "updates", service: BUNDLED });
  await act(async () => {});
  const service = pane("updates")!.querySelectorAll<HTMLElement>(".ui-group")[1];
  expect(within(service).getByRole("heading", { name: "Sidevoice on this computer" })).toBeInTheDocument();
  expect(service.querySelector(".host-status-product")).toHaveTextContent(/^Sidevoice 0\.9\.0$/);
  const button = await within(service).findByRole("button", { name: "Update this machine" });
  expect(within(pane("this-computer")!).queryByRole("button", { name: "Update this machine" })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Update this machine" })).toHaveLength(1);
  await act(async () => { fireEvent.click(button); });
  expect(update).toHaveBeenCalledTimes(1);
});

test("A, the same service: its Update is on This device's card, as it was", async () => {
  open("this-device", { service: BUNDLED });
  await act(async () => {});
  expect(await within(pane("this-computer")!).findByRole("button", { name: "Update this machine" })).toBeInTheDocument();
});

test("B, a nightly app: Updates says so under its version, updated by hand; the card no longer does; its service has no Update", async () => {
  open("section", { build: NIGHTLY, section: "updates", service: BUNDLED });
  await act(async () => {});
  const note = pane("updates")!.querySelector(".host-status-build")!;
  expect(note).toHaveTextContent("Nightly · abcdef0 · 2026-10-13 — updates by hand");
  expect(within(note as HTMLElement).getByRole("link", { name: /updates by hand/ })).toHaveAttribute("target", "_blank");
  expect(pane("this-computer")!.querySelector(".host-status-build")).toBeNull();
  // A nightly has no updater: no Automatic/Manual, no Check for updates; and its service is updated by hand too.
  expect(screen.queryByRole("radiogroup", { name: "Updates" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Update this machine" })).toBeNull();
});

test("B in the desktop app, a remote machine behind: the app, this computer's Sidevoice, then the machine, its versions and the command to run there", async () => {
  const other: PairingSummary = { ...lab, fp: "fp-nuc", host: "NUC", device_id: "d-nuc" };
  open("section", { section: "updates", machines: [lab, other], remote: { "fp-lab": behind(), "fp-nuc": { state: "connected", checkedAt: 1, version: "0.5.0", update: null } } });
  await act(async () => {});
  expect(groups()).toEqual(["Sidevoice app", "Sidevoice on this computer", "Remote machines"]);
  // Only the one behind; the one up to date is not listed.
  expect(machineRows()).toEqual([["Lab box", "0.4.0 · 0.5.0 available", "Run this on Lab box:", COMMAND]]);
  expect(within(pane("updates")!).getByRole("button", { name: /copy/i })).toBeInTheDocument();
});

test("B in a browser: no Updates section while no machine is behind", () => {
  open("section", { build: null, section: "general", machines: [lab], remote: { "fp-lab": { state: "connected", checkedAt: 1, version: "0.5.0", update: null } } });
  expect(entry()).toBeNull();
  expect(pane("updates")).toBeNull();
});

test("B in a browser, a machine behind: Updates lists only the machines — no app, no service — and goes as the machine is updated", async () => {
  const unnamed: PairingSummary = { ...lab, fp: "fp-x", host: "", device_id: "d-x" };
  const { store } = open("section", { build: null, section: "updates", machines: [lab, unnamed], remote: { "fp-lab": behind(), "fp-x": behind(null, "sidevoice update") } });
  await act(async () => {});
  expect(entry()).toHaveTextContent(/^Updates$/);
  expect(within(pane("updates")!).getByText("Machines whose Sidevoice is behind, and how to update them.")).toBeInTheDocument();
  expect(groups()).toEqual(["Remote machines"]);
  expect(pane("updates")!.querySelector(".app-update-settings")).toBeNull();
  expect(machineRows()).toEqual([
    ["Lab box", "0.4.0 · 0.5.0 available", "Run this on Lab box:", COMMAND],
    ["Unnamed machine", "Version 0.5.0 available", "Run this on Unnamed machine:", "sidevoice update"],
  ]);
  // Updated (and the other forgotten): no machine behind, no section, and Settings is back where the person can be.
  act(() => { store.patch({ pairings: [lab], remoteHostStatus: { "fp-lab": { state: "connected", checkedAt: 2, version: "0.5.0", update: null } } } as never); });
  expect(entry()).toBeNull();
  expect(pane("updates")).toBeNull();
  expect(store.getState().facts.settingsSection).toBe("general");
});

test("B, a machine forgotten while it was behind: no longer listed, and in a browser no section for it", async () => {
  open("section", { build: null, section: "general", machines: [], remote: { "fp-lab": behind() } });
  await act(async () => {});
  expect(entry()).toBeNull();
});

test("the panel's choice is followed live; Updates shown as it goes is This device, where the updates are then", async () => {
  const { store } = open("section", { section: "updates" });
  await act(async () => {});
  act(() => {
    localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "updates-section": "this-device" }));
    window.dispatchEvent(new StorageEvent("storage", { key: VARIANTS_KEY }));
  });
  expect(entry()).toBeNull();
  expect(store.getState().facts.settingsSection).toBe("this-computer");
  expect(await within(pane("this-computer")!).findByRole("radiogroup", { name: "Updates" })).toBeInTheDocument();
});

test("in Spanish: Actualizaciones, its groups, a machine behind and This device's Ver actualizaciones", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  open("section", { section: "updates", machines: [lab], remote: { "fp-lab": behind() } });
  await act(async () => {});
  expect(entry()).toHaveTextContent(/^Actualizaciones$/);
  expect(groups()).toEqual(["App de Sidevoice", "Sidevoice en este ordenador", "Máquinas remotas"]);
  expect(machineRows()).toEqual([["Lab box", "0.4.0 · 0.5.0 disponible", "Ejecuta esto en Lab box:", COMMAND]]);
  expect(within(pane("this-computer")!).getByRole("button", { name: "Ver actualizaciones", hidden: true })).toBeInTheDocument();
});
