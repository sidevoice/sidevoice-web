import { afterEach, beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { playThinkingSound, primeThinkingSound, resetThinkingSoundForTests } from "./thinking-sound";

/* The player keeps one context for the page: begun in the Join tap (prime), and every breath plays in that one, so a
 * browser that starts a page's audio only from a gesture lets it sound (sidevoice-web#439). */

const node = () => ({ connect: vi.fn((next: unknown) => next), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
  gain: { value: 0, cancelScheduledValues: vi.fn() }, frequency: { value: 0 }, offset: { value: 0 }, type: "", buffer: null, loop: false });

class FakeContext {
  static made: FakeContext[] = [];
  state: AudioContextState = "suspended";
  sampleRate = 8000;
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => { this.state = "running"; });
  suspend = vi.fn(async () => { this.state = "suspended"; });
  close = vi.fn(async () => { this.state = "closed"; });
  sources: ReturnType<typeof node>[] = [];
  constructor() { FakeContext.made.push(this); }
  createBuffer() { return { getChannelData: () => new Float32Array(16) }; }
  createBufferSource() { const made = node(); this.sources.push(made); return made; }
  createBiquadFilter() { return node(); }
  createGain() { return node(); }
  createOscillator() { return node(); }
  createConstantSource() { return node(); }
}

beforeEach(() => { vi.useFakeTimers(); FakeContext.made = []; vi.stubGlobal("AudioContext", FakeContext); });
afterEach(() => { resetThinkingSoundForTests(); vi.unstubAllGlobals(); vi.useRealTimers(); });

test("the Join tap begins the one context, quiet until a breath plays in it", async () => {
  primeThinkingSound();
  expect(FakeContext.made).toHaveLength(1);
  const [context] = FakeContext.made;
  expect(context.resume).toHaveBeenCalledTimes(1);
  await vi.runAllTimersAsync();
  expect(context.state).toBe("suspended");

  const stop = playThinkingSound();
  expect(FakeContext.made).toHaveLength(1);
  await vi.runAllTimersAsync();
  expect(context.state).toBe("running");
  expect(context.sources[0].start).toHaveBeenCalled();

  stop();
  expect(context.sources[0].stop).toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(context.state).toBe("suspended");
  // The next breath plays in the same context.
  playThinkingSound()();
  expect(FakeContext.made).toHaveLength(1);
});

test("without a tap (an app's webview) the context is made when the first breath plays", async () => {
  const stop = playThinkingSound();
  expect(FakeContext.made).toHaveLength(1);
  await vi.runAllTimersAsync();
  expect(FakeContext.made[0].state).toBe("running");
  stop();
  stop();
  await vi.runAllTimersAsync();
  expect(FakeContext.made[0].state).toBe("suspended");
});

test("a page without Web Audio plays nothing and does not fail", () => {
  vi.stubGlobal("AudioContext", undefined);
  primeThinkingSound();
  expect(() => playThinkingSound()()).not.toThrow();
});

/* An app that plays the cue itself (host.cue) is asked to, and the page makes no Web Audio of its own. */
function withCue(cue: unknown) {
  Object.defineProperty(window, "__sidevoiceHost", { configurable: true, value: { host: { cue } } });
  onTestFinished(() => { Reflect.deleteProperty(window, "__sidevoiceHost"); });
}

test("a host with its own cue plays the breath, once, and the page makes no context", () => {
  const cue = { start: vi.fn(), stop: vi.fn() };
  withCue(cue);
  const stop = playThinkingSound();
  expect(cue.start).toHaveBeenCalledWith("thinking");
  expect(FakeContext.made).toHaveLength(0);
  stop(); stop();
  expect(cue.stop).toHaveBeenCalledTimes(1);
  expect(cue.stop).toHaveBeenCalledWith("thinking");
});

test("a host cue that throws on start breaks nothing, and is still told to stop", () => {
  const cue = { start: () => { throw new Error("no audio"); }, stop: vi.fn() };
  withCue(cue);
  expect(() => playThinkingSound()()).not.toThrow();
  expect(cue.stop).toHaveBeenCalledWith("thinking");
  expect(FakeContext.made).toHaveLength(0);
});

test("the Join tap makes no page context where the host plays the cue", () => {
  withCue({ start: vi.fn(), stop: vi.fn() });
  primeThinkingSound();
  expect(FakeContext.made).toHaveLength(0);
});

test("a host without the cue's functions leaves the breath to the page's Web Audio", async () => {
  withCue({ start: vi.fn() });
  const stop = playThinkingSound();
  expect(FakeContext.made).toHaveLength(1);
  stop();
  await vi.runAllTimersAsync();
});
