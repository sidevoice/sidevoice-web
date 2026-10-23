import { expect, test, vi } from "vitest";
import { AUDIO_DIAGNOSTICS_KEY, createAudioDiagnostics, shortId } from "./audio-diagnostics";

/* Fakes of the browser's audio objects: the diagnostics only observe them. */
class FakeTrack extends EventTarget {
  readyState = "live"; muted = false; enabled = true;
  constructor(public id: string, private settings: Record<string, unknown>) { super(); }
  getSettings() { return this.settings; }
  // As a real track: the on<type> property is a handler too.
  override dispatchEvent(event: Event) { (this as any)["on" + event.type]?.(event); return super.dispatchEvent(event); }
}
class FakeContext extends EventTarget {
  state = "running"; sampleRate = 48000; outputLatency = 0.012; baseLatency = 0.005; sinkId: string | object = "";
  async setSinkId(id: string) { this.sinkId = id; }
}
const SECRET_DEVICE = "7f9c0d-very-private-device-id";
const settings = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1, deviceId: SECRET_DEVICE, groupId: "group-private", label: "Alice's AirPods" };

function setup(extra: Partial<Parameters<typeof createAudioDiagnostics>[0]> = {}) {
  let t = 1_000_000;
  const devices = Object.assign(new EventTarget(), {
    getUserMedia: vi.fn(async () => ({ getAudioTracks: () => [track = new FakeTrack("0123456789abcdef", settings)] })),
    enumerateDevices: vi.fn(async () => [{ kind: "audioinput" }, { kind: "audioinput" }, { kind: "audiooutput" }]),
  });
  let track: FakeTrack;
  const original = devices.getUserMedia;
  const win: any = { navigator: { mediaDevices: devices }, AudioContext: FakeContext };
  const diag = createAudioDiagnostics({ win, now: () => t, storage: null, log: () => {}, ...extra });
  diag.install();
  return { diag, win, devices, original, advance: (ms: number) => { t += ms; }, track: () => track };
}

test("every microphone acquisition is logged with settings, context facts, elapsed time and a rebuild counter", async () => {
  const { diag, win, advance } = setup();
  const context = new win.AudioContext();
  await win.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, deviceId: { exact: SECRET_DEVICE } } });
  advance(60_000);
  await win.navigator.mediaDevices.getUserMedia({ audio: true });
  const acquired = diag.entries().filter((e) => e.kind === "mic-acquired");
  expect(acquired).toHaveLength(2);
  expect(acquired[0]).toMatchObject({ n: 1, mic_rebuilds: 0, aec: true, ns: true, agc: true, rate: 48000, ctx_state: "running", ctx_rate: 48000, ctx_out_latency_ms: 12, call_ms: 0 });
  expect(acquired[1]).toMatchObject({ n: 2, mic_rebuilds: 1, call_ms: 60_000 });
  expect(acquired[0].device).toBe(shortId(SECRET_DEVICE));
  expect(context.state).toBe("running");
});

test("a video-only request passes through untouched and a refusal is logged then rethrown", async () => {
  const { diag, win, original } = setup();
  await win.navigator.mediaDevices.getUserMedia({ video: true });
  expect(diag.entries()).toHaveLength(0);
  original.mockRejectedValueOnce(Object.assign(new Error("secret text"), { name: "NotAllowedError" }));
  await expect(win.navigator.mediaDevices.getUserMedia({ audio: true })).rejects.toThrow("secret text");
  expect(diag.entries()[0]).toMatchObject({ kind: "mic-failed", error: "NotAllowedError" });
  expect(diag.dump()).not.toContain("secret text");
});

test("track ended, mute and unmute and context state changes are logged without replacing the package's handlers", async () => {
  const { diag, win, track } = setup();
  const context = new win.AudioContext();
  await win.navigator.mediaDevices.getUserMedia({ audio: true });
  const packageHandler = vi.fn();
  (track() as any).onended = packageHandler;
  track().addEventListener("ended", () => {});
  track().dispatchEvent(new Event("mute"));
  track().dispatchEvent(new Event("unmute"));
  track().dispatchEvent(new Event("ended"));
  context.state = "suspended"; context.dispatchEvent(new Event("statechange"));
  const kinds = diag.entries().map((e) => e.kind);
  expect(kinds).toEqual(expect.arrayContaining(["ctx-created", "mic-acquired", "track-mute", "track-unmute", "track-ended", "ctx-suspended"]));
  expect(packageHandler).toHaveBeenCalledTimes(1);
  expect(diag.entries().find((e) => e.kind === "ctx-suspended")).toMatchObject({ ctx_state: "suspended" });
});

test("setSinkId changes and devicechange are logged, and the subclass adds setSinkId only where the browser has it", async () => {
  const { diag, win, devices } = setup();
  const context = new win.AudioContext();
  await context.setSinkId("headset-private-id");
  devices.dispatchEvent(new Event("devicechange"));
  await vi.waitFor(() => expect(diag.entries().some((e) => e.kind === "devicechange")).toBe(true));
  expect(diag.entries().find((e) => e.kind === "sink-set")).toMatchObject({ wanted: shortId("headset-private-id"), ctx_sink: shortId("headset-private-id") });
  expect(diag.entries().find((e) => e.kind === "devicechange")).toMatchObject({ inputs: 2, outputs: 1 });
  expect(context).toBeInstanceOf(FakeContext);

  class Bare extends EventTarget { state = "running"; sampleRate = 44100; }
  const plain: any = { navigator: { mediaDevices: undefined }, AudioContext: Bare };
  createAudioDiagnostics({ win: plain, storage: null, log: () => {} }).install();
  expect(typeof plain.AudioContext.prototype.setSinkId).toBe("undefined");
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

test("barge-in facts recorded by the page carry the call clock, and the call's end resets the counters", async () => {
  const { diag, win, advance } = setup();
  await win.navigator.mediaDevices.getUserMedia({ audio: true });
  advance(5000);
  diag.record("barge-in", { reason: "user_interrupted", mic_level: 40, playback_level: 70 });
  expect(diag.entries().at(-1)).toMatchObject({ kind: "barge-in", call_ms: 5000, mic_rebuilds: 0, mic_level: 40 });
  diag.callEnded();
  expect(diag.entries().at(-1)).toMatchObject({ kind: "call-ended", mic_acquisitions: 1 });
  advance(1000);
  diag.callStarted();
  await win.navigator.mediaDevices.getUserMedia({ audio: true });
  expect(diag.entries().at(-1)).toMatchObject({ n: 1, mic_rebuilds: 0, call_ms: 0 });
});

test("nothing personal reaches the log, in memory or in storage", async () => {
  vi.useFakeTimers();
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v) };
  const { diag, win } = setup({ storage });
  new win.AudioContext();
  await win.navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: SECRET_DEVICE } } });
  vi.advanceTimersByTime(1500);
  const everything = diag.dump() + (values.get(AUDIO_DIAGNOSTICS_KEY) ?? "");
  expect(values.get(AUDIO_DIAGNOSTICS_KEY)).toBeTruthy();
  for (const secret of [SECRET_DEVICE, "group-private", "AirPods", "Alice", "0123456789abcdef"]) expect(everything).not.toContain(secret);
  // a new page reads what the last one kept
  expect(createAudioDiagnostics({ win, storage, log: () => {} }).entries().length).toBe(diag.entries().length);
  vi.useRealTimers();
});

test("uninstall restores the browser's own functions", () => {
  const { diag, win, original } = setup();
  expect(win.AudioContext).not.toBe(FakeContext);
  diag.uninstall();
  expect(win.AudioContext).toBe(FakeContext);
  expect(win.navigator.mediaDevices.getUserMedia).toBe(original);
});
