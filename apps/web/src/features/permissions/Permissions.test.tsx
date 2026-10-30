import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { translator } from "../../i18n/translator";
import type { MicrophoneSnapshot } from "../../services/microphone-access";
import { createMicrophoneAccess } from "../../services/microphone-access";
import { MicrophoneContinue, PermissionsStep } from "../onboarding/PermissionsStep";
import { useMicrophoneAccess } from "./permission-view";
import { PermissionsSettings } from "../settings/PermissionsSettings";

/* What Sidevoice needs allowed, in the setup (the person's bicho) and in Settings › Permissions. */

const t = translator("en");
afterEach(() => {
  cleanup();
  delete (window as { __sidevoiceHost?: unknown }).__sidevoiceHost;
  delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  delete (navigator as { permissions?: unknown }).permissions;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const snapshot = (state: MicrophoneSnapshot["state"], extra: Partial<MicrophoneSnapshot> = {}): MicrophoneSnapshot =>
  ({ state, asker: "page", known: true, dismissed: false, unchanged: false, from: null, ...extra });
const list = () => document.querySelector(".perm-list")!;

test("one row says where the microphone stands: its name and why, Allow microphone at the right, the green badge once allowed; blocked, how to allow it", () => {
  const cases: [MicrophoneSnapshot, string | null][] = [
    [snapshot("prompt"), "Allow microphone"],
    [snapshot("requesting", { from: "prompt" }), "Allow microphone"],
    [snapshot("granted"), null],
    [snapshot("denied"), "Check again"],
    [snapshot("missing"), "Check again"],
  ];
  for (const [microphone, button] of cases) {
    render(<PermissionsStep microphone={microphone} openSettings={null} t={t} platform="other" />);
    expect(list()).toHaveTextContent("Microphone");
    expect(list()).toHaveTextContent("Needed so your agent can hear you");
    if (button) expect(list().querySelector("#wizard-mic-action")).toHaveTextContent(button);
    else {
      expect(list().querySelector("#wizard-mic-action")).toBeNull();
      expect(list().querySelector(".perm-badge")).toHaveTextContent("Allowed");
    }
    expect(document.querySelector(".wizard-mic-help") !== null).toBe(microphone.state === "denied" || microphone.state === "missing");
    cleanup();
  }
});

test("no Refresh status in the setup; blocked, the footer's action is described by the how-to, which is a live alert", () => {
  render(<PermissionsStep microphone={snapshot("denied")} openSettings={null} t={t} platform="other" />);
  expect(screen.queryByRole("button", { name: "Refresh status" })).toBeNull();
  expect(document.querySelector(".wizard-mic-help")).toHaveAttribute("role", "alert");
  // The card's one control is described by the how-to, which sits in the same block.
  expect(screen.getByRole("button", { name: "Check again" })).toHaveAttribute("aria-describedby", "wizard-mic-help");
  expect(document.querySelector(".perm-list .wizard-mic-help")).not.toBeNull();
  cleanup();
  // Mandatory: Continue waits until the microphone is allowed, and there is no way past without it.
  render(<MicrophoneContinue microphone={snapshot("denied")} onContinue={() => {}} t={t} />);
  expect(screen.getByRole("button", { name: "Continue" })).toHaveAttribute("aria-disabled", "true");
  expect(screen.queryByRole("button", { name: /Continue without/ })).toBeNull();
});

test("the bicho is calm in every state and its wrapper follows the permission state", () => {
  const cases: [MicrophoneSnapshot, string][] = [
    [snapshot("prompt"), "prompt"], [snapshot("requesting", { from: "prompt" }), "requesting"], [snapshot("granted"), "granted"],
    [snapshot("denied"), "denied"], [snapshot("requesting", { from: "denied" }), "denied"], [snapshot("missing"), "missing"],
  ];
  for (const [microphone, state] of cases) {
    render(<PermissionsStep microphone={microphone} openSettings={null} t={t} platform="other" />);
    expect(document.querySelector(".perm-hero-figure .sv-avatar")).toHaveAttribute("data-avatar-state", "present");
    expect(document.querySelector(".perm-hero-figure")).toHaveAttribute("data-state", state);
    expect(list()).toHaveAttribute("data-state", state);
    cleanup();
  }
});

test("the row's button follows the state (Allow microphone, Check again); once allowed it is the green badge, which keeps focus", () => {
  const onRequest = vi.fn();
  const view = render(<PermissionsStep microphone={snapshot("prompt")} openSettings={null} t={t} platform="other" onRequest={onRequest} />);
  const control = screen.getByRole("button", { name: "Allow microphone" });
  fireEvent.click(control);
  expect(onRequest).toHaveBeenCalledTimes(1);
  view.rerender(<PermissionsStep microphone={snapshot("denied")} openSettings={null} t={t} platform="other" onRequest={onRequest} />);
  expect(screen.getByRole("button", { name: "Check again" })).toBe(control);
  view.rerender(<PermissionsStep microphone={snapshot("granted")} openSettings={null} t={t} platform="other" onRequest={onRequest} />);
  expect(screen.queryByRole("button", { name: /Allow microphone|Check again/ })).toBeNull();
  expect(document.querySelector(".perm-badge")).toHaveTextContent("Allowed");
  expect(document.querySelector(".perm-badge-focus")).toHaveAttribute("tabindex", "-1");
  expect(onRequest).toHaveBeenCalledTimes(1);
});

function browser(state: PermissionState) {
  const status = { state, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
  Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: vi.fn().mockResolvedValue(status) } });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  return { status, getUserMedia };
}

/** What the settings dialog does: one reader, shared. */
function Settings() {
  const { access, microphone } = useMicrophoneAccess();
  return <PermissionsSettings t={t} access={access} microphone={microphone} />;
}

test("false Allowed: the computer blocks the browser while the site reads allowed; a failed request stays blocked through a later plain read", async () => {
  const { status, getUserMedia } = browser("granted");
  getUserMedia.mockRejectedValue(Object.assign(new Error("blocked by the system"), { name: "NotAllowedError" }));
  const access = createMicrophoneAccess();
  await waitFor(() => expect(access.getSnapshot().state).toBe("prompt"));
  await access.request();
  expect(access.getSnapshot().state).toBe("denied");
  // The site still reads allowed: a focus or a refresh must not flip it.
  expect(status.state).toBe("granted");
  await access.check();
  expect(access.getSnapshot().state).toBe("denied");
  window.dispatchEvent(new Event("focus"));
  await access.check();
  expect(access.getSnapshot().state).toBe("denied");
  // Only a successful request moves it on.
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
  await access.request();
  expect(access.getSnapshot().state).toBe("granted");
  access.dispose();
});

test("false Allowed: no microphone found stays so through a plain read that says allowed", async () => {
  const { getUserMedia } = browser("granted");
  getUserMedia.mockRejectedValue(Object.assign(new Error("none"), { name: "NotFoundError" }));
  const access = createMicrophoneAccess();
  await waitFor(() => expect(access.getSnapshot().state).toBe("prompt"));
  await access.request();
  expect(access.getSnapshot().state).toBe("missing");
  await access.check();
  expect(access.getSnapshot().state).toBe("missing");
  access.dispose();
});

test("Settings › Permissions in a browser: the setup's list, Allow at the row's end, the badge once allowed; no Refresh and no site note", async () => {
  const { getUserMedia } = browser("prompt");
  render(<Settings />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Allow microphone" })).toBeInTheDocument());
  expect(screen.getByText("Needed so your agent can hear you")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Refresh status" })).toBeNull();
  expect(screen.queryByText(/site settings icon/)).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Allow microphone" })); });
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  await waitFor(() => expect(document.querySelector(".perm-badge")).toHaveTextContent("Allowed"));
});

test("Settings › Permissions: the one button stays mounted and keeps focus while it asks; allowed, focus moves to the badge, and a polite region says the result", async () => {
  const { getUserMedia } = browser("prompt");
  let answer!: (value: unknown) => void;
  getUserMedia.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
  render(<Settings />);
  const button = await screen.findByRole("button", { name: "Allow microphone" });
  button.focus();
  fireEvent.click(button);
  await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
  expect(screen.getByRole("button", { name: "Allow microphone" })).toBe(button);
  expect(document.activeElement).toBe(button);
  await act(async () => { answer({ getTracks: () => [{ stop: vi.fn() }] }); });
  await waitFor(() => expect(document.querySelector(".perm-badge")).toHaveTextContent("Allowed"));
  // The button gives way to the badge, and focus goes there, never to the page.
  expect(screen.queryByRole("button", { name: /Allow microphone|Check again/ })).toBeNull();
  expect(document.activeElement).toBe(document.querySelector(".perm-badge-focus"));
  const region = document.querySelector("[role=status][aria-live=polite]")!;
  expect(region).toHaveTextContent("Microphone allowed.");
});

test("Settings › Permissions, blocked: how to allow it under the row, and Check again; no badge, no Refresh", async () => {
  const { getUserMedia } = browser("denied");
  getUserMedia.mockRejectedValue(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
  render(<Settings />);
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Allow microphone" })); });
  await waitFor(() => expect(document.querySelector(".wizard-mic-help")).toHaveTextContent("Allow it for this site"));
  expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  expect(document.querySelector(".perm-badge")).toBeNull();
  expect(screen.queryByRole("button", { name: "Refresh status" })).toBeNull();
});

test("Settings › Permissions trusts a successful stream when Safari's query rejects or says denied", async () => {
  for (const query of ["denied", "reject"] as const) {
    const { getUserMedia } = browser("denied");
    if (query === "reject") vi.mocked(navigator.permissions.query).mockRejectedValue(new TypeError("unsupported"));
    render(<Settings />);
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Allow microphone" })); });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.querySelector(".perm-badge")).toHaveTextContent("Allowed"));
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(document.querySelector(".perm-badge")).toHaveTextContent("Allowed"));
    cleanup();
  }
});


test.each(["setup", "settings"])("Windows %s: the privacy button uses the settings-only bridge; Check again still asks the webview", async (place) => {
  const openSettings = vi.fn(async () => {});
  Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: { build: { channel: "release", version: "0.3.0" }, microphone: { openSettings } } } });
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  const { getUserMedia } = browser("prompt");
  getUserMedia.mockRejectedValueOnce(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
  function Setup() {
    const { access, microphone } = useMicrophoneAccess();
    return microphone && <PermissionsStep microphone={microphone} openSettings={access?.openSettings ?? null} onRequest={() => void access?.request()} t={t} />;
  }
  render(place === "settings" ? <Settings /> : <Setup />);
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Allow microphone" })); });
  expect(document.querySelector(".wizard-mic-help")).toHaveTextContent("Microphone access");
  expect(document.querySelector(".wizard-mic-help")).toHaveTextContent("Let desktop apps access your microphone");
  fireEvent.click(screen.getByRole("button", { name: "Open Windows Settings" }));
  expect(openSettings).toHaveBeenCalledTimes(1);
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Check again" })); });
  expect(getUserMedia).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(document.querySelector(".perm-badge")).toHaveTextContent("Allowed"));
});

test("no microphone found in the desktop app on Windows: the alert says what to do, with Open Windows Settings", () => {
  const openSettings = vi.fn(() => Promise.resolve());
  render(<PermissionsStep microphone={snapshot("missing", { asker: "app" })} openSettings={openSettings} t={t} platform="windows" />);
  expect(document.querySelector(".wizard-mic-help")).toHaveTextContent("Connect a microphone or turn one on, then check again.");
  fireEvent.click(screen.getByRole("button", { name: "Open Windows Settings" }));
  expect(openSettings).toHaveBeenCalled();
});

test("none found says itself once, by the alert: the polite status stays silent until a retry finds it still missing", () => {
  const status = () => document.querySelector("[role=status][aria-live=polite]")!;
  render(<PermissionsStep microphone={snapshot("missing")} openSettings={null} t={t} platform="windows" />);
  expect(document.querySelector(".wizard-mic-help")).toHaveAttribute("role", "alert");
  expect(status()).toHaveTextContent("");
  cleanup();
  render(<PermissionsStep microphone={snapshot("missing", { unchanged: true })} openSettings={null} t={t} platform="windows" />);
  expect(status()).toHaveTextContent("Still no microphone found.");
});

test("focus on the settings button inside the alert moves to the badge once the microphone is allowed", () => {
  const openSettings = () => Promise.resolve();
  for (const blocked of ["missing", "denied"] as const) {
    const { rerender } = render(<PermissionsStep microphone={snapshot(blocked, { asker: "app" })} openSettings={openSettings} t={t} platform="windows" />);
    screen.getByRole("button", { name: "Open Windows Settings" }).focus();
    rerender(<PermissionsStep microphone={snapshot("granted", { asker: "app" })} openSettings={openSettings} t={t} platform="windows" />);
    expect(document.activeElement).toBe(document.querySelector(".perm-badge-focus"));
    cleanup();
  }
});

test("blocked in the desktop app on Windows: the alert names the Windows setting, and its button opens Windows Settings", () => {
  const openSettings = vi.fn(() => Promise.resolve());
  render(<PermissionsStep microphone={snapshot("denied", { asker: "app" })} openSettings={openSettings} t={t} platform="windows" />);
  const help = document.querySelector(".wizard-mic-help");
  expect(help).toHaveTextContent("Settings › Privacy & security › Microphone");
  expect(help).toHaveTextContent("Let desktop apps access your microphone");
  expect(help).not.toHaveTextContent("System Settings");
  fireEvent.click(screen.getByRole("button", { name: "Open Windows Settings" }));
  expect(openSettings).toHaveBeenCalledTimes(1);
});
