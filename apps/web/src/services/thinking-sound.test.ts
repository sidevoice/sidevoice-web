import { afterEach, beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { playThinkingSound, previewThinkingSound, primeThinkingSound, resetThinkingSoundForTests } from "./thinking-sound";
import { DEFAULT_THINKING_SOUND, THINKING_SOUNDS, thinkingSound } from "./thinking-sounds";

/* The player keeps one context for the page: begun in the Join tap (prime), and every play is in that one, so a browser
 * that starts a page's audio only from a gesture lets it sound (sidevoice-web#439). It plays the chosen sound at the
 * sound's cadence (now, then a gap in its interval after each play ends) through the person's offset and a limiter; an app
 * that plays the chosen sound itself is asked to instead. */

const param = (value = 0) => ({ value, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });

class FakeSource {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;
  starts: number[] = [];
  stops: number[] = [];
  connected: unknown[] = [];
  connect = vi.fn((next: unknown) => { this.connected.push(next); return next; });
  disconnect = vi.fn();
  start(at = 0) { this.starts.push(at); }
  stop(at = 0) { this.stops.push(at); }
}

/** A context whose clock is the test's own (the fake timers' Date), once it runs. */
class FakeContext {
  static made: FakeContext[] = [];
  static decodes: ArrayBuffer[] = [];
  static failDecodeOf: string | null = null;
  static failAll = false;
  state: AudioContextState = "suspended";
  frozen = false;
  /** Seconds the audio clock is ahead of the timers: a page whose timers were held back in the background. */
  skew = 0;
  private origin = Date.now();
  get currentTime() { return this.frozen ? 0 : (Date.now() - this.origin) / 1000 + this.skew; }
  destination = { destination: true };
  resume = vi.fn(async () => { this.state = "running"; });
  suspend = vi.fn(async () => { this.state = "suspended"; });
  close = vi.fn(async () => { this.state = "closed"; });
  sources: FakeSource[] = [];
  gains: { gain: ReturnType<typeof param>; connect: (next: unknown) => unknown; disconnect: () => void }[] = [];
  limiters: (Record<"threshold" | "knee" | "ratio" | "attack" | "release", { value: number }> & { connect: (next: unknown) => unknown })[] = [];
  constructor() { FakeContext.made.push(this); }
  createBufferSource() { const made = new FakeSource(); this.sources.push(made); return made; }
  createGain() { const made = { gain: param(1), connect: vi.fn((next: unknown) => next), disconnect: vi.fn() }; this.gains.push(made); return made; }
  createDynamicsCompressor() {
    const made = { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: vi.fn((next: unknown) => next), disconnect: vi.fn() };
    this.limiters.push(made);
    return made;
  }
  async decodeAudioData(data: ArrayBuffer) {
    FakeContext.decodes.push(data);
    const name = new TextDecoder().decode(data);
    if (FakeContext.failAll || (FakeContext.failDecodeOf && name.endsWith(FakeContext.failDecodeOf))) throw new Error("cannot decode");
    return { duration: 0.6, name };
  }
}

/** Every fetch answers its file's name as its bytes; `fetched` says which, in order. */
let fetched: string[] = [];
let opus = "";

beforeEach(() => {
  vi.useFakeTimers();
  FakeContext.made = []; FakeContext.decodes = []; FakeContext.failDecodeOf = null; FakeContext.failAll = false;
  fetched = []; opus = "";
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const file = new URL(url).pathname.split("/").pop()!;
    fetched.push(file);
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(file).buffer };
  }));
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockImplementation((type: string) => type.includes("opus") ? opus as CanPlayTypeResult : "");
});
afterEach(() => { resetThinkingSoundForTests(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

const SOFT = { sound: DEFAULT_THINKING_SOUND, gainDb: 0 };

test("the Join tap begins the one context, quiet until a sound plays in it", async () => {
  primeThinkingSound();
  expect(FakeContext.made).toHaveLength(1);
  const [context] = FakeContext.made;
  expect(context.resume).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(0);
  expect(context.state).toBe("suspended");

  const loop = playThinkingSound(SOFT);
  expect(FakeContext.made).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(0);
  expect(context.state).toBe("running");
  expect(context.sources[0].starts).toHaveLength(1);

  loop.stop();
  expect(context.sources[0].stops).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(context.state).toBe("suspended");
  // The next one plays in the same context.
  playThinkingSound(SOFT).stop();
  expect(FakeContext.made).toHaveLength(1);
});

test("without a tap (an app's webview) the context is made when the sound first plays", async () => {
  const loop = playThinkingSound(SOFT);
  expect(FakeContext.made).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(0);
  expect(FakeContext.made[0].state).toBe("running");
  loop.stop();
  loop.stop();
  await vi.advanceTimersByTimeAsync(1000);
  expect(FakeContext.made[0].state).toBe("suspended");
});

test("a page without Web Audio plays nothing and does not fail", () => {
  vi.stubGlobal("AudioContext", undefined);
  primeThinkingSound();
  expect(() => playThinkingSound(SOFT).stop()).not.toThrow();
  expect(() => previewThinkingSound(SOFT).setGain(3)).not.toThrow();
});

test("the chosen sound plays now, then again a gap in its interval after each play ends, one play ahead on the clock", async () => {
  const sound = thinkingSound("warm-pad-pulse");
  const [min, max] = sound.interval;
  const draws = [0, 1, 0.5];
  const loop = playThinkingSound({ sound: sound.id, gainDb: 0 }, () => draws.shift() ?? 0.25);
  await vi.advanceTimersByTimeAsync(0);
  const [context] = FakeContext.made;
  expect(fetched).toEqual(["warm-pad-pulse.m4a"]);
  // The first now, and the second already on the clock: 0.6 s of sound, then the shortest gap.
  const starts = () => context.sources.map((source) => source.starts[0]);
  expect(starts()).toEqual([0, 0.6 + min]);
  // Nothing more until the second begins; then the third, after the longest gap.
  await vi.advanceTimersByTimeAsync((0.6 + min) * 1000 - 50);
  expect(starts()).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(50);
  expect(starts()).toEqual([0, 0.6 + min, 0.6 + min + 0.6 + max]);
  for (const at of starts()) expect(at).toBeGreaterThanOrEqual(0);
  // Each play goes through the offset's gain, then the limiter, to the speakers.
  const [gain] = context.gains;
  expect(context.sources.every((source) => source.connected[0] === gain)).toBe(true);
  expect(gain.connect).toHaveBeenCalledWith(context.limiters[0]);
  expect(context.limiters[0].connect).toHaveBeenCalledWith(context.destination);
  expect({ threshold: context.limiters[0].threshold.value, knee: context.limiters[0].knee.value, ratio: context.limiters[0].ratio.value })
    .toEqual({ threshold: -2, knee: 0, ratio: 20 });
  // Stopped: what is on the clock is stopped too, and nothing more is put on it.
  loop.stop();
  expect(context.sources.every((source) => source.stops.length === 1)).toBe(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(starts()).toHaveLength(3);
});

test("a clock that does not run yet holds one play ahead, never a pile of them", async () => {
  const loop = playThinkingSound(SOFT, () => 0);
  const [context] = FakeContext.made;
  context.frozen = true;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(context.sources).toHaveLength(2);
  loop.stop();
});

test("timers held back past the next play (a page long in the background): it plays now and the cadence goes on, never a burst", async () => {
  const loop = playThinkingSound(SOFT, () => 0);
  await vi.advanceTimersByTimeAsync(0);
  const [context] = FakeContext.made;
  const [min] = thinkingSound(DEFAULT_THINKING_SOUND).interval;
  expect(context.sources.map((source) => source.starts[0])).toEqual([0, 0.6 + min]);
  context.skew = 60;
  await vi.advanceTimersByTimeAsync((0.6 + min) * 1000 + 10);
  const late = context.sources.slice(2).map((source) => source.starts[0]);
  // The one it missed now, then the next a whole play and gap after it: two plays, not the dozen it missed.
  expect(late).toHaveLength(2);
  expect(late[0]).toBeCloseTo(60 + 0.6 + min, 3);
  expect(late[1] - late[0]).toBeCloseTo(0.6 + min, 3);
  loop.stop();
});

test("a sound neither format of which plays holds no audio for the rest of the turn", async () => {
  FakeContext.failAll = true;
  const loop = playThinkingSound(SOFT);
  await vi.advanceTimersByTimeAsync(0);
  const [context] = FakeContext.made;
  expect(fetched).toEqual([`${DEFAULT_THINKING_SOUND}.m4a`, `${DEFAULT_THINKING_SOUND}.webm`]);
  expect(context.sources).toHaveLength(0);
  expect(context.gains[0].disconnect).toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(context.state).toBe("suspended");
  loop.stop();
  // Counted once: the next sound that plays keeps the context running, and its stop lets it rest.
  FakeContext.failAll = false;
  const next = playThinkingSound({ sound: "single-beat", gainDb: 0 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(context.state).toBe("running");
  next.stop();
  await vi.advanceTimersByTimeAsync(1000);
  expect(context.state).toBe("suspended");
});

test("the offset gains what plays, clamped to its range; a change applies at once", async () => {
  const loop = playThinkingSound({ sound: DEFAULT_THINKING_SOUND, gainDb: -6 });
  await vi.advanceTimersByTimeAsync(0);
  const [context] = FakeContext.made;
  const [gain] = context.gains;
  expect(gain.gain.value).toBeCloseTo(Math.pow(10, -6 / 20));
  loop.setGain(3);
  expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(expect.closeTo(Math.pow(10, 3 / 20)), expect.any(Number), expect.any(Number));
  loop.setGain(40);
  expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(expect.closeTo(Math.pow(10, 10 / 20)), expect.any(Number), expect.any(Number));
  loop.stop();
  playThinkingSound({ sound: DEFAULT_THINKING_SOUND, gainDb: -99 }).stop();
  expect(context.gains[1].gain.value).toBeCloseTo(Math.pow(10, -20 / 20));
});

test("Opus where the page surely plays it, AAC elsewhere, and the other format when one does not decode", async () => {
  opus = "probably";
  playThinkingSound(SOFT).stop();
  await vi.advanceTimersByTimeAsync(0);
  expect(fetched).toEqual([`${DEFAULT_THINKING_SOUND}.webm`]);

  resetThinkingSoundForTests(); fetched = [];
  opus = "maybe";
  playThinkingSound(SOFT).stop();
  await vi.advanceTimersByTimeAsync(0);
  expect(fetched).toEqual([`${DEFAULT_THINKING_SOUND}.m4a`]);

  resetThinkingSoundForTests(); fetched = [];
  opus = "probably";
  FakeContext.failDecodeOf = ".webm";
  const loop = playThinkingSound(SOFT);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetched).toEqual([`${DEFAULT_THINKING_SOUND}.webm`, `${DEFAULT_THINKING_SOUND}.m4a`]);
  expect(FakeContext.made.at(-1)!.sources[0].buffer).toMatchObject({ name: `${DEFAULT_THINKING_SOUND}.m4a` });
  loop.stop();
});

test("a sound is fetched and decoded once for the page; one this build no longer has is the default", async () => {
  playThinkingSound({ sound: "a-sound-from-before", gainDb: 0 }).stop();
  await vi.advanceTimersByTimeAsync(0);
  playThinkingSound(SOFT).stop();
  await vi.advanceTimersByTimeAsync(0);
  expect(fetched).toEqual([`${DEFAULT_THINKING_SOUND}.m4a`]);
  expect(THINKING_SOUNDS[0].id).toBe(DEFAULT_THINKING_SOUND);
});

test("the try plays in the page, even where the app plays the call's cue", async () => {
  const cue = { start: vi.fn(), stop: vi.fn(), options: ["sound", "gainDb"] };
  withCue(cue);
  const preview = previewThinkingSound({ sound: "single-beat", gainDb: 2 });
  await vi.advanceTimersByTimeAsync(0);
  expect(cue.start).not.toHaveBeenCalled();
  expect(fetched).toEqual(["single-beat.m4a"]);
  expect(FakeContext.made[0].sources).toHaveLength(2);
  preview.stop();
});

/* An app that plays the cue itself (host.cue) is asked to, with the sound and the offset, and the page makes no Web Audio
 * of its own; an app before the sounds (whose start takes no options) would play its own sound, so the page plays it. */
function withCue(cue: unknown) {
  Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: { cue } } });
  onTestFinished(() => { Reflect.deleteProperty(window, "__sidevoiceHost"); });
}

test("an app that takes the sound plays the chosen one at the offset, once, and the page makes no context", () => {
  const cue = { start: vi.fn(), stop: vi.fn(), options: ["sound", "gainDb"] };
  withCue(cue);
  primeThinkingSound();
  const loop = playThinkingSound({ sound: "deep-heartbeat", gainDb: -4 });
  expect(cue.start).toHaveBeenCalledWith("thinking", { sound: "deep-heartbeat", gainDb: -4 });
  loop.setGain(-4);
  expect(cue.start).toHaveBeenCalledTimes(1);
  loop.setGain(2);
  expect(cue.start).toHaveBeenLastCalledWith("thinking", { sound: "deep-heartbeat", gainDb: 2 });
  loop.stop(); loop.stop();
  expect(cue.stop).toHaveBeenCalledTimes(1);
  expect(cue.stop).toHaveBeenCalledWith("thinking");
  expect(FakeContext.made).toHaveLength(0);
  // A sound it would not know is asked for as the default; an offset out of range, as the nearest.
  playThinkingSound({ sound: "a-sound-from-before", gainDb: 50 }).stop();
  expect(cue.start).toHaveBeenLastCalledWith("thinking", { sound: DEFAULT_THINKING_SOUND, gainDb: 10 });
});

test("an app whose cue takes no options (before the sounds): the page plays the chosen sound, and priming begins its audio", async () => {
  const cue = { start: vi.fn(), stop: vi.fn() };
  withCue(cue);
  primeThinkingSound();
  expect(FakeContext.made).toHaveLength(1);
  const loop = playThinkingSound({ sound: "slow-breath", gainDb: 0 });
  await vi.advanceTimersByTimeAsync(0);
  expect(cue.start).not.toHaveBeenCalled();
  expect(fetched).toEqual(["slow-breath.m4a"]);
  loop.stop();
  // Nor one that takes the sound and not the offset: what it played would not be what the person set.
  withCue({ start: vi.fn(), stop: vi.fn(), options: ["sound"] });
  playThinkingSound(SOFT).stop();
  expect(FakeContext.made[0].sources.length).toBeGreaterThan(0);
});

test("an app cue that throws on start breaks nothing, and is still told to stop", () => {
  const cue = { start: () => { throw new Error("no audio"); }, stop: vi.fn(), options: ["sound", "gainDb"] };
  withCue(cue);
  expect(() => playThinkingSound(SOFT).stop()).not.toThrow();
  expect(cue.stop).toHaveBeenCalledWith("thinking");
  expect(FakeContext.made).toHaveLength(0);
});

test("an app without the cue's functions leaves the sound to the page's Web Audio", async () => {
  withCue({ start: vi.fn(), options: ["sound", "gainDb"] });
  const loop = playThinkingSound(SOFT);
  expect(FakeContext.made).toHaveLength(1);
  loop.stop();
  await vi.advanceTimersByTimeAsync(1000);
});
