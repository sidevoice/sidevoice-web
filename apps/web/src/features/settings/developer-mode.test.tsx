import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  createTapCounter, DEVELOPER_MODE_KEY, developerModeOn, isNightlyBuild, NOTE_MS, setDeveloperMode, TAP_WINDOW_MS, TAPS_TO_TOGGLE,
  useDeveloperMode, useDeveloperModeGesture,
} from "./developer-mode";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  delete (window as { __sidevoiceHost?: unknown }).__sidevoiceHost;
});

/* Developer mode (operator, 2026-10-21): Android's way in. Ten clicks on the version within five seconds turn it on in a
 * nightly build, the same again turns it off; it is kept on the device. Anywhere else the version is only text. */

/** The desktop app as its bridge says its build (`host.build`); null, a browser. */
function inApp(channel: string | null) {
  if (channel) Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: { build: { channel, version: "0.2.1-nightly.608" } } } });
}

/** The version text of Updates, wired as AppUpdateSettings wires it, with what a person could see of developer mode. */
function Version() {
  const { props, note } = useDeveloperModeGesture();
  const on = useDeveloperMode();
  return <div>
    <span data-testid="version" {...props}>Sidevoice 0.2.1-nightly.608</span>
    <span data-testid="note">{note}</span>
    <span data-testid="mode">{on ? "on" : "off"}</span>
  </div>;
}
const version = () => screen.getByTestId("version");
const note = () => screen.getByTestId("note").textContent;
const mode = () => screen.getByTestId("mode").textContent;

/** `count` clicks on the version, `gap` ms apart (none after the last). */
function click(count: number, gap = 100) {
  for (let i = 0; i < count; i++) {
    fireEvent.click(version());
    if (i < count - 1) act(() => { vi.advanceTimersByTime(gap); });
  }
}

test("the counter fires on the tenth click within five seconds of the first, then starts over", () => {
  let at = 0;
  const counter = createTapCounter({ now: () => at });
  const tap = (after = 0) => { at += after; return counter.tap(); };
  expect(Array.from({ length: TAPS_TO_TOGGLE }, () => tap(10))).toEqual([...Array(TAPS_TO_TOGGLE - 1).fill(false), true]);
  // Starts over: the next ten, not the next one.
  expect(Array.from({ length: TAPS_TO_TOGGLE }, () => tap(10))).toEqual([...Array(TAPS_TO_TOGGLE - 1).fill(false), true]);
});

test("the window is five seconds from the first click of the run: exactly five counts, a millisecond more does not", () => {
  const run = (span: number) => {
    let at = 0;
    const counter = createTapCounter({ now: () => at });
    const results: boolean[] = [];
    for (let i = 0; i < TAPS_TO_TOGGLE; i++) {
      // The first click, then eight together, then the last at `span`.
      at = i === TAPS_TO_TOGGLE - 1 ? span : 0;
      results.push(counter.tap());
    }
    return results.at(-1);
  };
  expect(run(TAP_WINDOW_MS)).toBe(true);
  expect(run(TAP_WINDOW_MS + 1)).toBe(false);
});

test("slow clicks never add up: an old one leaves the count as a new one arrives", () => {
  let at = 0;
  const counter = createTapCounter({ now: () => at });
  // A click every 600 ms for a minute: never more than nine within five seconds.
  const fired = Array.from({ length: 100 }, () => { at += 600; return counter.tap(); });
  expect(fired).not.toContain(true);
});

test("ten clicks within five seconds turn developer mode on in a nightly, kept on the device, and say so for a few seconds", () => {
  vi.useFakeTimers();
  inApp("nightly");
  render(<Version />);
  expect(mode()).toBe("off");
  click(TAPS_TO_TOGGLE - 1, 400);
  // Nine are not enough.
  expect(mode()).toBe("off");
  expect(note()).toBe("");
  expect(localStorage.getItem(DEVELOPER_MODE_KEY)).toBeNull();
  act(() => { vi.advanceTimersByTime(400); });
  fireEvent.click(version());
  expect(mode()).toBe("on");
  expect(localStorage.getItem(DEVELOPER_MODE_KEY)).toBe("1");
  expect(developerModeOn()).toBe(true);
  expect(note()).toBe("Developer mode on");
  act(() => { vi.advanceTimersByTime(NOTE_MS - 1); });
  expect(note()).toBe("Developer mode on");
  act(() => { vi.advanceTimersByTime(1); });
  expect(note()).toBe("");
});

test("the same again turns it off, and removes what was kept", () => {
  vi.useFakeTimers();
  inApp("nightly");
  render(<Version />);
  click(TAPS_TO_TOGGLE);
  expect(mode()).toBe("on");
  act(() => { vi.advanceTimersByTime(NOTE_MS); });
  click(TAPS_TO_TOGGLE);
  expect(mode()).toBe("off");
  expect(localStorage.getItem(DEVELOPER_MODE_KEY)).toBeNull();
  expect(note()).toBe("Developer mode off");
  // And on again: the run starts over after each toggle.
  act(() => { vi.advanceTimersByTime(NOTE_MS); });
  click(TAPS_TO_TOGGLE);
  expect(mode()).toBe("on");
});

test("ten clicks spread over more than five seconds do nothing", () => {
  vi.useFakeTimers();
  inApp("nightly");
  render(<Version />);
  // 600 ms apart: the tenth comes 5.4 s after the first.
  click(TAPS_TO_TOGGLE, 600);
  expect(mode()).toBe("off");
  expect(note()).toBe("");
  expect(localStorage.getItem(DEVELOPER_MODE_KEY)).toBeNull();
  // Going on at that pace never makes ten within the window.
  act(() => { vi.advanceTimersByTime(600); });
  fireEvent.click(version());
  expect(mode()).toBe("off");
});

test("a pause longer than five seconds starts the count over", () => {
  vi.useFakeTimers();
  inApp("nightly");
  render(<Version />);
  click(TAPS_TO_TOGGLE - 1);
  act(() => { vi.advanceTimersByTime(TAP_WINDOW_MS + 1); });
  // Nine before the pause did not carry over: the first click after it was the run's first, not its tenth.
  click(TAPS_TO_TOGGLE - 1);
  expect(mode()).toBe("off");
  // The tenth of the new run.
  act(() => { vi.advanceTimersByTime(100); });
  click(1);
  expect(mode()).toBe("on");
});

test.each(["release", "dev", "unknown", "stable"])("in a %s build the version is only text: ten clicks do nothing and keep nothing", (channel) => {
  vi.useFakeTimers();
  inApp(channel);
  render(<Version />);
  expect(isNightlyBuild()).toBe(false);
  click(TAPS_TO_TOGGLE);
  expect(mode()).toBe("off");
  expect(note()).toBe("");
  expect(localStorage.getItem(DEVELOPER_MODE_KEY)).toBeNull();
});

test("in a browser, with no desktop app, the version is only text too", () => {
  vi.useFakeTimers();
  inApp(null);
  render(<Version />);
  click(TAPS_TO_TOGGLE);
  expect(mode()).toBe("off");
  expect(localStorage.getItem(DEVELOPER_MODE_KEY)).toBeNull();
});

test("a stored on does nothing outside a nightly: the same origin opened by a release app", () => {
  localStorage.setItem(DEVELOPER_MODE_KEY, "1");
  inApp("release");
  expect(developerModeOn()).toBe(false);
  // Nor can it be written from there.
  setDeveloperMode(true);
  setDeveloperMode(false);
  expect(localStorage.getItem(DEVELOPER_MODE_KEY)).toBe("1");
  Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: { build: { channel: "nightly", version: "0.2.1-nightly.608" } } } });
  expect(developerModeOn()).toBe(true);
});

test("only a stored 1 is on", () => {
  inApp("nightly");
  for (const value of ["0", "true", "yes", ""]) {
    localStorage.setItem(DEVELOPER_MODE_KEY, value);
    expect(developerModeOn()).toBe(false);
  }
});

test("another window of the app turning it on or off is followed", () => {
  inApp("nightly");
  render(<Version />);
  expect(mode()).toBe("off");
  localStorage.setItem(DEVELOPER_MODE_KEY, "1");
  act(() => { window.dispatchEvent(new StorageEvent("storage", { key: DEVELOPER_MODE_KEY })); });
  expect(mode()).toBe("on");
  localStorage.removeItem(DEVELOPER_MODE_KEY);
  act(() => { window.dispatchEvent(new StorageEvent("storage", { key: DEVELOPER_MODE_KEY })); });
  expect(mode()).toBe("off");
});

test("a storage that refuses leaves developer mode as it was", () => {
  inApp("nightly");
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  onTestFinished(() => set.mockRestore());
  expect(() => setDeveloperMode(true)).not.toThrow();
  expect(developerModeOn()).toBe(false);
});

test("a fast run of clicks does not select the word under them, in a nightly only", () => {
  inApp("nightly");
  render(<Version />);
  // The first click of a run is an ordinary mouse down; a second or later (detail > 1) would select the word.
  expect(fireEvent.mouseDown(version(), { detail: 1 })).toBe(true);
  expect(fireEvent.mouseDown(version(), { detail: 2 })).toBe(false);
  cleanup();
  inApp("release");
  render(<Version />);
  expect(fireEvent.mouseDown(version(), { detail: 2 })).toBe(true);
});
