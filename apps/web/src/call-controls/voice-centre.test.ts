import { expect, test } from "vitest";
import { avatarColumn, voiceMax } from "./voice-centre";

/** How far the column (so the window) reaches past the creature on each side, laid out as avatarColumn says. */
function reach(figure: number, pieces: number[], room?: { left: number; right: number } | null) {
  const column = avatarColumn(figure, pieces, room);
  const width = Math.max(column.figure + figure, ...pieces.map((piece, i) => column.pieces[i] + piece));
  return { left: column.figure, right: width - column.figure - figure, column };
}

test("with room all round everything is centred on the creature, and the window grows to both sides", () => {
  expect(avatarColumn(160, [300], { left: 500, right: 500 })).toEqual({ figure: 70, pieces: [0] });
  expect(avatarColumn(160, [300])).toEqual({ figure: 70, pieces: [0] });
  expect(avatarColumn(160, [300], null)).toEqual({ figure: 70, pieces: [0] });
  // Narrower than the creature: centred on it, nothing grows.
  expect(avatarColumn(160, [100])).toEqual({ figure: 0, pieces: [30] });
  // The voice text and the compact card at once: both centred on the creature, in a column as wide as the wider.
  expect(avatarColumn(160, [230, 300], { left: 500, right: 500 })).toEqual({ figure: 70, pieces: [35, 0] });
});

test("against the right edge the creature stays where it rests: the window grows only to the left, the card off-centre beside it", () => {
  // The operator's report (2026-11-07): docked right, the call card coming out moved the creature in. No room on the right, so the
  // column reaches nothing past the creature there, and the app has nothing to move.
  expect(reach(160, [300], { left: 600, right: 0 })).toMatchObject({ left: 140, right: 0 });
  expect(reach(160, [230, 300], { left: 600, right: 0 })).toMatchObject({ left: 140, right: 0, column: { pieces: [70, 0] } });
  // And against the left edge, the other way.
  expect(reach(160, [300], { left: 0, right: 600 })).toMatchObject({ left: 0, right: 140 });
  // Some room: the window takes all of it on that side, and the rest on the other.
  expect(reach(160, [300], { left: 600, right: 30 })).toMatchObject({ left: 110, right: 30 });
});

test("the text is as wide as the creature and its room at most; no room told, no limit", () => {
  expect(voiceMax(160, undefined)).toBeNull();
  expect(voiceMax(160, null)).toBeNull();
  expect(voiceMax(160, { left: 20, right: 20 })).toBe(200);
  expect(voiceMax(160, { left: -5, right: 0 })).toBe(160);
});

test("a text wrapped to the limit fills the creature and its room, never past it", () => {
  for (const room of [{ left: 20, right: 20 }, { left: 10, right: 50 }, { left: 0, right: 40 }]) {
    const text = Math.min(300, voiceMax(160, room)!);
    const { left, right } = reach(160, [text], room);
    expect(left).toBeLessThanOrEqual(room.left);
    expect(right).toBeLessThanOrEqual(room.right);
  }
});

test("odd widths: the creature's place is whole pixels and never leaves the window a pixel past the room", () => {
  // A text 230.4 wide over a creature 161 wide, no room on the right: the creature at 70 would leave 0.4 past it, which the app's
  // whole-pixel window rounds up to a pixel; at 70 rounded up it is flush.
  const tight = avatarColumn(161, [230.4], { left: 600, right: 0 });
  expect(Number.isInteger(tight.figure)).toBe(true);
  expect(Math.ceil(Math.max(tight.figure + 161, tight.pieces[0] + 230.4)) - tight.figure - 161).toBe(0);
  // Centred on the creature where there is room: within half a pixel.
  const free = avatarColumn(161, [230], { left: 600, right: 600 });
  expect(Math.abs(free.pieces[0] + 115 - (free.figure + 80.5))).toBeLessThanOrEqual(0.5);
});

test("a work area narrower than the column keeps the creature's left edge in it", () => {
  // 300 of compact card over a creature of 160 and 50 of room in all: it cannot fit; the left side is kept.
  expect(avatarColumn(160, [300], { left: 20, right: 30 }).figure).toBe(20);
});
