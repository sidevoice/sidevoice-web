import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Button } from "../../components/ui/Button";
import type { LocalHostBridge, LocalHostInstallOperation, LocalHostStatus } from "../../services/desktop-host";
import { createLocalHostInstallController } from "../../services/local-host-install";
import { NoMachineScreen } from "./NoMachineScreen";
import { LocalHostInstallEntry } from "./LocalHostInstallEntry";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";

vi.mock("../../services/room-session-controller.js", () => ({}));

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
  const openPairing = vi.fn();
  window.sidevoiceActions = { openPairing } as unknown as typeof window.sidevoiceActions;
  const controller = fakeController({ install, cancel: vi.fn(() => cancelResult.promise) });
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, localHostAvailable: true, localHostStatus: { state: "absent" } }));
  render(<RoomProvider store={store}><NoMachineScreen installController={controller} /></RoomProvider>);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use agents on this computer" })); });
  expect(install).toHaveBeenCalledOnce();
  await act(async () => { report({ step: "download", done: 1_572_864, total: 3_145_728 }); });
  expect(screen.getByRole("progressbar", { name: "Download progress" })).toHaveAttribute("aria-valuenow", "50");
  expect(screen.getByText("1.5 of 3 MB")).toBeInTheDocument();

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Connect to a machine" })); });
  expect(openPairing).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cancel" })); });
  await waitFor(() => expect(controller.getSnapshot()).toMatchObject({ phase: "installing", cancelling: true }));
  await act(async () => { cancelResult.resolve(true);await cancelResult.promise; });
  await act(async () => { result.reject({ key: "install.cancelled", step: "download" });await Promise.resolve(); });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Cancelled. Nothing was installed."));
  act(() => controller.clear());
});

test("a non-cancellable commit progress frame hides Cancel", async () => {
  const result = deferred<LocalHostStatus>();
  let report!: (event: { step: string; done: number | null; total: number | null; cancellable?: boolean }) => void;
  const controller = fakeController({
    install: vi.fn((onProgress) => { report = onProgress!; return operation("commit-job", result.promise); }),
    cancel: vi.fn(async () => true),
  });
  render(<LocalHostInstallEntry showCta controller={controller} />);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use agents on this computer" })); });
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  await act(async () => { report({ step: "commit", done: null, total: null, cancellable: false }); });
  expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

  await act(async () => { result.resolve(running); await Promise.resolve(); });
  act(() => controller.clear());
});

test("failure shows translated key copy, safe details with the installer's log redacted (copied, never shown) and a retry action", async () => {
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
    params: { token: "raw-token", attempt: 2, url: "http://demo-user:demo-password@proxy.example:8080",
      detail: "{\"token\":\"demo-secret\",\"env\":{\"CUSTOM_CREDENTIAL\":\"demo-credential\"}}" },
    log_tail: ["HOME=/Users/demo-person", "{\"token\":\"demo-secret\",\"env\":{\"CUSTOM_CREDENTIAL\":\"demo-credential\"}}", "SV1.private-pairing-code",
      "Authorization: Bearer demo-bearer", "fetching sidevoice-core 0.4.2 for aarch64-apple-darwin"] });
    await Promise.resolve(); });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The download could not reach the release"));
  expect(screen.queryByText("never show native prose")).toBeNull();
  expect(screen.queryByText(/HOME=|private-pairing-code|aarch64-apple-darwin|•••/)).toBeNull();

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy details" })); });
  expect(writeText).toHaveBeenCalledOnce();
  const copied = writeText.mock.calls[0][0];
  // Its key, step and allowlisted params; the installer's log with the home path as ~ and secrets masked, for whoever the
  // person sends it to (operator, 2026-10-14). Never the native sentence nor a param outside the allowlist.
  expect(JSON.parse(copied)).toEqual({ key: "install.network", step: "download", params: { attempt: 2 },
    log_tail: ["HOME=~", "{\"token\":\"•••\",\"env\":{\"CUSTOM_CREDENTIAL\":\"•••\"}}", "SV1.•••", "Authorization: •••",
      "fetching sidevoice-core 0.4.2 for aarch64-apple-darwin"] });
  expect(copied).not.toMatch(/demo-person|demo-secret|demo-credential|private-pairing-code|demo-bearer/);
  expect(copied).not.toContain("raw-token");
  expect(copied).not.toContain("never show native prose");
  expect(copied).not.toContain("demo-user");
  expect(copied).not.toContain("demo-password");

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry" })); });
  expect(install).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Preparing this computer" })).toBeNull());
});

test.each([
  ["install.busy", "An install is already running. Wait for it to finish."],
  ["install.failed", "The service couldn't be installed. Copy the details and try again."],
])("the desktop app's %s is said in its own words, its key kept in the details", async (key, said) => {
  const failed = deferred<LocalHostStatus>();
  const controller = fakeController({ install: vi.fn(() => operation("keyed-job", failed.promise)) });
  const writeText = vi.fn(async (_value: string) => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<LocalHostInstallEntry showCta controller={controller} />);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use agents on this computer" })); });
  await act(async () => { failed.reject({ key, message: "native prose" }); await Promise.resolve(); });
  expect(await screen.findByRole("alert")).toHaveTextContent(said);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy details" })); });
  expect(JSON.parse(writeText.mock.calls[0][0])).toEqual({ key });
});

test("authenticity failures translate allowlisted connector check IDs", async () => {
  const failed = deferred<LocalHostStatus>();
  const controller = fakeController({ install: vi.fn(() => operation("check-job", failed.promise)) });
  render(<LocalHostInstallEntry showCta controller={controller} />);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use agents on this computer" })); });
  await act(async () => { failed.reject({ key: "install.authenticity", params: { check: "sigstore-bundle" } });await Promise.resolve(); });
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Release authenticity check failed: the Sigstore bundle.");
  expect(alert).not.toHaveTextContent("sigstore-bundle");
});

test("install details omit unrecognized bridge error keys and steps while retaining safe checks", async () => {
  const failed = deferred<LocalHostStatus>();
  const controller = fakeController({ install: vi.fn(() => operation("unsafe-error-job", failed.promise)) });
  const writeText = vi.fn(async (_value: string) => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<LocalHostInstallEntry showCta controller={controller} />);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use agents on this computer" })); });
  await act(async () => {
    failed.reject({ key: "SV1.private-pairing-code", step: "token-secret", params: { check: "archive-link" } });
    await Promise.resolve();
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Sidevoice could not prepare this computer.");

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy details" })); });
  const copied = writeText.mock.calls[0][0];
  expect(JSON.parse(copied)).toEqual({ key: "install.unknown", params: { check: "archive-link" } });
  expect(copied).not.toContain("SV1.private-pairing-code");
  expect(copied).not.toContain("token-secret");
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

test("outside the setup it offers another machine in every state of the install; anotherMachine={false} never does", async () => {
  let settle!: { resolve(status: LocalHostStatus): void; reject(error: unknown): void };
  const install = vi.fn(() => operation("job", new Promise<LocalHostStatus>((resolve, reject) => { settle = { resolve, reject }; })));
  const controller = fakeController({ install });
  render(<>
    <div data-testid="room"><LocalHostInstallEntry showCta={false} holdSuccess source="no-machine" controller={controller} /></div>
    <div data-testid="setup"><LocalHostInstallEntry showCta={false} holdSuccess source="no-machine" anotherMachine={false} controller={controller} /></div>
  </>);
  const offered = (where: string) =>
    [...screen.getByTestId(where).querySelectorAll("button")].some((button) => button.textContent === "Connect to another machine");
  const check = (phase: string) => {
    expect(controller.getSnapshot().phase).toBe(phase);
    expect(offered("room")).toBe(true);
    expect(offered("setup")).toBe(false);
  };
  try {
    await act(async () => { controller.start("no-machine"); });
    check("installing");
    await act(async () => { settle.reject({ key: "install.unknown", step: "download" }); await Promise.resolve(); });
    check("failed");
    await act(async () => { controller.start("no-machine"); });
    await act(async () => { settle.reject({ key: "install.cancelled", step: "download" }); await Promise.resolve(); });
    check("cancelled");
    await act(async () => { controller.start("no-machine"); });
    await act(async () => { settle.resolve(running); await Promise.resolve(); });
    check("succeeded");
  } finally { act(() => controller.clear()); }
});
