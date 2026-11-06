import { expect, test } from "vitest";
import { voiceMax, voiceShift } from "./voice-centre";

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

test("the text is as wide as the creature and its room at most; no room told, no limit", () => {
  expect(voiceMax(160, undefined)).toBeNull();
  expect(voiceMax(160, null)).toBeNull();
  expect(voiceMax(160, { left: 20, right: 20 })).toBe(200);
  expect(voiceMax(160, { left: -5, right: 0 })).toBe(160);
});

test("a text wrapped to the limit is placed after the cap: it fills the creature and its room, never past it", () => {
  const room = { left: 20, right: 20 };
  const limit = voiceMax(160, room)!;
  expect(voiceShift(Math.min(300, limit), 160, room)).toBe(0);
  const lopsided = { left: 10, right: 50 };
  expect(voiceShift(Math.min(300, voiceMax(160, lopsided)!), 160, lopsided)).toBe(20);
});
