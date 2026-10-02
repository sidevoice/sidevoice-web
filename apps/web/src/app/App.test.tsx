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
  expect(screen.getByRole("button", { name: "Connect to a machine" })).toBeInTheDocument();
  expect(agents).not.toHaveBeenCalled();

  await act(async () => {
    rejectFirst({ key: "install.network", step: "download" });
    await Promise.resolve();
  });
  act(() => store.patch({ localHostStatus: { state: "failed", installed: false } }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The download could not reach the release");
  expect(screen.getByRole("button", { name: "Connect to a machine" })).toBeInTheDocument();

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
  localHostInstallController.clear();
});
