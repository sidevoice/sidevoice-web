import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { playbackLevel } from "../../state/playback-level";
import { avatarFor } from "./avatar-spec";
import { BORED_AFTER_MS, createAvatarStates, type AvatarInputs, type AvatarStates } from "./avatar-state";
import { avatarRepertoire } from "./bicho-draw";
import { ENTER_MS } from "./engine/styles/bichos";

// A figure with pastimes and tools to pick from, drawn moving (on the stage, with the GPU: web#278).
const spec = avatarFor("fp-1|t-login");
const inputs = (extra: Partial<AvatarInputs> = {}): AvatarInputs => ({ spec, mood: "idle", pastimes: true, ...extra });
let states: AvatarStates;

beforeEach(() => {
  vi.useFakeTimers();
  // Picks and spells near the top of their ranges, so no window holds two swaps by chance (rotation.test.ts).
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  states = createAvatarStates();
});
afterEach(() => { states.clear(); playbackLevel.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

test("the figure this test draws has pastimes and tools to pick from", () => {
  expect(avatarRepertoire(spec).idles.filter((idle) => idle !== "quiet").length).toBeGreaterThan(0);
  expect(avatarRepertoire(spec).works.length).toBeGreaterThan(0);
});

test("resting, it is quiet for BORED_AFTER_MS, then goes in steps on its one clock: quiet, then a pastime", () => {
  states.set("a", inputs());
  expect(states.get("a")).toMatchObject({ mood: "idle", idle: "quiet" });
  vi.advanceTimersByTime(BORED_AFTER_MS - 1);
  expect(states.get("a")!.idle).toBe("quiet");
  // Bored: its steps start, quiet first (4–10 s), then a pastime.
  vi.advanceTimersByTime(1);
  expect(states.get("a")!.idle).toBe("quiet");
  vi.advanceTimersByTime(11_000);
  const pastime = states.get("a")!.idle;
  expect(avatarRepertoire(spec).idles).toContain(pastime);
  expect(pastime).not.toBe("quiet");
});

test("a figure no copy draws moving rests quiet however long; drawn moving again, it starts its rest over", () => {
  states.set("a", inputs({ pastimes: false }));
  vi.advanceTimersByTime(120_000);
  expect(states.get("a")).toMatchObject({ mood: "idle", idle: "quiet" });
  states.set("a", inputs());
  vi.advanceTimersByTime(BORED_AFTER_MS + 11_000);
  expect(states.get("a")!.idle).not.toBe("quiet");
  // No longer drawn moving: back to quiet at once.
  states.set("a", inputs({ pastimes: false }));
  expect(states.get("a")!.idle).toBe("quiet");
});

test("whatever happens with it restarts its rest; held still it stays quiet and takes nothing in hand", () => {
  states.set("a", inputs({ interaction: "1" }));
  vi.advanceTimersByTime(BORED_AFTER_MS - 1000);
  states.set("a", inputs({ interaction: "2" }));
  // Left alone it would be at a pastime by now (bored at 10 s, quiet for under 10 s more); its rest started again.
  vi.advanceTimersByTime(12_000);
  expect(states.get("a")!.idle).toBe("quiet");
  vi.advanceTimersByTime(9_000);
  expect(states.get("a")!.idle).not.toBe("quiet");
  states.set("a", inputs({ still: true }));
  vi.advanceTimersByTime(60_000);
  expect(states.get("a")!.idle).toBe("quiet");
  // Working, held still: no tool until it is let go.
  states.set("a", inputs({ mood: "working", still: true }));
  expect(states.get("a")!.work).toBeUndefined();
  states.set("a", inputs({ mood: "working" }));
  expect(avatarRepertoire(spec).works).toContain(states.get("a")!.work);
});

test("startled into listening, what it had in hand stays on for the entrance, then goes", () => {
  states.set("a", inputs({ mood: "working" }));
  const tool = states.get("a")!.work;
  expect(tool).toBeDefined();
  states.set("a", inputs({ mood: "listening" }));
  expect(states.get("a")).toMatchObject({ mood: "listening", enter: "working", work: tool });
  vi.advanceTimersByTime(ENTER_MS);
  expect(states.get("a")!.enter).toBeUndefined();
  expect(states.get("a")!.work).toBeUndefined();
  // A first mood makes no entrance.
  states.set("b", inputs({ mood: "listening" }));
  expect(states.get("b")!.enter).toBeUndefined();
});

test("offline it sleeps: no step, and none starts however long it lasts", () => {
  states.set("a", inputs({ mood: "offline" }));
  vi.advanceTimersByTime(60_000);
  expect(states.get("a")).toMatchObject({ mood: "offline", idle: undefined, work: undefined });
});

test("its moment moves with what it shows, and only then; the same object until then", () => {
  vi.spyOn(performance, "now").mockReturnValue(100);
  states.set("a", inputs());
  const first = states.get("a")!;
  expect(first.since).toBe(100);
  vi.mocked(performance.now).mockReturnValue(200);
  // An interaction restarts its rest but changes nothing it shows.
  states.set("a", inputs({ interaction: "x" }));
  expect(states.get("a")).toBe(first);
  states.set("a", inputs({ mood: "working" }));
  expect(states.get("a")!.since).toBe(200);
});

test("dropped, its timers stop and its steps let go; every listener hears each change once", () => {
  const heard = vi.fn();
  states.subscribe(heard);
  states.sync(new Map([["a", inputs({ mood: "working" })], ["b", inputs()]]));
  expect(heard).toHaveBeenCalledTimes(1);
  states.sync(new Map([["b", inputs()]]));
  expect(states.get("a")).toBeUndefined();
  expect(heard).toHaveBeenCalledTimes(2);
  // Nothing changed: nobody is told.
  states.sync(new Map([["b", inputs()]]));
  expect(heard).toHaveBeenCalledTimes(2);
});

test("its mouth is one level for every copy: painted from its own voice while it speaks, shut otherwise", () => {
  states.set("a", inputs({ mood: "speaking", voice: "fp-1|t-login" }));
  const stage: number[] = [], thumbnail: number[] = [];
  const stopStage = states.mouth("a")((level) => stage.push(level));
  expect(states.mouth("a")).toBe(states.mouth("a"));
  playbackLevel.publish(0.8, "fp-1|t-login");
  playbackLevel.publish(0.9, "fp-1|other");
  // A copy drawn mid-word opens its mouth as far as the other's, at once.
  const stopThumbnail = states.mouth("a")((level) => thumbnail.push(level));
  expect(thumbnail.at(-1)).toBe(stage.at(-1));
  playbackLevel.publish(0.6, "fp-1|t-login");
  expect(thumbnail.at(-1)).toBe(stage.at(-1));
  expect(stage.at(-1)).toBeGreaterThan(0);
  // Not speaking any more: shut, for both.
  states.set("a", inputs({ mood: "idle", voice: "fp-1|t-login" }));
  expect([stage.at(-1), thumbnail.at(-1)]).toEqual([0, 0]);
  playbackLevel.publish(0.8, "fp-1|t-login");
  expect([stage.at(-1), thumbnail.at(-1)]).toEqual([0, 0]);
  stopStage();
  stopThumbnail();
});
