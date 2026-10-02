import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MachineList } from "./MachineList";
import { NoMachineScreen } from "../pairing/NoMachineScreen";
import { LocalHostBanner } from "../settings/LocalHostBanner";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { PairingSummary } from "../../services/device-pairing.js";
import type { LocalHostBridge, LocalHostStatus } from "../../services/desktop-host";

vi.mock("../../services/room-session-controller.js", () => ({}));

const paired = (extra: Partial<PairingSummary> = {}): PairingSummary => ({
  fp: "fp-nuc", host: "NUC", urls: ["https://nuc.example"], rv: { url: "https://room.example", node: "nuc-1" },
  device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false, ...extra,
});
const local = paired({ fp: "fp-local", host: "MacBook", local: true, urls: ["http://127.0.0.1:45781"], rv: null, device_id: "d-local" });
const running: LocalHostStatus = { state: "running", installed: true, service: "launchd", core: { version: "0.1.0", api: 1 }, calls: 0 };

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
  await act(async () => { screen.getByRole("button", { name: "Start at login" }).click(); });
  expect(serviceInstall).toHaveBeenCalledOnce();
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
