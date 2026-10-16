import { afterEach, expect, test, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { createMicrophoneAccess } from "./microphone-access";

/* The microphone's state follows the platform live, in every direction: the permission's change event, devicechange,
 * the app's own state events, and the window's focus. A rise to allowed in the browser is confirmed by a silent probe. */

const refused = (name: string) => Object.assign(new Error(name), { name });

function browser(initial: PermissionState, inputs = 1) {
  const status = Object.assign(new EventTarget(), { name: "microphone", state: initial });
  const tracks = { stop: vi.fn() };
  const media = Object.assign(new EventTarget(), {
    inputs,
    getUserMedia: vi.fn(async () => ({ getTracks: () => [tracks] })),
    enumerateDevices: vi.fn(async () => Array.from({ length: media.inputs }, () => ({ kind: "audioinput" }))),
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: media });
  Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: vi.fn(async () => status) } });
  return {
    status, media, tracks,
    set(next: PermissionState) { status.state = next; status.dispatchEvent(new Event("change")); },
    plug(count: number) { media.inputs = count; media.dispatchEvent(new Event("devicechange")); },
  };
}

afterEach(() => {
  delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  delete (navigator as { permissions?: unknown }).permissions;
  delete (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop;
});

const stateOf = (access: ReturnType<typeof createMicrophoneAccess>) => () => access.getSnapshot().state;

test("permission change events move the state in every direction", async () => {
  const b = browser("prompt");
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  b.set("denied");
  await waitFor(() => expect(stateOf(access)()).toBe("denied"));
  b.set("prompt");
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  b.set("granted");
  await waitFor(() => expect(stateOf(access)()).toBe("granted"));
  b.set("denied");
  await waitFor(() => expect(stateOf(access)()).toBe("denied"));
  access.dispose();
});

test("a rise to allowed is confirmed by a silent probe that lets the microphone go; a failed probe stays blocked", async () => {
  const b = browser("denied");
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("denied"));
  b.media.getUserMedia.mockRejectedValueOnce(refused("NotAllowedError"));
  b.set("granted");
  await waitFor(() => expect(b.media.getUserMedia).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 20));
  expect(stateOf(access)()).toBe("denied");
  b.set("prompt");
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  b.set("granted");
  await waitFor(() => expect(stateOf(access)()).toBe("granted"));
  expect(b.media.getUserMedia).toHaveBeenCalledTimes(2);
  expect(b.tracks.stop).toHaveBeenCalled();
  access.dispose();
});

test("devicechange: unplugging the microphone is no microphone found, plugging it in finds it again", async () => {
  const b = browser("granted");
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("granted"));
  b.plug(0);
  await waitFor(() => expect(stateOf(access)()).toBe("missing"));
  b.plug(1);
  await waitFor(() => expect(stateOf(access)()).toBe("granted"));
  access.dispose();
});

test("window focus reads the state again", async () => {
  const b = browser("denied");
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("denied"));
  b.status.state = "prompt";
  window.dispatchEvent(new Event("focus"));
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  access.dispose();
});

test("the app's state is authoritative: its change events move it with no probe", async () => {
  let system: "prompt" | "granted" | "denied" = "denied";
  const listeners = new Set<() => void>();
  (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop = { host: { voice: {}, microphone: {
    state: async () => system,
    request: async () => system === "granted" ? "granted" : "denied",
    onChange: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
  } } };
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("denied"));
  system = "granted"; listeners.forEach((l) => l());
  await waitFor(() => expect(stateOf(access)()).toBe("granted"));
  system = "denied"; listeners.forEach((l) => l());
  await waitFor(() => expect(stateOf(access)()).toBe("denied"));
  access.dispose();
  expect(listeners.size).toBe(0);
});
