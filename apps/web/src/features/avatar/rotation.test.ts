import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IDLE_DEFS } from "./engine/bichos/idle";
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

test("resting goes in steps: quiet for a few seconds, a pastime for its own spell, quiet again, then another pastime", () => {
  vi.useFakeTimers();
  const release = holdRotation("idle", "t-2", ["quiet", "music", "bubbles"]);
  // Every step changes what it shows (a pastime never follows a pastime, nor quiet quiet): follow the changes, and
  // check each step lasted within its own spell.
  const seen: string[] = [rotationValue("idle", "t-2")!];
  let since = 0;
  for (let clock = 0; seen.length < 5 && clock < 200_000; clock += 250) {
    vi.advanceTimersByTime(250);
    const now = rotationValue("idle", "t-2")!;
    if (now === seen[seen.length - 1]) continue;
    const [lo, hi] = IDLE_DEFS[seen[seen.length - 1] as keyof typeof IDLE_DEFS].duration;
    expect(clock + 250 - since).toBeGreaterThanOrEqual(lo);
    expect(clock + 250 - since).toBeLessThanOrEqual(hi + 750);
    since = clock + 250;
    seen.push(now);
  }
  expect(seen[0]).toBe("quiet");
  expect(seen[2]).toBe("quiet");
  expect(seen[4]).toBe("quiet");
  expect(["music", "bubbles"]).toContain(seen[1]);
  expect(["music", "bubbles"]).toContain(seen[3]);
  expect(seen[3]).not.toBe(seen[1]);
  release();
  expect(rotationValue("idle", "t-2")).toBeUndefined();
});

test("a bicho with no pastime that suits it stays quiet; work and rest are picked apart", () => {
  vi.useFakeTimers();
  const releaseIdle = holdRotation("idle", "t-3", ["quiet"]);
  const releaseWork = holdRotation("work", "t-3", ["read"]);
  vi.advanceTimersByTime(25_000);
  expect(rotationValue("idle", "t-3")).toBe("quiet");
  expect(rotationValue("work", "t-3")).toBe("read");
  releaseIdle();
  releaseWork();
});
