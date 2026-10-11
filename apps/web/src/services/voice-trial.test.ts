import { afterEach, expect, test, vi } from "vitest";
import { tryTranscription, tryVoice } from "./voice-trial.js";

/* A try of the device's voice settings, through a voice that records what it was asked. */

afterEach(() => { vi.useRealTimers(); });

const SETTINGS = { stt: { catalog: "local", model: "whisper-base", language: null }, tts: { catalog: "local", model: "kokoro-82m-v1.0", voice: null, speed: 1 } };

function fakeVoice({ outcome = { status: "heard" } as Record<string, unknown>, startFails = null as unknown } = {}) {
  const on: Record<string, Set<(value: unknown) => void>> = { turn: new Set(), state: new Set(), error: new Set() };
  const calls: unknown[][] = [];
  const sub = (name: string) => (listener: (value: unknown) => void) => { on[name].add(listener); return () => on[name].delete(listener); };
  const voice = {
    calls, on,
    emit: (name: string, value: unknown) => { for (const listener of [...on[name]]) listener(value); },
    setSettings: async (settings: unknown) => { calls.push(["setSettings", settings]); },
    start: async () => { calls.push(["start"]); if (startFails) throw startFails; },
    stop: async () => { calls.push(["stop"]); },
    say: (text: string, options: unknown) => { calls.push(["say", text, options]); return { id: "s1", cancel: () => calls.push(["cancel"]), onEvent() {}, outcome: Promise.resolve(outcome) }; },
    onTurn: sub("turn"), onState: sub("state"), onError: sub("error"),
  };
  return voice;
}
type Voice = Parameters<typeof tryTranscription>[0];
const listeners = (voice: ReturnType<typeof fakeVoice>) => Object.values(voice.on).reduce((count, set) => count + set.size, 0);

test("the first turn finished with words is what was heard; one with none is not; the voice is stopped and let go", async () => {
  const voice = fakeVoice();
  const heard = tryTranscription(voice as unknown as Voice, SETTINGS as never);
  await vi.waitFor(() => expect(voice.calls).toContainEqual(["start"]));
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  voice.emit("turn", { phase: "cancelled", turn_id: "t1" });
  voice.emit("turn", { phase: "finished", turn_id: "t2", text: "  " });
  voice.emit("turn", { phase: "finished", turn_id: "t3", text: " hola, ¿me oyes? " });
  await expect(heard).resolves.toBe("hola, ¿me oyes?");
  expect(voice.calls).toEqual([["setSettings", SETTINGS], ["start"], ["stop"]]);
  expect(listeners(voice)).toBe(0);
});

test("nothing heard in time, a cancel, a voice error or a start that fails: each is the try's failure, and the voice stops", async () => {
  vi.useFakeTimers();
  const silent = fakeVoice();
  const late = tryTranscription(silent as unknown as Voice, SETTINGS as never, { timeoutMs: 1000 });
  const failed = expect(late).rejects.toMatchObject({ code: "trial-silence" });
  await vi.advanceTimersByTimeAsync(1000);
  await failed;
  expect(silent.calls.at(-1)).toEqual(["stop"]);
  vi.useRealTimers();

  const abort = new AbortController();
  const cancelled = fakeVoice();
  const tried = tryTranscription(cancelled as unknown as Voice, SETTINGS as never, { signal: abort.signal });
  await vi.waitFor(() => expect(cancelled.calls).toContainEqual(["start"]));
  abort.abort();
  await expect(tried).rejects.toMatchObject({ code: "trial-cancelled" });

  const broken = fakeVoice();
  const erred = tryTranscription(broken as unknown as Voice, SETTINGS as never);
  await vi.waitFor(() => expect(broken.calls).toContainEqual(["start"]));
  broken.emit("error", { code: "model-load-failed" });
  await expect(erred).rejects.toMatchObject({ code: "model-load-failed" });

  const denied = fakeVoice({ startFails: { code: "microphone-denied" } });
  await expect(tryTranscription(denied as unknown as Voice, SETTINGS as never)).rejects.toMatchObject({ code: "microphone-denied" });
  expect(denied.calls.at(-1)).toEqual(["stop"]);
  expect(listeners(denied)).toBe(0);
});

test("a sentence said through the settings, in its language, heard to its end; cut short or failed, the try says why", async () => {
  const voice = fakeVoice();
  await expect(tryVoice(voice as unknown as Voice, SETTINGS as never, "Hola", { language: "es" })).resolves.toMatchObject({ status: "heard" });
  expect(voice.calls).toEqual([["setSettings", SETTINGS], ["start"], ["say", "Hola", { language: "es" }], ["stop"]]);
  await expect(tryVoice(fakeVoice({ outcome: { status: "heard-up-to", heard_chars: 2, reason: "barge-in" } }) as unknown as Voice, SETTINGS as never, "Hola"))
    .rejects.toMatchObject({ code: "trial-not-heard", detail: "barge-in" });
  await expect(tryVoice(fakeVoice({ outcome: { status: "not-played", reason: "failed", code: "credential-missing" } }) as unknown as Voice, SETTINGS as never, "Hola"))
    .rejects.toMatchObject({ code: "credential-missing" });
});

test("a try says how long each phase took, once it is heard", async () => {

  const turns: Array<(turn: unknown) => void> = [];
  const voice = {
    setSettings: async () => {}, start: async () => {}, stop: async () => {},
    onTurn: (listener: (turn: unknown) => void) => { turns.push(listener); return () => {}; }, onError: () => () => {}, onState: () => () => {},
    say: () => {
      const events: Array<(event: { type: string }) => void> = [];
      setTimeout(() => events.forEach((listener) => listener({ type: "playing" })), 0);
      return { onEvent: (listener: (event: { type: string }) => void) => events.push(listener), outcome: new Promise((done) => setTimeout(() => done({ status: "heard" }), 5)), cancel() {} };
    },
  };
  const heard: unknown[] = [];
  const text = tryTranscription(voice as never, {} as never, { onTimings: (timings: unknown) => heard.push(timings) });
  await new Promise((done) => setTimeout(done, 0));
  turns[0]({ phase: "finished", text: "hola", timings: { audio_ms: 1200, endpoint_silence_ms: 600, recognition_ms: 300 } });
  expect(await text).toBe("hola");
  expect(heard[0]).toMatchObject({ audio_ms: 1200, endpoint_silence_ms: 600, recognition_ms: 300 });
  expect(typeof (heard[0] as { ready_ms: number }).ready_ms).toBe("number");
  const said: unknown[] = [];
  await tryVoice(voice as never, {} as never, "hola", { onTimings: (timings: unknown) => said.push(timings) });
  expect(typeof (said[0] as { first_sound_ms: number }).first_sound_ms).toBe("number");
});

test("while it runs a try tells how it goes: the voice listening and the microphone's level; the part of the sentence sounding", async () => {
  const voice = fakeVoice();
  voice.on.level = new Set();
  const listening = { ...voice, onLevel: (listener: (value: unknown) => void) => { voice.on.level.add(listener); return () => voice.on.level.delete(listener); } };
  const told: unknown[] = [];
  const heard = tryTranscription(listening as unknown as Voice, SETTINGS as never, { onListening: () => told.push("listening"), onLevel: (level: number) => told.push(level) });
  await vi.waitFor(() => expect(told).toEqual(["listening"]));
  voice.emit("level", 0.4);
  voice.emit("turn", { phase: "finished", turn_id: "t1", text: "hola" });
  await heard;
  expect(told).toEqual(["listening", 0.4]);
  // Let go with the rest once heard.
  expect(voice.on.level.size).toBe(0);

  const steps: Array<(event: unknown) => void> = [];
  const said = { ...fakeVoice(), say: () => ({ id: "s1", cancel() {}, onEvent: (listener: (event: unknown) => void) => steps.push(listener),
    outcome: new Promise((done) => setTimeout(() => {
      for (const event of [{ type: "playing" }, { type: "progress", sounding: [0, 4], heard_chars: 0 }, { type: "progress", sounding: null, heard_chars: 4 }]) steps.forEach((listener) => listener(event));
      done({ status: "heard" });
    }, 0)) }) };
  const progress: unknown[] = [];
  await tryVoice(said as unknown as Voice, SETTINGS as never, "Hola", { onProgress: (step: unknown) => progress.push(step) });
  // The first sound is the start of it.
  expect(progress).toEqual([{ sounding: null, heard_chars: 0 }, { sounding: [0, 4], heard_chars: 0 }, { sounding: null, heard_chars: 4 }]);
});
