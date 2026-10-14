import { expect, onTestFinished, test, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MachineList, ThisComputerSettings } from "./MachineList";
import { NoMachineScreen } from "../pairing/NoMachineScreen";
import { LocalHostBanner } from "../settings/LocalHostBanner";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { HostDeviceView } from "../../state/room-types";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostBridge, LocalHostStatus, LocalHostVersion, LocalPairingCode } from "../../services/desktop-host";
import { fakeUpdater } from "../../test/updater";
import { localHostInstallController } from "../../services/local-host-install";
import { CONNECTOR_INSTALL } from "../pairing/connector-commands";

vi.mock("../../services/room-session-controller.js", () => ({}));


const paired = (extra: Partial<PairingSummary> = {}): PairingSummary => ({
  fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], rv: { url: "https://room.example", node: "nuc-1" },
  device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false, ...extra,
});
const local = paired({ fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local" });
const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd", core: { version: "0.1.0", api: 1 }, calls: 0 };

function setBridge(bridge: Partial<LocalHostBridge>) {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => running), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), ...bridge,
  } } } });
}

function actions() {
  const done = { openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), revokeLocalHostDevice: vi.fn().mockResolvedValue(undefined) };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  return done;
}

/** A machine's entry under Machines (MachineNav), as the pane repeats it. */
const entry = (name: string) => document.querySelector<HTMLElement>(`.machines-inline .machine-entry[data-name="${name}"]`)!;
/** This device's own section, where it can host: its page, with no entry to choose under Remote machines. */
const thisDevice = () => document.getElementById("this-computer")!;
/** Settings' panes about machines, as a device that can host has them: This device, then Remote machines. */
const Panes = () => <><ThisComputerSettings /><MachineList /></>;


function room(pairings: PairingSummary[], facts: Record<string, unknown> = {}) {
  const store = createRoomStore();
  act(() => { store.patch({ pairings, machinesAt: 1_700_086_400_000,
    machinesReady: true, localHostAvailable: pairings.some((item) => item.local), inApp: pairings.some((item) => item.local), localHostStatus: running, ...facts }); });
  render(<RoomProvider store={store}><Panes /></RoomProvider>);
  return store;
}

test("the local host is This device's; every remote row says Connected however it is reached, never a route, and no machine is to be chosen", async () => {
  actions();
  const other = paired({ fp: "fp-other", host: "Other PC" });
  room([local, paired(), other], { machineLinks: { "fp-nuc": { reach: "ok", via: "room" }, "fp-other": { reach: "ok", via: "node" } } });
  expect(thisDevice().querySelector('.host-detail[aria-label="MacBook"]')).not.toBeNull();
  const rows = [...document.querySelectorAll(".machines-inline .machine-entry")];
  expect(rows).toHaveLength(2);
  // Through the room or directly, the same word: how it is reached is not said while the relay is not shipping.
  expect(rows[0].getAttribute("aria-label")).toBe("NUC, Connected");
  expect(rows[0].getAttribute("aria-label")).not.toMatch(/room|nuc-1|fingerprint|relay/i);
  expect(rows[0]).toHaveAttribute("title", "NUC · Connected");
  expect(rows[1].getAttribute("aria-label")).toBe("Other PC, Connected");
  expect(rows[1]).toHaveAttribute("title", "Other PC · Connected");
  expect(rows.some((row) => row.hasAttribute("data-in-use"))).toBe(false);
  // Every machine is live at once: no page says In use or offers Use.
  for (const name of ["NUC", "Other PC"]) {
    await act(async () => { entry(name).click(); });
    expect(screen.queryByRole("button", { name: /^Use / })).toBeNull();
    expect(screen.queryByText(/In use/)).toBeNull();
  }
});

test("an unreachable remote machine only says Not connected, and can still be forgotten, told when it's back", () => {
  const done = { ...actions(), machineDevices: vi.fn(), forgetMachine: vi.fn() };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  room([paired()], { machineLinks: { "fp-nuc": { reach: "away", via: "" } } });
  expect(document.querySelector(".machines-inline .machine-entry")?.getAttribute("aria-label")).toBe("NUC, Not connected");
  expect(screen.queryByRole("button", { name: /Retry NUC/ })).toBeNull();
  // Its list can't be read, so no row of this device's: Forget is offered on its own, and never waits on the machine.
  expect(done.machineDevices).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Forget NUC" }));
  expect(screen.getByRole("group", { name: "Forget NUC" })).toHaveTextContent("NUC is offline: it will be told when it’s back.");
  fireEvent.click(screen.getByRole("button", { name: "Yes, forget" }));
  expect(done.forgetMachine).toHaveBeenCalledWith("fp-nuc");
});

test("This device offers local setup when no local host is projected; Remote machines keeps remote pairing", async () => {
  const install = vi.fn();
  const done = actions();
  setBridge({ install });
  onTestFinished(() => localHostInstallController.clear());
  room([paired()], { localHostStatus: { state: "absent" }, localHostAvailable: true, inApp: true });

  // The setup's two ways: the app's Prepare, then I'll do it myself, closed.
  const device = within(thisDevice());
  expect(thisDevice().querySelector(".this-computer-prepare > p")).toHaveTextContent("To use the agents on this computer, Sidevoice needs a background service.");
  expect(device.getByRole("button", { name: "Prepare this computer" })).toHaveClass("ui-button--primary");
  expect(device.getByRole("button", { name: "I’ll do it myself" })).toHaveAttribute("aria-expanded", "false");
  expect(thisDevice().querySelector(".ui-snippet")).toBeNull();
  expect(document.getElementById("machines")!.querySelector(".local-install-entry")).toBeNull();
  await act(async () => { screen.getAllByRole("button", { name: "Add a remote machine" })[0].click(); });
  expect(done.openPairing).toHaveBeenCalledOnce();
  expect(install).not.toHaveBeenCalled();
  // Opened: the command, and the wait for this computer.
  await act(async () => { device.getByRole("button", { name: "I’ll do it myself" }).click(); });
  expect([...thisDevice().querySelectorAll(".ui-snippet code")].map((code) => code.textContent)).toEqual(["npx sidevoice@latest install"]);
  expect(thisDevice().querySelector(".prepare-here-wait")).toHaveTextContent("Waiting for the Sidevoice service…");
  await act(async () => { device.getByRole("button", { name: "I’ll do it myself" }).click(); });
  expect(thisDevice().querySelector(".ui-snippet")).toBeNull();
  // The app's install failing (this one answers nothing usable): what failed, Retry, and the command open by itself.
  await act(async () => { device.getByRole("button", { name: "Prepare this computer" }).click(); });
  expect(install).toHaveBeenCalledOnce();
  expect(thisDevice().querySelector(".local-install-panel")).toHaveAttribute("data-phase", "failed");
  expect(device.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  expect(device.queryByRole("button", { name: "Prepare this computer" })).toBeNull();
  expect(device.getByRole("button", { name: "I’ll do it myself" })).toHaveAttribute("aria-expanded", "true");
  expect([...thisDevice().querySelectorAll(".ui-snippet code")].map((code) => code.textContent)).toEqual(["npx sidevoice@latest install"]);
});

test("This device, where the app does not install Sidevoice itself, offers the install command to run here instead", () => {
  actions();
  setBridge({});
  room([paired()], { localHostStatus: { state: "absent" }, localHostAvailable: true, inApp: true });

  expect(within(thisDevice()).queryByRole("button", { name: /^(Use agents on|Prepare) this computer$/ })).toBeNull();
  // The only way: shown as it is, nothing to open.
  expect(within(thisDevice()).queryByRole("button", { name: "I’ll do it myself" })).toBeNull();
  expect([...thisDevice().querySelectorAll(".ui-snippet code")].map((code) => code.textContent)).toEqual(["npx sidevoice@latest install"]);
  expect(within(thisDevice()).getByText("You can also ask one of your agents to run it for you.")).toBeInTheDocument();
  expect(thisDevice().querySelector(".prepare-here-wait")).toHaveTextContent("Waiting for the Sidevoice service…");
  expect(document.getElementById("machines")!.querySelector(".local-install-entry")).toBeNull();
});

test("an existing stopped local R1 host keeps its page and does not show the install CTA", () => {
  actions();
  setBridge({ install: vi.fn() });
  room([local], { localHostStatus: { state: "stopped-by-person", installed: true, reachable: false } });

  expect(thisDevice().querySelector('.host-detail[aria-label="MacBook"]')).not.toBeNull();
  expect(screen.queryByRole("button", { name: /^(Use agents on|Prepare) this computer$/ })).toBeNull();
});

test("an already-running local R1 host is shown without starting another install", () => {
  const install = vi.fn();
  setBridge({ install });
  actions();
  room([local], { localHostStatus: running });

  expect(thisDevice().querySelector('.host-detail[aria-label="MacBook"]')).not.toBeNull();
  expect(screen.queryByRole("button", { name: /^(Use agents on|Prepare) this computer$/ })).toBeNull();
  expect(install).not.toHaveBeenCalled();
});

test("a failed local R1 host stays on the existing machine path instead of the no-machine screen", () => {
  setBridge({ install: vi.fn() });
  const store = createRoomStore();
  act(() => store.patch({ pairings: [local], machinesReady: true, localHostAvailable: true, inApp: true,
    localHostStatus: { state: "failed", installed: true, failure: { key: "start.failed" } } }));
  render(<RoomProvider store={store}><NoMachineScreen /></RoomProvider>);

  expect(screen.queryByRole("heading", { name: "No machine connected" })).toBeNull();
});

test("a remote that does not answer says Not connected while another answers: each row says its own link", () => {
  actions();
  const other = paired({ fp: "fp-other", host: "Other PC" });
  room([local, paired(), other], { machineLinks: { "fp-nuc": { reach: "offline", via: "" }, "fp-other": { reach: "ok", via: "node" } } });
  const rows = [...document.querySelectorAll(".machines-inline .machine-entry")];
  expect(rows[0].getAttribute("aria-label")).toBe("NUC, Not connected");
  expect(rows[1].getAttribute("aria-label")).toBe("Other PC, Connected");
});

test("local F6 status shows only supported service actions", async () => {
  const serviceInstall = vi.fn().mockResolvedValue(undefined);
  setBridge({ serviceInstall, start: undefined, restart: undefined, stop: undefined });
  actions();
  room([local], { localHostStatus: { state: "not-installed", installed: false, service: "none" } });
  expect(screen.getByRole("heading", { name: "Sidevoice service" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Paired devices" })).toBeInTheDocument();
  expect(document.querySelector(".host-status-summary")).toHaveTextContent("The service is installed, but doesn't start by itself.");
  // Not installed: its one action is Start, which installs the service; Start at sign-in comes once there is one.
  expect(screen.getAllByRole("button", { name: "Start" })).toHaveLength(1);
  expect(screen.queryByRole("switch", { name: "Start at sign-in" })).toBeNull();
  expect(screen.queryByRole("button", { name: /agent/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /copy from another machine/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /^(Use agents on|Prepare) this computer$/ })).toBeNull();
  await act(async () => { screen.getByRole("button", { name: "Start" }).click(); });
  expect(serviceInstall).toHaveBeenCalledOnce();
});

test("incompatible, this computer's card ends on Update it: and the install command follows; the banner, with no command, says it without", () => {
  setBridge({ serviceInstall: vi.fn() });
  actions();
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local], machinesAt: 1_700_086_400_000, machinesReady: true, localHostAvailable: true, inApp: true,
    localHostStatus: { ...running, state: "incompatible", reachable: false } }); });
  render(<RoomProvider store={store}><Panes /><LocalHostBanner /></RoomProvider>);
  const card = thisDevice().querySelector<HTMLElement>(".host-status-card")!;
  expect(within(card).getByRole("heading", { name: "Sidevoice service" })).toBeInTheDocument();
  const summary = card.querySelector(".host-status-summary")!;
  expect(summary).toHaveTextContent("The service on this computer isn't compatible with this version of the app. Update it:");
  expect(summary.nextElementSibling).toHaveClass("install-here");
  expect(summary.nextElementSibling).toHaveTextContent(CONNECTOR_INSTALL);
  expect(screen.getByText("This computer is unavailable: The service on this computer isn't compatible with this version of the app.")).toBeInTheDocument();
});

test("service failure display and copied diagnostics omit secret-bearing native fields", async () => {
  const secretStatus = {
    state: "service-failed", service: "launchd", installed: true, reachable: false, calls: 0, attempts: 2, limit: 3,
    core: { pid: 814, version: "0.1.0", api: 1, launch_id: "LAUNCH_SECRET_42" },
    failure: {
      key: "start.failed", step: "PAIRING_CODE_SECRET_42", message: "RAW_FAILURE_SECRET_42",
      at: "2026-10-01T10:12:00.000Z", log_tail: ["token=TOKEN_SECRET_42", "env=ENV_SECRET_42", "code=CODE_SECRET_42"],
      token: "TOKEN_SECRET_42", code: "CODE_SECRET_42", env: "ENV_SECRET_42",
    },
    token: "TOP_LEVEL_TOKEN_SECRET_42", pairing_code: "TOP_LEVEL_CODE_SECRET_42", env: { secret: "TOP_LEVEL_ENV_SECRET_42" },
  } as unknown as LocalHostStatus;
  setBridge({ restart: vi.fn(async () => undefined) });
  actions();
  const store = createRoomStore();
  act(() => store.patch({ pairings: [local], machinesReady: true, localHostAvailable: true, inApp: true, localHostStatus: secretStatus }));

  const writeText = vi.fn(async (_value: string) => {});
  const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    render(<RoomProvider store={store}><LocalHostBanner /><Panes /></RoomProvider>);
    expect(document.querySelector(".local-host-banner")).toBeInTheDocument();
    expect(document.querySelector(".host-status-summary")).toHaveTextContent("The Sidevoice service is unavailable: the service could not start");
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(2);
    expect(screen.queryByText(/PAIRING_CODE_SECRET_42|RAW_FAILURE_SECRET_42|TOKEN_SECRET_42|ENV_SECRET_42|CODE_SECRET_42|LAUNCH_SECRET_42/)).toBeNull();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy details" })); });
    expect(writeText).toHaveBeenCalledOnce();
    const copied = writeText.mock.calls[0][0];
    const details = JSON.parse(copied) as Record<string, unknown>;
    expect(details).toMatchObject({ state: "service-failed", service: "launchd", installed: true, reachable: false,
      core: { pid: 814, version: "0.1.0", api: 1 }, attempts: 2, limit: 3,
      failure: { key: "start.failed", at: "2026-10-01T10:12:00.000Z" } });
    expect(copied).not.toMatch(/PAIRING_CODE_SECRET_42|RAW_FAILURE_SECRET_42|TOKEN_SECRET_42|ENV_SECRET_42|CODE_SECRET_42|LAUNCH_SECRET_42|TOP_LEVEL/);
    expect(copied).not.toContain("log_tail");
  } finally {
    if (previousClipboard) Object.defineProperty(navigator, "clipboard", previousClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

test("stopping the local host while calls are active asks first, and Cancel leaves it running", async () => {
  const stop = vi.fn().mockResolvedValue(undefined);
  setBridge({ stop });
  actions();
  room([local], { localHostStatus: { ...running, calls: 1 } });

  await act(async () => { screen.getByRole("button", { name: "Stop" }).click(); });
  expect(screen.getByText("Stop the service on this computer? Active calls will end.")).toBeInTheDocument();
  expect(stop).not.toHaveBeenCalled();
  await act(async () => { screen.getByRole("button", { name: "Cancel" }).click(); });
  expect(thisDevice().querySelector(".host-status-state")).toHaveTextContent("Running");
  expect(stop).not.toHaveBeenCalled();

  await act(async () => { screen.getByRole("button", { name: "Stop" }).click(); });
  await act(async () => { screen.getByRole("button", { name: "Stop" }).click(); });
  expect(stop).toHaveBeenCalledOnce();
});

test("with no active calls, Stop stops the local host without asking", async () => {
  const stop = vi.fn().mockResolvedValue(undefined);
  setBridge({ stop });
  actions();
  room([local], { localHostStatus: { ...running, calls: 0 } });
  await act(async () => {});

  await act(async () => { screen.getByRole("button", { name: "Stop" }).click(); });
  expect(screen.queryByText("Stop the service on this computer? Active calls will end.")).toBeNull();
  expect(stop).toHaveBeenCalledOnce();
});


test.each(["not-installed", "service-failed", "stopped-by-person"] as const)(
  "Devices operations remain available for a reachable local core in %s state",
  async (state) => {
    const status: LocalHostStatus = { state, reachable: true, installed: true, service: "launchd" };
    const pairingCode = vi.fn().mockResolvedValue({ code: "SV1.local", expires_in: 600, reach: "local-only" as const });
    setBridge({ state: vi.fn(async () => status), pairingCode });
    const done = actions();
    room([local], { localHostStatus: status });
    await act(async () => {});
    await waitFor(() => expect(done.localHostDevices).toHaveBeenCalledOnce());
    // Read once: nothing to retry while it worked.
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  },
);

test("Devices waits for the verified local pairing if reachability arrives first", async () => {
  const status: LocalHostStatus = { state: "stopped-by-person", reachable: true, installed: true, service: "launchd" };
  const pairingCode = vi.fn().mockResolvedValue({ code: "SV1.local", expires_in: 600, reach: "local-only" as const });
  setBridge({ state: vi.fn(async () => status), pairingCode, pairRoom: vi.fn().mockResolvedValue({ ok: true }) });
  const done = actions();
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [], localHostAvailable: true, inApp: true,
    localHostStatus: status, machinesReady: true }); });
  render(<RoomProvider store={store}><Panes /></RoomProvider>);
  await act(async () => {});

  expect(done.localHostDevices).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

  act(() => { store.patch({ pairings: [local] }); });
  await waitFor(() => expect(done.localHostDevices).toHaveBeenCalledOnce());
});

test("Devices discards the old host's rows when the local pairing identity changes", async () => {
  const pairingCode = vi.fn().mockResolvedValue({ code: "SV1.old-host", expires_in: 600, reach: "local-only" as const });
  setBridge({ pairingCode });
  const done = actions();
  done.localHostDevices.mockImplementationOnce(async () => [{ device_id: "d-old", name: "Old phone", kind: "code" }])
    .mockResolvedValue([{ device_id: "d-new", name: "New phone", kind: "code" }]);
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local], localHostAvailable: true, inApp: true,
    localHostStatus: running, machinesReady: true }); });
  render(<RoomProvider store={store}><Panes /></RoomProvider>);
  await act(async () => {});
  await waitFor(() => expect(screen.getByText("Old phone")).toBeInTheDocument());

  const replacement = paired({ fp: "fp-local-new", host: "Mac mini", local: true, urls: ["http://127.0.0.1:47212"], rv: null, device_id: "d-local-new" });
  act(() => { store.patch({ pairings: [replacement] }); });
  await waitFor(() => expect(screen.getByText("New phone")).toBeInTheDocument());
  expect(screen.queryByText("Old phone")).toBeNull();
  expect(done.localHostDevices).toHaveBeenCalledTimes(2);
});

test("Devices clears cached contents on loss and refreshes them when native reachability returns", async () => {
  const status: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd" };
  const pairingCode = vi.fn().mockResolvedValue({ code: "SV1.initial", expires_in: 600, reach: "local-only" as const });
  setBridge({ state: vi.fn(async () => status), pairingCode, pairRoom: vi.fn().mockResolvedValue({ ok: true }) });
  const done = actions();
  let loads = 0;
  done.localHostDevices.mockImplementation(async () => ++loads === 1
    ? [{ device_id: "d-before", name: "Phone", kind: "code" }]
    : [{ device_id: "d-after", name: "Tablet", kind: "code" }]);
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local], localHostAvailable: true, inApp: true,
    localHostStatus: status, machinesReady: true }); });
  render(<RoomProvider store={store}><Panes /></RoomProvider>);
  await act(async () => {});
  await waitFor(() => expect(screen.getByText("Phone")).toBeInTheDocument());
  await act(async () => { screen.getByRole("button", { name: "Revoke Phone" }).click(); });
  expect(screen.getByRole("group", { name: "Revoke Phone" })).toBeInTheDocument();

  act(() => { store.patch({ pairings: [], localHostStatus: { ...status, reachable: false } }); });
  await waitFor(() => expect(screen.queryByText("Phone")).toBeNull());
  expect(screen.queryByRole("textbox", { name: "Room address" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  expect(screen.queryByRole("group", { name: "Revoke Phone" })).toBeNull();

  act(() => { store.patch({ pairings: [local], localHostStatus: { ...status, reachable: true, state: "service-failed" } }); });
  await waitFor(() => expect(screen.getByText("Tablet")).toBeInTheDocument());
  expect(done.localHostDevices).toHaveBeenCalledTimes(2);
});

test("an in-flight device list cannot repopulate Devices after reachability is lost", async () => {
  const status: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd" };
  let resolveDevices!: (value: HostDeviceView[]) => void;
  let resolveCode!: (value: LocalPairingCode) => void;
  const pairingCode = vi.fn()
    .mockImplementationOnce(() => new Promise<LocalPairingCode>((resolve) => { resolveCode = resolve; }))
    .mockResolvedValue({ code: "SV1.fresh", expires_in: 600, reach: "direct" as const });
  setBridge({ state: vi.fn(async () => status), pairingCode, pairRoom: vi.fn().mockResolvedValue({ ok: true }) });
  const done = actions();
  done.localHostDevices.mockImplementationOnce(() => new Promise<HostDeviceView[]>((resolve) => { resolveDevices = resolve; }));
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local], localHostAvailable: true, inApp: true,
    localHostStatus: status, machinesReady: true }); });
  render(<RoomProvider store={store}><Panes /></RoomProvider>);
  await act(async () => {});
  await waitFor(() => expect(done.localHostDevices).toHaveBeenCalledOnce());

  act(() => { store.patch({ pairings: [], localHostStatus: { ...status, reachable: false } }); });
  await act(async () => {
    resolveDevices([{ device_id: "d-stale", name: "Stale phone", kind: "code" }]);
    await Promise.resolve();
  });
  expect(screen.queryByText("Stale phone")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Room address" })).toBeNull();

  act(() => { store.patch({ pairings: [local], localHostStatus: status }); });
  await waitFor(() => expect(screen.getByText("No other devices are paired with this computer.")).toBeInTheDocument());
});

test("in a browser (this device can't host) it is plain Machines, Add a machine, with no This device", async () => {
  actions();
  const store = room([paired()], { machineLinks: { "fp-nuc": { reach: "ok", via: "node" } } });
  expect(store.getState().facts.inApp).toBeFalsy();
  const machines = document.getElementById("machines")!;
  expect(within(machines).getByRole("heading", { level: 2 })).toHaveTextContent(/^Machines$/);
  // Add, short, its whole words its name and its tooltip.
  expect([...machines.querySelectorAll(".machine-nav button")].map((button) => button.textContent)).toEqual([expect.stringMatching(/^NUC/), "Add"]);
  expect(machines.querySelector(".machine-nav-add")).toHaveAccessibleName("Add a machine");
  expect(machines.querySelector(".machine-nav-add")).toHaveAttribute("title", "Add a machine");
  expect(screen.queryByText(/remote machine/i)).toBeNull();
  expect(screen.queryByTitle(/remote machine/i)).toBeNull();
  cleanup();
  // Nothing paired: the empty page's own button says the same.
  room([]);
  expect(document.getElementById("pair-device-open")).toHaveTextContent(/^Add$/);
  expect(document.getElementById("pair-device-open")).toHaveAccessibleName("Add a machine");
  expect(document.getElementById("pair-device-open")).toHaveAttribute("title", "Add a machine");
  cleanup();
  // Not even a browser talking to a local Sidevoice: that one is a machine among the others.
  room([local, paired()], { localHostAvailable: true, inApp: false });
  expect(within(document.getElementById("machines")!).getByRole("heading", { level: 2 })).toHaveTextContent(/^Machines$/);
  expect([...document.querySelectorAll(".machine-nav button")].map((button) => button.textContent)).toEqual([expect.stringMatching(/MacBook/), expect.stringMatching(/^NUC/), "Add"]);
  expect(document.querySelector(".machine-nav-add")).toHaveAccessibleName("Add a machine");
  expect(document.getElementById("this-computer")?.querySelector(".host-detail") ?? null).not.toBeNull();
});

test("where this device hosts, Remote machines with none says Add, named Add a remote machine", () => {
  actions();
  room([local]);
  const machines = document.getElementById("machines")!;
  expect(within(machines).getByRole("heading", { level: 2 })).toHaveTextContent("Remote machines");
  for (const add of [document.getElementById("pair-device-open"), machines.querySelector(".machine-nav-add")]) {
    expect(add).toHaveTextContent(/^Add$/);
    expect(add).toHaveAccessibleName("Add a remote machine");
    expect(add).toHaveAttribute("title", "Add a remote machine");
  }
});

test("in Spanish, Add is Añadir, named with its whole words", async () => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "es" }));
  try {
    actions();
    room([local]);
    for (const add of [document.getElementById("pair-device-open"), document.querySelector("#machines .machine-nav-add")]) {
      expect(add).toHaveTextContent(/^Añadir$/);
      expect(add).toHaveAccessibleName("Añadir una máquina remota");
      expect(add).toHaveAttribute("title", "Añadir una máquina remota");
    }
    cleanup();
    room([paired()], { machineLinks: { "fp-nuc": { reach: "ok", via: "node" } } });
    expect(document.querySelector("#machines .machine-nav-add")).toHaveTextContent(/^Añadir$/);
    expect(document.querySelector("#machines .machine-nav-add")).toHaveAccessibleName("Añadir una máquina");
    // A click on the short Add opens the pairing all the same.
    await act(async () => { (document.querySelector("#machines .machine-nav-add") as HTMLElement).click(); });
    expect(window.sidevoiceActions!.openPairing).toHaveBeenCalledTimes(1);
  } finally {
    localStorage.removeItem("sidevoice.settings");
  }
});

test("Add machine opens the explicit remote setup and pairing flow", async () => {
  const done = actions();
  room([]);
  expect(screen.getByText("This device is not paired with a machine yet.")).toBeInTheDocument();
  await act(async () => { document.getElementById("pair-device-open")!.click(); });
  expect(done.openPairing).toHaveBeenCalledOnce();
});

test("the no-machine screen offers Connect; install guidance starts only in the pairing flow", () => {
  actions();
  const store = createRoomStore();
  act(() => { store.patch({ machinesReady: true, pairings: [], localHostStatus: { state: "absent" } }); });
  render(<RoomProvider store={store}><NoMachineScreen /></RoomProvider>);
  expect(screen.getByRole("heading", { name: "No machine connected" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Connect to a machine" })).toBeInTheDocument();
  expect(screen.queryByText(/npx sidevoice@latest install/)).toBeNull();
});

test("the local warning stays away while another machine answers, and appears once none does", () => {
  actions();
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local, paired()], machineLinks: { "fp-nuc": { reach: "ok", via: "node" } }, localHostStatus: { state: "failed" } }); });
  render(<RoomProvider store={store}><LocalHostBanner /></RoomProvider>);
  expect(screen.queryByText(/This computer is unavailable/)).toBeNull();
  act(() => { store.patch({ machineLinks: { "fp-nuc": { reach: "away", via: "" } } }); });
  expect(screen.getByText(/This computer is unavailable/)).toBeInTheDocument();
});

test("a lost native pairing keeps This device's page and recovery action, with nothing to choose", async () => {
  const restart = vi.fn().mockResolvedValue(undefined);
  setBridge({ restart, state: vi.fn(async (): Promise<LocalHostStatus> => ({ state: "failed", reachable: false })) });
  actions();
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [], localHostAvailable: true, inApp: true,
    localHostStatus: { state: "failed", reachable: false, failure: { key: "start.failed" } }, machinesReady: true }); });
  render(<RoomProvider store={store}><Panes /><LocalHostBanner /></RoomProvider>);

  // Its page is This device's, never an entry among the remote machines.
  expect(thisDevice().querySelector('.host-detail[aria-label="This computer"]')).not.toBeNull();
  expect(document.querySelector(".machines-inline .machine-entry")).toBeNull();
  expect(screen.queryByRole("button", { name: "Use This computer" })).toBeNull();
  expect(screen.getByText(/This computer is unavailable/)).toBeInTheDocument();
  expect(within(thisDevice()).getByRole("heading", { name: "Sidevoice service" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(2);
  await act(async () => { screen.getAllByRole("button", { name: "Retry" })[0].click(); });
  expect(restart).toHaveBeenCalledOnce();
});

test("a reachable local core whose service the person stopped says Stopped, as its card, and hides the warning", () => {
  actions();
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local], localHostAvailable: true, inApp: true,
    localHostStatus: { state: "stopped-by-person", reachable: true }, machinesReady: true }); });
  render(<RoomProvider store={store}><Panes /><LocalHostBanner /></RoomProvider>);
  expect(thisDevice().querySelector(".host-detail-state")).toHaveTextContent(/^Stopped$/);
  expect(thisDevice().querySelector(".host-status-state")).toHaveTextContent(/^Stopped$/);
  expect(screen.queryByText(/This computer is unavailable/)).toBeNull();
});


test("a remote machine's page has it all: how it is reached, its agents, its devices (others revocable, never this one), and Forget", async () => {
  // This device's name here, which the machine last heard otherwise.
  localStorage.setItem("sidevoice.deviceName", "Ana’s laptop");
  onTestFinished(() => localStorage.removeItem("sidevoice.deviceName"));
  const devices: HostDeviceView[] = [{ device_id: "d-nuc", name: "Chrome on Mac", current: true }, { device_id: "d-phone", name: "Phone", kind: "code" },
    { device_id: "d-self", name: "NUC", kind: "local" }, { device_id: "d-tablet", name: "Tablet", kind: "code" }];
  const done = { ...actions(), machineDevices: vi.fn().mockResolvedValue(devices), revokeMachineDevice: vi.fn().mockResolvedValue(undefined), forgetMachine: vi.fn(), loadHostAgents: vi.fn() };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  room([paired()], { machineLinks: { "fp-nuc": { reach: "ok", via: "node" } },
    remoteHostStatus: { "fp-nuc": { state: "connected", checkedAt: 1_700_000_000_000 } } });
  await waitFor(() => expect(screen.getByText("Phone")).toBeInTheDocument());
  expect(done.machineDevices).toHaveBeenCalledWith("fp-nuc");
  expect(screen.getByRole("heading", { name: "Paired devices" })).toBeInTheDocument();
  const rows = [...document.querySelectorAll<HTMLElement>(".host-device-row")];
  // This device's row: its name and "This device" — never revoking itself, nor forgetting the machine (the page's foot).
  expect(rows[0]).toHaveTextContent("Ana’s laptop");
  expect(within(rows[0]).getByText("This device")).toBeInTheDocument();
  expect(within(rows[0]).queryByRole("button", { name: "Forget NUC" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Revoke (Chrome on Mac|Ana’s laptop)/ })).toBeNull();
  // The machine's own Sidevoice, paired with itself, is never listed; every other device has Revoke.
  expect(rows.map((row) => row.querySelector("strong")?.textContent)).toEqual(["Ana’s laptop", "Phone", "Tablet"]);
  expect(screen.queryByRole("button", { name: "Revoke NUC" })).toBeNull();
  expect(within(rows[1]).getByRole("button", { name: "Revoke Phone" })).toBeInTheDocument();
  expect(within(rows[2]).getByRole("button", { name: "Revoke Tablet" })).toBeInTheDocument();
  // Devices are named where they are (this one in General); none is renamed here. Read once: nothing to retry.
  expect(screen.queryByRole("button", { name: /^Rename (Ana’s laptop|Phone)/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Revoke Phone" }));
  const confirm = screen.getByRole("group", { name: "Revoke Phone" });
  await act(async () => { fireEvent.click(within(confirm).getByRole("button", { name: "Revoke Phone" })); });
  expect(done.revokeMachineDevice).toHaveBeenCalledWith("fp-nuc", "d-phone");
  // Pairing goes from a device to the machine, never from here.
  expect(screen.queryByRole("button", { name: "Pair another device" })).toBeNull();
  // Its Sidevoice service's card is to read: it is run there.
  expect(screen.getByRole("heading", { name: "Sidevoice service" }).closest(".host-status-card")).toHaveAttribute("data-remote");
  expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Forget NUC" }));
  fireEvent.click(screen.getByRole("button", { name: "Yes, forget" }));
  expect(done.forgetMachine).toHaveBeenCalledWith("fp-nuc");
});

test("this computer's page never lists its own Sidevoice: alone, no other devices are paired; the others, each revocable", async () => {
  const done = actions();
  done.localHostDevices.mockResolvedValueOnce([{ device_id: "d-local", name: "MacBook", kind: "local" }])
    .mockResolvedValue([{ device_id: "d-local", name: "MacBook", kind: "local" }, { device_id: "d-phone", name: "Phone", kind: "code" }]);
  const store = room([local]);
  await waitFor(() => expect(screen.getByText("No other devices are paired with this computer.")).toBeInTheDocument());
  expect(document.querySelectorAll(".host-device-row")).toHaveLength(0);
  // Another device pairs with it: listed, and revocable; this computer still not.
  act(() => { store.patch({ pairings: [paired({ ...local, fp: "fp-local-2" })] }); });
  await waitFor(() => expect(screen.getByText("Phone")).toBeInTheDocument());
  expect([...document.querySelectorAll(".host-device-row strong")].map((name) => name.textContent)).toEqual(["Phone"]);
  expect(screen.getByRole("button", { name: "Revoke Phone" })).toBeInTheDocument();
  expect(screen.queryByText("No other devices are paired with this computer.")).toBeNull();
});

test("a devices list that couldn't be read offers Retry, which reads it again", async () => {
  const devices: HostDeviceView[] = [{ device_id: "d-nuc", name: "Chrome on Mac", current: true }, { device_id: "d-phone", name: "Phone", kind: "code" }];
  const machineDevices = vi.fn().mockRejectedValueOnce(new Error("unreachable")).mockResolvedValue(devices);
  const done = { ...actions(), machineDevices, loadHostAgents: vi.fn() };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  room([paired()], { machineLinks: { "fp-nuc": { reach: "ok", via: "node" } } });
  const retry = await screen.findByRole("button", { name: "Retry" });
  await act(async () => { fireEvent.click(retry); });
  await waitFor(() => expect(screen.getByText("Phone")).toBeInTheDocument());
  expect(machineDevices).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  expect(within(document.querySelector(".host-device-row") as HTMLElement).queryByRole("button", { name: "Forget NUC" })).toBeNull();
});

test("the remote machines are entries under Remote machines, Add a remote machine last; an entry shows its machine's whole page", async () => {
  const done = { ...actions(), machineDevices: vi.fn().mockResolvedValue([]), loadHostAgents: vi.fn() };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  const other = paired({ fp: "fp-other", host: "Other PC" });
  const store = room([local, paired(), other], { machineLinks: { "fp-nuc": { reach: "ok", via: "node" }, "fp-other": { reach: "ok", via: "node" } } });
  const machines = document.getElementById("machines")!;
  const nav = machines.querySelector(".machines-inline .machine-nav")!;
  expect(within(machines).getByRole("heading", { level: 2 })).toHaveTextContent("Remote machines");
  expect([...nav.querySelectorAll("button")].map((button) => button.textContent)).toEqual([expect.stringMatching(/^NUC/), expect.stringMatching(/^Other PC/), "Add"]);
  expect(nav.querySelector(".machine-nav-add")).toHaveAccessibleName("Add a remote machine");
  expect(entry("NUC")).toHaveAccessibleName("NUC, Connected");
  // Each a server, as Remote machines' own icon is: in its entry and in its page's header.
  expect(entry("NUC").querySelector("svg")).toHaveClass("lucide-server");
  expect(machines.querySelector('.host-detail[aria-label="NUC"] .machine-icon svg')).toHaveClass("lucide-server");
  // Remote machines alone is the first remote machine; this computer's page is This device's.
  // Each card is the Sidevoice service: the remote machine's, to read, there; this computer's, with its controls, here.
  expect(within(machines).getByRole("heading", { name: "Sidevoice service" }).closest(".host-status-card")).toHaveAttribute("data-remote");
  expect(machines.querySelector(".host-status-card:not([data-remote])")).toBeNull();
  expect(within(thisDevice()).getByRole("heading", { name: "Sidevoice service" }).closest(".host-status-card")).not.toHaveAttribute("data-remote");
  await act(async () => { entry("Other PC").click(); });
  expect(store.getState().facts.machinesView.machine).not.toBeNull();
  // Every machine's page has its Sidevoice service's card: another machine's, to read.
  const page = (name: string) => within(machines).queryByRole("region", { name });
  expect(page("NUC")).toBeNull();
  expect(within(page("Other PC")!).getByRole("heading", { name: "Sidevoice service" }).closest(".host-status-card")).toHaveAttribute("data-remote");
  await act(async () => { entry("NUC").click(); });
  expect(within(page("NUC")!).getByRole("heading", { name: "Sidevoice service" }).closest(".host-status-card")).toHaveAttribute("data-remote");
  expect(within(machines).getByRole("heading", { name: "Paired devices" })).toBeInTheDocument();
  expect(entry("NUC")).toHaveAttribute("aria-current", "page");
});

test("asked for a machine's agents, Machines shows that machine once, without feeding the store back into itself", () => {
  actions();
  const store = room([local, paired()], { machineLinks: { "fp-nuc": { reach: "ok", via: "node" } } });
  const patch = vi.spyOn(store, "patch");
  act(() => store.patch({ settingsAgentRequest: { fp: "fp-nuc", id: 7 } }));
  expect(entry("NUC")).toHaveAttribute("aria-current", "page");
  // The request, then the machine chosen; nothing after.
  expect(patch.mock.calls.length).toBeLessThanOrEqual(2);
  act(() => store.patch({ pairingNote: "x" } as never));
  expect(patch.mock.calls.length).toBeLessThanOrEqual(3);
});

test("this computer is not among the remote machines; stopped, its card says Stopped and offers Start, and nothing of sign-in", async () => {
  setBridge({ start: vi.fn(async () => running) });
  actions();
  const stopped: LocalHostStatus = { ...running, state: "stopped-by-person", reachable: false, installed: false, service: "none" };
  room([local, paired()], { localHostStatus: stopped });
  expect(entry("MacBook")).toBeNull();
  expect(entry("NUC")).not.toHaveTextContent("This computer");
  expect(within(thisDevice()).getByRole("button", { name: "Start" })).toBeInTheDocument();
  // Its state's word alone says it: no sentence repeats it, and whether it starts at sign-in is its switch's.
  expect(thisDevice().querySelector(".host-status-state")).toHaveTextContent(/^Stopped$/);
  expect(thisDevice().querySelector(".host-status-summary")).toBeNull();
  expect(within(thisDevice()).queryByText(/sign in/)).toBeNull();
});


test("a machine paired without encryption shows exactly what the same machine paired with it shows: its entry, its page", async () => {
  // The same machine, paired over https or — as the person agreed when pairing — over plain http on a private network.
  const lab = { fp: "fp-lab", host: "Lab box", rv: null };
  const encrypted = paired({ ...lab, urls: ["https://lab.example"] });
  const unencrypted = paired({ ...lab, insecure: true, urls: ["http://192.168.1.20:8768"] });
  // What the person meets under Machines, with Lab box's page open; React's own ids are counted afresh each render.
  const shown = async (pairing: PairingSummary) => {
    actions();
    room([pairing, paired()], { remoteHostStatus: { "fp-lab": { state: "connected", checkedAt: 1_700_000_000_000 } },
      machineLinks: { "fp-lab": { reach: "ok", via: "node" }, "fp-nuc": { reach: "ok", via: "node" } } });
    await act(async () => { entry("Lab box").click(); });
    expect(screen.getByRole("region", { name: "Lab box" })).toBeInTheDocument();
    const html = document.getElementById("machines")!.outerHTML.replace(/«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, "«id»");
    cleanup();
    return html;
  };
  const plain = await shown(unencrypted);
  expect(plain).toBe(await shown(encrypted));
  // And nothing in it speaks of encryption: no words, no open lock, no (i) about the connection.
  expect(plain).not.toMatch(/encrypt|lucide-lock|insecure|About this connection/i);
  expect(plain).toContain("Lab box, Connected");
});

/** The devices list on a remote machine's page, and the action at that page's foot. */
const devicesPanel = () => document.querySelector<HTMLElement>("#machines .host-devices-panel")!;
const forgetFoot = () => document.querySelector<HTMLElement>("#machines .host-forget");

test("forgetting a machine is never in its devices list, online or offline: it is the page's foot", async () => {
  const devices: HostDeviceView[] = [{ device_id: "d-nuc", name: "Chrome on Mac", current: true }, { device_id: "d-phone", name: "Phone", kind: "code" }];
  const done = { ...actions(), machineDevices: vi.fn().mockResolvedValue(devices), forgetMachine: vi.fn(), loadHostAgents: vi.fn() };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  // Online: this device's row is there, "This device", with no Forget.
  room([paired()], { machineLinks: { "fp-nuc": { reach: "ok", via: "node" } } });
  await waitFor(() => expect(screen.getByText("Phone")).toBeInTheDocument());
  expect(within(devicesPanel()).getByText("This device")).toBeInTheDocument();
  expect(within(devicesPanel()).queryByRole("button", { name: /Forget/ })).toBeNull();
  expect(within(forgetFoot()!).getByRole("button", { name: "Forget NUC" })).toBeInTheDocument();
  // After the devices: the page's last section.
  expect(document.querySelector('#machines .host-detail[aria-label="NUC"]')!.lastElementChild).toBe(forgetFoot());
  cleanup();
  // Offline: the list can't be read, and still offers no Forget of its own.
  room([paired()], { machineLinks: { "fp-nuc": { reach: "away", via: "" } } });
  expect(within(devicesPanel()).queryByRole("button", { name: /Forget/ })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Forget NUC" })).toHaveLength(1);
  expect(within(forgetFoot()!).getByRole("button", { name: "Forget NUC" })).toBeInTheDocument();
});

test("only a remote machine's page has Forget at its foot; this device's page never does", () => {
  const done = { ...actions(), machineDevices: vi.fn().mockResolvedValue([]), forgetMachine: vi.fn(), loadHostAgents: vi.fn() };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  room([local, paired()], { machineLinks: { "fp-nuc": { reach: "ok", via: "node" } } });
  expect(thisDevice().querySelector(".host-forget")).toBeNull();
  expect(within(thisDevice()).queryByRole("button", { name: /^Forget/ })).toBeNull();
  expect(forgetFoot()).not.toBeNull();
  expect(screen.getAllByRole("button", { name: /^Forget/ }).map((button) => button.textContent)).toEqual(["Forget NUC"]);
});

test("Forget at a machine's foot is a danger button that asks first: the hint, then the online line; Yes forgets it", () => {
  const done = { ...actions(), machineDevices: vi.fn().mockResolvedValue([]), forgetMachine: vi.fn(), loadHostAgents: vi.fn() };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  room([paired()], { machineLinks: { "fp-nuc": { reach: "ok", via: "node" } },
    remoteHostStatus: { "fp-nuc": { state: "connected", checkedAt: 1_700_000_000_000 } } });
  const open = within(forgetFoot()!).getByRole("button", { name: "Forget NUC" });
  expect(open).toHaveClass("ui-button--danger");
  fireEvent.click(open);
  const confirm = within(forgetFoot()!).getByRole("group", { name: "Forget NUC" });
  expect([...confirm.querySelectorAll("p")].map((line) => line.textContent)).toEqual([
    "Unpairs this device from NUC: its conversations and calls stop here until you pair it again with a new code.",
    "Forget this machine? You will need a new code to use it again."]);
  expect(within(confirm).getByRole("button", { name: "Cancel" })).toHaveFocus();
  expect(done.forgetMachine).not.toHaveBeenCalled();
  fireEvent.click(within(confirm).getByRole("button", { name: "Yes, forget" }));
  expect(done.forgetMachine).toHaveBeenCalledExactlyOnceWith("fp-nuc");
});

test("Forget asked of a machine that doesn't answer says it will be told when it's back; Yes still forgets it", () => {
  const done = { ...actions(), machineDevices: vi.fn(), forgetMachine: vi.fn() };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  room([paired()], { machineLinks: { "fp-nuc": { reach: "away", via: "" } } });
  fireEvent.click(within(forgetFoot()!).getByRole("button", { name: "Forget NUC" }));
  const confirm = within(forgetFoot()!).getByRole("group", { name: "Forget NUC" });
  expect([...confirm.querySelectorAll("p")].map((line) => line.textContent)).toEqual([
    "Unpairs this device from NUC: its conversations and calls stop here until you pair it again with a new code.",
    "Forget this machine? You will need a new code to use it again. NUC is offline: it will be told when it’s back."]);
  fireEvent.click(within(confirm).getByRole("button", { name: "Yes, forget" }));
  expect(done.forgetMachine).toHaveBeenCalledExactlyOnceWith("fp-nuc");
  expect(done.machineDevices).not.toHaveBeenCalled();
});

test("Cancel closes Forget's question without forgetting, and the focus goes back to Forget", async () => {
  const done = { ...actions(), machineDevices: vi.fn().mockResolvedValue([]), forgetMachine: vi.fn(), loadHostAgents: vi.fn() };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  room([paired()], { machineLinks: { "fp-nuc": { reach: "ok", via: "node" } } });
  fireEvent.click(within(forgetFoot()!).getByRole("button", { name: "Forget NUC" }));
  fireEvent.click(within(forgetFoot()!).getByRole("button", { name: "Cancel" }));
  expect(within(forgetFoot()!).queryByRole("group")).toBeNull();
  await waitFor(() => expect(within(forgetFoot()!).getByRole("button", { name: "Forget NUC" })).toHaveFocus());
  expect(done.forgetMachine).not.toHaveBeenCalled();
});

/** This device's app, with its build (sidevoice-desktop #56), its service behind what it bundles, and maybe its updater. */
function buildBridge(build: Record<string, unknown> | undefined, withUpdater = false) {
  const version: LocalHostVersion = { bridge: 3, bundled: { version: "0.9.1" }, installed: {}, core_api: 2, update: "available" };
  setBridge({ version: vi.fn(async () => version), update: vi.fn().mockResolvedValue(running) });
  const desktop = (window as unknown as { __sidevoiceDesktop: { host: Record<string, unknown> } }).__sidevoiceDesktop;
  desktop.host.build = build;
  if (withUpdater) desktop.host.updater = fakeUpdater({ mode: "manual", status: { state: "available", version: "0.5.0" } }).updater;
  actions();
}
const versionLine = () => document.querySelector(".host-status-product");

/* Everything that updates is in Settings › Updates (UpdatesSettings.test.tsx): This device's card says its version — the
 * app's, the Sidevoice the person installed — and, where the app updates something here, Update available, a link to
 * its row in Updates; never a vague "See updates", never an action of its own. */
test("This device's card: the app's version and Update available, a link to Updates, where the app updates something; no Update, no Automatic/Manual, no Check, no build note", async () => {
  for (const [build, withUpdater, line] of [
    [{ channel: "release", version: "0.4.0" }, true, "Sidevoice 0.4.0 · Update available"],
    [{ channel: "nightly", version: "0.5.0-nightly", commit: "abcdef0123456789" }, true, "Sidevoice 0.5.0-nightly · Update available"],
    // Updated by hand, or a development build: nothing here updates it, so nothing is said of updates.
    [{ channel: "nightly", version: "0.5.0-nightly" }, false, "Sidevoice 0.5.0-nightly"], [{ channel: "dev", version: "0.5.0-dev" }, false, "Sidevoice 0.5.0-dev"],
  ] as [Record<string, unknown>, boolean, string][]) {
    buildBridge(build, withUpdater);
    room([local], { localHostStatus: { ...running, product_version: "0.8.1" } });
    await act(async () => {});
    const card = thisDevice();
    await waitFor(() => expect(versionLine()).toHaveTextContent(new RegExp("^" + line.replaceAll(".", "\\.") + "$")));
    expect(within(card).queryAllByRole("button", { name: "Update available, see it in Updates" })).toHaveLength(withUpdater ? 1 : 0);
    expect(within(card).queryByRole("button", { name: /See updates|Update the service|Update the app|Check for updates/ })).toBeNull();
    expect(within(card).queryByRole("radiogroup", { name: "Updates" })).toBeNull();
    expect(card.querySelector(".host-status-build, .host-update-control, .app-update-settings")).toBeNull();
    cleanup();
  }
});

test("where the product does not say its version, the card shows the app's, as it does when it does", () => {
  buildBridge({ channel: "nightly", version: "0.5.0-nightly" });
  room([local], { localHostStatus: running });
  expect(versionLine()).toHaveTextContent("Sidevoice 0.5.0-nightly");
});
