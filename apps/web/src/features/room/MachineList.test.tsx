import { expect, onTestFinished, test, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MachineList } from "./MachineList";
import { NoMachineScreen } from "../pairing/NoMachineScreen";
import { LocalHostBanner } from "../settings/LocalHostBanner";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { HostDeviceView } from "../../state/room-types";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostBridge, LocalHostStatus, LocalHostVersion, LocalPairingCode } from "../../services/desktop-host";

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


function room(pairings: PairingSummary[], facts: Record<string, unknown> = {}) {
  const store = createRoomStore();
  act(() => { store.patch({ pairings, machinesAt: 1_700_086_400_000,
    machinesReady: true, localHostAvailable: pairings.some((item) => item.local), localHostStatus: running, ...facts }); });
  render(<RoomProvider store={store}><MachineList /></RoomProvider>);
  return store;
}

test("the local host is first, every remote row says Connected without revealing a route, and no machine is to be chosen", async () => {
  actions();
  const other = paired({ fp: "fp-other", host: "Other PC" });
  room([local, paired(), other], { machineLinks: { "fp-nuc": { reach: "ok", via: "room" }, "fp-other": { reach: "ok", via: "node" } } });
  const rows = [...document.querySelectorAll(".machines-inline .machine-entry")];
  expect(rows).toHaveLength(3);
  expect(rows[0].getAttribute("aria-label")).toMatch(/MacBook/);
  expect(rows[0].getAttribute("aria-label")).toMatch(/This computer/);
  expect(rows[1].getAttribute("aria-label")).toMatch(/NUC/);
  expect(rows[1].getAttribute("aria-label")).toMatch(/Connected/);
  expect(rows[1].getAttribute("aria-label")).not.toMatch(/room\.example|nuc-1|fingerprint|relay/i);
  expect(rows[2].getAttribute("aria-label")).toMatch(/Other PC.*Connected/);
  expect(rows.some((row) => row.hasAttribute("data-in-use"))).toBe(false);
  // Every machine is live at once: no page says In use or offers Use.
  for (const name of ["MacBook", "NUC", "Other PC"]) {
    await act(async () => { entry(name).click(); });
    expect(screen.queryByRole("button", { name: /^Use / })).toBeNull();
    expect(screen.queryByText(/In use/)).toBeNull();
  }
});

test("an unreachable remote machine only says No response, and can still be forgotten, told when it's back", () => {
  const done = { ...actions(), machineDevices: vi.fn(), forgetMachine: vi.fn() };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  room([paired()], { machineLinks: { "fp-nuc": { reach: "away", via: "" } } });
  expect(document.querySelector(".machines-inline .machine-entry")?.getAttribute("aria-label")).toMatch(/No response/);
  expect(screen.queryByRole("button", { name: /Retry NUC/ })).toBeNull();
  // Its list can't be read, so no row of this device's: Forget is offered on its own, and never waits on the machine.
  expect(done.machineDevices).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Forget NUC" }));
  expect(screen.getByRole("group", { name: "Forget NUC" })).toHaveTextContent("NUC is offline: it will be told when it’s back.");
  fireEvent.click(screen.getByRole("button", { name: "Yes, forget" }));
  expect(done.forgetMachine).toHaveBeenCalledWith("fp-nuc");
});

test("the Machines footer offers local setup only when no local host is projected, and keeps remote pairing", async () => {
  const install = vi.fn();
  const done = actions();
  setBridge({ install });
  room([paired()], { localHostStatus: { state: "absent" }, localHostAvailable: true });

  expect(screen.getByRole("button", { name: "Use agents on this computer" })).toBeInTheDocument();
  await act(async () => { screen.getAllByRole("button", { name: "Add a machine" })[0].click(); });
  expect(done.openPairing).toHaveBeenCalledOnce();
  expect(install).not.toHaveBeenCalled();
});

test("an existing stopped local R1 host keeps its row and does not show the install CTA", () => {
  actions();
  setBridge({ install: vi.fn() });
  room([local], { localHostStatus: { state: "stopped-by-person", installed: true, reachable: false } });

  expect(entry("MacBook")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Use agents on this computer" })).toBeNull();
});

test("an already-running local R1 host is shown without starting another install", () => {
  const install = vi.fn();
  setBridge({ install });
  actions();
  room([local], { localHostStatus: running });

  expect(entry("MacBook")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Use agents on this computer" })).toBeNull();
  expect(install).not.toHaveBeenCalled();
});

test("a failed local R1 host stays on the existing machine path instead of the no-machine screen", () => {
  setBridge({ install: vi.fn() });
  const store = createRoomStore();
  act(() => store.patch({ pairings: [local], machinesReady: true, localHostAvailable: true,
    localHostStatus: { state: "failed", installed: true, failure: { key: "start.failed" } } }));
  render(<RoomProvider store={store}><NoMachineScreen /></RoomProvider>);

  expect(screen.queryByRole("heading", { name: "No machine connected" })).toBeNull();
});

test("a remote that does not answer says No response while another answers: each row says its own link", () => {
  actions();
  const other = paired({ fp: "fp-other", host: "Other PC" });
  room([local, paired(), other], { machineLinks: { "fp-nuc": { reach: "offline", via: "" }, "fp-other": { reach: "ok", via: "node" } } });
  const rows = [...document.querySelectorAll(".machines-inline .machine-entry")];
  expect(rows[1].getAttribute("aria-label")).toMatch(/NUC/);
  expect(rows[1].getAttribute("aria-label")).toMatch(/No response/);
  expect(rows[2].getAttribute("aria-label")).toMatch(/Other PC/);
  expect(rows[2].getAttribute("aria-label")).toMatch(/Connected/);
});

test("local F6 status shows only supported service actions", async () => {
  const serviceInstall = vi.fn().mockResolvedValue(undefined);
  setBridge({ serviceInstall, start: undefined, restart: undefined, stop: undefined });
  actions();
  room([local], { localHostStatus: { state: "not-installed", installed: false, service: "none" } });
  await act(async () => { entry("MacBook").click(); });
  expect(screen.getByRole("heading", { name: "Sidevoice on MacBook" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Paired devices" })).toBeInTheDocument();
  expect(document.querySelector(".host-status-summary")).toHaveTextContent("Does not start when you sign in");
  // Not installed: its one action is Start, which installs the service; Start at sign-in comes once there is one.
  expect(screen.getAllByRole("button", { name: "Start" })).toHaveLength(1);
  expect(screen.queryByRole("switch", { name: "Start at sign-in" })).toBeNull();
  expect(screen.queryByRole("button", { name: /agent/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /copy from another machine/i })).toBeNull();
  expect(screen.queryByRole("button", { name: "Use agents on this computer" })).toBeNull();
  await act(async () => { screen.getByRole("button", { name: "Start" }).click(); });
  expect(serviceInstall).toHaveBeenCalledOnce();
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
  act(() => store.patch({ pairings: [local], machinesReady: true, localHostAvailable: true, localHostStatus: secretStatus }));

  const writeText = vi.fn(async (_value: string) => {});
  const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    render(<RoomProvider store={store}><LocalHostBanner /><MachineList /></RoomProvider>);
    expect(document.querySelector(".local-host-banner")).toBeInTheDocument();
    await act(async () => { fireEvent.click(entry("MacBook")); });
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

test("Update appears only for an available version and waits for active calls", async () => {
  const version: LocalHostVersion = { bridge: 3, bundled: {}, installed: {}, core_api: 2, update: "available" };
  const versionCheck = vi.fn(async () => version);
  const update = vi.fn().mockResolvedValue(running);
  setBridge({ version: versionCheck, update });
  actions();
  room([local], { localHostStatus: { ...running, calls: 2 } });
  await act(async () => { entry("MacBook").click(); });

  expect(await screen.findByText("Wait for 2 active calls to finish before updating.")).toBeInTheDocument();
  const updateButton = screen.getByRole("button", { name: "Update this machine" });
  expect(updateButton).toBeDisabled();
  expect(versionCheck).toHaveBeenCalledOnce();
  expect(update).not.toHaveBeenCalled();
});

test("an available Update click delegates to the optional desktop transaction", async () => {
  const available: LocalHostVersion = { bridge: 3, bundled: {}, installed: {}, core_api: 2, update: "available" };
  const current: LocalHostVersion = { ...available, update: "current" };
  const version = vi.fn().mockResolvedValueOnce(available).mockResolvedValueOnce(available).mockResolvedValueOnce(current);
  const update = vi.fn().mockResolvedValue(running);
  setBridge({ version, update });
  actions();
  room([local], { localHostStatus: { ...running, calls: 0 } });
  await act(async () => { entry("MacBook").click(); });

  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Update this machine" })); });
  expect(update).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole("button", { name: "Update this machine" })).toBeNull());
  expect(version).toHaveBeenCalledTimes(3);
});

test("copied Update errors omit unrecognized bridge keys and steps while retaining safe checks", async () => {
  const available: LocalHostVersion = { bridge: 3, bundled: {}, installed: {}, core_api: 2, update: "available" };
  const version = vi.fn(async () => available);
  const update = vi.fn().mockRejectedValue({ key: "SV1.private-pairing-code", step: "token-secret",
    params: { check: "archive-link", token: "raw-token" } });
  setBridge({ version, update });
  actions();
  room([local], { localHostStatus: { ...running, calls: 0 } });
  await act(async () => { entry("MacBook").click(); });

  const writeText = vi.fn(async (_value: string) => {});
  const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Update this machine" })); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Sidevoice could not prepare this computer.");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy details" })); });

    const copied = writeText.mock.calls[0][0];
    expect(JSON.parse(copied)).toEqual({ key: "install.unknown", params: { check: "archive-link" } });
    expect(copied).not.toContain("SV1.private-pairing-code");
    expect(copied).not.toContain("token-secret");
    expect(copied).not.toContain("raw-token");
  } finally {
    if (previousClipboard) Object.defineProperty(navigator, "clipboard", previousClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

test("a newer installed build found at click time is never downgraded", async () => {
  const available: LocalHostVersion = { bridge: 3, bundled: {}, installed: {}, core_api: 2, update: "available" };
  const newer: LocalHostVersion = { ...available, update: "newer-installed" };
  const version = vi.fn().mockResolvedValueOnce(available).mockResolvedValueOnce(newer);
  const update = vi.fn().mockResolvedValue(running);
  setBridge({ version, update });
  actions();
  room([local], { localHostStatus: { ...running, calls: 0 } });
  await act(async () => { entry("MacBook").click(); });

  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Update this machine" })); });
  expect(await screen.findByText("A newer Sidevoice core is already installed. Update the desktop app to use it.")).toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
});

test.each([
  ["newer-installed", "A newer Sidevoice core is already installed. Update the desktop app to use it."],
  ["incompatible", "This machine reports core API 9, which this app cannot use."],
] as const)("Update is not offered when version reports %s", async (state, copy) => {
  const version: LocalHostVersion = { bridge: 3, bundled: {}, installed: {}, core_api: 9, update: state };
  const update = vi.fn().mockResolvedValue(running);
  setBridge({ version: vi.fn(async () => version), update });
  actions();
  room([local]);
  await act(async () => { entry("MacBook").click(); });

  expect(await screen.findByText(copy)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Update this machine" })).toBeNull();
  expect(update).not.toHaveBeenCalled();
});

test("stopping the local host while calls are active asks first, and Cancel leaves it running", async () => {
  const stop = vi.fn().mockResolvedValue(undefined);
  setBridge({ stop });
  actions();
  room([local], { localHostStatus: { ...running, calls: 1 } });
  await act(async () => { entry("MacBook").click(); });

  await act(async () => { screen.getByRole("button", { name: "Stop" }).click(); });
  expect(screen.getByText("Stop Sidevoice on this computer? Active calls will end.")).toBeInTheDocument();
  expect(stop).not.toHaveBeenCalled();
  await act(async () => { screen.getByRole("button", { name: "Cancel" }).click(); });
  expect(screen.getByText("Running")).toBeInTheDocument();
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
  await act(async () => { entry("MacBook").click(); });

  await act(async () => { screen.getByRole("button", { name: "Stop" }).click(); });
  expect(screen.queryByText("Stop Sidevoice on this computer? Active calls will end.")).toBeNull();
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
    await act(async () => { entry("MacBook").click(); });
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
  act(() => { store.patch({ pairings: [], localHostAvailable: true,
    localHostStatus: status, machinesReady: true }); });
  render(<RoomProvider store={store}><MachineList /></RoomProvider>);
  await act(async () => { entry("This computer").click(); });
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
  act(() => { store.patch({ pairings: [local], localHostAvailable: true,
    localHostStatus: running, machinesReady: true }); });
  render(<RoomProvider store={store}><MachineList /></RoomProvider>);
  await act(async () => { entry("MacBook").click(); });
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
  act(() => { store.patch({ pairings: [local], localHostAvailable: true,
    localHostStatus: status, machinesReady: true }); });
  render(<RoomProvider store={store}><MachineList /></RoomProvider>);
  await act(async () => { entry("MacBook").click(); });
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
  act(() => { store.patch({ pairings: [local], localHostAvailable: true,
    localHostStatus: status, machinesReady: true }); });
  render(<RoomProvider store={store}><MachineList /></RoomProvider>);
  await act(async () => { entry("MacBook").click(); });
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

test("a lost native pairing keeps a local Status row and recovery action, with nothing to choose", async () => {
  const restart = vi.fn().mockResolvedValue(undefined);
  setBridge({ restart, state: vi.fn(async (): Promise<LocalHostStatus> => ({ state: "failed", reachable: false })) });
  actions();
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [], localHostAvailable: true,
    localHostStatus: { state: "failed", reachable: false, failure: { key: "start.failed" } }, machinesReady: true }); });
  render(<RoomProvider store={store}><MachineList /><LocalHostBanner /></RoomProvider>);

  const row = document.querySelector(".machines-inline .machine-entry");
  expect(row).toHaveAttribute("data-local", "true");
  expect(row).not.toHaveAttribute("data-in-use");
  expect(row?.textContent).toMatch(/This computer/);
  expect(screen.queryByRole("button", { name: "Use This computer" })).toBeNull();
  expect(screen.getByText(/This computer is unavailable/)).toBeInTheDocument();
  await act(async () => { entry("This computer").click(); });
  expect(screen.getByRole("heading", { name: "Sidevoice on this computer" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(2);
  await act(async () => { screen.getAllByRole("button", { name: "Retry" })[0].click(); });
  expect(restart).toHaveBeenCalledOnce();
});

test("a reachable local core stays Connected when its service state is not running and hides the warning", () => {
  actions();
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local], localHostAvailable: true,
    localHostStatus: { state: "stopped-by-person", reachable: true }, machinesReady: true }); });
  render(<RoomProvider store={store}><MachineList /><LocalHostBanner /></RoomProvider>);
  expect(document.querySelector(".machines-inline .machine-entry")?.getAttribute("aria-label")).toMatch(/Connected/);
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
  // This device's row: its name, "This device", and forgetting the machine — never revoking itself.
  expect(rows[0]).toHaveTextContent("Ana’s laptop");
  expect(within(rows[0]).getByText("This device")).toBeInTheDocument();
  expect(within(rows[0]).getByRole("button", { name: "Forget NUC" })).toBeInTheDocument();
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
  // Its Sidevoice card is to read: it is run there.
  expect(screen.getByRole("heading", { name: "Sidevoice on NUC" })).toBeInTheDocument();
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
  expect(within(document.querySelector(".host-device-row") as HTMLElement).getByRole("button", { name: "Forget NUC" })).toBeInTheDocument();
});

test("the machines are entries under Machines, Add a machine last; an entry shows its machine's whole page", async () => {
  const done = { ...actions(), machineDevices: vi.fn().mockResolvedValue([]), loadHostAgents: vi.fn() };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  const store = room([local, paired()], { machineLinks: { "fp-nuc": { reach: "ok", via: "node" } } });
  const nav = document.querySelector(".machines-inline .machine-nav")!;
  // This computer's entry says so before its name (an icon, in words to a screen reader).
  expect([...nav.querySelectorAll("button")].map((button) => button.textContent)).toEqual([expect.stringMatching(/^This computerMacBook/), expect.stringMatching(/^NUC/), "Add a machine"]);
  expect(entry("NUC")).toHaveAccessibleName("NUC, Online · Connected");
  // Machines alone is the first machine.
  expect(screen.getByRole("heading", { name: "Sidevoice on MacBook" })).toBeInTheDocument();
  await act(async () => { entry("NUC").click(); });
  expect(store.getState().facts.machinesView.machine).not.toBeNull();
  // Every machine's page has its Sidevoice card: another machine's, to read.
  expect(screen.queryByRole("heading", { name: "Sidevoice on MacBook" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Sidevoice on NUC" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Paired devices" })).toBeInTheDocument();
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

test("this computer's machine is marked in the list; stopped, it says Start brings it back, and whether sign-in would", async () => {
  setBridge({ start: vi.fn(async () => running) });
  actions();
  const stopped: LocalHostStatus = { ...running, state: "stopped-by-person", reachable: false, installed: false, service: "none" };
  room([local, paired()], { localHostStatus: stopped });
  expect(entry("MacBook")).toHaveTextContent("This computer");
  expect(entry("NUC")).not.toHaveTextContent("This computer");
  expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  expect(screen.getByText(/does not start when you sign in\. Start it here/)).toBeInTheDocument();
});


test("a machine paired without encryption says so on its page, with why, and its entry carries a sign heard with its name", async () => {
  actions();
  const remote = { "fp-nuc": { state: "connected", checkedAt: 1_700_000_000_000 }, "fp-lab": { state: "connected", checkedAt: 1_700_000_000_000 } };
  room([paired({ fp: "fp-lab", host: "Lab box", insecure: true, urls: ["http://192.168.1.20:8765"], rv: null }), paired()], { remoteHostStatus: remote });
  await act(async () => { entry("Lab box").click(); });
  const page = screen.getByRole("region", { name: "Lab box" });
  const badge = within(page.querySelector("header")!).getByText("Not encrypted");
  expect(badge.closest(".ui-badge")).toHaveAttribute("data-tone", "warning");
  expect(badge.closest(".ui-badge")!.querySelector("svg")).not.toBeNull();
  expect(within(page).getByRole("button", { name: "About this connection" })).toBeInTheDocument();
  // In the list, a sign after the name (which gives way, the sign never), and in words to a screen reader.
  expect(entry("Lab box").querySelector(".machine-nav-name + .machine-nav-insecure svg")).not.toBeNull();
  expect(entry("Lab box").getAttribute("aria-label")).toMatch(/^Lab box, not encrypted, /);
  // One paired over https says nothing of the kind.
  expect(entry("NUC").querySelector(".machine-nav-insecure")).toBeNull();
  expect(entry("NUC").getAttribute("aria-label")).not.toMatch(/not encrypted/);
  await act(async () => { entry("NUC").click(); });
  expect(screen.queryByText("Not encrypted")).toBeNull();
});
