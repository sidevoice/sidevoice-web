import { expect, test } from "vitest";
import { voiceShift } from "./voice-centre";

test("centred on the creature unless the room on a side is short of the overhang", () => {
  expect(voiceShift(300, 160)).toBe(0);
  expect(voiceShift(300, 160, null)).toBe(0);
  expect(voiceShift(300, 160, { left: 70, right: 70 })).toBe(0);
  expect(voiceShift(100, 160, { left: 0, right: 0 })).toBe(0);
});

test("clamped at an edge: slides toward the other side by what is missing, never past the room there", () => {
  expect(voiceShift(300, 160, { left: 20, right: 400 })).toBe(50);
  expect(voiceShift(300, 160, { left: 400, right: 10 })).toBe(-60);
  expect(voiceShift(300, 160, { left: 0, right: 0 })).toBe(0);
  // Room on neither side: the middle of what there is.
  expect(voiceShift(300, 160, { left: 10, right: 30 })).toBe(10);
});
