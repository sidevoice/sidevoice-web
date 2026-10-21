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
  expect(screen.getByRole("button", { name: "Join the call" })).toBeInTheDocument();
  expect(document.getElementById("language-settings")).toBeInTheDocument();
});

test("keeps local setup visible through native projection, and puts it away once the projected host answers, choosing nothing", async () => {
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
  // Every machine is live at once: there is no machine to choose, so an action by that name must stay untouched.
  const chooseMachine = vi.fn();
  const openPairing = vi.fn();
  window.sidevoiceActions = { chooseMachine, openPairing } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, inApp: true, localHostAvailable: true, localHostStatus: { state: "absent" } }));
  render(<App store={store} />);

  // The call area offers the setup's two cards first; This computer opens its preparation.
  await act(async () => { fireEvent.click(document.getElementById("machine-choice-agents")!); });
  expect(screen.getByRole("button", { name: "I’ll do it myself" })).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Prepare this computer" })); });
  act(() => store.patch({ localHostStatus: { state: "installing", installed: false } }));
  const settings = document.getElementById("pane-this-computer")!;
  expect(settings.querySelector(".local-install-panel")).toHaveAttribute("data-phase", "installing");
  expect(settings.textContent).toContain("Installing the Sidevoice service…");
  expect(screen.getByRole("region", { name: "No machine connected" })).toHaveTextContent("Installing the Sidevoice service…");
  expect(document.querySelector(".room-shell > .local-install-entry")).toBeNull();
  expect(agents).not.toHaveBeenCalled();

  await act(async () => {
    rejectFirst({ key: "install.network", step: "download" });
    await Promise.resolve();
  });
  act(() => store.patch({ localHostStatus: { state: "failed", installed: false } }));
  expect(settings.textContent).toContain("The download could not reach the release. Check your connection and retry.");
  expect(screen.getByRole("region", { name: "No machine connected" })).toHaveTextContent("The download could not reach the release. Check your connection and retry.");

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry" })); });
  act(() => store.patch({ localHostStatus: { state: "installing", installed: false } }));
  await act(async () => { resolveRetry({ state: "running", reachable: true, installed: true });await Promise.resolve(); });
  expect(settings.textContent).toContain("Connecting to this computer…");
  expect(chooseMachine).not.toHaveBeenCalled();

  act(() => store.patch({
    pairings: [{ fp: "fp-local", device_id: "device-local", urls: ["http://127.0.0.1:45781"],
      host: "This computer", local: true, paired_at: 1_700_000_000, revoked: false }],
    localHostAvailable: true, localHostStatus: { state: "running", reachable: true, installed: true },
  }));
  await waitFor(() => expect(screen.queryByText("Connecting to this computer…")).toBeNull());
  expect(localHostInstallController.getSnapshot().phase).toBe("idle");
  expect(chooseMachine).not.toHaveBeenCalled();
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
  act(() => store.patch({ machinesReady: true, inApp: true, localHostAvailable: true, localHostStatus: { state: "absent" } }));
  render(<App store={store} />);

  // The call area offers the setup's two cards first; This computer opens its preparation.
  await act(async () => { fireEvent.click(document.getElementById("machine-choice-agents")!); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Prepare this computer" })); });
  act(() => store.patch({ localHostStatus: { state: "installing", installed: false } }));
  expect(document.querySelector("#pane-this-computer .local-install-panel")).toHaveAttribute("data-phase", "installing");

  act(() => store.patch({
    pairings: [{ fp: "fp-remote", device_id: "device-remote", urls: ["https://remote.example"],
      host: "Remote computer", paired_at: 1_700_000_000, revoked: false }],
    localHostStatus: { state: "installing", installed: false },
  }));
  expect(screen.queryByRole("heading", { name: "No machine connected" })).toBeNull();
  expect(screen.getByRole("log")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Join the call" })).toBeInTheDocument();
  expect(document.querySelector(".room-shell > .local-install-entry")).toBeNull();
  expect(document.querySelector("#pane-this-computer .local-install-panel")).toHaveAttribute("data-phase", "installing");

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
  window.sidevoiceActions = {} as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" } }));
  render(<App store={store} />);

  // The call area offers the setup's two cards first; This computer opens its preparation.
  await act(async () => { fireEvent.click(document.getElementById("machine-choice-agents")!); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Prepare this computer" })); });
  act(() => store.patch({ localHostStatus: { state: "installing", installed: false } }));
  act(() => store.patch({
    pairings: [{ fp: "fp-local", device_id: "device-local", urls: ["http://127.0.0.1:45781"],
      host: "This computer", local: true, paired_at: 1_700_000_000, revoked: false }],
    localHostAvailable: true,
    localHostStatus: { state: "failed", installed: true, service: "launchd", reachable: false, failure: { key: "start.failed" } },
  }));

  expect(screen.queryByRole("heading", { name: "No machine connected" })).toBeNull();
  expect(screen.getByRole("log")).toBeInTheDocument();
  expect(document.querySelector(".local-host-banner")).toBeNull();
  const pane = document.getElementById("pane-machines");
  const dialog = document.getElementById("language-settings");
  pane?.removeAttribute("hidden");
  dialog?.setAttribute("open", "");
  expect(document.querySelector(".machine-entry[data-local='true']")).toHaveAttribute("data-name", "This computer");
  await act(async () => { rejectInstall({ key: "install.service", step: "service" }); await Promise.resolve(); });
  expect(document.querySelector(".local-host-banner")).toBeInTheDocument();
  // Once preparation has stopped, the installed service's Retry restarts it from the banner or its card.
  expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(2);
  act(() => localHostInstallController.clear());
});
