import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { act } from "react";
import { PairingDialog } from "./PairingDialog";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { installApp, removeApp } from "../../host/testing";
import { VARIANTS_KEY } from "../../lib/variants";
import type { CodeScan, CodeScannerBridge } from "../../host";

vi.mock("../../services/room-session-controller.js", () => ({}));

/* Scanning the pairing code with the app's camera (`host.codeScanner`, the mobile app): the QR a machine shows holds the code
 * as it prints it, so what is scanned goes where a pasted code goes. Typing stays: a camera not allowed, or none, is said and
 * the field is still there. */

afterEach(() => { removeApp(); cleanup(); localStorage.removeItem(VARIANTS_KEY); });

function pairingCode(extra: Record<string, unknown> = {}) {
  const payload = { v: 1, fp: "A".repeat(43), host: "nuc", urls: ["http://127.0.0.1:8768", "https://nuc.example:8768"], secret: "s3cret",
    exp: Math.floor(Date.now() / 1000) + 600, ...extra };
  return "SV1." + Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/** A camera whose scan ends when the test says so. */
function camera(request: "granted" | "denied" = "granted") {
  let finish!: (result: CodeScan) => void;
  const bridge = {
    permission: vi.fn(async () => request),
    request: vi.fn(async () => request),
    scan: vi.fn(() => new Promise<CodeScan>((resolve) => { finish = resolve; })),
    cancel: vi.fn(async () => finish({ status: "cancelled" })),
    openSettings: vi.fn(async () => {}),
  } satisfies CodeScannerBridge;
  return { bridge, finish: (result: CodeScan) => act(async () => finish(result)) };
}

function open(pairDevice: (...args: unknown[]) => Promise<unknown> = vi.fn()) {
  const store = createRoomStore();
  window.sidevoiceActions = { pairDevice, closePairing: vi.fn() } as unknown as typeof window.sidevoiceActions;
  render(<RoomProvider store={store}><PairingDialog /></RoomProvider>);
  act(() => { store.patch({ pairingOpen: true }); });
}
const code = () => screen.getByRole("textbox", { name: "Pairing code" }) as HTMLTextAreaElement;
const scanButton = () => screen.getByRole("button", { name: "Scan QR code" });
const tapScan = () => act(async () => { fireEvent.click(scanButton()); });
const viewfinder = () => screen.queryByRole("dialog", { name: "Scan the pairing code" });

test("a browser has no camera to offer: the code is typed or pasted", () => {
  open();
  expect(screen.queryByRole("button", { name: "Scan QR code" })).toBeNull();
  expect(code()).toBeInTheDocument();
});

test("the QR is the code: scanned, it fills the field as a pasted one does, is recognised, and connects", async () => {
  const { bridge, finish } = camera();
  installApp({ codeScanner: bridge });
  const pairDevice = vi.fn().mockResolvedValue({ host: "nuc" });
  open(pairDevice);
  await tapScan();
  // The camera is asked for before the viewfinder opens; the page is transparent while it lasts.
  expect(bridge.request).toHaveBeenCalledTimes(1);
  expect(bridge.scan).toHaveBeenCalledTimes(1);
  expect(viewfinder()).toBeInTheDocument();
  expect(document.documentElement).toHaveAttribute("data-scanning");
  expect(screen.getByText("Point the camera at the QR code the machine shows.")).toBeInTheDocument();
  const scanned = pairingCode();
  await finish({ status: "scanned", text: `${scanned}\n` });
  expect(viewfinder()).toBeNull();
  expect(document.documentElement).not.toHaveAttribute("data-scanning");
  expect(code().value).toBe(scanned);
  expect(code()).toHaveAccessibleDescription("Code for “nuc” · expires in 10 min");
  expect(code()).not.toHaveAttribute("aria-invalid");
  const connect = document.querySelector("#device-pairing button[type=submit][form]") as HTMLButtonElement;
  expect(document.activeElement).toBe(connect);
  await act(async () => { fireEvent.submit(connect.form!); });
  expect(pairDevice).toHaveBeenCalledWith(scanned, expect.any(String), "");
});

test("Cancel ends the scan and leaves the field as it was; the focus goes back to Scan", async () => {
  const { bridge } = camera();
  installApp({ codeScanner: bridge });
  open();
  await tapScan();
  await act(async () => { fireEvent.click(within(viewfinder()!).getByRole("button", { name: "Cancel" })); });
  expect(bridge.cancel).toHaveBeenCalled();
  expect(viewfinder()).toBeNull();
  expect(code().value).toBe("");
  expect(document.activeElement).toBe(scanButton());
});

test("a camera that is not allowed is said, with the way to the settings, and typing the code still works", async () => {
  const { bridge } = camera("denied");
  installApp({ codeScanner: bridge });
  const pairDevice = vi.fn().mockResolvedValue({ host: "nuc" });
  open(pairDevice);
  await tapScan();
  expect(bridge.scan).not.toHaveBeenCalled();
  expect(viewfinder()).toBeNull();
  expect(screen.getByText("Sidevoice can't use the camera. Allow it in the system settings, or type the code instead.")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open system settings" })); });
  expect(bridge.openSettings).toHaveBeenCalledTimes(1);
  const typed = pairingCode();
  fireEvent.change(code(), { target: { value: typed } });
  const connect = document.querySelector("#device-pairing button[type=submit][form]") as HTMLButtonElement;
  await act(async () => { fireEvent.submit(connect.form!); });
  expect(pairDevice).toHaveBeenCalledWith(typed, expect.any(String), "");
});

test("a camera taken away during the scan, and a device with none, are said", async () => {
  const { bridge, finish } = camera();
  installApp({ codeScanner: bridge });
  open();
  await tapScan();
  await finish({ status: "denied" });
  expect(screen.getByText(/^Sidevoice can't use the camera\./)).toBeInTheDocument();
  await tapScan();
  await finish({ status: "unavailable" });
  expect(screen.queryByText(/^Sidevoice can't use the camera\./)).toBeNull();
  expect(screen.getByText("This device has no camera to scan with. Type the code instead.")).toBeInTheDocument();
});

test("a QR that is not a Sidevoice code is said under the field, as a pasted one would be", async () => {
  const { bridge, finish } = camera();
  installApp({ codeScanner: bridge });
  open();
  await tapScan();
  await finish({ status: "scanned", text: "https://example.com/not-a-code" });
  expect(code()).toHaveAccessibleDescription("That's not a Sidevoice code. Codes start with SV1.");
  expect(code()).toHaveAttribute("aria-invalid", "true");
  expect(code()).toHaveFocus();
});

test("leaving the screen during a scan lets the camera go; a request that fails is a camera not allowed", async () => {
  const { bridge } = camera();
  installApp({ codeScanner: bridge });
  open();
  await tapScan();
  expect(bridge.cancel).not.toHaveBeenCalled();
  cleanup();
  expect(bridge.cancel).toHaveBeenCalledTimes(1);
  expect(document.documentElement).not.toHaveAttribute("data-scanning");
  const broken = camera();
  broken.bridge.request.mockRejectedValue(new Error("not allowed"));
  installApp({ codeScanner: broken.bridge });
  open();
  await tapScan();
  expect(broken.bridge.scan).not.toHaveBeenCalled();
  expect(screen.getByText(/^Sidevoice can't use the camera\./)).toBeInTheDocument();
});

test("Connect is focused only after the viewfinder is gone: while it is open the page is inert and hidden", async () => {
  const { bridge, finish } = camera();
  installApp({ codeScanner: bridge });
  open();
  await tapScan();
  const seen: { overlayOpen: boolean; scanning: boolean }[] = [];
  const focus = HTMLElement.prototype.focus;
  const spy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, ...args) {
    if (this.matches("button[type=submit][form]")) seen.push({ overlayOpen: !!viewfinder(), scanning: document.documentElement.hasAttribute("data-scanning") });
    focus.apply(this, args);
  });
  try { await finish({ status: "scanned", text: pairingCode() }); } finally { spy.mockRestore(); }
  expect(seen).toEqual([{ overlayOpen: false, scanning: false }]);
});

test("the page is hidden while scanning whatever layer is open: any dialog, not a list of classes", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync("src/features/pairing/pairing.css", "utf8");
  expect(css).toMatch(/html\[data-scanning=""\] dialog:not\(\.scan-overlay\)\s*\{\s*visibility: hidden/);
  expect(css).toMatch(/html\[data-scanning=""\] body > \*:not\(\.scan-overlay\)/);
  expect(css).not.toMatch(/html\[data-scanning\] dialog\.ui-dialog/);
});

/* Where Scan sits is an open decision (VARIANTS `pairingScan`): each variant scans the same way, from its own place. */
const variant = (value: string) => localStorage.setItem(VARIANTS_KEY, JSON.stringify({ pairingScan: value }));
const connectButton = () => document.querySelector("#device-pairing button[type=submit][form]") as HTMLButtonElement;

for (const [value, name] of [["inField", "Scan QR code"], ["twoWays", "Scan"], ["scanFirst", "Scan QR code"], ["labelRow", "Scan QR code"]] as const) {
  test(`${value}: its Scan fills the field like a paste, and Connect takes the focus`, async () => {
    variant(value);
    const { bridge, finish } = camera();
    installApp({ codeScanner: bridge });
    open();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name })); });
    expect(bridge.scan).toHaveBeenCalledTimes(1);
    expect(document.documentElement.getAttribute("data-scanning")).toBe(value === "scanFirst" ? "inline" : "");
    const scanned = pairingCode();
    await finish({ status: "scanned", text: scanned });
    expect(document.documentElement).not.toHaveAttribute("data-scanning");
    expect(code().value).toBe(scanned);
    expect(code()).toBeVisible();
    expect(document.activeElement).toBe(connectButton());
  });
}

test("twoWays and scanFirst: the field comes in with Type the code, and takes the focus", async () => {
  for (const value of ["twoWays", "scanFirst"]) {
    variant(value);
    installApp({ codeScanner: camera().bridge });
    open();
    expect(document.querySelector("#device-pairing-code")!.closest(".pairing-code-field")).toHaveAttribute("hidden");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Type the code" })); });
    expect(code().closest(".pairing-code-field")).not.toHaveAttribute("hidden");
    expect(code()).toHaveFocus();
    cleanup();
    removeApp();
  }
});

test("scanFirst: the camera opens inside the card; Escape ends it, and Type the code during it goes to the field", async () => {
  variant("scanFirst");
  const { bridge } = camera();
  installApp({ codeScanner: bridge });
  open();
  const start = () => screen.getByRole("button", { name: "Scan QR code" });
  await act(async () => { fireEvent.click(start()); });
  expect(viewfinder()).toBeNull();
  expect(screen.getByRole("region", { name: "Scan the pairing code" })).toBeInTheDocument();
  await act(async () => { fireEvent.keyDown(document.body, { key: "Escape" }); });
  expect(bridge.cancel).toHaveBeenCalled();
  expect(document.documentElement).not.toHaveAttribute("data-scanning");
  expect(document.activeElement).toBe(start());
  bridge.cancel.mockClear();
  await act(async () => { fireEvent.click(start()); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Type the code" })); });
  expect(bridge.cancel).toHaveBeenCalled();
  expect(document.documentElement).not.toHaveAttribute("data-scanning");
  expect(code()).toHaveFocus();
});

test("an unknown variant is today's: the button under the field", () => {
  variant("nope");
  installApp({ codeScanner: camera().bridge });
  open();
  expect(scanButton()).toHaveClass("pairing-scan");
});
