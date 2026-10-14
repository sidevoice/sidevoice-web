import { afterEach, expect, test, vi } from "vitest";
import { tryEndOfTurn, tryTranscription, tryVoice, type TurnStep } from "./voice-trial.js";

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
    mute: (muted: boolean) => { calls.push(["mute", muted]); },
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
  expect(voice.calls).toEqual([["setSettings", { ...SETTINGS, end_of_turn: "silence", patience: "fast" }], ["start"], ["stop"]]);
  expect(listeners(voice)).toBe(0);
});

test("nothing heard in time, a cancel, a voice error or a start that fails: each is the try's failure, and the voice stops", async () => {
  vi.useFakeTimers();
  const silent = fakeVoice();
  // A silent microphone is not a take too long: past the longest take, it is still the try's own timeout.
  const late = tryTranscription(silent as unknown as Voice, SETTINGS as never, { timeoutMs: 1000, maxTakeMs: 100 });
  const failed = expect(late).rejects.toMatchObject({ code: "trial-silence" });
  await vi.advanceTimersByTimeAsync(1100);
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
  expect(voice.calls).toEqual([["setSettings", { ...SETTINGS, end_of_turn: "silence" }], ["start"], ["say", "Hola", { language: "es" }], ["stop"]]);
  await expect(tryVoice(fakeVoice({ outcome: { status: "heard-up-to", heard_chars: 2, reason: "barge-in" } }) as unknown as Voice, SETTINGS as never, "Hola"))
    .rejects.toMatchObject({ code: "trial-not-heard", detail: "barge-in" });
  await expect(tryVoice(fakeVoice({ outcome: { status: "not-played", reason: "failed", code: "credential-missing" } }) as unknown as Voice, SETTINGS as never, "Hola"))
    .rejects.toMatchObject({ code: "credential-missing" });
});

// The voice loads, downloading it when it is not on disk, every model its settings name: a voice try handed Smart
// fetched Smart's model behind the catalogue the page shows, and End of turn then offered a download that ended at once.
test("a voice try asks for no end-of-turn model, whatever the person's end of turn is; its patience and model stay theirs", async () => {
  for (const turn of [{ end_of_turn: "smart-turn", patience: "calm", turn_model: "smart-turn-v3.2" }, { end_of_turn: "silence", patience: "fast" }, {}]) {
    const voice = fakeVoice();
    await tryVoice(voice as unknown as Voice, { ...SETTINGS, ...turn } as never, "Hola");
    expect(voice.calls[0]).toEqual(["setSettings", { ...SETTINGS, ...turn, end_of_turn: "silence" }]);
  }
});

test("a transcription try ends its take on a short silence, whatever the person's end of turn is", async () => {
  for (const turn of [{ end_of_turn: "smart-turn", patience: "patient", turn_model: "smart-turn-v3" }, { end_of_turn: "silence", patience: "relaxed" }, {}]) {
    const voice = fakeVoice();
    const heard = tryTranscription(voice as unknown as Voice, { ...SETTINGS, ...turn } as never);
    await vi.waitFor(() => expect(voice.calls).toContainEqual(["start"]));
    voice.emit("turn", { phase: "finished", turn_id: "t1", text: "hola" });
    await heard;
    expect(voice.calls[0]).toEqual(["setSettings", { ...SETTINGS, ...turn, end_of_turn: "silence", patience: "fast" }]);
  }
});

test("still talking at the longest take, the take ends there by muting, what was said is the result, and it is unmuted after", async () => {
  vi.useFakeTimers();
  const long = fakeVoice();
  const heard = tryTranscription(long as unknown as Voice, SETTINGS as never, { maxTakeMs: 100 });
  await vi.advanceTimersByTimeAsync(0);
  long.emit("turn", { phase: "started", turn_id: "t1" });
  long.emit("state", { listening: "speaking", recognising: 0 });
  await vi.advanceTimersByTimeAsync(99);
  expect(long.calls).not.toContainEqual(["mute", true]);
  await vi.advanceTimersByTimeAsync(1);
  expect(long.calls.at(-1)).toEqual(["mute", true]);
  long.emit("turn", { phase: "finished", turn_id: "t1", text: " una frase muy larga " });
  await expect(heard).resolves.toBe("una frase muy larga");
  expect(long.calls.slice(-2)).toEqual([["mute", false], ["stop"]]);
  expect(listeners(long)).toBe(0);
});

test("a take already being transcribed at the longest take is not muted", async () => {
  vi.useFakeTimers();
  const ended = fakeVoice();
  const heard = tryTranscription(ended as unknown as Voice, SETTINGS as never, { maxTakeMs: 100 });
  await vi.advanceTimersByTimeAsync(0);
  ended.emit("state", { listening: "speaking", recognising: 0 });
  await vi.advanceTimersByTimeAsync(50);
  ended.emit("state", { listening: "listening", recognising: 1 });
  await vi.advanceTimersByTimeAsync(200);
  ended.emit("turn", { phase: "finished", turn_id: "t1", text: "una frase" });
  await expect(heard).resolves.toBe("una frase");
  expect(ended.calls.filter(([name]) => name === "mute")).toEqual([]);
});

test("Stop ends the take with what was said, and it is transcribed; before anything was said, Stop is a cancel", async () => {
  const spoken = fakeVoice();
  const finish = new AbortController();
  const heard = tryTranscription(spoken as unknown as Voice, SETTINGS as never, { finish: finish.signal });
  await vi.waitFor(() => expect(spoken.calls).toContainEqual(["start"]));
  spoken.emit("turn", { phase: "started", turn_id: "t1" });
  finish.abort();
  expect(spoken.calls.at(-1)).toEqual(["mute", true]);
  spoken.emit("turn", { phase: "finished", turn_id: "t1", text: "hasta aquí" });
  await expect(heard).resolves.toBe("hasta aquí");
  expect(spoken.calls.slice(-2)).toEqual([["mute", false], ["stop"]]);

  const quiet = fakeVoice();
  const early = new AbortController();
  const nothing = tryTranscription(quiet as unknown as Voice, SETTINGS as never, { finish: early.signal });
  await vi.waitFor(() => expect(quiet.calls).toContainEqual(["start"]));
  early.abort();
  await expect(nothing).rejects.toMatchObject({ code: "trial-cancelled" });
  expect(quiet.calls.filter(([name]) => name === "mute")).toEqual([]);
  expect(quiet.calls.at(-1)).toEqual(["stop"]);
});

test("Stop says at once that the take has ended and is being transcribed; the voice's own end of a turn says so too", async () => {
  const told: boolean[] = [];
  const spoken = fakeVoice();
  const finish = new AbortController();
  const heard = tryTranscription(spoken as unknown as Voice, SETTINGS as never, { finish: finish.signal, onTranscribing: (on) => told.push(on) });
  await vi.waitFor(() => expect(spoken.calls).toContainEqual(["start"]));
  spoken.emit("turn", { phase: "started", turn_id: "t1" });
  spoken.emit("state", { listening: "speaking", recognising: 0 });
  expect(told).toEqual([]);
  finish.abort();
  expect(told).toEqual([true]);
  spoken.emit("state", { listening: "muted", recognising: 1 });
  spoken.emit("turn", { phase: "finished", turn_id: "t1", text: "hasta aquí" });
  await expect(heard).resolves.toBe("hasta aquí");
  expect(told).toEqual([true]);

  // A turn the voice ended on its silence is transcribed; one that came to nothing (a cough) leaves it listening.
  const steps: boolean[] = [];
  const voice = fakeVoice();
  const listened = tryTranscription(voice as unknown as Voice, SETTINGS as never, { onTranscribing: (on) => steps.push(on) });
  await vi.waitFor(() => expect(voice.calls).toContainEqual(["start"]));
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  voice.emit("state", { listening: "listening", recognising: 1 });
  voice.emit("turn", { phase: "cancelled", turn_id: "t1", merged: false });
  voice.emit("state", { listening: "listening", recognising: 0 });
  expect(steps).toEqual([true, false]);
  voice.emit("turn", { phase: "started", turn_id: "t2" });
  voice.emit("state", { listening: "listening", recognising: 1 });
  voice.emit("turn", { phase: "finished", turn_id: "t2", text: "hola" });
  await expect(listened).resolves.toBe("hola");
  expect(steps).toEqual([true, false, true]);
});

test("after a turn that came to nothing, Stop is a cancel: there is nothing to transcribe, and nothing is muted", async () => {
  const voice = fakeVoice();
  const finish = new AbortController();
  const tried = tryTranscription(voice as unknown as Voice, SETTINGS as never, { finish: finish.signal });
  await vi.waitFor(() => expect(voice.calls).toContainEqual(["start"]));
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  voice.emit("state", { listening: "speaking", recognising: 0 });
  voice.emit("state", { listening: "listening", recognising: 1 });
  voice.emit("turn", { phase: "cancelled", turn_id: "t1", merged: false });
  voice.emit("state", { listening: "listening", recognising: 0 });
  finish.abort();
  await expect(tried).rejects.toMatchObject({ code: "trial-cancelled" });
  expect(voice.calls.filter(([name]) => name === "mute")).toEqual([]);
});

test("a take ended by Stop whose turn comes to no words is nothing heard at once, not a wait on a muted microphone", async () => {
  const voice = fakeVoice();
  const finish = new AbortController();
  const tried = tryTranscription(voice as unknown as Voice, SETTINGS as never, { finish: finish.signal });
  await vi.waitFor(() => expect(voice.calls).toContainEqual(["start"]));
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  finish.abort();
  expect(voice.calls.at(-1)).toEqual(["mute", true]);
  voice.emit("turn", { phase: "finished", turn_id: "t1", text: "  " });
  await expect(tried).rejects.toMatchObject({ code: "trial-silence" });
  expect(voice.calls.slice(-2)).toEqual([["mute", false], ["stop"]]);
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
  // Its own times only: not the speech, nor the pause the take ended on.
  expect(heard[0]).toEqual({ ready_ms: expect.any(Number), recognition_ms: 300 });
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

/* The end of turn tried: the voice listens until stopped, and tells the latest of the person's turns step by step. */

/** The voice's state as it tells it: whether it hears speech, and how many turns wait for or are in transcription. */
const callState = (listening: string, recognising = 0) => ({ listening, recognising, playback: "idle", microphone: "live" });

/** A try of the end of turn through `voice`, and the steps it told. */
function tryTurns(voice: ReturnType<typeof fakeVoice>, options: { quietMs?: number; signal?: AbortSignal; settings?: unknown } = {}) {
  const steps: TurnStep[] = [];
  const run = tryEndOfTurn(voice as unknown as Voice, (options.settings ?? SETTINGS) as never, { ...options, onTurnStep: (step) => steps.push(step) });
  return { run, steps };
}

test("a try of the end of turn tells the turn as it goes: speaking, a pause within it, its end the moment it is decided, then its words and the silence the voice waited", async () => {
  const voice = fakeVoice();
  const { run, steps } = tryTurns(voice);
  await vi.waitFor(() => expect(steps).toEqual([{ step: "listening", again: false }]));
  expect(voice.calls).toEqual([["setSettings", SETTINGS], ["start"]]);
  // Speech heard before its turn is told: the turn is what starts it.
  voice.emit("state", callState("speaking"));
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  voice.emit("state", callState("listening"));
  voice.emit("state", callState("speaking"));
  voice.emit("state", callState("listening"));
  voice.emit("state", callState("listening", 1));
  voice.emit("turn", { phase: "finished", turn_id: "t1", text: " hola, ¿me oyes? ", timings: { audio_ms: 2400, endpoint_silence_ms: 900, recognition_ms: 300 } });
  expect(steps.slice(1)).toEqual([{ step: "speaking" }, { step: "pause" }, { step: "speaking" }, { step: "pause" }, { step: "ended" },
    { step: "heard", text: "hola, ¿me oyes?", endpoint_silence_ms: 900 }]);
  // The voice ends speech and decides the end in one state: the end, with no pause before it.
  steps.length = 0;
  voice.emit("state", callState("listening", 0));
  voice.emit("turn", { phase: "started", turn_id: "t2" });
  voice.emit("state", callState("speaking"));
  voice.emit("state", callState("listening", 1));
  expect(steps).toEqual([{ step: "speaking" }, { step: "ended" }]);
  expect(voice.calls).toEqual([["setSettings", SETTINGS], ["start"]]);
  void run.done.catch(() => {});
});

test("only the latest turn counts: one that starts drops what an earlier one tells late; a turn with no words or dropped by the voice did not count, one joined into the next says nothing", async () => {
  const voice = fakeVoice();
  const { steps } = tryTurns(voice);
  await vi.waitFor(() => expect(steps).toHaveLength(1));
  // Ended, and then the person goes on: the next turn is the evidence of a cut-off.
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  voice.emit("state", callState("listening", 1));
  voice.emit("turn", { phase: "started", turn_id: "t2" });
  voice.emit("state", callState("speaking", 1));
  voice.emit("turn", { phase: "cancelled", turn_id: "t1", merged: true });
  voice.emit("turn", { phase: "finished", turn_id: "t1", text: "late", timings: { audio_ms: 1, endpoint_silence_ms: 1, recognition_ms: 1 } });
  voice.emit("state", callState("listening", 0));
  voice.emit("state", callState("listening", 1));
  voice.emit("turn", { phase: "finished", turn_id: "t2", text: "y luego sigo", merged: true, timings: { audio_ms: 4000, endpoint_silence_ms: 1300, recognition_ms: 400 } });
  voice.emit("turn", { phase: "started", turn_id: "t3" });
  voice.emit("turn", { phase: "finished", turn_id: "t3", text: "  " });
  voice.emit("turn", { phase: "started", turn_id: "t4" });
  voice.emit("turn", { phase: "cancelled", turn_id: "t4", merged: false });
  voice.emit("turn", { phase: "started", turn_id: "t5" });
  voice.emit("turn", { phase: "cancelled", turn_id: "t5", merged: true });
  expect(steps.slice(1)).toEqual([
    { step: "speaking" }, { step: "ended" },
    { step: "speaking" }, { step: "pause" }, { step: "ended" }, { step: "heard", text: "y luego sigo", endpoint_silence_ms: 1300 },
    { step: "speaking" }, { step: "not-a-turn" },
    { step: "speaking" }, { step: "not-a-turn" },
    { step: "speaking" },
  ]);
});

test("it listens until stopped, or until a stretch with no speech; while the person speaks the quiet does not run out", async () => {
  vi.useFakeTimers();
  const voice = fakeVoice();
  const { run, steps } = tryTurns(voice, { quietMs: 1000 });
  let over = false;
  const quiet = expect(run.done.finally(() => { over = true; })).rejects.toMatchObject({ code: "trial-silence" });
  await vi.advanceTimersByTimeAsync(0);
  expect(steps).toEqual([{ step: "listening", again: false }]);
  voice.emit("state", callState("speaking"));
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  await vi.advanceTimersByTimeAsync(5000);
  expect(over).toBe(false);
  // The quiet starts over each time speech stops.
  voice.emit("state", callState("listening", 1));
  await vi.advanceTimersByTimeAsync(600);
  voice.emit("turn", { phase: "finished", turn_id: "t1", text: "hola", timings: { audio_ms: 1, endpoint_silence_ms: 600, recognition_ms: 1 } });
  await vi.advanceTimersByTimeAsync(999);
  expect(over).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await quiet;
  expect(voice.calls.at(-1)).toEqual(["stop"]);
  expect(listeners(voice)).toBe(0);
});

test("stopped, failed or never started: the try ends with why, and the voice stops and is let go", async () => {
  const abort = new AbortController();
  const stopped = fakeVoice();
  stopped.on.level = new Set();
  const levels: number[] = [];
  const run = tryEndOfTurn({ ...stopped, onLevel: (listener: (value: unknown) => void) => { stopped.on.level.add(listener); return () => stopped.on.level.delete(listener); } } as unknown as Voice,
    SETTINGS as never, { signal: abort.signal, onLevel: (level) => levels.push(level) });
  await vi.waitFor(() => expect(stopped.calls).toContainEqual(["start"]));
  stopped.emit("level", 0.3);
  abort.abort();
  await expect(run.done).rejects.toMatchObject({ code: "trial-cancelled" });
  expect(levels).toEqual([0.3]);
  expect(stopped.calls.at(-1)).toEqual(["stop"]);
  expect(listeners(stopped)).toBe(0);

  const broken = fakeVoice();
  const erred = tryTurns(broken);
  await vi.waitFor(() => expect(erred.steps).toHaveLength(1));
  broken.emit("error", { code: "transcription-failed" });
  await expect(erred.run.done).rejects.toMatchObject({ code: "transcription-failed" });
  expect(broken.calls.at(-1)).toEqual(["stop"]);

  const missing = fakeVoice({ startFails: { code: "end-of-turn-missing" } });
  await expect(tryTurns(missing).run.done).rejects.toMatchObject({ code: "end-of-turn-missing" });
  expect(missing.calls.at(-1)).toEqual(["stop"]);
  expect(listeners(missing)).toBe(0);

  const gone = new AbortController();
  gone.abort();
  await expect(tryTurns(fakeVoice(), { signal: gone.signal }).run.done).rejects.toMatchObject({ code: "trial-cancelled" });
});

test("other settings while it runs: the turn in progress is dropped, the voice stops, takes them and listens again; the same ones change nothing", async () => {
  const voice = fakeVoice();
  const { run, steps } = tryTurns(voice);
  await vi.waitFor(() => expect(steps).toHaveLength(1));
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  const calm = { ...SETTINGS, patience: "calm" };
  const retuned = run.retune(calm as never);
  // Stopping, the voice cancels the turn it had: that is not a turn that did not count.
  voice.emit("turn", { phase: "cancelled", turn_id: "t1", merged: false });
  voice.emit("state", callState("idle"));
  await retuned;
  expect(voice.calls).toEqual([["setSettings", SETTINGS], ["start"], ["stop"], ["setSettings", calm], ["start"]]);
  expect(steps.slice(1)).toEqual([{ step: "speaking" }, { step: "restarting" }, { step: "listening", again: true }]);
  await run.retune({ ...calm } as never);
  expect(voice.calls).toHaveLength(5);
  // Listening again, it follows the turns as before.
  voice.emit("turn", { phase: "started", turn_id: "t2" });
  expect(steps.at(-1)).toEqual({ step: "speaking" });
});

test("settings asked for while the voice starts are put in place once it has, the latest only", async () => {
  const voice = fakeVoice();
  let release = () => {};
  voice.start = async () => { voice.calls.push(["start"]); await new Promise<void>((done) => { release = done; }); };
  const { run, steps } = tryTurns(voice);
  await vi.waitFor(() => expect(voice.calls).toContainEqual(["start"]));
  const fast = { ...SETTINGS, patience: "fast" }, smart = { ...SETTINGS, end_of_turn: "smart-turn" };
  void run.retune(fast as never);
  const latest = run.retune(smart as never);
  release();
  await vi.waitFor(() => expect(voice.calls).toHaveLength(5));
  release();
  await latest;
  expect(voice.calls).toEqual([["setSettings", SETTINGS], ["start"], ["stop"], ["setSettings", smart], ["start"]]);
  expect(steps).toEqual([{ step: "listening", again: true }]);
});

test.each(["stop", "settings", "start"])("cancelling during a pending restart %s leaves no recording or listeners after the try", async (pending) => {
  const voice = takingVoice();
  const abort = new AbortController();
  const takes: unknown[] = [];
  let release = () => {};
  let active = false;
  const originalSettings = voice.setSettings;
  const originalStart = voice.start;
  const originalStop = voice.stop;
  let settingsCalls = 0;
  let startCalls = 0;
  let stopCalls = 0;
  voice.setSettings = async (settings: unknown) => {
    settingsCalls++;
    if (pending === "settings" && settingsCalls === 2) await new Promise<void>((done) => { release = done; });
    await originalSettings(settings);
  };
  voice.start = async (...asked: unknown[]) => {
    startCalls++;
    if (pending === "start" && startCalls === 2) await new Promise<void>((done) => { release = done; });
    await originalStart(...asked);
    active = true;
  };
  voice.stop = async () => {
    stopCalls++;
    if (pending === "stop" && stopCalls === 1) await new Promise<void>((done) => { release = done; });
    await originalStop(); active = false;
  };
  const run = tryEndOfTurn(voice as unknown as Voice, SETTINGS as never, { signal: abort.signal, onTake: (take) => takes.push(take) });
  await vi.waitFor(() => expect(active).toBe(true));
  const retuned = run.retune({ ...SETTINGS, patience: "calm" } as never);
  await vi.waitFor(() => expect(pending === "stop" ? stopCalls : pending === "settings" ? settingsCalls : startCalls).toBe(pending === "stop" ? 1 : 2));
  abort.abort();
  let settled = false;
  void run.done.catch(() => {}).finally(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  release();
  await retuned;
  await expect(run.done).rejects.toMatchObject({ code: "trial-cancelled" });
  expect(active).toBe(false);
  expect(voice.calls.at(-1)).toEqual(["stop"]);
  expect(startCalls).toBe(pending === "start" ? 2 : 1);
  expect(listeners(voice)).toBe(0);
  const handed = takes.length;
  voice.emit("take", { ended_at: 999 });
  expect(takes).toHaveLength(handed);
});

/* A try requests a take only when the UI wants it, and hands it once the voice has stopped. */

/** `fakeVoice`, with a take: `start` says what it was asked, and each stop hands the take of the stretch it ends. */
function takingVoice() {
  const voice = fakeVoice();
  voice.on.take = new Set();
  let stretch = 0;
  const take = (n: number) => ({ sampleRate: 16000, samples: new Float32Array(16 * n), started_at: 0, ended_at: n, turns: [] });
  const taking = Object.assign(voice, {
    start: async (...asked: unknown[]) => { voice.calls.push(["start", ...asked]); stretch++; },
    stop: async () => { voice.calls.push(["stop"]); voice.emit("take", take(stretch * 100)); },
    onTake: (listener: (value: unknown) => void) => { voice.on.take.add(listener); return () => voice.on.take.delete(listener); },
  });
  return taking;
}

test("a voice that hands a take is asked for one; the try hands it once the voice has stopped, and lets the voice go", async () => {
  const voice = takingVoice();
  const told: unknown[] = [];
  const heard = tryTranscription(voice as unknown as Voice, SETTINGS as never, { onTake: (take) => told.push(["take", take.ended_at]) });
  await vi.waitFor(() => expect(voice.calls).toContainEqual(["start", { take: true }]));
  voice.emit("turn", { phase: "finished", turn_id: "t1", text: "hola" });
  await expect(heard).resolves.toBe("hola");
  expect(voice.calls).toEqual([["setSettings", { ...SETTINGS, end_of_turn: "silence", patience: "fast" }], ["start", { take: true }], ["stop"]]);
  expect(told).toEqual([["take", 100]]);
  expect(listeners(voice)).toBe(0);
  // Not wanted, not asked for.
  const unwanted = takingVoice();
  const plain = tryTranscription(unwanted as unknown as Voice, SETTINGS as never);
  await vi.waitFor(() => expect(unwanted.calls).toContainEqual(["start"]));
  unwanted.emit("turn", { phase: "finished", turn_id: "t1", text: "hola" });
  await plain;
  expect(unwanted.calls).toContainEqual(["start"]);
  expect(unwanted.calls).not.toContainEqual(["start", { take: true }]);
  expect(listeners(unwanted)).toBe(0);
  // A try that fails still hands what was heard until then.
  const broken = takingVoice();
  const takes: unknown[] = [];
  const erred = tryTranscription(broken as unknown as Voice, SETTINGS as never, { onTake: (take) => takes.push(take) });
  await vi.waitFor(() => expect(broken.calls).toContainEqual(["start", { take: true }]));
  broken.emit("error", { code: "transcription-failed" });
  await expect(erred).rejects.toMatchObject({ code: "transcription-failed" });
  expect(takes).toHaveLength(1);
});

test("the end of turn tried: the take since the voice last started to listen, once it stops; what it heard before other settings goes with them", async () => {
  const voice = takingVoice();
  const takes: number[] = [];
  const abort = new AbortController();
  const run = tryEndOfTurn(voice as unknown as Voice, SETTINGS as never, { signal: abort.signal, onTake: (take) => takes.push(take.ended_at) });
  await vi.waitFor(() => expect(voice.calls).toContainEqual(["start", { take: true }]));
  const calm = { ...SETTINGS, patience: "calm" };
  await run.retune(calm as never);
  expect(voice.calls).toEqual([["setSettings", SETTINGS], ["start", { take: true }], ["stop"], ["setSettings", calm], ["start", { take: true }]]);
  expect(takes).toEqual([]);
  abort.abort();
  await expect(run.done).rejects.toMatchObject({ code: "trial-cancelled" });
  expect(takes).toEqual([200]);
  expect(listeners(voice)).toBe(0);
});
