import { afterEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { installApp, removeApp } from "../host/testing";
import {
  CRASH_REPORTS_KEY, DEFAULT_CRASH_REPORTS, chooseCrashReports, markCrashReportsNoticeSeen, readCrashReports, startCrashReports, useCrashReports, writeCrashReports,
} from "./crash-reports";

/* What the person chose for crash reports, kept on this device and told to the app that sends them. */

afterEach(() => { localStorage.removeItem(CRASH_REPORTS_KEY); removeApp(); });

const app = (set: (mode: string) => unknown) => installApp({ crashReports: { set } });

describe("the choice kept on this device", () => {
  test("on by default, and the notice not yet seen", () => {
    expect(readCrashReports()).toEqual({ mode: "auto", noticeSeen: false });
    expect(DEFAULT_CRASH_REPORTS).toEqual({ mode: "auto", noticeSeen: false });
  });

  test("what is stored is read back, and a change keeps what else was there", () => {
    writeCrashReports({ mode: "never" });
    expect(readCrashReports()).toEqual({ mode: "never", noticeSeen: false });
    writeCrashReports({ noticeSeen: true });
    expect(readCrashReports()).toEqual({ mode: "never", noticeSeen: true });
    expect(JSON.parse(localStorage.getItem(CRASH_REPORTS_KEY)!)).toEqual({ mode: "never", noticeSeen: true });
  });

  test.each(["{broken", "null", "[]", '{"mode":"sometimes","noticeSeen":"yes"}', '{"mode":"auto"}'])("%s reads as the default: never an off nobody chose", (raw) => {
    localStorage.setItem(CRASH_REPORTS_KEY, raw);
    expect(readCrashReports()).toEqual({ mode: "auto", noticeSeen: false });
  });

  test("a storage that refuses still holds the choice for this visit", () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    // What the page held for the visit is let go once the storage takes a write again.
    onTestFinished(() => { set.mockRestore(); writeCrashReports({ mode: "auto" }); });
    const { result } = renderHook(() => useCrashReports());
    act(() => { writeCrashReports({ mode: "never" }); });
    expect(result.current.mode).toBe("never");
  });

  test("a hook follows the choice as it changes, and is the same object while it does not", () => {
    const { result, rerender } = renderHook(() => useCrashReports());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    act(() => { writeCrashReports({ mode: "never" }); });
    expect(result.current.mode).toBe("never");
    // Another tab: the storage event.
    localStorage.setItem(CRASH_REPORTS_KEY, JSON.stringify({ mode: "auto", noticeSeen: true }));
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: CRASH_REPORTS_KEY })); });
    expect(result.current).toEqual({ mode: "auto", noticeSeen: true });
  });
});

describe("choosing", () => {
  test("is seen at once and told to the app", async () => {
    const set = vi.fn(async () => undefined);
    app(set);
    const holds = chooseCrashReports("never");
    expect(readCrashReports().mode).toBe("never");
    await expect(holds).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith("never");
  });

  test("asks nothing of the app when nothing changes", async () => {
    const set = vi.fn();
    app(set);
    await expect(chooseCrashReports("auto")).resolves.toBe(true);
    expect(set).not.toHaveBeenCalled();
  });

  test("where the host sends nothing, there is nothing to tell and the choice holds", async () => {
    removeApp();
    await expect(chooseCrashReports("never")).resolves.toBe(true);
    expect(readCrashReports().mode).toBe("never");
  });

  test("an app that does not take it leaves the choice as it was: what the page says is what the app does", async () => {
    app(async () => { throw new Error("refused"); });
    await expect(chooseCrashReports("never")).resolves.toBe(false);
    expect(readCrashReports().mode).toBe("auto");
  });

  test("changes are told in the order made, one at a time, and a later choice is not undone by an earlier failure", async () => {
    const told: string[] = [];
    let fail = true;
    app(async (mode) => { told.push(mode); if (fail && mode === "never") { fail = false; await new Promise((resolve) => setTimeout(resolve, 5)); throw new Error("busy"); } });
    const first = chooseCrashReports("never");
    const second = chooseCrashReports("auto");
    expect(await Promise.all([first, second])).toEqual([false, true]);
    expect(told).toEqual(["never", "auto"]);
    expect(readCrashReports().mode).toBe("auto");
  });

  test("the notice put away is kept for good", () => {
    markCrashReportsNoticeSeen();
    expect(readCrashReports().noticeSeen).toBe(true);
    markCrashReportsNoticeSeen();
    expect(readCrashReports()).toEqual({ mode: "auto", noticeSeen: true });
  });
});

describe("at the page's start", () => {
  test("the app is told the choice kept, so it holds to it before anything else is asked", async () => {
    writeCrashReports({ mode: "never" });
    const set = vi.fn(async () => undefined);
    app(set);
    const stop = startCrashReports();
    onTestFinished(stop);
    await vi.waitFor(() => expect(set).toHaveBeenCalledWith("never"));
  });

  test("an app that offers its member after the page's script is told then", async () => {
    vi.useFakeTimers();
    onTestFinished(() => { vi.useRealTimers(); });
    installApp({});
    const set = vi.fn(async () => undefined);
    const stop = startCrashReports();
    onTestFinished(stop);
    expect(set).not.toHaveBeenCalled();
    installApp({ crashReports: { set } });
    await vi.advanceTimersByTimeAsync(300);
    expect(set).toHaveBeenCalledWith("auto");
  });

  test("a browser has no app to tell and nothing happens", () => {
    removeApp();
    const stop = startCrashReports();
    expect(() => stop()).not.toThrow();
  });

  test("an app that refuses is not an error to the page: it is told again at the next start", async () => {
    const set = vi.fn(async () => { throw new Error("refused"); });
    app(set);
    const stop = startCrashReports();
    onTestFinished(stop);
    await vi.waitFor(() => expect(set).toHaveBeenCalled());
  });
});
