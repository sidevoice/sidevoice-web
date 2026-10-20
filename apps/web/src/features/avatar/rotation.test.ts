import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { WORK_DURATION, type Work } from "./engine/bichos/work";
import { holdRotation, rotationValue } from "./rotation";

// Picks and spells are random: pin them near the top of their ranges, so a spell runs about as long as it can and a
// test window never holds two swaps by chance (a short spell of one tool, then a short one of another: the flake).
beforeEach(() => { vi.spyOn(Math, "random").mockReturnValue(0.99); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test("a conversation's copies share one tool in hand, keep it for that tool's own spell, then pick up another", () => {
  vi.useFakeTimers();
  const pool = ["crank", "hammer", "read", "type"] as const;
  const releaseStage = holdRotation("work", "t-1", pool);
  const first = rotationValue("work", "t-1") as Work;
  expect(pool).toContain(first);
  // The sidebar's copy of the same conversation picks up the same tool.
  const releaseRow = holdRotation("work", "t-1", pool);
  expect(rotationValue("work", "t-1")).toBe(first);
  // Still in hand just short of its shortest spell; another one once its longest is over, never the same.
  vi.advanceTimersByTime(WORK_DURATION[first][0] - 600);
  expect(rotationValue("work", "t-1")).toBe(first);
  vi.advanceTimersByTime(WORK_DURATION[first][1] - WORK_DURATION[first][0] + 1200);
  const second = rotationValue("work", "t-1");
  expect(pool).toContain(second);
  expect(second).not.toBe(first);
  releaseStage();
  expect(rotationValue("work", "t-1")).toBe(second);
  releaseRow();
  expect(rotationValue("work", "t-1")).toBeUndefined();
});
