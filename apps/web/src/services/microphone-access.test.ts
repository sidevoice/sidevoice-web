import { afterEach, expect, test, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { createMicrophoneAccess } from "./microphone-access";

/* A browser permission read never opens the microphone by itself; the person verifies it with Allow. */

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

test("permission query changes are hints; a successful stream remains allowed", async () => {
  const b = browser("prompt");
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  b.set("denied");
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  b.set("prompt");
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  b.set("granted");
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  await access.request();
  expect(stateOf(access)()).toBe("granted");
  b.set("denied");
  await waitFor(() => expect(stateOf(access)()).toBe("granted"));
  access.dispose();
});

test("a granted site permission asks only on the person's action, and a real stream confirms it", async () => {
  const b = browser("denied");
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  b.media.getUserMedia.mockRejectedValueOnce(refused("NotAllowedError"));
  b.set("granted");
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  expect(b.media.getUserMedia).not.toHaveBeenCalled();
  await access.request();
  expect(stateOf(access)()).toBe("denied");
  await access.request();
  expect(stateOf(access)()).toBe("granted");
  expect(b.media.getUserMedia).toHaveBeenCalledTimes(2);
  expect(b.tracks.stop).toHaveBeenCalled();
  window.dispatchEvent(new Event("focus"));
  await waitFor(() => expect(stateOf(access)()).toBe("granted"));
  expect(b.media.getUserMedia).toHaveBeenCalledTimes(2);
  access.dispose();
});

test("devicechange: unplugging the microphone is no microphone found, plugging it in finds it again", async () => {
  const b = browser("granted");
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  await access.request();
  expect(stateOf(access)()).toBe("granted");
  b.plug(0);
  await waitFor(() => expect(stateOf(access)()).toBe("missing"));
  b.plug(1);
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  access.dispose();
});

test("window focus reads the state again", async () => {
  const b = browser("denied");
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
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

test("the app's \"missing\" is the missing state, in both directions", async () => {
  let system: "prompt" | "granted" | "denied" | "missing" = "granted";
  const listeners = new Set<() => void>();
  (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop = { host: { voice: {}, microphone: {
    state: async () => system,
    request: async () => system === "granted" ? "granted" : "denied",
    onChange: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
  } } };
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("granted"));
  system = "missing"; listeners.forEach((l) => l());
  await waitFor(() => expect(stateOf(access)()).toBe("missing"));
  system = "prompt"; listeners.forEach((l) => l());
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  access.dispose();
});
