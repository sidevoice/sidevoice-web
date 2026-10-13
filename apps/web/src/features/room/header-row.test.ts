import { expect, test } from "vitest";
import { CHEVRON_ALWAYS, headerRow, rowCapacity } from "./header-row";

/* A phone's header row (PHONE-SETTINGS-SPEC part 2): how many avatars fit, and which ones show. */

/** The row of a phone this wide: the header less its padding (16 + 8), the gap and the 44px gear. */
const row = (phone: number) => phone - 76;

test("as many avatars as fit beside \"+\" and the chevron, or all of them when they fit with no chevron", () => {
  // The spec's table: avatars beside the chevron, and with no chevron (every one of that many fits).
  const widths = [320, 360, 375, 390, 412, 430];
  expect(widths.map((width) => rowCapacity(row(width), 99).avatars)).toEqual([3, 4, 4, 5, 5, 6]);
  expect(widths.map((width) => rowCapacity(row(width), 99).chevron)).toEqual(widths.map(() => true));
  const fitting = widths.map((width) => [4, 5, 6, 6, 7, 7].find((n) => !rowCapacity(row(width), n).chevron && rowCapacity(row(width), n + 1).chevron));
  expect(fitting).toEqual([4, 5, 6, 6, 7, 7]);
  // A 360px phone with five conversations: all of them, and no chevron; with six, four and the chevron.
  expect(rowCapacity(row(360), 5)).toEqual({ avatars: 5, chevron: false });
  expect(rowCapacity(row(360), 6)).toEqual({ avatars: 4, chevron: true });
  // No cap: a wider screen shows more.
  expect(rowCapacity(row(899), 99).avatars).toBe(Math.floor((row(899) - 60) / 42) - 1);
});

test("the chevron shows only when some are not in the row (the operator's decision); always, at the one constant's flip", () => {
  expect(CHEVRON_ALWAYS).toBe(false);
  expect(rowCapacity(row(390), 3)).toEqual({ avatars: 3, chevron: false });
  expect(rowCapacity(row(390), 3, true)).toEqual({ avatars: 3, chevron: true });
  expect(rowCapacity(row(390), 0, true)).toEqual({ avatars: 0, chevron: true });
});

test("the first ones in the room's order; the one on the stage from outside takes the last slot, and stays until another comes", () => {
  const order = ["a", "b", "c", "d", "e"];
  expect(headerRow(order, "b", null, 3)).toEqual({ row: ["a", "b", "c"], guest: null });
  // Chosen from the sheet: the guest, in the last slot; the one there goes behind the chevron.
  const chosen = headerRow(order, "e", null, 3);
  expect(chosen).toEqual({ row: ["a", "b", "e"], guest: "e" });
  // An avatar in the row tapped: the row stays as it is, the guest with it.
  expect(headerRow(order, "a", chosen.guest, 3)).toEqual({ row: ["a", "b", "e"], guest: "e" });
  // Another from outside: it becomes the guest.
  expect(headerRow(order, "c", "e", 3)).toEqual({ row: ["a", "b", "c"], guest: "c" });
  expect(headerRow(order, "d", "c", 3)).toEqual({ row: ["a", "b", "d"], guest: "d" });
  // The guest left: the row is the first ones again.
  expect(headerRow(["a", "b", "c", "e"], "a", "d", 3)).toEqual({ row: ["a", "b", "c"], guest: null });
  // Room for it in its own place (one before it left): no longer a guest.
  expect(headerRow(["a", "c", "d", "e"], "d", "d", 3)).toEqual({ row: ["a", "c", "d"], guest: null });
});
