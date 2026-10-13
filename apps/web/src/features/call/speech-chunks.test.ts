import { expect, test } from "vitest";
import { PACE, readingMoves, readingPosition, readOn } from "./speech-chunks";

const REPLY = "Okay. I'll start with the login and then look at the cart tests. I'll tell you as soon as I have something.";

test("without a cue the reply is read at a speaking pace, only while it sounds, and the same reply keeps its place", () => {
  let reading = readOn(null, "r1", true, null, 0);
  reading = readOn(reading, "r1", true, null, 2000);
  expect(readingPosition(reading!)).toBe(2 * PACE);
  // The voice stops for a moment, and the row stops saying it is playing: no time passes for the reply.
  reading = readOn(reading, "r1", false, null, 2500);
  reading = readOn(reading, null, false, null, 4000);
  reading = readOn(reading, "r1", true, null, 4000);
  reading = readOn(reading, "r1", true, null, 5000);
  expect(readingPosition(reading!)).toBe(Math.round(3.5 * PACE));
  // Another reply starts over.
  expect(readingPosition(readOn(reading, "r2", true, null, 5000)!)).toBe(0);
});

test("a late first cue never sends the bubble back, the part sounding is read at a pace up to its end, and a cue going back is the reply heard again", () => {
  let reading = readOn(null, "r1", true, null, 0);
  reading = readOn(reading, "r1", true, null, 4000);
  expect(readingPosition(reading!)).toBe(4 * PACE);
  reading = readOn(reading, "r1", true, { from: 5, to: 10 }, 4000);
  expect(readingPosition(reading!)).toBe(4 * PACE);
  // A chunk starts sounding: the words move on from its start at a speaking pace, and stop at its end.
  reading = readOn(reading, "r1", true, { from: 80, to: 120 }, 6000);
  expect(readingPosition(reading!)).toBe(80);
  expect(readingMoves(reading!)).toBe(true);
  reading = readOn(reading, "r1", true, { from: 80, to: 120 }, 8000);
  expect(readingPosition(reading!)).toBe(80 + 2 * PACE);
  reading = readOn(reading, "r1", true, { from: 80, to: 120 }, 9000);
  expect(readingPosition(reading!)).toBe(120);
  expect(readingMoves(reading!)).toBe(false);
  // Between chunks, what was heard; the row giving no cue for a moment does not move it either.
  reading = readOn(reading, "r1", true, { from: 120, to: 120 }, 9200);
  reading = readOn(reading, "r1", true, null, 9400);
  expect(readingPosition(reading!)).toBe(120);
  // The reply said again from its start.
  reading = readOn(reading, "r1", true, { from: 0, to: 0 }, 9500);
  expect(readingPosition(reading!)).toBe(0);
});
