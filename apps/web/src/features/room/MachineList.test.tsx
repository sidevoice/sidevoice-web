import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  const done = { chooseMachine: vi.fn(), openPairing: vi.fn(), localHostDevices: vi.fn().mockResolvedValue([]), revokeLocalHostDevice: vi.fn().mockResolvedValue(undefined) };
  window.sidevoiceActions = done as unknown as typeof window.sidevoiceActions;
  return done;
}

function room(pairings: PairingSummary[], facts: Record<string, unknown> = {}) {
  const store = createRoomStore();
  act(() => { store.patch({ pairings, pairingInUse: pairings[0]?.fp ?? null, machinesAt: 1_700_086_400_000,
    machinesReady: true, localHostAvailable: pairings.some((item) => item.local), localHostStatus: running, ...facts }); });
  render(<RoomProvider store={store}><MachineList /></RoomProvider>);
  return store;
}

test("the local host is first, remote rows say Connected without revealing a route, and Use switches machines", async () => {
  const done = actions();
  const other = paired({ fp: "fp-other", host: "Other PC" });
  room([local, paired(), other], { pairingInUse: "fp-other", node: "fp-other", nodeReach: "ok",
    remoteHostStatus: { "fp-nuc": { state: "connected", checkedAt: 1_700_000_000_000 } } });
  const rows = [...document.querySelectorAll(".machine-row")];
  expect(rows).toHaveLength(3);
  expect(rows[0].textContent).toMatch(/MacBook/);
  expect(rows[0].textContent).toMatch(/This computer/);
  expect(rows[1].textContent).toMatch(/NUC/);
  expect(rows[1].textContent).toMatch(/Connected/);
  expect(rows[1].textContent).not.toMatch(/room\.example|nuc-1|fingerprint|relay/i);
  await act(async () => { screen.getByRole("button", { name: "Use MacBook" }).click(); });
  expect(done.chooseMachine).toHaveBeenCalledWith("fp-local");
  await act(async () => { screen.getByRole("button", { name: "Use NUC" }).click(); });
  expect(done.chooseMachine).toHaveBeenCalledWith("fp-nuc");
});

test("the unreachable remote row only says No response and has no machine-specific controls", () => {
  actions();
  room([paired()], { pairingInUse: "fp-nuc", node: "fp-nuc", nodeReach: "away" });
  expect(document.querySelector(".machine-row")?.textContent).toMatch(/No response/);
  expect(screen.queryByRole("button", { name: /Retry NUC/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Forget NUC/ })).toBeNull();
});

test("the Machines footer offers local setup only when no local host is projected, and keeps remote pairing", async () => {
  const install = vi.fn();
  const done = actions();
  setBridge({ install });
  room([paired()], { localHostStatus: { state: "absent" }, localHostAvailable: true });

  expect(screen.getByRole("button", { name: "Use agents on this computer" })).toBeInTheDocument();
  await act(async () => { screen.getByRole("button", { name: "Add a machine" }).click(); });
  expect(done.openPairing).toHaveBeenCalledOnce();
  expect(install).not.toHaveBeenCalled();
});

test("an existing stopped local R1 host keeps its row and does not show the install CTA", () => {
  actions();
  setBridge({ install: vi.fn() });
  room([local], { pairingInUse: "fp-local", localHostStatus: { state: "stopped-by-person", installed: true, reachable: false } });

  expect(screen.getByText("MacBook")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Use agents on this computer" })).toBeNull();
});

test("an already-running local R1 host is shown without starting another install", () => {
  const install = vi.fn();
  setBridge({ install });
  actions();
  room([local], { pairingInUse: "fp-local", localHostStatus: running });

  expect(screen.getByText("MacBook")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Use agents on this computer" })).toBeNull();
  expect(install).not.toHaveBeenCalled();
});

test("a failed local R1 host stays on the existing machine path instead of the no-machine screen", () => {
  setBridge({ install: vi.fn() });
  const store = createRoomStore();
  act(() => store.patch({ pairings: [local], pairingInUse: "fp-local", machinesReady: true, localHostAvailable: true,
    localHostStatus: { state: "failed", installed: true, failure: { key: "start.failed" } } }));
  render(<RoomProvider store={store}><NoMachineScreen /></RoomProvider>);

  expect(screen.queryByRole("heading", { name: "No machine connected" })).toBeNull();
});

test("a previously unreachable remote stays No response after another machine becomes selected", () => {
  actions();
  const other = paired({ fp: "fp-other", host: "Other PC" });
  room([local, paired(), other], { pairingInUse: "fp-other", node: "fp-other", nodeReach: "ok",
    remoteHostStatus: { "fp-nuc": { state: "offline", checkedAt: 1_700_000_000_000 } } });
  const rows = [...document.querySelectorAll(".machine-row")];
  expect(rows[1].textContent).toMatch(/NUC/);
  expect(rows[1].textContent).toMatch(/No response/);
  expect(rows[2].textContent).toMatch(/Other PC/);
  expect(rows[2].textContent).toMatch(/Connected/);
});

test("local F6 status shows only supported service actions", async () => {
  const serviceInstall = vi.fn().mockResolvedValue(undefined);
  setBridge({ serviceInstall, start: undefined, restart: undefined, stop: undefined });
  actions();
  room([local], { pairingInUse: "fp-local", localHostStatus: { state: "not-installed", installed: false, service: "none" } });
  await act(async () => { screen.getByRole("button", { name: "Open MacBook" }).click(); });
  expect(screen.getByRole("tab", { name: "Status" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Devices" })).toBeInTheDocument();
  expect(screen.getByText("Does not start when you sign in")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Start at login" })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /agent/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /copy from another machine/i })).toBeNull();
  expect(screen.queryByRole("button", { name: "Use agents on this computer" })).toBeNull();
  await act(async () => { screen.getByRole("button", { name: "Start at login" }).click(); });
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
  act(() => store.patch({ pairings: [local], pairingInUse: "fp-local", machinesReady: true, localHostAvailable: true, localHostStatus: secretStatus }));

  const writeText = vi.fn(async (_value: string) => {});
  const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    render(<RoomProvider store={store}><LocalHostBanner /><MachineList /></RoomProvider>);
    expect(document.querySelector(".local-host-banner")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open MacBook" })); });
    expect(screen.getByText("The Sidevoice service is unavailable: the service could not start")).toBeInTheDocument();
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
  room([local], { pairingInUse: "fp-local", localHostStatus: { ...running, calls: 2 } });
  await act(async () => { screen.getByRole("button", { name: "Open MacBook" }).click(); });

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
  room([local], { pairingInUse: "fp-local", localHostStatus: { ...running, calls: 0 } });
  await act(async () => { screen.getByRole("button", { name: "Open MacBook" }).click(); });

  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Update this machine" })); });
  expect(update).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole("button", { name: "Update this machine" })).toBeNull());
  expect(version).toHaveBeenCalledTimes(3);
});

test("a newer installed build found at click time is never downgraded", async () => {
  const available: LocalHostVersion = { bridge: 3, bundled: {}, installed: {}, core_api: 2, update: "available" };
  const newer: LocalHostVersion = { ...available, update: "newer-installed" };
  const version = vi.fn().mockResolvedValueOnce(available).mockResolvedValueOnce(newer);
  const update = vi.fn().mockResolvedValue(running);
  setBridge({ version, update });
  actions();
  room([local], { pairingInUse: "fp-local", localHostStatus: { ...running, calls: 0 } });
  await act(async () => { screen.getByRole("button", { name: "Open MacBook" }).click(); });

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
  room([local], { pairingInUse: "fp-local" });
  await act(async () => { screen.getByRole("button", { name: "Open MacBook" }).click(); });

  expect(await screen.findByText(copy)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Update this machine" })).toBeNull();
  expect(update).not.toHaveBeenCalled();
});

test("stopping the local host requires confirmation and Cancel leaves it running", async () => {
  const stop = vi.fn().mockResolvedValue(undefined);
  setBridge({ stop });
  actions();
  room([local], { pairingInUse: "fp-local" });
  await act(async () => { screen.getByRole("button", { name: "Open MacBook" }).click(); });

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

test("Devices shows the local code and pairs a local-only host with a room", async () => {
  const pairingCode = vi.fn().mockResolvedValue({ code: "SV1.local", expires_in: 600, reach: "local-only" });
  const pairRoom = vi.fn().mockResolvedValue({ ok: true });
  setBridge({ pairingCode, pairRoom });
  const done = actions();
  done.localHostDevices.mockResolvedValue([{ device_id: "d-local", name: "Sidevoice app", kind: "local", current: true, created_at: 1_700_000_000 }]);
  room([local], { pairingInUse: "fp-local" });
  await act(async () => { screen.getByRole("button", { name: "Open MacBook" }).click(); });
  await act(async () => { screen.getByRole("tab", { name: "Devices" }).click(); });
  await waitFor(() => expect(screen.getByText("Sidevoice app")).toBeInTheDocument());
  expect(screen.getByText("This app")).toBeInTheDocument();
  await act(async () => { screen.getByRole("button", { name: "Create pairing code" }).click(); });
  expect(pairingCode).toHaveBeenCalledOnce();
  expect(screen.getByText("SV1.local")).toBeInTheDocument();
  expect(screen.getByText(/only be reached from this computer/i)).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Room address" }), { target: { value: "https://room.example" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Room pairing code" }), { target: { value: "ROOM-123" } });
  await act(async () => { fireEvent.submit(screen.getByRole("textbox", { name: "Room pairing code" }).closest("form")!); });
  expect(pairRoom).toHaveBeenCalledWith("https://room.example", "ROOM-123");
});

test.each(["not-installed", "service-failed", "stopped-by-person"] as const)(
  "Devices operations remain available for a reachable local core in %s state",
  async (state) => {
    const status: LocalHostStatus = { state, reachable: true, installed: true, service: "launchd" };
    const pairingCode = vi.fn().mockResolvedValue({ code: "SV1.local", expires_in: 600, reach: "local-only" as const });
    setBridge({ state: vi.fn(async () => status), pairingCode });
    const done = actions();
    room([local], { pairingInUse: "fp-local", localHostStatus: status });
    await act(async () => { screen.getByRole("button", { name: "Open MacBook" }).click(); });
    await act(async () => { screen.getByRole("tab", { name: "Devices" }).click(); });
    await waitFor(() => expect(done.localHostDevices).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create pairing code" })).toBeEnabled();

    await act(async () => { screen.getByRole("button", { name: "Retry" }).click(); });
    expect(done.localHostDevices).toHaveBeenCalledTimes(2);
    await act(async () => { screen.getByRole("button", { name: "Create pairing code" }).click(); });
    expect(pairingCode).toHaveBeenCalledOnce();
    expect(screen.getByText("SV1.local")).toBeInTheDocument();
  },
);

test("Devices waits for the verified local pairing if reachability arrives first", async () => {
  const status: LocalHostStatus = { state: "stopped-by-person", reachable: true, installed: true, service: "launchd" };
  const pairingCode = vi.fn().mockResolvedValue({ code: "SV1.local", expires_in: 600, reach: "local-only" as const });
  setBridge({ state: vi.fn(async () => status), pairingCode, pairRoom: vi.fn().mockResolvedValue({ ok: true }) });
  const done = actions();
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [], pairingInUse: "fp-local", localHostSelected: true, localHostAvailable: true,
    localHostStatus: status, machinesReady: true }); });
  render(<RoomProvider store={store}><MachineList /></RoomProvider>);
  await act(async () => { screen.getByRole("button", { name: "Open This computer" }).click(); });
  await act(async () => { screen.getByRole("tab", { name: "Devices" }).click(); });

  expect(done.localHostDevices).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Create pairing code" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

  act(() => { store.patch({ pairings: [local], pairingInUse: "fp-local" }); });
  await waitFor(() => expect(done.localHostDevices).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "Create pairing code" })).toBeEnabled();
  await act(async () => { screen.getByRole("button", { name: "Create pairing code" }).click(); });
  expect(pairingCode).toHaveBeenCalledOnce();
});

test("Devices discards the old host's rows and code when the local pairing identity changes", async () => {
  const pairingCode = vi.fn().mockResolvedValue({ code: "SV1.old-host", expires_in: 600, reach: "local-only" as const });
  setBridge({ pairingCode });
  const done = actions();
  done.localHostDevices.mockImplementationOnce(async () => [{ device_id: "d-old", name: "Old phone", kind: "code" }])
    .mockResolvedValue([{ device_id: "d-new", name: "New phone", kind: "code" }]);
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local], pairingInUse: "fp-local", localHostSelected: true, localHostAvailable: true,
    localHostStatus: running, machinesReady: true }); });
  render(<RoomProvider store={store}><MachineList /></RoomProvider>);
  await act(async () => { screen.getByRole("button", { name: "Open MacBook" }).click(); });
  await act(async () => { screen.getByRole("tab", { name: "Devices" }).click(); });
  await waitFor(() => expect(screen.getByText("Old phone")).toBeInTheDocument());
  await act(async () => { screen.getByRole("button", { name: "Create pairing code" }).click(); });
  expect(screen.getByText("SV1.old-host")).toBeInTheDocument();

  const replacement = paired({ fp: "fp-local-new", host: "Mac mini", local: true, urls: ["http://127.0.0.1:47212"], rv: null, device_id: "d-local-new" });
  act(() => { store.patch({ pairings: [replacement], pairingInUse: replacement.fp }); });
  await waitFor(() => expect(screen.getByText("New phone")).toBeInTheDocument());
  expect(screen.queryByText("Old phone")).toBeNull();
  expect(screen.queryByText("SV1.old-host")).toBeNull();
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
  act(() => { store.patch({ pairings: [local], pairingInUse: "fp-local", localHostSelected: true, localHostAvailable: true,
    localHostStatus: status, machinesReady: true }); });
  render(<RoomProvider store={store}><MachineList /></RoomProvider>);
  await act(async () => { screen.getByRole("button", { name: "Open MacBook" }).click(); });
  await act(async () => { screen.getByRole("tab", { name: "Devices" }).click(); });
  await waitFor(() => expect(screen.getByText("Phone")).toBeInTheDocument());
  await act(async () => { screen.getByRole("button", { name: "Create pairing code" }).click(); });
  expect(screen.getByText("SV1.initial")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Room address" })).toBeInTheDocument();
  await act(async () => { screen.getByRole("button", { name: "Revoke Phone" }).click(); });
  expect(screen.getByRole("group", { name: "Revoke Phone" })).toBeInTheDocument();

  act(() => { store.patch({ pairings: [], pairingInUse: "fp-local", localHostStatus: { ...status, reachable: false } }); });
  await waitFor(() => expect(screen.queryByText("Phone")).toBeNull());
  expect(screen.queryByText("SV1.initial")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Room address" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  expect(screen.queryByRole("group", { name: "Revoke Phone" })).toBeNull();
  expect(screen.getByRole("button", { name: "Create pairing code" })).toBeDisabled();

  act(() => { store.patch({ pairings: [local], pairingInUse: "fp-local", localHostStatus: { ...status, reachable: true, state: "service-failed" } }); });
  await waitFor(() => expect(screen.getByText("Tablet")).toBeInTheDocument());
  expect(screen.queryByText("SV1.initial")).toBeNull();
  expect(done.localHostDevices).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Create pairing code" })).toBeEnabled();
});

test("in-flight device and code results cannot repopulate Devices after reachability is lost", async () => {
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
  act(() => { store.patch({ pairings: [local], pairingInUse: "fp-local", localHostSelected: true, localHostAvailable: true,
    localHostStatus: status, machinesReady: true }); });
  render(<RoomProvider store={store}><MachineList /></RoomProvider>);
  await act(async () => { screen.getByRole("button", { name: "Open MacBook" }).click(); });
  await act(async () => { screen.getByRole("tab", { name: "Devices" }).click(); });
  await waitFor(() => expect(done.localHostDevices).toHaveBeenCalledOnce());
  await act(async () => { screen.getByRole("button", { name: "Create pairing code" }).click(); });

  act(() => { store.patch({ pairings: [], pairingInUse: "fp-local", localHostStatus: { ...status, reachable: false } }); });
  await act(async () => {
    resolveDevices([{ device_id: "d-stale", name: "Stale phone", kind: "code" }]);
    resolveCode({ code: "SV1.stale", expires_in: 600, reach: "local-only" });
    await Promise.resolve();
  });
  expect(screen.queryByText("Stale phone")).toBeNull();
  expect(screen.queryByText("SV1.stale")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Room address" })).toBeNull();
  expect(screen.getByRole("button", { name: "Create pairing code" })).toBeDisabled();

  act(() => { store.patch({ pairings: [local], pairingInUse: "fp-local", localHostStatus: status }); });
  await waitFor(() => expect(screen.getByText("No devices are paired with this machine.")).toBeInTheDocument());
  await act(async () => { screen.getByRole("button", { name: "Create pairing code" }).click(); });
  expect(screen.getByText("SV1.fresh")).toBeInTheDocument();
});

test("Add machine opens the explicit remote setup and pairing flow", async () => {
  const done = actions();
  room([]);
  expect(screen.getByText("This device is not paired with a machine yet.")).toBeInTheDocument();
  await act(async () => { screen.getByRole("button", { name: "Add a machine" }).click(); });
  expect(done.openPairing).toHaveBeenCalledOnce();
});

test("the no-machine screen offers Connect; install guidance starts only in the pairing flow", () => {
  actions();
  const store = createRoomStore();
  act(() => { store.patch({ machinesReady: true, pairings: [], pairingInUse: null, localHostStatus: { state: "absent" } }); });
  render(<RoomProvider store={store}><NoMachineScreen /></RoomProvider>);
  expect(screen.getByRole("heading", { name: "No machine connected" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Connect to a machine" })).toBeInTheDocument();
  expect(screen.queryByText(/npx @sidevoice\/uplink install/)).toBeNull();
});

test("the local warning only appears while the local host is selected", () => {
  actions();
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local, paired()], pairingInUse: "fp-nuc", localHostStatus: { state: "failed" } }); });
  render(<RoomProvider store={store}><LocalHostBanner /></RoomProvider>);
  expect(screen.queryByText(/This computer is unavailable/)).toBeNull();
});

test("a lost native pairing keeps a local Status row and recovery action without a selectable proxy", async () => {
  const restart = vi.fn().mockResolvedValue(undefined);
  setBridge({ restart, state: vi.fn(async (): Promise<LocalHostStatus> => ({ state: "failed", reachable: false })) });
  actions();
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [], pairingInUse: "@sidevoice/local-host", localHostAvailable: true, localHostSelected: true,
    localHostStatus: { state: "failed", reachable: false, failure: { key: "start.failed" } }, machinesReady: true }); });
  render(<RoomProvider store={store}><MachineList /><LocalHostBanner /></RoomProvider>);

  const row = document.querySelector(".machine-row");
  expect(row).toHaveAttribute("data-local", "true");
  expect(row).toHaveAttribute("data-in-use", "true");
  expect(row?.textContent).toMatch(/This computer/);
  expect(screen.queryByRole("button", { name: "Use This computer" })).toBeNull();
  expect(screen.getByText(/This computer is unavailable/)).toBeInTheDocument();
  await act(async () => { screen.getByRole("button", { name: "Open This computer" }).click(); });
  expect(screen.getByRole("tab", { name: "Status" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(2);
  await act(async () => { screen.getAllByRole("button", { name: "Retry" })[0].click(); });
  expect(restart).toHaveBeenCalledOnce();
});

test("a reachable local core stays Connected when its service state is not running and hides the warning", () => {
  actions();
  const store = createRoomStore();
  act(() => { store.patch({ pairings: [local], pairingInUse: "fp-local", localHostAvailable: true, localHostSelected: true,
    localHostStatus: { state: "stopped-by-person", reachable: true }, machinesReady: true }); });
  render(<RoomProvider store={store}><MachineList /><LocalHostBanner /></RoomProvider>);
  expect(document.querySelector(".machine-row")?.textContent).toMatch(/Connected/);
  expect(screen.queryByText(/This computer is unavailable/)).toBeNull();
});
