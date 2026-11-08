import { createMicrophoneAccess, type MicrophoneAccess, type MicrophoneState } from "./microphone-access";

/* What makes the voice's device list (the store's `audioDevices`) read again, in one place: the runtime starts this
 * once and the components only read the store. The voice host itself tells when a device is plugged in or out
 * (`onAudioDevices`: `devicechange` on the web, the app's own report on the desktop); this adds what it cannot see:
 * the microphone's permission changing (labels and, on the desktop, the whole list appear only once it is allowed),
 * and the window coming back. A component showing the list asks `refreshAudioDevices` when it is shown. */

/** How to read the list again, and the sources of the signals (given in tests). */
export interface AudioDeviceRefreshOptions {
  refresh(): Promise<unknown> | unknown;
  win?: Window & typeof globalThis;
  access?: MicrophoneAccess;
}

const settled = (state: MicrophoneState) => state !== "checking" && state !== "requesting";

/** Starts following the signals; returns how to stop (removes every listener it added). */
export function watchAudioDeviceRefresh({ refresh, win = window, access = createMicrophoneAccess(win) }: AudioDeviceRefreshOptions): () => void {
  const run = () => { try { void Promise.resolve(refresh()).catch(() => undefined); } catch { /* the list stays as it was */ } };
  // A change of the permission's answer (also from nothing read yet to the first answer), not every device change the
  // microphone reader sees: those the host reports itself.
  let last: MicrophoneState = access.getSnapshot().state;
  const unsubscribe = access.subscribe(() => {
    const { state } = access.getSnapshot();
    if (!settled(state) || state === last) return;
    last = state;
    run();
  });
  const onFocus = () => run();
  const onVisible = () => { if (win.document?.visibilityState !== "hidden") run(); };
  win.addEventListener("focus", onFocus);
  win.document?.addEventListener("visibilitychange", onVisible);
  return () => {
    unsubscribe();
    access.dispose();
    win.removeEventListener("focus", onFocus);
    win.document?.removeEventListener("visibilitychange", onVisible);
  };
}
