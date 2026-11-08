import { expect, test, vi } from "vitest";
import { createMicLevelChannel } from "./mic-level";

test("listeners hear every level, clamped to 0–100, until they stop", () => {
  const channel = createMicLevelChannel();
  const heard = vi.fn();
  const stop = channel.subscribe(heard);
  channel.publish(42);
  channel.publish(180);
  channel.publish(-3);
  expect(heard.mock.calls.map(([value]) => value)).toEqual([42, 100, 0]);
  stop();
  channel.publish(10);
  expect(heard).toHaveBeenCalledTimes(3);
  expect(channel.current()).toBe(10);
});
