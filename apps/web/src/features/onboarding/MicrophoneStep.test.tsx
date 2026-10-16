import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { App } from "../../app/App";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { ONBOARDING_STORAGE_KEY } from "../../services/onboarding-state";
import { devicePlatform } from "../../services/microphone-access";
import type { SidevoiceActions } from "../../state/room-types";

vi.mock("../../services/room-session-controller.js", () => ({}));

/** The whole App rendered: past vitest's five seconds on a busy machine (see Onboarding.test.tsx). */
const WHOLE_APP_MS = 15_000;

/* The setup's microphone step (web#129): asked for before transcription, through the browser's permission or the
 * desktop app's; every state it can be in — not asked, waiting, allowed (and on by itself), blocked (how to allow it,
 * Check again), the request closed, no microphone — and where there is nothing to ask. */

const NUC = { fp: "fp-nuc", device_id: "d-1", urls: ["https://nuc.example"], rv: null, host: "NUC", paired_at: 1_700_000_000, revoked: false };

/** The browser's microphone permission, as `permissions.query` gives it: its state, changed by the test. */
function permission(state: PermissionState) {
  const status = Object.assign(new EventTarget(), { name: "microphone", state });
  return { status, set(next: PermissionState) { status.state = next; status.dispatchEvent(new Event("change")); } };
}

let stop: ReturnType<typeof vi.fn>;
function browser(state: PermissionState, getUserMedia: (constraints: MediaStreamConstraints) => Promise<unknown>) {
  const granted = permission(state);
  const media = { getUserMedia: vi.fn(getUserMedia) };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: media });
  Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: vi.fn(async () => granted.status) } });
  return { granted, media };
}
const stream = () => ({ getTracks: () => [{ stop }] });
const refused = (name: string) => Object.assign(new Error(name), { name });

beforeEach(() => {
  stop = vi.fn();
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ basics_done: true, choice: "remote" }));
  window.sidevoiceActions = { loadVoiceCatalogue: vi.fn().mockResolvedValue(undefined), editVoice: vi.fn(), cancelVoiceTry: vi.fn() } as unknown as SidevoiceActions;
});
afterEach(() => {
  delete window.sidevoiceActions;
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
  delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  delete (navigator as { permissions?: unknown }).permissions;
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  vi.restoreAllMocks();
});

const wizard = () => within(document.getElementById("wizard")!);
const title = () => wizard().getByRole("heading", { level: 2 });
const action = () => document.getElementById("wizard-mic-action");
// Allowed, the row's button is the green badge (a focusable span) and there is no button any more.
const badge = () => document.querySelector("#wizard .perm-list .perm-badge")!;
const proceed = () => document.getElementById("wizard-mic-continue")!;
const said = () => document.querySelector("#wizard .wizard-mic [role=status]")!.textContent;
const tile = () => document.querySelector("#wizard .perm-list")!.textContent;

/** The setup over the room, its other machine paired: where it resumes is the microphone's or transcription's. */
async function setup() {
  const store = createRoomStore();
  act(() => store.patch({ machinesReady: true, voiceSettings: defaultVoiceSettings(), pairings: [NUC], machineLinks: { [NUC.fp]: { reach: "ok", via: "node" } } }));
  render(<App store={store} />);
  await waitFor(() => expect(document.getElementById("wizard")).toHaveAttribute("open"));
}

test("not asked yet: Allow microphone asks the browser, lets the microphone go at once, and, allowed, Continue moves on to transcription", async () => {
  let answer!: (value: unknown) => void;
  const { media } = browser("prompt", () => new Promise((resolve) => { answer = resolve; }));
  await setup();
  expect(title()).toHaveTextContent("Permissions");
  expect(wizard().getByRole("list", { name: "Setup progress" }).children).toHaveLength(8);
  expect(tile()).toContain("Needed so your agent can hear you");
  expect(proceed()).toHaveAttribute("aria-disabled", "true");
  expect(action()).toHaveTextContent("Allow microphone");
  await act(async () => { fireEvent.click(action()!); });
  expect(media.getUserMedia).toHaveBeenCalledWith({ audio: true });
  expect(action()).toHaveAttribute("aria-busy", "true");
  expect(said()).toBe("Answer your browser’s request to use the microphone.");
  await act(async () => { answer(stream()); });
  expect(stop).toHaveBeenCalled();
  expect(action()).toBeNull();
  expect(badge()).toHaveTextContent("Allowed");
  expect(said()).toBe("Microphone allowed.");
  // Allowed, it says so and waits for Continue: it never moves on by itself.
  expect(proceed()).not.toHaveAttribute("aria-disabled", "true");
  expect(title()).toHaveTextContent("Permissions");
  await act(async () => { fireEvent.click(proceed()); });
  expect(title()).toHaveTextContent("Set up transcription");
  // Kept for a browser that could not say so without asking again.
  expect(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!).microphone_done).toBe(true);
}, WHOLE_APP_MS);

test("blocked: how to allow it for the site, Check again (still blocked, said so), and Check again once it is allowed in the browser says so and waits for Continue", async () => {
  const { granted, media } = browser("denied", () => Promise.reject(refused("NotAllowedError")));
  await setup();
  expect(title()).toHaveTextContent("Permissions");
  expect(document.querySelector("#wizard .wizard-mic-help .ui-alert-title")).toHaveTextContent("Sidevoice can’t use the microphone");
  expect(wizard().getByText(/select the site settings icon beside the web address/)).toBeInTheDocument();
  expect(action()).toHaveTextContent("Check again");
  // Mandatory: the footer's Continue waits; the recovery is all under the microphone's row.
  expect(proceed()).toHaveTextContent("Continue");
  expect(proceed()).toHaveAttribute("aria-disabled", "true");
  expect(proceed()).toHaveClass("ui-button--primary");
  expect(document.querySelector("#wizard .wizard-actions .wizard-mic-help, #wizard .wizard-actions .perm-also")).toBeNull();
  expect(document.querySelector("#wizard .perm-list .wizard-mic-help")).not.toBeNull();
  action()!.focus();
  await act(async () => { fireEvent.click(action()!); });
  expect(media.getUserMedia).toHaveBeenCalledTimes(1);
  expect(said()).toBe("Still blocked.");
  expect(document.activeElement).toBe(action());
  // The site now reads allowed, but a plain read never upgrades a block (the computer may still be blocking the
  // browser): only a successful request does.
  await act(async () => { granted.set("granted"); });
  expect(action()).toHaveTextContent("Check again");
  media.getUserMedia.mockResolvedValue(stream());
  await act(async () => { fireEvent.click(action()!); });
  // Allowed, it says so and waits for Continue: it never moves on by itself.
  await waitFor(() => expect(badge()).toHaveTextContent("Allowed"));
  expect(title()).toHaveTextContent("Permissions");
  await act(async () => { fireEvent.click(proceed()); });
  expect(title()).toHaveTextContent("Set up transcription");
}, WHOLE_APP_MS);

test("required in this release: no way past the step without the microphone allowed (only Continue without passes it), reloaded or not", async () => {
  const { media } = browser("denied", () => Promise.reject(refused("NotAllowedError")));
  await setup();
  expect(title()).toHaveTextContent("Permissions");
  // Continue waits, focusable, saying why; pressed, it goes nowhere.
  expect(proceed()).toHaveAttribute("aria-disabled", "true");
  await act(async () => { fireEvent.click(proceed()); });
  expect(title()).toHaveTextContent("Permissions");
  expect(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!).microphone_done ?? false).toBe(false);
  cleanup();
  await setup();
  expect(title()).toHaveTextContent("Permissions");
  // Allowed: Continue, and on to transcription.
  media.getUserMedia.mockResolvedValue(stream());
  await act(async () => { fireEvent.click(action()!); });
  await waitFor(() => expect(proceed()).not.toHaveAttribute("aria-disabled", "true"));
  await act(async () => { fireEvent.click(proceed()); });
  expect(title()).toHaveTextContent("Set up transcription");
}, WHOLE_APP_MS);

test("Continue without microphone is kept, a reload goes on from there, and allowed it is gone", async () => {
  browser("denied", () => Promise.reject(refused("NotAllowedError")));
  await setup();
  expect(title()).toHaveTextContent("Permissions");
  expect(proceed()).toHaveAttribute("aria-disabled", "true");
  await act(async () => { fireEvent.click(wizard().getByRole("button", { name: "Continue without microphone" })); });
  expect(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!).microphone_skipped).toBe(true);
  expect(title()).not.toHaveTextContent("Permissions");
  cleanup();
  await setup();
  expect(title()).not.toHaveTextContent("Permissions");
}, WHOLE_APP_MS);

test("the request closed without an answer is not a block: Allow microphone again", async () => {
  browser("prompt", () => Promise.reject(refused("NotAllowedError")));
  await setup();
  await act(async () => { fireEvent.click(action()!); });
  expect(said()).toBe("The request was closed without an answer. Allow microphone asks again.");
  expect(action()).toHaveTextContent("Allow microphone");
}, WHOLE_APP_MS);

test("already allowed: never asked again; the step still shows it allowed, with Continue", async () => {
  const { media } = browser("granted", () => Promise.resolve(stream()));
  await setup();
  expect(title()).toHaveTextContent("Permissions");
  expect(action()).toBeNull();
  expect(badge()).toHaveTextContent("Allowed");
  expect(proceed()).toHaveTextContent("Continue");
  expect(proceed()).toHaveClass("ui-button--primary");
  expect(media.getUserMedia).not.toHaveBeenCalled();
  // It stays until Continue.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  expect(title()).toHaveTextContent("Permissions");
}, WHOLE_APP_MS);

test("none connected: No microphone found, and Check again finds one", async () => {
  let found = false;
  browser("prompt", () => found ? Promise.resolve(stream()) : Promise.reject(refused("NotFoundError")));
  await setup();
  await act(async () => { fireEvent.click(action()!); });
  expect(said()).toBe("No microphone found");
  expect(action()).toHaveTextContent("Check again");
  found = true;
  await act(async () => { fireEvent.click(action()!); });
  // Allowed, it says so and waits for Continue: it never moves on by itself.
  await waitFor(() => expect(badge()).toHaveTextContent("Allowed"));
  expect(title()).toHaveTextContent("Permissions");
  await act(async () => { fireEvent.click(proceed()); });
  expect(title()).toHaveTextContent("Set up transcription");
}, WHOLE_APP_MS);

test("in the desktop app on a Mac: the system's permission through the app, its settings opened from the step", async () => {
  let state: "prompt" | "granted" | "denied" = "denied";
  const microphone = { state: vi.fn(async () => state), request: vi.fn(async () => state === "granted" ? "granted" : "denied"), openSettings: vi.fn(async () => {}) };
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { voice: {}, microphone } } });
  await setup();
  expect(title()).toHaveTextContent("Permissions");
  expect(wizard().getByText(/System Settings › Privacy & Security › Microphone and turn on Sidevoice/)).toBeInTheDocument();
  fireEvent.click(wizard().getByRole("button", { name: "Open System Settings" }));
  expect(microphone.openSettings).toHaveBeenCalled();
  state = "granted";
  await act(async () => { fireEvent.click(action()!); });
  expect(microphone.request).toHaveBeenCalled();
  // Allowed, it says so and waits for Continue: it never moves on by itself.
  await waitFor(() => expect(badge()).toHaveTextContent("Allowed"));
  expect(title()).toHaveTextContent("Permissions");
  await act(async () => { fireEvent.click(proceed()); });
  expect(title()).toHaveTextContent("Set up transcription");
}, WHOLE_APP_MS);

test("nothing to ask: an app that asks for itself when its call opens, or a page with no microphone API, goes straight to transcription", async () => {
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { voice: {} } } });
  await setup();
  expect(title()).toHaveTextContent("Set up transcription");
}, WHOLE_APP_MS);

test("where its settings are: the platform the page runs on, a phone none", () => {
  const nav = (platform: string, userAgent = "", maxTouchPoints = 0) => ({ platform, userAgent, maxTouchPoints }) as Navigator;
  expect(devicePlatform(nav("MacIntel"))).toBe("mac");
  expect(devicePlatform(nav("MacIntel", "", 5))).toBe("other");
  expect(devicePlatform(nav("Win32"))).toBe("windows");
  expect(devicePlatform(nav("Linux x86_64"))).toBe("linux");
  expect(devicePlatform(nav("Linux armv8l", "Mozilla/5.0 (Linux; Android 14)"))).toBe("other");
});
