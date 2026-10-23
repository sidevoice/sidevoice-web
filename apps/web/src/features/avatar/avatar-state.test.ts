import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { playbackLevel } from "../../state/playback-level";
import { avatarFor } from "./avatar-spec";
import { BORED_AFTER_MS, createAvatarStates, toTimeline, type AvatarInputs, type AvatarStates } from "./avatar-state";
import { avatarRepertoire } from "./bicho-draw";
import { ENTER_MS } from "./engine/styles/bichos";

// A figure with pastimes and tools to pick from, drawn moving (on the stage, with the GPU: web#278).
const spec = avatarFor("fp-1|t-login");
const inputs = (extra: Partial<AvatarInputs> = {}): AvatarInputs => ({ spec, mood: "idle", pastimes: true, ...extra });
let states: AvatarStates;

beforeEach(() => {
  vi.useFakeTimers({ now: 1_800_000_000_000 });
  // Picks and spells near the top of their ranges, so no window holds two swaps by chance (rotation.test.ts).
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  states = createAvatarStates();
});
afterEach(() => { states.clear(); playbackLevel.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

/** Whether a pastime of the figure shows at some second within the next `seconds`. */
function pastimeWithin(seconds: number): boolean {
  for (let second = 0; second < seconds; second += 1) {
    vi.advanceTimersByTime(1000);
    const idle = states.get("a")!.idle;
    if (idle && idle !== "quiet") { expect(avatarRepertoire(spec).idles).toContain(idle); return true; }
  }
  return false;
}

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
  // The first quiet lasts 4–10 s, then a pastime comes up (and ends in its turn).
  expect(pastimeWithin(40)).toBe(true);
});

test("a figure no copy draws moving rests quiet however long; drawn moving, it goes by the time since its rest began", () => {
  const rest = Date.now();
  states.set("a", inputs({ pastimes: false, restStart: rest }));
  vi.advanceTimersByTime(120_000);
  expect(states.get("a")).toMatchObject({ mood: "idle", idle: "quiet" });
  states.set("a", inputs({ restStart: rest + 100_000 }));
  vi.advanceTimersByTime(BORED_AFTER_MS);
  expect(pastimeWithin(40)).toBe(true);
  // No longer drawn moving: back to quiet at once.
  states.set("a", inputs({ pastimes: false }));
  expect(states.get("a")!.idle).toBe("quiet");
});

test("whatever happens with it restarts its rest; held still it stays quiet and takes nothing in hand", () => {
  states.set("a", inputs({ interaction: "1", restStart: Date.now() }));
  vi.advanceTimersByTime(BORED_AFTER_MS - 1000);
  states.set("a", inputs({ interaction: "2", restStart: Date.now() }));
  // Left alone it would be at a pastime by now (bored at 10 s, quiet for under 10 s more); its rest started again.
  vi.advanceTimersByTime(BORED_AFTER_MS - 1);
  expect(states.get("a")!.idle).toBe("quiet");
  expect(pastimeWithin(40)).toBe(true);
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

test("its moment (wall-clock) moves with what it shows, and only then; the same object until then", () => {
  const start = Date.now();
  states.set("a", inputs({ restStart: start }));
  const first = states.get("a")!;
  expect(first.since).toBe(start);
  vi.advanceTimersByTime(200);
  // An interaction restarts its rest but changes nothing it shows.
  states.set("a", inputs({ interaction: "x", restStart: start + 200 }));
  expect(states.get("a")).toBe(first);
  states.set("a", inputs({ mood: "working", restStart: start + 200 }));
  // At work, its moment is the one its tool was picked up: when its work began.
  expect(states.get("a")!.since).toBe(start + 200);
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

// Two windows (the room and the card) each have a set of their own; with the same figure and `restStart` they show the same.
const SHOWN_AT = [0, 5_000, 9_999, 10_000, 14_000, 20_000, 31_000, 47_000, 90_000, 400_000, 2_000_000, 7_200_000];
function atTimes(set: AvatarStates, restStart: number, extra: Partial<AvatarInputs> = {}) {
  const seen: unknown[] = [];
  set.set("fp-1|t-login", inputs({ restStart, ...extra }));
  for (const offset of SHOWN_AT) {
    vi.setSystemTime(restStart + offset);
    // A hidden window wakes late: its timers are throttled, so the state is brought up to date by the next change of inputs.
    set.set("fp-1|t-login", inputs({ restStart, ...extra, interaction: String(offset) }));
    seen.push({ ...set.get("fp-1|t-login")! });
  }
  return seen;
}

test("two windows with the same (id, restStart, now) show the same step and the same moment, resting or at work", () => {
  vi.setSystemTime(1_800_000_000_000);
  const restStart = Date.now();
  for (const extra of [{}, { mood: "working" as const }]) {
    const room = createAvatarStates(), card = createAvatarStates();
    vi.setSystemTime(restStart);
    const inRoom = atTimes(room, restStart, extra);
    vi.setSystemTime(restStart);
    expect(atTimes(card, restStart, extra)).toEqual(inRoom);
    room.clear();
    card.clear();
  }
});

test("playing on by timers equals recomputing after a long pause (a throttled window waking)", () => {
  const restStart = Date.now();
  const steady = createAvatarStates(), woken = createAvatarStates();
  steady.set("a", inputs({ restStart }));
  woken.set("a", inputs({ restStart }));
  const heard: (string | undefined)[] = [];
  steady.subscribe(() => heard.push(steady.get("a")!.idle));
  vi.advanceTimersByTime(300_000);
  expect(heard.length).toBeGreaterThan(3);
  // The other window slept: no timer ran. Its next look at the clock gives what the first one reached by playing on.
  vi.useRealTimers();
  vi.useFakeTimers({ now: restStart + 300_000 });
  woken.set("a", inputs({ restStart, interaction: "woke" }));
  expect(woken.get("a")).toMatchObject({ idle: steady.get("a")!.idle, since: steady.get("a")!.since });
  woken.clear();
  steady.clear();
});

test("`since` is wall-clock, and each window turns it into the same animation phase on its own timeline", () => {
  states.set("a", inputs({ mood: "working", restStart: Date.now() - 4_000 }));
  const wall = states.get("a")!.since!;
  expect(wall).toBe(Date.now() - 4_000);
  // Two documents whose timelines began at different moments: 70 s and 5 s ago.
  const windowA = toTimeline(wall, 70_000, Date.now()), windowB = toTimeline(wall, 5_000, Date.now());
  const phase = (startTime: number, timelineNow: number) => timelineNow - startTime;
  expect(phase(windowA, 70_000)).toBe(phase(windowB, 5_000));
  expect(phase(windowA, 70_000)).toBe(Date.now() - wall);
});

test("a window that starts drawing later shows the same moment: in the first quiet step after the rest, `since` is the rest's start", () => {
  const restStart = Date.now();
  const room = createAvatarStates(), card = createAvatarStates();
  room.set("a", inputs({ restStart }));
  vi.advanceTimersByTime(BORED_AFTER_MS + 500);
  card.set("a", inputs({ restStart }));
  expect(card.get("a")).toEqual(room.get("a"));
  expect(card.get("a")!.since).toBe(restStart);
  room.clear();
  card.clear();
});

test("the entrance ends with the shared stamp, not when a window hears of it: a late relay ends it at the same moment, same moment stamped", () => {
  const restStart = Date.now();
  const room = createAvatarStates(), card = createAvatarStates();
  room.set("a", inputs({ mood: "working", restStart: restStart - 5_000 }));
  vi.advanceTimersByTime(5_000);
  const changed = Date.now();
  room.set("a", inputs({ mood: "listening", restStart: changed }));
  vi.advanceTimersByTime(100);
  card.set("a", inputs({ mood: "working", restStart: restStart - 5_000 }));
  card.set("a", inputs({ mood: "listening", restStart: changed }));
  expect(room.get("a")).toMatchObject({ enter: "working" });
  expect(card.get("a")).toMatchObject({ enter: "working" });
  vi.advanceTimersByTime(ENTER_MS - 100);
  // The room's entrance is over, and so is the card's, with no tool left in hand.
  expect(card.get("a")).toEqual(room.get("a"));
  expect(card.get("a")).toMatchObject({ enter: undefined, work: undefined, since: changed });
  room.clear();
  card.clear();
});
