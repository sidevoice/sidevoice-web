import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { translator } from "../../i18n/translator";
import type { MicrophoneSnapshot } from "../../services/microphone-access";
import { createMicrophoneAccess } from "../../services/microphone-access";
import { MicrophoneAction, PermissionsStep } from "../onboarding/PermissionsStep";
import { useMicrophoneAccess } from "./permission-view";
import { PermissionsSettings } from "../settings/PermissionsSettings";

/* What Sidevoice needs allowed, in the setup's four looks (variant permissionsStep) and in Settings › Permissions. */

const t = translator("en");
afterEach(() => {
  cleanup();
  localStorage.removeItem("sidevoice.variants");
  delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  delete (navigator as { permissions?: unknown }).permissions;
  vi.restoreAllMocks();
});

const snapshot = (state: MicrophoneSnapshot["state"], extra: Partial<MicrophoneSnapshot> = {}): MicrophoneSnapshot =>
  ({ state, asker: "page", known: true, dismissed: false, unchanged: false, from: null, ...extra });
const row = () => document.querySelector("[data-permission=microphone]")!;

for (const look of ["a", "b", "c", "d"] as const) {
  test(`look ${look}: every state says where the microphone stands; blocked, how to allow it`, () => {
    localStorage.setItem("sidevoice.variants", JSON.stringify({ permissionsStep: look }));
    const cases: [MicrophoneSnapshot, string, string | null][] = [
      [snapshot("prompt"), "Not allowed yet", "Your browser will ask you once."],
      [snapshot("requesting", { from: "prompt" }), "Waiting for your answer", "Answer your browser’s request to use the microphone."],
      [snapshot("granted"), "Allowed", "Your voice will work in calls."],
      [snapshot("denied"), "Blocked", null],
      [snapshot("missing"), "No microphone found", "Connect a microphone or turn one on, then check again."],
    ];
    for (const [microphone, state, line] of cases) {
      render(<PermissionsStep microphone={microphone} openSettings={null} t={t} platform="other" />);
      expect(document.querySelector(".wizard-perm")).toHaveAttribute("data-look", look);
      expect(row()).toHaveTextContent(state);
      if (line) expect(row()).toHaveTextContent(line);
      expect(document.querySelector(".wizard-mic-help") !== null).toBe(microphone.state === "denied");
      cleanup();
    }
  });
}


test("look a: no Refresh status in the setup (it stays in Settings); blocked, the footer's action is described by the how-to, which is a live alert", () => {
  render(<PermissionsStep microphone={snapshot("denied")} openSettings={null} t={t} platform="other" />);
  expect(screen.queryByRole("button", { name: "Refresh status" })).toBeNull();
  expect(document.querySelector(".perm-badge")).toHaveAttribute("data-tone", "warning");
  expect(document.querySelector(".wizard-mic-help")).toHaveAttribute("role", "alert");
  cleanup();
  render(<MicrophoneAction microphone={snapshot("denied")} onRequest={() => {}} onContinue={() => {}} t={t} />);
  const help = "wizard-mic-help";
  expect(screen.getByRole("button", { name: "Check again" })).toHaveAttribute("aria-describedby", help);
});

test("look b: the bicho is calm, never listening, and its explanation follows the state", () => {
  localStorage.setItem("sidevoice.variants", JSON.stringify({ permissionsStep: "b" }));
  const cases: [MicrophoneSnapshot, RegExp][] = [
    [snapshot("prompt"), /Allow it now/], [snapshot("granted"), /only while voice is on in a call/], [snapshot("denied"), /Fix it, then check again/],
  ];
  for (const [microphone, why] of cases) {
    render(<PermissionsStep microphone={microphone} openSettings={null} t={t} platform="other" />);
    expect(document.querySelector(".perm-hero-why")).toHaveTextContent(why);
    expect(document.querySelector(".perm-hero .sv-avatar")).not.toHaveAttribute("data-mood", "listening");
    expect(document.querySelector(".perm-hero .sv-avatar")).toHaveAttribute("data-avatar-state", "present");
    cleanup();
  }
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
  await waitFor(() => expect(access.getSnapshot().state).toBe("granted"));
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
  await waitFor(() => expect(access.getSnapshot().state).toBe("granted"));
  await access.request();
  expect(access.getSnapshot().state).toBe("missing");
  await access.check();
  expect(access.getSnapshot().state).toBe("missing");
  access.dispose();
});

test("Settings › Permissions in a browser: the site's microphone permission, Allow at the row's end, and where to change it, on a computer and on a phone", async () => {
  const { getUserMedia } = browser("prompt");
  render(<Settings />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Allow microphone" })).toBeInTheDocument());
  expect(screen.getByText(/change it from the site settings icon/)).toBeInTheDocument();
  expect(screen.getByText(/tap aA, then Website Settings/)).toBeInTheDocument();
  expect(screen.queryByText(/once you refresh/)).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Allow microphone" })); });
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  await waitFor(() => expect(document.querySelector(".perm-badge")).toHaveTextContent("Allowed"));
});

test("Settings › Permissions: the one button stays mounted and keeps focus while it asks, changes only its words, and a polite region says the result", async () => {
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
  // Still the same button, now saying Check again; focus stayed on it.
  expect(screen.getByRole("button", { name: "Check again" })).toBe(button);
  expect(button).not.toHaveAttribute("aria-busy");
  expect(document.activeElement).toBe(button);
  const region = document.querySelector("[role=status][aria-live=polite]")!;
  expect(region).toHaveTextContent("Microphone allowed.");
});

test("Settings › Permissions, blocked: the badge says so, how to allow it, and Check again", async () => {
  browser("denied");
  render(<Settings />);
  await waitFor(() => expect(document.querySelector(".perm-badge")).toHaveTextContent("Blocked"));
  expect(document.querySelector(".wizard-mic-help")).toHaveTextContent("Allow it for this site");
  expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh status" })).toBeEnabled();
});
