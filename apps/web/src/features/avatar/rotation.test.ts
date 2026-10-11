import { afterEach, expect, test, vi } from "vitest";
import { WORK_TURN } from "./engine/bichos/work";
import { holdRotation, rotationValue } from "./rotation";

afterEach(() => { vi.useRealTimers(); });

test("a conversation's copies share one tool in hand, swap it now and then, and drop it when they stop", () => {
  vi.useFakeTimers();
  const pool = ["crank", "read", "type"] as const;
  const releaseStage = holdRotation("work", "t-1", pool);
  const first = rotationValue("work", "t-1");
  expect(pool).toContain(first);
  // The sidebar's copy of the same conversation picks up the same tool.
  const releaseRow = holdRotation("work", "t-1", pool);
  expect(rotationValue("work", "t-1")).toBe(first);
  // After a turn (20–30 s) it picks up another one, never the same.
  vi.advanceTimersByTime(WORK_TURN.max + 1000);
  const second = rotationValue("work", "t-1");
  expect(pool).toContain(second);
  expect(second).not.toBe(first);
  releaseStage();
  expect(rotationValue("work", "t-1")).toBe(second);
  releaseRow();
  expect(rotationValue("work", "t-1")).toBeUndefined();
});

test("work and rest are picked apart, from their own styles", () => {
  const releaseWork = holdRotation("work", "t-2", ["hammer"]);
  const releaseIdle = holdRotation("idle", "t-2", ["music"]);
  expect(rotationValue("work", "t-2")).toBe("hammer");
  expect(rotationValue("idle", "t-2")).toBe("music");
  releaseWork();
  releaseIdle();
  expect(rotationValue("idle", "t-2")).toBeUndefined();
});
