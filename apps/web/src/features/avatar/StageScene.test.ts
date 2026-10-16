import { expect, test } from "vitest";
import { fitCanvas } from "./StageScene";

/* The stage's canvas keeps its shape in whatever room the tile has: the tile's width with bands above and below when the
 * tile is taller than the shape, its height with bands at the sides when it is wider. */
test("the canvas fits the tile at its shape, letterboxed or pillarboxed", () => {
  expect(fitCanvas(960, 614, 16 / 9)).toEqual({ width: 960, height: 540 });
  expect(fitCanvas(1200, 400, 16 / 9)).toEqual({ width: 400 * 16 / 9, height: 400 });
  expect(fitCanvas(366, 658, 1)).toEqual({ width: 366, height: 366 });
  expect(fitCanvas(300, 200, 3 / 2)).toEqual({ width: 300, height: 200 });
});
