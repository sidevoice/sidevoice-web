import { expect, test } from "vitest";
import { clampDeviceName, deviceNameProblem, normalizeDeviceName } from "./device-name-rules.js";

test("a long name is cut between graphemes, never inside an emoji, and counted as a machine counts it", () => {
  const name = "a".repeat(59) + "👋🏽";
  const cut = clampDeviceName(name);
  expect(cut).toBe("a".repeat(59));
  expect([...cut].length).toBeLessThanOrEqual(60);
  expect(clampDeviceName("Mac de Ana 👋")).toBe("Mac de Ana 👋");
  // No lone surrogate ever: what is sent is valid UTF-16.
  expect(clampDeviceName("x".repeat(59) + "😀😀").endsWith("\uD83D")).toBe(false);
});

test("a name is checked as the machine checks it: visible, 60 characters at most, no control or bidi override", () => {
  expect(normalizeDeviceName("  Mac   de\tAna ")).toBe("Mac de Ana");
  expect(deviceNameProblem("Mac de Ana")).toBeNull();
  expect(deviceNameProblem("   ")).toBe("empty");
  expect(deviceNameProblem("​‍")).toBe("empty");
  expect(deviceNameProblem("a".repeat(61))).toBe("tooLong");
  expect(deviceNameProblem("😀".repeat(60))).toBeNull();
  expect(deviceNameProblem("evil‮txt")).toBe("invalid");
  expect(deviceNameProblem("bell\u0007")).toBe("invalid");
});
