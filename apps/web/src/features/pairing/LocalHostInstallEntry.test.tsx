import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Button } from "../../components/ui/Button";
import type { LocalHostBridge, LocalHostInstallOperation, LocalHostStatus } from "../../services/desktop-host";
import { createLocalHostInstallController } from "../../services/local-host-install";
import { NoMachineScreen } from "./NoMachineScreen";
import { LocalHostInstallEntry } from "./LocalHostInstallEntry";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";

const running: LocalHostStatus = { state: "running", reachable: true, installed: true, service: "launchd" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function operation(job: string, promise: Promise<LocalHostStatus>) {
  return Object.assign(promise, { job }) as LocalHostInstallOperation;
}

function setBridge(bridge: Partial<LocalHostBridge>) {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { localHost: {
    state: vi.fn(async () => ({ state: "absent" as const })), subscribe: vi.fn(() => () => {}), pairing: vi.fn(async () => null), ...bridge,
  } } } });
}

function fakeController(overrides: Partial<LocalHostBridge> = {}) {
  const bridge = { ...overrides } as LocalHostBridge;
  setBridge(bridge);
  return createLocalHostInstallController(() => bridge);
}

test("hides the local setup CTA when the optional desktop install method is missing", () => {
  const controller = fakeController({});
  render(<LocalHostInstallEntry showCta controller={controller} />);
  expect(screen.queryByRole("button", { name: "Use agents on this computer" })).toBeNull();
});

test("NoMachine keeps remote pairing available while local preparation reports byte progress", async () => {
  const result = deferred<LocalHostStatus>();
  const cancelResult = deferred<boolean>();
  const report = vi.fn();
  const install = vi.fn((onProgress) => {
    report.mockImplementation(onProgress);
    return operation("room-job", result.promise);
  });
  const agents = vi.fn();
  const openPairing = vi.fn();
  window.sidevoiceActions = { openPairing } as unknown as typeof window.sidevoiceActions;
  const controller = fakeController({ install, cancel: vi.fn(() => cancelResult.promise), agents });
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" } }));
  render(<RoomProvider store={store}><NoMachineScreen installController={controller} /></RoomProvider>);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use agents on this computer" })); });
  expect(install).toHaveBeenCalledOnce();
  expect(agents).not.toHaveBeenCalled();
  await act(async () => { report({ step: "download", done: 1_572_864, total: 3_145_728 }); });
  expect(screen.getByRole("progressbar", { name: "Download progress" })).toHaveAttribute("max", "3145728");
  expect(screen.getByText("1.5 of 3 MB")).toBeInTheDocument();

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Connect to a machine" })); });
  expect(openPairing).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Cancel setup" })).toBeInTheDocument();

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cancel setup" })); });
  await waitFor(() => expect(controller.getSnapshot()).toMatchObject({ phase: "installing", cancelling: true }));
  await act(async () => { cancelResult.resolve(true);await cancelResult.promise; });
  await act(async () => { result.reject({ key: "install.cancelled", step: "download" });await Promise.resolve(); });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Setup was canceled"));
  act(() => controller.clear());
});

test("failure shows translated key copy, safe details and a retry action", async () => {
  const failed = deferred<LocalHostStatus>();
  const install = vi.fn()
    .mockImplementationOnce(() => operation("failed-job", failed.promise))
    .mockImplementationOnce(() => operation("retry-job", Promise.resolve(running)));
  const controller = fakeController({ install });
  const writeText = vi.fn(async (_value: string) => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<LocalHostInstallEntry showCta controller={controller} />);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use agents on this computer" })); });
  await act(async () => { failed.reject({ key: "install.network", step: "download", message: "never show native prose",
    params: { token: "raw-token", attempt: 2 }, log_tail: ["HOME=/private/account", "release request timed out", "SV1.private-pairing-code"] });
    await Promise.resolve(); });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The download could not reach the release"));
  expect(screen.queryByText("never show native prose")).toBeNull();

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy details" })); });
  expect(writeText).toHaveBeenCalledOnce();
  const copied = writeText.mock.calls[0][0];
  expect(copied).toContain('"key": "install.network"');
  expect(copied).not.toContain("raw-token");
  expect(copied).not.toContain("private-pairing-code");
  expect(copied).not.toContain("HOME=");
  expect(copied).not.toContain("never show native prose");

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry setup" })); });
  expect(install).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Preparing this computer" })).toBeNull());
});

test("connecting to another machine dismisses a settled failure without changing remote pairing", async () => {
  const failed = deferred<LocalHostStatus>();
  const controller = fakeController({ install: vi.fn(() => operation("failed-job", failed.promise)) });
  const openPairing = vi.fn();
  window.sidevoiceActions = { openPairing } as unknown as typeof window.sidevoiceActions;
  render(<><Button onClick={() => window.sidevoiceActions?.openPairing()}>Remote pairing</Button>
    <LocalHostInstallEntry showCta controller={controller} /></>);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use agents on this computer" })); });
  await act(async () => { failed.reject({ key: "install.proxy" });await Promise.resolve(); });
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Connect to another machine" })); });
  expect(openPairing).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).toBeNull();
});
