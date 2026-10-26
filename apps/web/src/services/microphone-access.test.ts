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

test("devicechange: none listed is no microphone found, one plugged in finds it again", async () => {
  const b = browser("prompt", 0);
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("missing"));
  b.plug(1);
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  access.dispose();
});

test("iPhone Safari: the device list changes as the stream opens and is let go, listing none after; it stays allowed", async () => {
  const b = browser("prompt");
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  await access.request();
  expect(stateOf(access)()).toBe("granted");
  b.plug(0);
  b.status.dispatchEvent(new Event("change"));
  window.dispatchEvent(new Event("focus"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(stateOf(access)()).toBe("granted");
  access.dispose();
});

test("a stream one reader opens is the page's answer: the call's reader and one made later read it allowed", async () => {
  const b = browser("prompt");
  const call = createMicrophoneAccess();
  const settings = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(call)()).toBe("prompt"));
  await waitFor(() => expect(stateOf(settings)()).toBe("prompt"));
  await settings.request();
  expect(b.media.getUserMedia).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(stateOf(call)()).toBe("granted"));
  settings.dispose();
  const later = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(later)()).toBe("granted"));
  expect(b.media.getUserMedia).toHaveBeenCalledTimes(1);
  call.dispose(); later.dispose();
});

test("getUserMedia is called in the tap itself, before anything is awaited", () => {
  const b = browser("prompt");
  const access = createMicrophoneAccess();
  void access.request();
  expect(b.media.getUserMedia).toHaveBeenCalledWith({ audio: true });
  access.dispose();
});

test("a refusal is a block though the permission still says prompt (iPhone Safari); a prompt the browser says it dismissed is not", async () => {
  const b = browser("prompt");
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("prompt"));
  b.media.getUserMedia.mockRejectedValueOnce(Object.assign(new Error("The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission."), { name: "NotAllowedError" }));
  await access.request();
  expect(access.getSnapshot()).toMatchObject({ state: "denied", dismissed: false });
  b.media.getUserMedia.mockRejectedValueOnce(Object.assign(new Error("Permission dismissed"), { name: "NotAllowedError" }));
  await access.request();
  expect(access.getSnapshot()).toMatchObject({ state: "prompt", dismissed: true });
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


test("the app's request keeps \"missing\", and a failed request invents no denial", async () => {
  let system: "granted" | "denied" | "missing" = "missing";
  let fail = false;
  (window as { __sidevoiceDesktop?: unknown }).__sidevoiceDesktop = { host: { voice: {}, microphone: {
    state: async () => system,
    request: async () => { if (fail) throw new Error("native"); return system; },
  } } };
  const access = createMicrophoneAccess();
  await waitFor(() => expect(stateOf(access)()).toBe("missing"));
  await access.request();
  expect(stateOf(access)()).toBe("missing");
  system = "granted"; await access.check();
  fail = true; await access.request();
  expect(stateOf(access)()).toBe("granted");
  access.dispose();
});

test("a settings-only desktop bridge leaves permission with the webview and offers the privacy button", async () => {
  const b = browser("prompt");
  const openSettings = vi.fn(async () => {});
  Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { microphone: { openSettings } } } });
  const access = createMicrophoneAccess();
  await waitFor(() => expect(access.getSnapshot()).toMatchObject({ state: "prompt", asker: "page" }));
  expect(b.media.getUserMedia).not.toHaveBeenCalled();
  b.media.getUserMedia.mockRejectedValueOnce(refused("NotAllowedError"));
  await access.request();
  expect(access.getSnapshot().state).toBe("denied");
  await access.openSettings!();
  expect(openSettings).toHaveBeenCalledTimes(1);
  expect(access.getSnapshot().state).toBe("denied");
  // Returning from Settings does not assert capture access. Check again must open a real stream.
  window.dispatchEvent(new Event("focus"));
  await access.check();
  expect(access.getSnapshot().state).toBe("denied");
  await access.request();
  expect(access.getSnapshot().state).toBe("granted");
  expect(b.tracks.stop).toHaveBeenCalled();
  access.dispose();
});

test("no callable settings capability means no settings button", () => {
  browser("prompt");
  for (const microphone of [undefined, {}, { openSettings: true }]) {
    Object.defineProperty(window, "__sidevoiceDesktop", { configurable: true, value: { host: { microphone } } });
    const access = createMicrophoneAccess();
    expect(access.openSettings).toBeNull();
    access.dispose();
  }
});
