import { describe, expect, it } from "vitest";
import { rubberBand, settleMs, shouldDismiss } from "./use-sheet-drag";

describe("a dragged sheet", () => {
  it("goes past a third of its height, or flicked away; stays when flicked back", () => {
    expect(shouldDismiss(300, 0, 700)).toBe(true);
    expect(shouldDismiss(100, 0, 700)).toBe(false);
    expect(shouldDismiss(40, 0.9, 700)).toBe(true);
    expect(shouldDismiss(400, -0.9, 700)).toBe(false);
    expect(shouldDismiss(-10, 0.9, 700)).toBe(false);
  });

  it("resists a pull the wrong way, never past its limit", () => {
    expect(rubberBand(0, 70)).toBe(0);
    expect(rubberBand(50, 70)).toBeLessThan(50);
    expect(rubberBand(5000, 70)).toBeLessThan(70);
    expect(rubberBand(100, 70)).toBeGreaterThan(rubberBand(50, 70));
  });

  it("settles quicker the faster it was let go, within bounds", () => {
    expect(settleMs(600, 0)).toBe(280);
    expect(settleMs(600, 4)).toBe(150);
    expect(settleMs(10, 0)).toBe(140);
  });
});
