import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";
import { createRoomStore } from "../state/room-store";
import { localHostInstallController } from "../services/local-host-install";
import type { LocalHostStatus } from "../services/desktop-host";

vi.mock("../services/room-session-controller.js", () => ({}));

test("renders the room as accessible React components", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Sidevoice" })).toBeInTheDocument();
  expect(screen.getByRole("log")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Entrar en la sala" })).toBeInTheDocument();
  expect(document.getElementById("language-settings")).toBeInTheDocument();
});

test("keeps local setup visible through native projection and selects the projected host after success", async () => {
  localHostInstallController.clear();
  let rejectFirst!: (error: unknown) => void;
  let resolveRetry!: (status: LocalHostStatus) => void;
  const install = vi.fn((onProgress?: (event: { step: string; done: number | null; total: number | null }) => void) => {
    void onProgress;
    const promise = install.mock.calls.length === 1
      ? new Promise<LocalHostStatus>((_resolve, reject) => { rejectFirst = reject; })
      : new Promise<LocalHostStatus>((resolve) => { resolveRetry = resolve; });
    return Object.assign(promise, { job: `app-job-${install.mock.calls.length}` });
  });
  const agents = vi.fn();
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "absent" })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null),
    install, agents,
  } } } });
  const chooseMachine = vi.fn();
  const openPairing = vi.fn();
  window.sidevoiceActions = { chooseMachine, openPairing } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" } }));
  render(<App store={store} />);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use agents on this computer" })); });
  act(() => store.patch({ localHostStatus: { state: "installing", installed: false } }));
  expect(await screen.findByText("Sidevoice is preparing this computer…")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Connect to another machine" })).toBeInTheDocument();
  expect(agents).not.toHaveBeenCalled();

  await act(async () => {
    rejectFirst({ key: "install.network", step: "download" });
    await Promise.resolve();
  });
  act(() => store.patch({ localHostStatus: { state: "failed", installed: false } }));
  expect(await screen.findByText("The download could not reach the release. Check your connection and retry.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Connect to another machine" })).toBeInTheDocument();

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry setup" })); });
  act(() => store.patch({ localHostStatus: { state: "installing", installed: false } }));
  await act(async () => { resolveRetry({ state: "running", reachable: true, installed: true });await Promise.resolve(); });
  expect(await screen.findByText("Connecting to this computer…")).toBeInTheDocument();
  expect(chooseMachine).not.toHaveBeenCalled();

  act(() => store.patch({
    pairings: [{ fp: "fp-local", device_id: "device-local", urls: ["http://127.0.0.1:45781"], rv: null,
      host: "This computer", local: true, paired_at: 1_700_000_000, revoked: false }],
    localHostAvailable: true, localHostStatus: { state: "running", reachable: true, installed: true },
  }));
  await waitFor(() => expect(chooseMachine).toHaveBeenCalledWith("fp-local"));
  expect(chooseMachine).toHaveBeenCalledOnce();
  expect(screen.queryByText("Connecting to this computer…")).toBeNull();
  act(() => localHostInstallController.clear());
});

test("remote room controls stay available when remote pairing succeeds during local setup", async () => {
  act(() => localHostInstallController.clear());
  let resolveInstall!: (status: LocalHostStatus) => void;
  const install = vi.fn(() => Object.assign(new Promise<LocalHostStatus>((resolve) => { resolveInstall = resolve; }), { job: "remote-transition-job" }));
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "absent" })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install,
    cancel: vi.fn(async () => true),
  } } } });
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" } }));
  render(<App store={store} />);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use agents on this computer" })); });
  act(() => store.patch({ localHostStatus: { state: "installing", installed: false } }));
  expect(screen.getByRole("button", { name: "Cancel setup" })).toBeInTheDocument();

  act(() => store.patch({
    pairings: [{ fp: "fp-remote", device_id: "device-remote", urls: ["https://remote.example"], rv: null,
      host: "Remote computer", paired_at: 1_700_000_000, revoked: false }],
    localHostStatus: { state: "installing", installed: false },
  }));
  expect(screen.queryByRole("heading", { name: "No machine connected" })).toBeNull();
  expect(screen.getByRole("log")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Entrar en la sala" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel setup" })).toBeInTheDocument();

  await act(async () => { resolveInstall({ state: "running", reachable: true, installed: true }); await Promise.resolve(); });
  act(() => localHostInstallController.clear());
});

test("a failed local host projected during setup returns to the normal room and host controls", async () => {
  act(() => localHostInstallController.clear());
  let rejectInstall!: (error: unknown) => void;
  const restart = vi.fn(async () => undefined);
  const install = vi.fn(() => Object.assign(new Promise<LocalHostStatus>((_resolve, reject) => { rejectInstall = reject; }), { job: "failed-projection-job" }));
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "absent" })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install, restart,
  } } } });
  const chooseMachine = vi.fn();
  window.sidevoiceActions = { chooseMachine } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" } }));
  render(<App store={store} />);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use agents on this computer" })); });
  act(() => store.patch({ localHostStatus: { state: "installing", installed: false } }));
  act(() => store.patch({
    pairings: [{ fp: "fp-local", device_id: "device-local", urls: ["http://127.0.0.1:45781"], rv: null,
      host: "This computer", local: true, paired_at: 1_700_000_000, revoked: false }],
    localHostAvailable: true,
    localHostStatus: { state: "failed", installed: true, service: "launchd", reachable: false, failure: { key: "start.failed" } },
  }));

  expect(screen.queryByRole("heading", { name: "No machine connected" })).toBeNull();
  expect(screen.getByRole("log")).toBeInTheDocument();
  expect(document.querySelector(".local-host-banner")).toBeInTheDocument();
  const pane = document.getElementById("pane-machines");
  const dialog = document.getElementById("language-settings");
  pane?.removeAttribute("hidden");
  dialog?.setAttribute("open", "");
  expect(document.querySelector(".machine-row[data-local='true']")).toHaveTextContent("This computer");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open This computer" })); });
  expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(2);

  await act(async () => { rejectInstall({ key: "install.service", step: "service" }); await Promise.resolve(); });
  act(() => localHostInstallController.clear());
});
