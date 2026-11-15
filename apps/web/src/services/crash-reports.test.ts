import { afterEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { installApp, removeApp } from "../host/testing";
import { CRASH_REPORTS_KEY, chooseCrashReports, markCrashReportsNoticeSeen, resetCrashReportsNotice, useCrashReports, useCrashReportsOffered } from "./crash-reports";

/* What the app does when something fails is the app's: the page reads it, shows it, and passes on the person's choice. Only the
 * notice's flag is the page's, kept on this device. */

afterEach(() => { cleanup(); resetCrashReportsNotice(); removeApp(); });

type Mode = "auto" | "never";
/** An app that holds `mode`; `set` and `get` are what the test watches. */
function app(held: Mode | (() => Promise<Mode> | Mode) = "auto", members: Record<string, unknown> = {}) {
  let mode: Mode | undefined = typeof held === "function" ? undefined : held;
  const get = vi.fn(async () => (typeof held === "function" ? await held() : mode!));
  const set = vi.fn(async (next: Mode) => { mode = next; });
  const listeners = new Set<(mode: Mode) => void>();
  const subscribe = vi.fn((listener: (mode: Mode) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; });
  installApp({ crashReports: { get, set, subscribe, ...members } });
  return { get, set, subscribe, listeners, tell: (next: Mode) => { mode = next; for (const listener of listeners) listener(next); } };
}
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });

describe("what the app holds is what the page shows", () => {
  test("none until the app has said, then its mode", async () => {
    let answer!: (mode: Mode) => void;
    app(() => new Promise<Mode>((resolve) => { answer = resolve; }));
    const { result } = renderHook(() => useCrashReports());
    expect(result.current).toEqual({ offered: true, mode: null, noticeSeen: false });
    await act(async () => { answer("never"); });
    expect(result.current.mode).toBe("never");
  });

  test("a page whose storage was lost shows No enviar, not auto: the mode was never the page's", async () => {
    localStorage.clear();
    const held = app("never");
    const { result } = renderHook(() => useCrashReports());
    await flush();
    expect(result.current.mode).toBe("never");
    // Nothing was told to the app: it was only read.
    expect(held.set).not.toHaveBeenCalled();
    // And nothing of the mode is kept here: whatever is stored says nothing of it.
    localStorage.setItem(CRASH_REPORTS_KEY, JSON.stringify({ mode: "auto", noticeSeen: true }));
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: CRASH_REPORTS_KEY })); });
    expect(result.current).toEqual({ offered: true, mode: "never", noticeSeen: true });
  });

  test("an app that answers synchronously is read too", async () => {
    app(() => "never");
    const { result } = renderHook(() => useCrashReports());
    await flush();
    expect(result.current.mode).toBe("never");
  });

  test("the app's own changes (its menu) are followed through subscribe", async () => {
    const held = app("auto");
    const { result } = renderHook(() => useCrashReports());
    await flush();
    act(() => held.tell("never"));
    expect(result.current.mode).toBe("never");
  });

  test("an app that answers something else, or fails, leaves the mode unknown rather than guessed", async () => {
    app(() => "sometimes" as Mode);
    const first = renderHook(() => useCrashReports());
    await flush();
    expect(first.result.current).toEqual({ offered: true, mode: null, noticeSeen: false });
    first.unmount();
    app(() => { throw new Error("down"); });
    const second = renderHook(() => useCrashReports());
    await flush();
    expect(second.result.current.mode).toBeNull();
  });

  test("a read that fails after the mode was known leaves it as it was", async () => {
    let fail = false;
    app(() => { if (fail) throw new Error("down"); return "never"; });
    const first = renderHook(() => useCrashReports());
    await flush();
    fail = true;
    // Another place shows it: read again.
    const second = renderHook(() => useCrashReports());
    await flush();
    expect(first.result.current.mode).toBe("never");
    expect(second.result.current.mode).toBe("never");
  });

  test("an app that has no subscribe is read again whenever something shows the setting", async () => {
    let held: Mode = "auto";
    installApp({ crashReports: { get: vi.fn(async () => held), set: async () => undefined } });
    const first = renderHook(() => useCrashReports());
    await flush();
    expect(first.result.current.mode).toBe("auto");
    held = "never";
    const second = renderHook(() => useCrashReports());
    await flush();
    expect(first.result.current.mode).toBe("never");
    expect(second.result.current.mode).toBe("never");
  });

  test("the app is let go when nothing shows the setting, and read again afresh when something does", async () => {
    const held = app("auto");
    const first = renderHook(() => useCrashReports());
    await flush();
    expect(held.listeners.size).toBe(1);
    first.unmount();
    expect(held.listeners.size).toBe(0);
    const second = renderHook(() => useCrashReports());
    expect(second.result.current.mode).toBeNull();
    await flush();
    expect(second.result.current.mode).toBe("auto");
  });

  test("a browser sends no crash reports: nothing is offered and nothing is read", () => {
    removeApp();
    const { result } = renderHook(() => useCrashReports());
    expect(result.current).toEqual({ offered: false, mode: null, noticeSeen: false });
    expect(renderHook(() => useCrashReportsOffered()).result.current).toBe(false);
  });

  test("an app that offers its member after the page's script is picked up then", async () => {
    vi.useFakeTimers();
    onTestFinished(() => { vi.useRealTimers(); });
    installApp({});
    const { result } = renderHook(() => useCrashReports());
    expect(result.current.offered).toBe(false);
    const held = app("never");
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current).toEqual({ offered: true, mode: "never", noticeSeen: false });
    expect(held.get).toHaveBeenCalled();
  });

  test("a member that lacks what the page calls is no member", () => {
    installApp({ crashReports: { set: async () => undefined } });
    expect(renderHook(() => useCrashReportsOffered()).result.current).toBe(false);
  });
});

describe("choosing", () => {
  test("is seen at once and passed to the app", async () => {
    const held = app("auto");
    const { result } = renderHook(() => useCrashReports());
    await flush();
    let holds!: Promise<boolean>;
    act(() => { holds = chooseCrashReports("never"); });
    expect(result.current.mode).toBe("never");
    await expect(holds).resolves.toBe(true);
    expect(held.set).toHaveBeenCalledWith("never");
  });

  test("asks nothing of the app when nothing changes", async () => {
    const held = app("auto");
    renderHook(() => useCrashReports());
    await flush();
    await expect(chooseCrashReports("auto")).resolves.toBe(true);
    expect(held.set).not.toHaveBeenCalled();
  });

  test("where the host sends nothing there is no choice to make", async () => {
    removeApp();
    await expect(chooseCrashReports("never")).resolves.toBe(false);
  });

  test("an app that does not take it leaves the choice as it was: what the page says is what the app does", async () => {
    const held = app("auto", { set: vi.fn(async () => { throw new Error("refused"); }) });
    const { result } = renderHook(() => useCrashReports());
    await flush();
    await act(async () => { await expect(chooseCrashReports("never")).resolves.toBe(false); });
    await flush();
    expect(result.current.mode).toBe("auto");
    // And it asked the app again what it holds, to be sure.
    expect(held.get.mock.calls.length).toBeGreaterThan(1);
  });

  test("changes are told in the order made, one at a time, and a later choice is not undone by an earlier failure", async () => {
    const told: string[] = [];
    let fail = true;
    app("auto", { set: async (mode: Mode) => { told.push(mode); if (fail && mode === "never") { fail = false; await new Promise((resolve) => setTimeout(resolve, 5)); throw new Error("busy"); } } });
    const { result } = renderHook(() => useCrashReports());
    await flush();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => { first = chooseCrashReports("never"); second = chooseCrashReports("auto"); });
    expect(await Promise.all([first, second])).toEqual([false, true]);
    expect(told).toEqual(["never", "auto"]);
    expect(result.current.mode).toBe("auto");
  });

  test("the app's own answer that comes late does not overwrite what the person chose meanwhile", async () => {
    let answer!: (mode: Mode) => void;
    const held = app(() => new Promise<Mode>((resolve) => { answer = resolve; }));
    const { result } = renderHook(() => useCrashReports());
    act(() => { void chooseCrashReports("never"); });
    await act(async () => { answer("auto"); });
    expect(result.current.mode).toBe("never");
    expect(held.set).toHaveBeenCalledWith("never");
  });
});

describe("the notice's flag, the page's own", () => {
  test("not seen until it is put away, and then kept for good, with nothing else stored", async () => {
    app();
    const { result } = renderHook(() => useCrashReports());
    await flush();
    expect(result.current.noticeSeen).toBe(false);
    act(() => { markCrashReportsNoticeSeen(); });
    expect(result.current.noticeSeen).toBe(true);
    expect(JSON.parse(localStorage.getItem(CRASH_REPORTS_KEY)!)).toEqual({ noticeSeen: true });
  });

  test.each(["{broken", "null", "[]", '{"noticeSeen":"yes"}', '{"mode":"never"}'])("%s reads as not seen", async (raw) => {
    localStorage.setItem(CRASH_REPORTS_KEY, raw);
    app();
    const { result } = renderHook(() => useCrashReports());
    await flush();
    expect(result.current.noticeSeen).toBe(false);
  });

  test("a storage that refuses still holds it for this visit", async () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    onTestFinished(() => { set.mockRestore(); });
    app();
    const { result } = renderHook(() => useCrashReports());
    await flush();
    act(() => { markCrashReportsNoticeSeen(); });
    expect(result.current.noticeSeen).toBe(true);
  });

  test("another tab's change is followed, and the hook is the same object while nothing changes", async () => {
    app();
    const { result, rerender } = renderHook(() => useCrashReports());
    await flush();
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    localStorage.setItem(CRASH_REPORTS_KEY, JSON.stringify({ noticeSeen: true }));
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: CRASH_REPORTS_KEY })); });
    expect(result.current.noticeSeen).toBe(true);
  });
});
