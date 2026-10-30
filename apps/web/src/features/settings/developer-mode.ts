import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { host } from "../../host";

/* Developer mode (operator, 2026-10-21): a hidden switch, in nightly builds only, that adds "Developer options" to
 * Settings. Android's way in: click the version in Settings › Updates ten times within five seconds; the same again
 * turns it off. It is kept on this device (localStorage) so it stays across restarts.
 *
 * "Nightly" is the desktop app's own word for its build (`host.build.channel`, host().identity.build: the one Updates already
 * reads to say "Nightly" under the version), not a second signal: a release, a development build, a build that says
 * nothing and the plain web all read as not nightly, and the gesture does nothing there. */

/** What keeps developer mode on, on this device. */
export const DEVELOPER_MODE_KEY = "sidevoiceDeveloperMode";
/** The clicks that turn developer mode on or off, and the time they all have to fall in. */
export const TAPS_TO_TOGGLE = 10;
export const TAP_WINDOW_MS = 5000;
/** How long the confirmation stays beside the version. */
export const NOTE_MS = 4000;

/** This build is a nightly, as the desktop app says it. */
export function isNightlyBuild(): boolean {
  return host().identity.build?.channel === "nightly";
}

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

/** Developer mode is on: asked for on this device, and in a build that has it. A stored "on" does nothing in any
 *  other build (the same origin opened by a release app, say). */
export function developerModeOn(): boolean {
  if (!isNightlyBuild()) return false;
  try { return storage()?.getItem(DEVELOPER_MODE_KEY) === "1"; } catch { return false; }
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/** Turns developer mode on or off on this device. Does nothing outside a nightly. */
export function setDeveloperMode(on: boolean) {
  if (!isNightlyBuild()) return;
  try {
    if (on) storage()?.setItem(DEVELOPER_MODE_KEY, "1");
    else storage()?.removeItem(DEVELOPER_MODE_KEY);
  } catch { /* storage refused: it stays as it was */ }
  changed();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another window of the app turning it on or off.
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === DEVELOPER_MODE_KEY) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

/** Whether developer mode is on, following it as it changes (the gesture, the switch in Developer options, another window). */
export function useDeveloperMode(): boolean {
  return useSyncExternalStore(subscribe, developerModeOn, () => false);
}

/** Counts clicks: true on the one that makes `taps` of them within `windowMs` of each other (a click a window or more
 *  after the first of the run no longer counts toward it), then starts over. */
export function createTapCounter({ taps = TAPS_TO_TOGGLE, windowMs = TAP_WINDOW_MS, now = () => performance.now() }: { taps?: number; windowMs?: number; now?: () => number } = {}) {
  let stamps: number[] = [];
  return {
    tap(): boolean {
      const at = now();
      stamps = stamps.filter((stamp) => at - stamp <= windowMs);
      stamps.push(at);
      if (stamps.length < taps) return false;
      stamps = [];
      return true;
    },
  };
}

/** The gesture on a version: spread `props` on the text that says it, show `note` (empty, or a line of words, as a
 *  polite status) beside it. Ten clicks within five seconds toggle developer mode in a nightly; anywhere else the text
 *  is just text. A fast run of clicks does not select the word under them. */
export function useDeveloperModeGesture() {
  const counter = useRef<ReturnType<typeof createTapCounter>>(undefined);
  const [note, setNote] = useState("");
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onClick = useCallback(() => {
    if (!isNightlyBuild()) return;
    counter.current ??= createTapCounter();
    if (!counter.current.tap()) return;
    const next = !developerModeOn();
    setDeveloperMode(next);
    setNote(next ? "Developer mode on" : "Developer mode off");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNote(""), NOTE_MS);
  }, []);
  const onMouseDown = useCallback((event: { detail: number; preventDefault(): void }) => {
    if (isNightlyBuild() && event.detail > 1) event.preventDefault();
  }, []);
  return { props: { onClick, onMouseDown }, note };
}
