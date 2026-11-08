import { afterEach, expect, test, vi } from "vitest";
import { watchAudioDeviceRefresh } from "./audio-device-refresh";
import type { MicrophoneAccess, MicrophoneSnapshot } from "./microphone-access";

afterEach(() => vi.restoreAllMocks());

/* What reads the voice's device list again, owned by the runtime: the permission changing, the window coming back. */

function fakeAccess(state: MicrophoneSnapshot["state"]) {
  const listeners = new Set<() => void>();
  let snapshot = { state, asker: "app", known: true, dismissed: false, unchanged: false, from: null } as MicrophoneSnapshot;
  const dispose = vi.fn();
  const access = { getSnapshot: () => snapshot, subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, dispose } as unknown as MicrophoneAccess;
  return { access, listeners, dispose, set(next: MicrophoneSnapshot["state"]) { snapshot = { ...snapshot, state: next }; for (const l of [...listeners]) l(); } };
}

test("the permission turning granted after start reads the list again, with nothing mounted", () => {
  const refresh = vi.fn(async () => undefined);
  const mic = fakeAccess("prompt");
  const stop = watchAudioDeviceRefresh({ refresh, access: mic.access });
  mic.set("requesting");
  expect(refresh).not.toHaveBeenCalled();
  mic.set("granted");
  expect(refresh).toHaveBeenCalledTimes(1);
  // The same answer again is not a change; a microphone found missing is.
  mic.set("granted");
  expect(refresh).toHaveBeenCalledTimes(1);
  mic.set("missing");
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
});

test("the window coming back reads the list again; hidden does not", () => {
  const refresh = vi.fn(async () => undefined);
  const stop = watchAudioDeviceRefresh({ refresh, access: fakeAccess("granted").access });
  window.dispatchEvent(new Event("focus"));
  expect(refresh).toHaveBeenCalledTimes(1);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenCalledTimes(2);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
});

test("stopping leaves no listener: not the window's, not the document's, not the permission reader's", () => {
  const refresh = vi.fn(async () => undefined);
  const added: string[] = [], removed: string[] = [];
  const addWin = vi.spyOn(window, "addEventListener").mockImplementation((type) => { added.push(`win:${type}`); });
  const addDoc = vi.spyOn(document, "addEventListener").mockImplementation((type) => { added.push(`doc:${type}`); });
  const mic = fakeAccess("prompt");
  const stop = watchAudioDeviceRefresh({ refresh, access: mic.access });
  addWin.mockRestore(); addDoc.mockRestore();
  vi.spyOn(window, "removeEventListener").mockImplementation((type) => { removed.push(`win:${type}`); });
  vi.spyOn(document, "removeEventListener").mockImplementation((type) => { removed.push(`doc:${type}`); });
  expect(mic.listeners.size).toBe(1);
  stop();
  expect(removed.sort()).toEqual(added.sort());
  expect(added.length).toBe(2);
  expect(mic.listeners.size).toBe(0);
  expect(mic.dispose).toHaveBeenCalledTimes(1);
});
