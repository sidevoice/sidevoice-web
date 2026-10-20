import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { playbackLevel } from "../../state/playback-level";
import { avatarFor } from "./avatar-spec";
import { createAvatarStates, type AvatarInputs, type AvatarStates } from "./avatar-state";
import { avatarRepertoire } from "./bicho-draw";
import { ENTER_MS } from "./engine/styles/bichos";

// A figure with pastimes (the engine's, never picked) and tools to pick from.
const spec = avatarFor("fp-1|t-login");
const inputs = (extra: Partial<AvatarInputs> = {}): AvatarInputs => ({ spec, mood: "idle", ...extra });
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

test("resting, it stays quiet however long it rests: no pastime (web#272)", () => {
  states.set("a", inputs());
  expect(states.get("a")).toMatchObject({ mood: "idle", idle: "quiet" });
  vi.advanceTimersByTime(120_000);
  expect(states.get("a")).toMatchObject({ mood: "idle", idle: "quiet" });
});

test("held still it takes nothing in hand until it is let go", () => {
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
  // The same state again changes nothing it shows.
  states.set("a", inputs());
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
