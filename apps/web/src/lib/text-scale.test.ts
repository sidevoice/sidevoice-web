import { afterEach, describe, expect, test } from "vitest";
import { iosBodyProbe } from "../host";
import { applyTextScale, clampTextScale, MAX_TEXT_SCALE, MIN_TEXT_SCALE, startTextScale, systemTextScale } from "./text-scale";

const noHost = { host: null } as const;

describe("systemTextScale", () => {
  test("the iOS probe's size over 17: 17 is 1, 23 is 1.35", () => {
    expect(systemTextScale({ ...noHost, probe: () => 17 })).toBe(1);
    expect(systemTextScale({ ...noHost, probe: () => 23 })).toBeCloseTo(1.353, 3);
  });
  test("an accessibility size stops at the cap: 53 is 2", () => {
    expect(systemTextScale({ ...noHost, probe: () => 53 })).toBe(MAX_TEXT_SCALE);
  });
  test("the smallest size stops at the floor", () => {
    expect(systemTextScale({ ...noHost, probe: () => 10 })).toBe(MIN_TEXT_SCALE);
    expect(systemTextScale({ ...noHost, probe: () => 14 })).toBeCloseTo(0.8235, 3);
  });
  test("the host's value wins over the probe", () => {
    expect(systemTextScale({ host: { get: () => 1.5 }, probe: () => 23 })).toBe(1.5);
    expect(systemTextScale({ host: { get: () => 1 }, probe: () => 23 })).toBe(1);
  });
  test("the host's value is clamped too", () => {
    expect(systemTextScale({ host: { get: () => 3 }, probe: () => null })).toBe(MAX_TEXT_SCALE);
    expect(systemTextScale({ host: { get: () => 0.5 }, probe: () => null })).toBe(MIN_TEXT_SCALE);
  });
  test("a host that says nothing usable leaves the probe", () => {
    expect(systemTextScale({ host: { get: () => Number.NaN }, probe: () => 23 })).toBeCloseTo(1.353, 3);
    expect(systemTextScale({ host: { get: () => { throw new Error("gone"); } }, probe: () => 23 })).toBeCloseTo(1.353, 3);
  });
  test("a browser that is not iOS WebKit has no probe, and is 1", () => {
    expect(systemTextScale({ ...noHost, probe: () => null })).toBe(1);
    // The real probe, in this test browser (not iOS): nothing.
    expect(iosBodyProbe()).toBeNull();
    expect(systemTextScale(noHost)).toBe(1);
  });
  test("a number that is not a size is 1", () => {
    expect(clampTextScale(Number.NaN)).toBe(1);
    expect(clampTextScale(0)).toBe(1);
    expect(clampTextScale(-2)).toBe(1);
  });
});

describe("the root's --sv-text-scale", () => {
  afterEach(() => { document.documentElement.style.removeProperty("--sv-text-scale"); document.documentElement.removeAttribute("data-text-large"); });

  test("applyTextScale says it on the root", () => {
    const root = document.documentElement;
    expect(applyTextScale(root, { ...noHost, probe: () => 23 })).toBeCloseTo(1.353, 3);
    expect(root.style.getPropertyValue("--sv-text-scale")).toBe("1.353");
    expect(root.hasAttribute("data-text-large")).toBe(true);
    applyTextScale(root, { ...noHost, probe: () => 17 });
    expect(root.hasAttribute("data-text-large")).toBe(false);
  });

  test("is read again when the page becomes visible, and not after it stops", () => {
    const root = document.documentElement;
    let px = 17;
    const stop = startTextScale(root, { ...noHost, probe: () => px });
    expect(root.style.getPropertyValue("--sv-text-scale")).toBe("1");
    px = 34;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(root.style.getPropertyValue("--sv-text-scale")).toBe("2");
    stop();
    px = 17;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(root.style.getPropertyValue("--sv-text-scale")).toBe("2");
  });

  test("is read again when the host says it changed", () => {
    const root = document.documentElement;
    let scale = 1;
    let notify = () => {};
    Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: { textScale: {
      get: () => scale, subscribe: (listener: () => void) => { notify = listener; return () => { notify = () => {}; }; } } } } });
    try {
      const stop = startTextScale(root);
      expect(root.style.getPropertyValue("--sv-text-scale")).toBe("1");
      scale = 1.35;
      notify();
      expect(root.style.getPropertyValue("--sv-text-scale")).toBe("1.35");
      stop();
    } finally { Reflect.deleteProperty(window, "__sidevoiceHost"); }
  });
});
