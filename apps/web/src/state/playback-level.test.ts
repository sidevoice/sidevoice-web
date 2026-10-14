import { expect, test, vi } from "vitest";
import { createPlaybackLevelChannel } from "./playback-level";

test("output samples stay scoped and normalized, and clear on silence", () => {
  const channel = createPlaybackLevelChannel();
  const heard = vi.fn();
  const stop = channel.subscribe(heard);
  channel.publish(0.8, "fp|one");
  channel.publish(2, "fp|one");
  channel.publish(Number.NaN, "fp|one");
  channel.clear();
  expect(heard.mock.calls.map(([sample]) => ({ threadId: sample.threadId, level: sample.level }))).toEqual([
    { threadId: "fp|one", level: 0.8 }, { threadId: "fp|one", level: 1 },
    { threadId: "fp|one", level: 0 }, { threadId: null, level: 0 },
  ]);
  stop();
  channel.publish(0.5, "fp|two");
  expect(heard).toHaveBeenCalledTimes(4);
  expect(channel.current()).toMatchObject({ threadId: "fp|two", level: 0.5 });
});
