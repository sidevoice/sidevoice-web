import { afterEach, expect, test, vi } from "vitest";
import { AUDIO_DIAGNOSTICS_KEY, createAudioDiagnostics, shortId } from "./audio-diagnostics";

const made: Array<{ uninstall(): void }> = [];
afterEach(() => { made.splice(0).forEach((d) => d.uninstall()); });

/* Fakes of the browser's objects: the diagnostics only listen to them. */
class FakeTrack extends EventTarget {
  readyState = "live"; muted = false; enabled = true;
  constructor(public id: string, private settings: Record<string, unknown>) { super(); }
  getSettings() { return this.settings; }
}
class FakeContext extends EventTarget { state = "running"; sampleRate = 48000; outputLatency = 0.012; baseLatency = 0.005; }
const SECRET_DEVICE = "7f9c0d-very-private-device-id";
const settings = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1, deviceId: SECRET_DEVICE, groupId: "group-private", label: "Alice's AirPods" };

function setup(extra: Partial<Parameters<typeof createAudioDiagnostics>[0]> = {}) {
  let t = 1_000_000;
  const devices = Object.assign(new EventTarget(), {
    enumerateDevices: vi.fn(async () => [{ kind: "audioinput", label: "Alice's AirPods" }, { kind: "audioinput" }, { kind: "audiooutput" }]),
  });
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const win: any = { navigator: { mediaDevices: devices }, document };
  const diag = createAudioDiagnostics({ win, now: () => t, storage: null, log: () => {}, ...extra });
  diag.install();
  made.push(diag);
  const stream = (track = new FakeTrack("0123456789abcdef", settings)) => ({ track, stream: { getAudioTracks: () => [track] } });
  return { diag, win, devices, document, stream, advance: (ms: number) => { t += ms; } };
}

test("devicechange logs counts and kinds, never labels; visibility changes are logged", async () => {
  const { diag, devices, document } = setup();
  devices.dispatchEvent(new Event("devicechange"));
  await vi.waitFor(() => expect(diag.entries().some((e) => e.kind === "devicechange")).toBe(true));
  expect(diag.entries().find((e) => e.kind === "devicechange")).toMatchObject({ inputs: 2, outputs: 1 });
  document.visibilityState = "hidden"; document.dispatchEvent(new Event("visibilitychange"));
  expect(diag.entries().at(-1)).toMatchObject({ kind: "visibility", state: "hidden" });
  expect(diag.dump()).not.toContain("AirPods");
});

test("a failing enumerateDevices still logs the change", async () => {
  const { diag, devices } = setup();
  devices.enumerateDevices.mockRejectedValueOnce(new Error("no"));
  devices.dispatchEvent(new Event("devicechange"));
  await vi.waitFor(() => expect(diag.entries().at(-1)).toMatchObject({ kind: "devicechange", inputs: null }));
});

test("a stream the page owns is logged with settings, context facts and the rebuild counter, and its track events follow", () => {
  const { diag, stream, advance } = setup();
  const context = new FakeContext();
  diag.callStarted();
  const first = stream();
  diag.watchStream(first.stream, context);
  advance(60_000);
  const second = stream(new FakeTrack("fedcba9876543210", settings));
  diag.watchStream(second.stream, context);
  const acquired = diag.entries().filter((e) => e.kind === "mic-acquired");
  expect(acquired[0]).toMatchObject({ n: 1, mic_rebuilds: 0, aec: true, ns: true, agc: true, rate: 48000, ctx_state: "running", ctx_rate: 48000, ctx_out_latency_ms: 12, call_ms: 0, device: shortId(SECRET_DEVICE) });
  expect(acquired[1]).toMatchObject({ n: 2, mic_rebuilds: 1, call_ms: 60_000 });
  first.track.dispatchEvent(new Event("mute"));
  first.track.dispatchEvent(new Event("ended"));
  expect(diag.entries().map((e) => e.kind)).toEqual(expect.arrayContaining(["track-mute", "track-ended"]));
});

test("stop and uninstall detach every listener; an ended track detaches itself", () => {
  const { diag, stream, document } = setup();
  const context = new FakeContext();
  const { track, stream: s } = stream();
  const stopStream = diag.watchStream(s, context);
  const stopContext = diag.watchContext(context);
  const removed = vi.spyOn(track, "removeEventListener");
  stopStream();
  expect(removed).toHaveBeenCalledTimes(3);
  stopContext();
  const before = diag.entries().length;
  track.dispatchEvent(new Event("mute"));
  context.dispatchEvent(new Event("statechange"));
  expect(diag.entries().length).toBe(before);
  diag.uninstall();
  document.dispatchEvent(new Event("visibilitychange"));
  expect(diag.entries().length).toBe(before);
});

test("a closed context detaches itself", () => {
  const { diag } = setup();
  const context = new FakeContext();
  const removed = vi.spyOn(context, "removeEventListener");
  diag.watchContext(context);
  context.state = "closed"; context.dispatchEvent(new Event("statechange"));
  expect(diag.entries().at(-1)).toMatchObject({ kind: "ctx-closed" });
  expect(removed).toHaveBeenCalledTimes(1);
});

test("throwing getters never break the log or the caller", () => {
  const { diag } = setup();
  const context = new FakeContext();
  Object.defineProperty(context, "outputLatency", { get() { throw new Error("boom"); } });
  const track: any = { id: "t", getSettings() { throw new Error("boom"); }, get readyState() { throw new Error("boom"); }, addEventListener() {}, removeEventListener() {} };
  expect(() => diag.watchStream({ getAudioTracks: () => [track] }, context)).not.toThrow();
  expect(() => diag.watchContext(context)).not.toThrow();
  expect(() => diag.callEnded()).not.toThrow();
  expect(diag.entries().at(-1)).toMatchObject({ kind: "call-ended" });
});

test("install is idempotent and survives a window without the APIs", () => {
  const { diag, devices } = setup();
  const add = vi.spyOn(devices, "addEventListener");
  diag.install();
  expect(add).not.toHaveBeenCalled();
  const bare = createAudioDiagnostics({ win: {}, storage: null, log: () => {} });
  expect(() => bare.install()).not.toThrow();
});

test("a kind is rate limited, the dropped count rides on the next entry, and the log is bounded", () => {
  const { diag, advance } = setup({ burst: 3, windowMs: 10_000, max: 5 });
  for (let i = 0; i < 10; i++) diag.record("track-mute");
  expect(diag.entries()).toHaveLength(3);
  advance(10_000);
  diag.record("track-mute");
  expect(diag.entries().at(-1)).toMatchObject({ suppressed: 7 });
  for (let i = 0; i < 20; i++) { advance(10_000); diag.record("other" + i); }
  expect(diag.entries()).toHaveLength(5);
});

test("the call clock runs from callStarted, also for a resumed session, and stops at callEnded", () => {
  const { diag, advance } = setup();
  diag.record("mic-state");
  expect(diag.entries().at(-1)).toMatchObject({ call_ms: null });
  diag.callStarted();
  advance(5000);
  diag.callStarted(); // a resumed session after a drop keeps the running clock
  diag.record("barge-in", { reason: "user_interrupted", mic_level: 40, playback_level: 70 });
  expect(diag.entries().at(-1)).toMatchObject({ kind: "barge-in", call_ms: 5000, mic_level: 40 });
  diag.callEnded();
  advance(3_600_000);
  diag.record("ctx-closed");
  expect(diag.entries().at(-1)).toMatchObject({ call_ms: null });
  diag.callStarted(); // a page reloaded into a resumed call starts it too
  diag.record("mic-state");
  expect(diag.entries().at(-1)).toMatchObject({ call_ms: 0 });
});

test("nothing personal reaches the log, in memory or in storage", () => {
  vi.useFakeTimers();
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v) };
  const { diag, stream, win } = setup({ storage });
  diag.watchStream(stream().stream, new FakeContext());
  vi.advanceTimersByTime(1500);
  const everything = diag.dump() + (values.get(AUDIO_DIAGNOSTICS_KEY) ?? "");
  expect(values.get(AUDIO_DIAGNOSTICS_KEY)).toBeTruthy();
  for (const secret of [SECRET_DEVICE, "group-private", "AirPods", "Alice", "0123456789abcdef"]) expect(everything).not.toContain(secret);
  expect(createAudioDiagnostics({ win, storage, log: () => {} }).entries().length).toBe(diag.entries().length);
  vi.useRealTimers();
});
