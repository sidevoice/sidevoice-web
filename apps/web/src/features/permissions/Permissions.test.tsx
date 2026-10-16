import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { translator } from "../../i18n/translator";
import type { MicrophoneSnapshot } from "../../services/microphone-access";
import { PermissionsStep } from "../onboarding/PermissionsStep";
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
      render(<PermissionsStep microphone={microphone} openSettings={null} onRefresh={() => {}} t={t} platform="other" />);
      expect(document.querySelector(".wizard-perm")).toHaveAttribute("data-look", look);
      expect(row()).toHaveTextContent(state);
      if (line) expect(row()).toHaveTextContent(line);
      expect(document.querySelector(".wizard-mic-help") !== null).toBe(microphone.state === "denied");
      cleanup();
    }
  });
}

test("look a: Refresh status reads the state again without asking", () => {
  const refresh = vi.fn();
  render(<PermissionsStep microphone={snapshot("denied")} openSettings={null} onRefresh={refresh} t={t} platform="other" />);
  fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
  expect(refresh).toHaveBeenCalledTimes(1);
});

function browser(state: PermissionState) {
  const status = { state, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
  Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: vi.fn().mockResolvedValue(status) } });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  return { status, getUserMedia };
}

test("Settings › Permissions in a browser: the site's microphone permission, Allow at the row's end, and where to change it", async () => {
  const { getUserMedia } = browser("prompt");
  render(<PermissionsSettings t={t} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Allow microphone" })).toBeInTheDocument());
  expect(screen.getByText(/change it from the site settings icon/)).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Allow microphone" })); });
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  await waitFor(() => expect(document.querySelector(".perm-badge")).toHaveTextContent("Allowed"));
  expect(screen.queryByRole("button", { name: "Allow microphone" })).toBeNull();
});

test("Settings › Permissions, blocked: the badge says so, how to allow it, and Check again", async () => {
  browser("denied");
  render(<PermissionsSettings t={t} />);
  await waitFor(() => expect(document.querySelector(".perm-badge")).toHaveTextContent("Blocked"));
  expect(document.querySelector(".wizard-mic-help")).toHaveTextContent("Allow it for this site");
  expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh status" })).toBeEnabled();
});
