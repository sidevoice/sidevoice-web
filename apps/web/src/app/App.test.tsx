import { beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";
import { createRoomStore } from "../state/room-store";
import { localHostInstallController } from "../services/local-host-install";
import { emptyOnboardingRecord, mergeOnboardingRecord, type OnboardingPatch, type OnboardingRecord } from "../services/onboarding-state";
import type { LocalHostStatus } from "../services/desktop-host";

vi.mock("../services/room-session-controller.js", () => ({}));

beforeEach(() => {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: undefined });
  localStorage.setItem("sidevoice.onboarding", JSON.stringify({ version: 1, choice: "remote", agents_done: true,
    deferred_at: null, completed_at: 1_700_000_000, trials: {} }));
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "en" }));
});

test("completed first-run setup renders the room as accessible React components", async () => {
  localStorage.setItem("sidevoice.onboarding", JSON.stringify({ version: 1, choice: "remote", agents_done: true,
    deferred_at: null, completed_at: 1_700_000_000, trials: {} }));
  render(<App />);
  await waitFor(() => expect(document.body).toHaveAttribute("data-setup", "done"));
  expect(screen.getByRole("heading", { name: "Sidevoice" })).toBeInTheDocument();
  expect(screen.getByRole("log")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Entrar en la sala" })).toBeInTheDocument();
  expect(document.getElementById("language-settings")).toBeInTheDocument();
});

test("a new browser starts at remote pairing and resumes there after deferral", async () => {
  localStorage.removeItem("sidevoice.onboarding");
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: "en" }));
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true }));
  render(<App store={store} />);

  expect(await screen.findByRole("heading", { name: "Connect to your machine" })).toBeInTheDocument();
  const dialog = document.getElementById("wizard") as HTMLDialogElement;
  expect(screen.queryByRole("heading", { name: "Where do your agents run?" })).toBeNull();

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Do this later" })); await Promise.resolve(); });
  await waitFor(() => expect(dialog.open).toBe(false));
  expect(screen.getByRole("heading", { name: "Setup is not finished" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("sidevoice.onboarding") || "null")).toMatchObject({ choice: null, deferred_at: expect.any(Number), completed_at: null });

  fireEvent.click(screen.getByRole("button", { name: "Continue setup" }));
  expect(await screen.findByRole("heading", { name: "Connect to your machine" })).toBeInTheDocument();
});

test("a Desktop host without host.app fails closed instead of writing onboarding to browser storage", async () => {
  localStorage.removeItem("sidevoice.onboarding");
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: {} } });
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true }));
  render(<App store={store} />);

  expect(await screen.findByRole("heading", { name: "Connect to your machine" })).toBeInTheDocument();
  expect(await screen.findByRole("alert")).toHaveTextContent("This app needs its native setup storage");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Do this later" })); await Promise.resolve(); });
  expect(screen.getByRole("heading", { name: "Connect to your machine" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("sidevoice.onboarding") || "null")).toBeNull();
  expect(document.body).toHaveAttribute("data-setup", "pending");
  expect(screen.queryByRole("log")).toBeNull();
});

test("remote pairing resumes at transcription without a local agents outcome", async () => {
  localStorage.setItem("sidevoice.onboarding", JSON.stringify({ version: 1, choice: "remote", agents_done: false,
    deferred_at: null, completed_at: null, trials: {} }));
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true }));
  render(<App store={store} />);

  expect(await screen.findByRole("heading", { name: "Connect to your machine" })).toBeInTheDocument();
  act(() => store.patch({
    pairings: [{ fp: "fp-remote", device_id: "device-remote", urls: ["https://remote.example"], rv: null,
      host: "Remote computer", paired_at: 1_700_000_000, revoked: false }],
    pairingInUse: "fp-remote",
    node: "fp-remote",
    nodeReach: "ok",
  }));
  expect(await screen.findByRole("heading", { name: "Set up transcription" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Connect Sidevoice to your agents" })).toBeNull();
});

function nativeOnboardingPort(options: { failPatch?: boolean; initial?: OnboardingRecord } = {}) {
  let record: OnboardingRecord = options.initial ?? emptyOnboardingRecord();
  const port = {
    read: vi.fn(async () => record),
    patch: vi.fn(async (update: OnboardingPatch) => {
      if (options.failPatch) throw new Error("durable write failed");
      record = mergeOnboardingRecord(record, update);
      return record;
    }),
  };
  return { port, getRecord: () => record };
}

function completedNativePort() {
  return nativeOnboardingPort({ initial: { ...emptyOnboardingRecord(), choice: "remote", agents_done: true, completed_at: 1_700_000_000 } }).port;
}

function localBridge(agents: () => Promise<unknown> = async () => ({ agents: [] })) {
  return { state: vi.fn(async () => ({ state: "absent" })), subscribe: vi.fn(() => () => {}),
    pairing: vi.fn(async () => null), agents: vi.fn(agents) };
}

test("a ready local host durably adopts the local path before opening W3", async () => {
  localStorage.removeItem("sidevoice.onboarding");
  const { port, getRecord } = nativeOnboardingPort();
  const bridge = localBridge();
  const install = vi.fn();
  Object.assign(bridge, { install });
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { app: { onboarding: port }, localHost: bridge } } });
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "running", reachable: true, installed: true },
    pairings: [{ fp: "fp-local", device_id: "device-local", urls: ["http://127.0.0.1:45781"], rv: null,
      host: "This computer", local: true, paired_at: 1_700_000_000, revoked: false }],
    pairingInUse: "fp-local", node: "fp-local", nodeReach: "ok" }));
  render(<App store={store} />);

  expect(await screen.findByRole("heading", { name: "Connect Sidevoice to your agents" })).toBeInTheDocument();
  expect(port.patch).toHaveBeenCalledWith({ choice: "agents", deferred_at: null });
  expect(getRecord()).toMatchObject({ choice: "agents", completed_at: null });
  expect(screen.queryByRole("heading", { name: "Where do your agents run?" })).toBeNull();
  expect(install).not.toHaveBeenCalled();
  expect(localStorage.getItem("sidevoice.onboarding")).toBeNull();
});

test("a failed local adoption write stays at W1 and does not enter local W3", async () => {
  localStorage.removeItem("sidevoice.onboarding");
  const { port } = nativeOnboardingPort({ failPatch: true });
  const bridge = localBridge();
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { app: { onboarding: port }, localHost: bridge } } });
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "running", reachable: true, installed: true },
    pairings: [{ fp: "fp-local", device_id: "device-local", urls: ["http://127.0.0.1:45781"], rv: null,
      host: "This computer", local: true, paired_at: 1_700_000_000, revoked: false }],
    pairingInUse: "fp-local", node: "fp-local", nodeReach: "ok" }));
  render(<App store={store} />);

  expect(await screen.findByRole("heading", { name: "Where do your agents run?" })).toBeInTheDocument();
  expect(await screen.findByRole("alert")).toHaveTextContent("was not saved");
  expect(screen.queryByRole("heading", { name: "Connect Sidevoice to your agents" })).toBeNull();
  expect(port.patch).toHaveBeenCalledWith({ choice: "agents", deferred_at: null });
  expect(localStorage.getItem("sidevoice.onboarding")).toBeNull();
});

test("W1 waits for the initial native agent scan before choosing its automatic default", async () => {
  localStorage.removeItem("sidevoice.onboarding");
  let finishScan!: (value: unknown) => void;
  const scan = new Promise<unknown>((resolve) => { finishScan = resolve; });
  const { port } = nativeOnboardingPort();
  const bridge = localBridge(() => scan);
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { app: { onboarding: port }, localHost: bridge } } });
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" } }));
  render(<App store={store} />);

  expect(await screen.findByRole("heading", { name: "Where do your agents run?" })).toBeInTheDocument();
  const continueButton = screen.getByRole("button", { name: "Continue" });
  expect(continueButton).toBeDisabled();
  await act(async () => { finishScan({ agents: [{ id: "codex", label: "Codex" }] }); await scan; });
  expect(screen.getByRole("radio", { name: "I use agents on this computer" })).toHaveAttribute("aria-checked", "true");
  expect(continueButton).toBeEnabled();
});

test("an explicit W1 choice can continue while the first native agent scan is pending", async () => {
  localStorage.removeItem("sidevoice.onboarding");
  const scan = new Promise<unknown>(() => {});
  const { port } = nativeOnboardingPort();
  const bridge = localBridge(() => scan);
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { app: { onboarding: port }, localHost: bridge } } });
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" } }));
  render(<App store={store} />);

  expect(await screen.findByRole("heading", { name: "Where do your agents run?" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "This computer connects to another machine" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("heading", { name: "Connect to your machine" })).toBeInTheDocument();
  expect(port.patch).toHaveBeenCalledWith({ choice: "remote", deferred_at: null });
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
  const onboarding = completedNativePort();
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "absent" })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null),
    install, agents,
  }, app: { onboarding } } } });
  const chooseMachine = vi.fn();
  const openPairing = vi.fn();
  window.sidevoiceActions = { chooseMachine, openPairing } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" } }));
  render(<App store={store} />);

  await waitFor(() => expect(document.body).toHaveAttribute("data-setup", "done"));
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
  const onboarding = completedNativePort();
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "absent" })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install,
    cancel: vi.fn(async () => true),
  }, app: { onboarding } } } });
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" } }));
  render(<App store={store} />);

  await waitFor(() => expect(document.body).toHaveAttribute("data-setup", "done"));
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
  const onboarding = completedNativePort();
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "absent" })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), install, restart,
  }, app: { onboarding } } } });
  const chooseMachine = vi.fn();
  window.sidevoiceActions = { chooseMachine } as unknown as typeof window.sidevoiceActions;
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" } }));
  render(<App store={store} />);

  await waitFor(() => expect(document.body).toHaveAttribute("data-setup", "done"));
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
