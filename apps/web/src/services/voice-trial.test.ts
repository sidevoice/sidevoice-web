import { afterEach, expect, test, vi } from "vitest";
import { TURN_TUNING } from "./voice-settings.js";
import { tryEndOfTurn, tryTranscription, tryVoice, type TurnStep } from "./voice-trial.js";

/* A try of the device's voice settings, through a voice that records what it was asked: the halves of each call it
 * starts, and what it is told to do. */

afterEach(() => { vi.useRealTimers(); });

const SETTINGS = {
  stt: { catalog: "local", model: "whisper-base", language: null }, tts: { catalog: "local", model: "kokoro-82m-v1.0", voice: null, speed: 1 },
  patience: "normal", end_of_turn: "silence", idle_unload_minutes: 10, turn: TURN_TUNING,
};
/** The turn numbers the app hands the voice with the input half. */
const TURNS = { listening_bar: TURN_TUNING.listening_bar, barge_in_min_speech: 0.5, barge_in_window: 2.5, vad_confidence: 0.65, speech_start_ms: 150, pre_roll_ms: 1000 };
/** The halves a transcription try asks for: the input alone, with its own end of turn. */
const LISTENING = { input: { stt: SETTINGS.stt, endOfTurn: { kind: "silence", ms: 1500 }, patience: "normal", ...TURNS }, idle_unload_minutes: 10 };
/** The halves a voice try asks for: the output alone. */
const SPEAKING = { output: { tts: { catalog: "local", model: "kokoro-82m-v1.0" }, voice: null, speed: 1, fade_ms: 30, language: null }, audio_grace_ms: 350, idle_unload_minutes: 10 };

/** The voice, as a host and as the one call it starts: `start` records the halves and answers the call, whose `ready`
 *  resolves (or rejects with `startFails`) at once. */
function fakeVoice({ outcome = { status: "heard" } as Record<string, unknown>, startFails = null as unknown } = {}) {
  const on: Record<string, Set<(value: unknown) => void>> = { turn: new Set(), state: new Set(), error: new Set(), level: new Set(), take: new Set() };
  const calls: unknown[][] = [];
  const sub = (name: string) => (listener: (value: unknown) => void) => { on[name].add(listener); return () => on[name].delete(listener); };
  const voice = {
    calls, on,
    ready: Promise.resolve() as Promise<void>,
    emit: (name: string, value: unknown) => { for (const listener of [...on[name]]) listener(value); },
    start: (settings: unknown, options?: unknown) => {
      calls.push(options ? ["start", settings, options] : ["start", settings]);
      voice.ready = startFails ? Promise.reject(startFails) : Promise.resolve();
      voice.ready.catch(() => {});
      return voice;
    },
    stop: async () => { calls.push(["stop"]); },
    mute: (muted: boolean) => { calls.push(["mute", muted]); },
    endInput: async () => { calls.push(["endInput"]); },
    say: (text: string, options: unknown) => { calls.push(["say", text, options]); return { id: "s1", cancel: () => calls.push(["cancel"]), onEvent() {}, outcome: Promise.resolve(outcome) }; },
    onTurn: sub("turn"), onState: sub("state"), onError: sub("error"), onLevel: sub("level"), onTake: sub("take"),
  };
  return voice;
}
type Host = Parameters<typeof tryTranscription>[0];
type TranscriptionOptions = NonNullable<Parameters<typeof tryTranscription>[2]>;
const listeners = (voice: ReturnType<typeof fakeVoice>) => Object.values(voice.on).reduce((count, set) => count + set.size, 0);

/** A transcription try through `voice`, once the voice listens: what it comes to, and Stop. */
async function takeOn(voice: object, options: TranscriptionOptions & { settings?: unknown } = {}) {
  const finish = new AbortController();
  let listening = () => {};
  const listened = new Promise<void>((done) => { listening = done; });
  const heard = tryTranscription(voice as unknown as Host, (options.settings ?? SETTINGS) as never,
    { finish: finish.signal, ...options, onListening: () => { options.onListening?.(); listening(); } });
  heard.catch(() => {});
  await listened;
  return { heard, stop: () => finish.abort() };
}

test("the voice ending the person's turn on its own (its long pause) ends the take there: the try is that turn's words", async () => {
  const told: boolean[] = [];
  const voice = fakeVoice();
  const { heard } = await takeOn(voice, { onTranscribing: (on) => told.push(on) });
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  voice.emit("state", { listening: "speaking", recognising: 0 });
  // A pause within the turn ends nothing.
  voice.emit("state", { listening: "listening", recognising: 0 });
  expect(voice.calls).toEqual([["start", LISTENING]]);
  expect(told).toEqual([]);
  // Its end, decided by the voice: it says it transcribes, and asks the voice for nothing more.
  voice.emit("state", { listening: "listening", recognising: 1 });
  expect(voice.calls.at(-1)).toEqual(["start", LISTENING]);
  expect(told).toEqual([true]);
  voice.emit("turn", { phase: "finished", turn_id: "t1", text: " hola, ¿me oyes? " });
  await expect(heard).resolves.toBe("hola, ¿me oyes?");
  expect(voice.calls.at(-1)).toEqual(["stop"]);
  expect(told).toEqual([true]);
  expect(listeners(voice)).toBe(0);
  // A turn the voice ended that came to nothing (a cough) is the end too: nothing heard, its take there to hear why.
  const cough = fakeVoice();
  const nothing = await takeOn(cough);
  cough.emit("turn", { phase: "started", turn_id: "t1" });
  cough.emit("state", { listening: "listening", recognising: 1 });
  cough.emit("turn", { phase: "cancelled", turn_id: "t1", merged: false });
  await expect(nothing.heard).rejects.toMatchObject({ code: "trial-silence" });
  expect(cough.calls.slice(-2)).toEqual([["start", LISTENING], ["stop"]]);
});

test("nothing heard in time, a cancel, a voice error or a start that fails: each is the try's failure, and the voice stops", async () => {
  vi.useFakeTimers();
  const silent = fakeVoice();
  // A silent microphone: the longest take ends it, and nothing was heard, at once.
  const quiet = tryTranscription(silent as unknown as Host, SETTINGS as never, { timeoutMs: 1000, maxTakeMs: 100 });
  const failed = expect(quiet).rejects.toMatchObject({ code: "trial-silence" });
  await vi.advanceTimersByTimeAsync(100);
  await failed;
  expect(silent.calls.slice(-2)).toEqual([["endInput"], ["stop"]]);
  // A part the voice never tells once the take has ended: the try's own time limit.
  const stuck = fakeVoice();
  const late = tryTranscription(stuck as unknown as Host, SETTINGS as never, { timeoutMs: 1000, maxTakeMs: 100 });
  const timedOut = expect(late).rejects.toMatchObject({ code: "trial-silence" });
  await vi.advanceTimersByTimeAsync(0);
  stuck.emit("turn", { phase: "started", turn_id: "t1" });
  await vi.advanceTimersByTimeAsync(1100);
  await timedOut;
  expect(stuck.calls.at(-1)).toEqual(["stop"]);
  vi.useRealTimers();

  const abort = new AbortController();
  const cancelled = fakeVoice();
  const tried = tryTranscription(cancelled as unknown as Host, SETTINGS as never, { signal: abort.signal });
  await vi.waitFor(() => expect(cancelled.calls).toContainEqual(["start", LISTENING]));
  abort.abort();
  await expect(tried).rejects.toMatchObject({ code: "trial-cancelled" });

  const broken = fakeVoice();
  const erred = tryTranscription(broken as unknown as Host, SETTINGS as never);
  await vi.waitFor(() => expect(broken.calls).toContainEqual(["start", LISTENING]));
  broken.emit("error", { code: "model-load-failed" });
  await expect(erred).rejects.toMatchObject({ code: "model-load-failed" });

  const denied = fakeVoice({ startFails: { code: "microphone-denied" } });
  await expect(tryTranscription(denied as unknown as Host, SETTINGS as never)).rejects.toMatchObject({ code: "microphone-denied" });
  expect(denied.calls.at(-1)).toEqual(["stop"]);
  expect(listeners(denied)).toBe(0);
});

test("a stalled provider setup leaves preparing with an actionable error even when stopping also stalls", async () => {
  vi.useFakeTimers();
  const voice = fakeVoice();
  const start = voice.start;
  voice.start = (settings, options) => { start(settings, options); voice.ready = new Promise<void>(() => {}); return voice; };
  vi.spyOn(voice, "stop").mockImplementation(async () => new Promise<void>(() => {}));
  const result = tryTranscription(voice as unknown as Host, SETTINGS as never, { timeoutMs: 25, maxTakeMs: 100 });
  const failed = expect(result).rejects.toMatchObject({ code: "trial-preparation-timeout" });
  await vi.advanceTimersByTimeAsync(1125);
  await failed;
  expect(voice.calls).toEqual([["start", LISTENING]]);
});

test("a sentence said through the settings, in its language, heard to its end; cut short or failed, the try says why", async () => {
  const voice = fakeVoice();
  await expect(tryVoice(voice as unknown as Host, SETTINGS as never, "Hola", { language: "es" })).resolves.toMatchObject({ status: "heard" });
  expect(voice.calls).toEqual([["start", SPEAKING], ["say", "Hola", { language: "es" }], ["stop"]]);
  await expect(tryVoice(fakeVoice({ outcome: { status: "heard-up-to", heard_chars: 2, reason: "barge-in" } }) as unknown as Host, SETTINGS as never, "Hola"))
    .rejects.toMatchObject({ code: "trial-not-heard", detail: "barge-in" });
  await expect(tryVoice(fakeVoice({ outcome: { status: "not-played", reason: "failed", code: "credential-missing" } }) as unknown as Host, SETTINGS as never, "Hola"))
    .rejects.toMatchObject({ code: "credential-missing" });
});

// A call loads what its halves use, downloading what is not on disk: a voice try handed Smart's model fetched it behind the
// catalogue the page shows, and End of turn then offered a download that ended at once; one handed a microphone could be
// failed by a blocked one. It asks for the output half alone.
test("a voice try asks for the output half alone: no microphone, detector, transcriber or end-of-turn model, whatever the person's end of turn is", async () => {
  for (const turn of [{ end_of_turn: "smart-turn", patience: "calm", turn_model: "smart-turn-v3.2" }, { end_of_turn: "silence", patience: "fast" }, {}]) {
    const voice = fakeVoice();
    await tryVoice(voice as unknown as Host, { ...SETTINGS, ...turn } as never, "Hola");
    expect(voice.calls[0]).toEqual(["start", SPEAKING]);
    expect(voice.calls[0][1]).not.toHaveProperty("input");
  }
  // The person's chosen voice, pace and build are the speaker's; the language they hear in is what is said by default.
  const chosen = fakeVoice();
  await tryVoice(chosen as unknown as Host, { ...SETTINGS, stt: { ...SETTINGS.stt, language: "es" }, tts: { ...SETTINGS.tts, voice: "ef_dora", speed: 1.2, build: "kokoro/fp16" } } as never, "Hola");
  expect(chosen.calls[0]).toEqual(["start", { output: { tts: { catalog: "local", model: "kokoro-82m-v1.0", build: "kokoro/fp16" }, voice: "ef_dora", speed: 1.2, fade_ms: 30, language: "es" }, audio_grace_ms: 350, idle_unload_minutes: 10 }]);
});

test("a transcription try asks for the input half alone, with its own end of turn and the ordinary patience, whatever the person's are", async () => {
  for (const turn of [{ end_of_turn: "smart-turn", patience: "calm", turn_model: "smart-turn-v3" }, { end_of_turn: "silence", patience: "fast" }, {}]) {
    const voice = fakeVoice();
    const { heard } = await takeOn(voice, { settings: { ...SETTINGS, ...turn } });
    voice.emit("turn", { phase: "started", turn_id: "t1" });
    voice.emit("turn", { phase: "finished", turn_id: "t1", text: "hola" });
    await heard;
    expect(voice.calls[0]).toEqual(["start", LISTENING]);
    expect(voice.calls[0][1]).not.toHaveProperty("output");
  }
  // A language the person chose is the transcriber's.
  const spanish = fakeVoice();
  const { heard } = await takeOn(spanish, { settings: { ...SETTINGS, stt: { ...SETTINGS.stt, language: "es", build: "whisper-base/int8" } } });
  spanish.emit("turn", { phase: "finished", turn_id: "t1", text: "hola" });
  await heard;
  expect(spanish.calls[0]).toEqual(["start", { ...LISTENING, input: { ...LISTENING.input, stt: { ...SETTINGS.stt, language: "es", build: "whisper-base/int8" } } }]);
});

test("at the longest take, talking or not, the open turn ends there (endInput), what was said is the result", async () => {
  vi.useFakeTimers();
  const long = fakeVoice();
  const heard = tryTranscription(long as unknown as Host, SETTINGS as never, { maxTakeMs: 100 });
  await vi.advanceTimersByTimeAsync(0);
  long.emit("turn", { phase: "started", turn_id: "t1" });
  long.emit("state", { listening: "speaking", recognising: 0 });
  await vi.advanceTimersByTimeAsync(99);
  expect(long.calls).not.toContainEqual(["endInput"]);
  await vi.advanceTimersByTimeAsync(1);
  expect(long.calls.at(-1)).toEqual(["endInput"]);
  long.emit("turn", { phase: "finished", turn_id: "t1", text: " una frase muy larga " });
  await expect(heard).resolves.toBe("una frase muy larga");
  expect(long.calls.slice(-2)).toEqual([["endInput"], ["stop"]]);
  expect(long.calls).not.toContainEqual(["mute", true]);
  expect(listeners(long)).toBe(0);

  // Ended by the voice already, the longest take changes nothing: the voice is not asked to end it.
  const ended = fakeVoice();
  const said = tryTranscription(ended as unknown as Host, SETTINGS as never, { maxTakeMs: 100 });
  await vi.advanceTimersByTimeAsync(0);
  ended.emit("turn", { phase: "started", turn_id: "t1" });
  ended.emit("state", { listening: "listening", recognising: 1 });
  await vi.advanceTimersByTimeAsync(200);
  ended.emit("turn", { phase: "finished", turn_id: "t1", text: "una frase" });
  await expect(said).resolves.toBe("una frase");
  expect(ended.calls.filter(([name]) => name === "endInput")).toEqual([]);
});

test("Stop ends the take with what was said, and it is transcribed; with nothing said, nothing was heard; before the voice listens, or once the take has ended, Stop is a cancel", async () => {
  const spoken = fakeVoice();
  const { heard, stop } = await takeOn(spoken);
  spoken.emit("turn", { phase: "started", turn_id: "t1" });
  stop();
  // The turn is closed now, once, and the microphone stays unmuted.
  await vi.waitFor(() => expect(spoken.calls.at(-1)).toEqual(["endInput"]));
  spoken.emit("turn", { phase: "finished", turn_id: "t1", text: "hasta aquí" });
  await expect(heard).resolves.toBe("hasta aquí");
  expect(spoken.calls.filter(([name]) => name === "endInput")).toHaveLength(1);
  expect(spoken.calls.filter(([name]) => name === "mute")).toEqual([]);
  expect(spoken.calls.at(-1)).toEqual(["stop"]);

  // Recorded, with nothing said: the take is there to hear why.
  const quiet = fakeVoice();
  const nothing = await takeOn(quiet);
  nothing.stop();
  await expect(nothing.heard).rejects.toMatchObject({ code: "trial-silence" });
  expect(quiet.calls.slice(-2)).toEqual([["endInput"], ["stop"]]);

  let started = () => {};
  const loading = fakeVoice();
  const startLoading = loading.start;
  loading.start = (settings, options) => { startLoading(settings, options); loading.ready = new Promise<void>((done) => { started = done; }); return loading; };
  const early = new AbortController();
  const cancelled = tryTranscription(loading as unknown as Host, SETTINGS as never, { finish: early.signal });
  await vi.waitFor(() => expect(loading.calls).toContainEqual(["start", LISTENING]));
  early.abort();
  started();
  await expect(cancelled).rejects.toMatchObject({ code: "trial-cancelled" });
  expect(loading.calls.filter(([name]) => name === "endInput")).toEqual([]);
  expect(loading.calls.at(-1)).toEqual(["stop"]);

  const late = fakeVoice();
  const transcribing = await takeOn(late);
  late.emit("turn", { phase: "started", turn_id: "t1" });
  late.emit("state", { listening: "listening", recognising: 1 });
  transcribing.stop();
  await expect(transcribing.heard).rejects.toMatchObject({ code: "trial-cancelled" });
  // Its transcription already runs: Stop closes nothing.
  expect(late.calls).not.toContainEqual(["endInput"]);
});

test("Stop's endInput failing is the try's failure; the voice has the microphone unmuted all along", async () => {
  const voice = Object.assign(fakeVoice(), { endInput: async () => { throw Object.assign(new Error("gone"), { code: "voice-gone" }); } });
  const { heard, stop } = await takeOn(voice);
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  stop();
  await expect(heard).rejects.toMatchObject({ code: "voice-gone" });
  expect(voice.calls.filter(([name]) => name === "mute")).toEqual([]);
});

test("Stop says at once that the take has ended and is being transcribed, once", async () => {
  const told: boolean[] = [];
  const spoken = fakeVoice();
  const { heard, stop } = await takeOn(spoken, { onTranscribing: (on) => told.push(on) });
  spoken.emit("turn", { phase: "started", turn_id: "t1" });
  spoken.emit("state", { listening: "speaking", recognising: 0 });
  expect(told).toEqual([]);
  stop();
  expect(told).toEqual([true]);
  spoken.emit("state", { listening: "listening", recognising: 1 });
  spoken.emit("turn", { phase: "finished", turn_id: "t1", text: "hasta aquí" });
  await expect(heard).resolves.toBe("hasta aquí");
  expect(told).toEqual([true]);
});

test("a take ended by Stop whose turn comes to no words is nothing heard at once", async () => {
  const voice = fakeVoice();
  const { heard, stop } = await takeOn(voice);
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  stop();
  await vi.waitFor(() => expect(voice.calls.at(-1)).toEqual(["endInput"]));
  voice.emit("turn", { phase: "finished", turn_id: "t1", text: "  " });
  await expect(heard).rejects.toMatchObject({ code: "trial-silence" });
  expect(voice.calls.slice(-2)).toEqual([["endInput"], ["stop"]]);
});

test("a try says how long each phase took, once it is heard", async () => {

  const turns: Array<(turn: unknown) => void> = [];
  const voice = {
    start: () => voice, ready: Promise.resolve(), stop: async () => {}, mute: () => {},
    onTurn: (listener: (turn: unknown) => void) => { turns.push(listener); return () => {}; }, onError: () => () => {}, onState: () => () => {},
    say: () => {
      const events: Array<(event: { type: string }) => void> = [];
      setTimeout(() => events.forEach((listener) => listener({ type: "playing" })), 0);
      return { onEvent: (listener: (event: { type: string }) => void) => events.push(listener), outcome: new Promise((done) => setTimeout(() => done({ status: "heard" }), 5)), cancel() {} };
    },
  };
  const heard: unknown[] = [];
  const { heard: text } = await takeOn(voice, { onTimings: (timings: unknown) => heard.push(timings) });
  turns[0]({ phase: "finished", text: "hola", timings: { audio_ms: 1200, endpoint_silence_ms: 600, recognition_ms: 300 } });
  expect(await text).toBe("hola");
  // Its own times only: not the speech, nor the pause the take ended on.
  expect(heard[0]).toEqual({ ready_ms: expect.any(Number), recognition_ms: 300 });
  expect(typeof (heard[0] as { ready_ms: number }).ready_ms).toBe("number");
  const said: unknown[] = [];
  await tryVoice(voice as never, SETTINGS as never, "hola", { onTimings: (timings: unknown) => said.push(timings) });
  expect(typeof (said[0] as { first_sound_ms: number }).first_sound_ms).toBe("number");
});

test("while it runs a try tells how it goes: the voice listening and the microphone's level; the part of the sentence sounding", async () => {
  const voice = fakeVoice();
  const told: unknown[] = [];
  const { heard } = await takeOn(voice, { onListening: () => told.push("listening"), onLevel: (level: number) => told.push(level) });
  expect(told).toEqual(["listening"]);
  voice.emit("level", 0.4);
  voice.emit("turn", { phase: "finished", turn_id: "t1", text: "hola" });
  await heard;
  expect(told).toEqual(["listening", 0.4]);
  // Let go with the rest once heard.
  expect(voice.on.level.size).toBe(0);

  const steps: Array<(event: unknown) => void> = [];
  const said = Object.assign(fakeVoice(), { say: () => ({ id: "s1", cancel() {}, onEvent: (listener: (event: unknown) => void) => steps.push(listener),
    outcome: new Promise((done) => setTimeout(() => {
      for (const event of [{ type: "playing" }, { type: "progress", sounding: [0, 4], heard_chars: 0 }, { type: "progress", sounding: null, heard_chars: 4 }]) steps.forEach((listener) => listener(event));
      done({ status: "heard" });
    }, 0)) }) });
  const progress: unknown[] = [];
  await tryVoice(said as unknown as Host, SETTINGS as never, "Hola", { onProgress: (step: unknown) => progress.push(step) });
  // The first sound is the start of it.
  expect(progress).toEqual([{ sounding: null, heard_chars: 0 }, { sounding: [0, 4], heard_chars: 0 }, { sounding: null, heard_chars: 4 }]);
});

/* The end of turn tried: the voice listens until stopped, and tells the latest of the person's turns step by step. */

/** The halves a try of the end of turn asks for: the input alone, with the person's end of turn and patience. */
const HEARING = { input: { stt: SETTINGS.stt, endOfTurn: { kind: "silence" }, patience: "normal", ...TURNS }, idle_unload_minutes: 10 };

/** The voice's state as it tells it: whether it hears speech, and how many turns wait for or are in transcription. */
const callState = (listening: string, recognising = 0) => ({ listening, recognising, playback: "idle", microphone: "live" });

/** A try of the end of turn through `voice`, and the steps it told. */
function tryTurns(voice: ReturnType<typeof fakeVoice>, options: { quietMs?: number; signal?: AbortSignal; settings?: unknown } = {}) {
  const steps: TurnStep[] = [];
  const run = tryEndOfTurn(voice as unknown as Host, (options.settings ?? SETTINGS) as never, { ...options, onTurnStep: (step) => steps.push(step) });
  return { run, steps };
}

test("a try of the end of turn tells the turn as it goes: speaking, a pause within it, its end the moment it is decided, then its words and the silence the voice waited", async () => {
  const voice = fakeVoice();
  const { run, steps } = tryTurns(voice);
  await vi.waitFor(() => expect(steps).toEqual([{ step: "listening", again: false }]));
  expect(voice.calls).toEqual([["start", HEARING]]);
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
  expect(voice.calls).toEqual([["start", HEARING]]);
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
  const levels: number[] = [];
  const run = tryEndOfTurn(stopped as unknown as Host, SETTINGS as never, { signal: abort.signal, onLevel: (level) => levels.push(level) });
  await vi.waitFor(() => expect(stopped.calls).toContainEqual(["start", HEARING]));
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

test("other settings while it runs: the turn in progress is dropped, its call stops and another starts on them, listening again; the same ones change nothing", async () => {
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
  expect(voice.calls).toEqual([["start", HEARING], ["stop"], ["start", { ...HEARING, input: { ...HEARING.input, patience: "calm" } }]]);
  expect(steps.slice(1)).toEqual([{ step: "speaking" }, { step: "restarting" }, { step: "listening", again: true }]);
  await run.retune({ ...calm } as never);
  expect(voice.calls).toHaveLength(3);
  // Settings that change nothing the voice listens with (the speaker's, say) restart nothing either.
  await run.retune({ ...calm, tts: { ...calm.tts, speed: 1.3 } } as never);
  expect(voice.calls).toHaveLength(3);
  // Listening again, it follows the turns as before.
  voice.emit("turn", { phase: "started", turn_id: "t2" });
  expect(steps.at(-1)).toEqual({ step: "speaking" });
});

test("settings asked for while the voice starts are put in place once it has, the latest only", async () => {
  const voice = fakeVoice();
  let release = () => {};
  const start = voice.start;
  voice.start = (settings, options) => { start(settings, options); voice.ready = new Promise<void>((done) => { release = done; }); return voice; };
  const { run, steps } = tryTurns(voice);
  await vi.waitFor(() => expect(voice.calls).toContainEqual(["start", HEARING]));
  const fast = { ...SETTINGS, patience: "fast" }, smart = { ...SETTINGS, end_of_turn: "smart-turn" };
  void run.retune(fast as never);
  const latest = run.retune(smart as never);
  release();
  await vi.waitFor(() => expect(voice.calls).toHaveLength(3));
  release();
  await latest;
  expect(voice.calls).toEqual([["start", HEARING], ["stop"], ["start", { ...HEARING, input: { ...HEARING.input, endOfTurn: { kind: "smart" } } }]]);
  expect(steps).toEqual([{ step: "listening", again: true }]);
});

test.each(["stop", "start"])("cancelling during a pending restart %s leaves no recording or listeners after the try", async (pending) => {
  const voice = takingVoice();
  const abort = new AbortController();
  const takes: unknown[] = [];
  let release = () => {};
  let active = false;
  const originalStart = voice.start;
  const originalStop = voice.stop;
  let startCalls = 0;
  let stopCalls = 0;
  voice.start = (...asked: [unknown, unknown?]) => {
    startCalls++;
    originalStart(...asked);
    if (pending === "start" && startCalls === 2) voice.ready = new Promise<void>((done) => { release = done; });
    voice.ready = voice.ready.then(() => { active = true; });
    return voice;
  };
  voice.stop = async () => {
    stopCalls++;
    if (pending === "stop" && stopCalls === 1) await new Promise<void>((done) => { release = done; });
    await originalStop(); active = false;
  };
  const run = tryEndOfTurn(voice as unknown as Host, SETTINGS as never, { signal: abort.signal, onTake: (take) => takes.push(take) });
  await vi.waitFor(() => expect(active).toBe(true));
  const retuned = run.retune({ ...SETTINGS, patience: "calm" } as never);
  await vi.waitFor(() => expect(pending === "stop" ? stopCalls : startCalls).toBe(pending === "stop" ? 1 : 2));
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
  let stretch = 0;
  const start = voice.start;
  const take = (n: number) => ({ sampleRate: 16000, samples: new Float32Array(16 * n), started_at: 0, ended_at: n, turns: [] });
  return Object.assign(voice, {
    start: (settings: unknown, options?: unknown) => { stretch++; return start(settings, options); },
    stop: async () => { voice.calls.push(["stop"]); voice.emit("take", take(stretch * 100)); },
  });
}

test("a voice that hands a take is asked for one; the try hands it once the voice has stopped, and lets the voice go", async () => {
  const voice = takingVoice();
  const told: unknown[] = [];
  const { heard } = await takeOn(voice, { onTake: (take) => told.push(["take", take.ended_at]) });
  expect(voice.calls).toContainEqual(["start", LISTENING, { take: true }]);
  voice.emit("turn", { phase: "finished", turn_id: "t1", text: "hola" });
  await expect(heard).resolves.toBe("hola");
  expect(voice.calls).toEqual([["start", LISTENING, { take: true }], ["stop"]]);
  expect(told).toEqual([["take", 100]]);
  expect(listeners(voice)).toBe(0);
  // Not wanted, not asked for.
  const unwanted = takingVoice();
  const plain = await takeOn(unwanted);
  expect(unwanted.calls).toContainEqual(["start", LISTENING]);
  unwanted.emit("turn", { phase: "finished", turn_id: "t1", text: "hola" });
  await plain.heard;
  expect(unwanted.calls).toContainEqual(["start", LISTENING]);
  expect(unwanted.calls).not.toContainEqual(["start", LISTENING, { take: true }]);
  expect(listeners(unwanted)).toBe(0);
  // A try that fails still hands what was heard until then.
  const broken = takingVoice();
  const takes: unknown[] = [];
  const erred = tryTranscription(broken as unknown as Host, SETTINGS as never, { onTake: (take) => takes.push(take) });
  await vi.waitFor(() => expect(broken.calls).toContainEqual(["start", LISTENING, { take: true }]));
  broken.emit("error", { code: "transcription-failed" });
  await expect(erred).rejects.toMatchObject({ code: "transcription-failed" });
  expect(takes).toHaveLength(1);
});

test("the transcription take ends where the take was ended (its longest, Stop or the voice's own end of the turn), not where the voice, still recording while it transcribed, stopped", async () => {
  vi.useFakeTimers({ now: 1_000_000 });
  const voice = takingVoice();
  const turn = { turn_id: "t1", speech_ms: 300, pauses: [], end_ms: 2000 };
  // Three seconds recorded from where it listened: two of the take, then one recorded while the voice transcribed.
  Object.assign(voice, { stop: async () => { voice.calls.push(["stop"]); voice.emit("take", { sampleRate: 16000, samples: new Float32Array(48000).fill(0.1), started_at: 1_000_000, ended_at: 1_003_000, turns: [turn] }); } });
  const takes: Array<{ samples: Float32Array; started_at: number; ended_at: number; turns: unknown[] }> = [];
  const heard = tryTranscription(voice as unknown as Host, SETTINGS as never, { maxTakeMs: 2000, onTake: (take) => takes.push(take) });
  await vi.advanceTimersByTimeAsync(0);
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  await vi.advanceTimersByTimeAsync(2000);
  expect(voice.calls.at(-1)).toEqual(["endInput"]);
  await vi.advanceTimersByTimeAsync(1000);
  voice.emit("turn", { phase: "finished", turn_id: "t1", text: "hola" });
  await expect(heard).resolves.toBe("hola");
  expect(takes).toHaveLength(1);
  expect(takes[0].samples.length).toBe(32000);
  expect(takes[0]).toMatchObject({ started_at: 1_000_000, ended_at: 1_002_000, turns: [turn] });
  // Ended by the voice's own end of the turn, 1.5 s in: cut there.
  const own = takingVoice();
  Object.assign(own, { stop: async () => { own.calls.push(["stop"]); own.emit("take", { sampleRate: 16000, samples: new Float32Array(48000), started_at: 1_003_000, ended_at: 1_006_000, turns: [] }); } });
  const cut = tryTranscription(own as unknown as Host, SETTINGS as never, { maxTakeMs: 2000, onTake: (take) => takes.push(take) });
  await vi.advanceTimersByTimeAsync(0);
  own.emit("turn", { phase: "started", turn_id: "t1" });
  await vi.advanceTimersByTimeAsync(1500);
  own.emit("state", { listening: "listening", recognising: 1 });
  await vi.advanceTimersByTimeAsync(1500);
  own.emit("turn", { phase: "finished", turn_id: "t1", text: "adiós" });
  await expect(cut).resolves.toBe("adiós");
  expect(takes[1].samples.length).toBe(24000);
  expect(takes[1].ended_at).toBe(1_004_500);
});

test("the end of turn tried: the take since the voice last started to listen, once it stops; what it heard before other settings goes with them", async () => {
  const voice = takingVoice();
  const takes: number[] = [];
  const abort = new AbortController();
  const run = tryEndOfTurn(voice as unknown as Host, SETTINGS as never, { signal: abort.signal, onTake: (take) => takes.push(take.ended_at) });
  await vi.waitFor(() => expect(voice.calls).toContainEqual(["start", HEARING, { take: true }]));
  const calm = { ...SETTINGS, patience: "calm" };
  await run.retune(calm as never);
  expect(voice.calls).toEqual([["start", HEARING, { take: true }], ["stop"], ["start", { ...HEARING, input: { ...HEARING.input, patience: "calm" } }, { take: true }]]);
  expect(takes).toEqual([]);
  abort.abort();
  await expect(run.done).rejects.toMatchObject({ code: "trial-cancelled" });
  expect(takes).toEqual([200]);
  expect(listeners(voice)).toBe(0);
});

/* Closing a take: the microphone is fenced off first, the open turn is closed once, and whatever goes wrong with either
 * is the try's failure — never silence — with the voice stopped all the same. */

const fenced = (voice: ReturnType<typeof fakeVoice>) => async () => { await Promise.resolve(); voice.calls.push(["fence"]); };
const names = (voice: ReturnType<typeof fakeVoice>) => voice.calls.map(([name]) => name);

test("Stop fences the microphone off before it closes the turn, so speech after Stop cannot join the words", async () => {
  // A microphone that goes on giving speech: a turn B opens after Stop unless the fence is up when Stop closes A.
  const voice = fakeVoice();
  let microphone = true;
  const fence = async () => { await Promise.resolve(); microphone = false; voice.calls.push(["fence"]); };
  Object.assign(voice, { endInput: async () => {
    voice.calls.push(["endInput", microphone]);
    voice.emit("turn", { phase: "finished", turn_id: "t1", text: "before Stop" });
  } });
  const { heard, stop } = await takeOn(voice, { fence });
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  stop();
  await expect(heard).resolves.toBe("before Stop");
  // The turn closed with the microphone already fenced; nothing opened after it could reach the result.
  expect(voice.calls.filter(([name]) => name === "endInput")).toEqual([["endInput", false]]);
  expect(names(voice).slice(-3)).toEqual(["fence", "endInput", "stop"]);
});

test("the longest take and a Stop after it close the take once, fenced once", async () => {
  vi.useFakeTimers();
  const voice = fakeVoice();
  const finish = new AbortController();
  const heard = tryTranscription(voice as unknown as Host, SETTINGS as never, { maxTakeMs: 100, finish: finish.signal, fence: fenced(voice) });
  heard.catch(() => {});
  await vi.advanceTimersByTimeAsync(0);
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  await vi.advanceTimersByTimeAsync(100);
  // Stop once the take has ended is a cancel, and closes nothing again.
  finish.abort();
  await expect(heard).rejects.toMatchObject({ code: "trial-cancelled" });
  expect(names(voice).filter((name) => name === "fence" || name === "endInput")).toEqual(["fence", "endInput"]);
});

test("the voice ending the person's turn on its own fences the microphone off too, and closes nothing", async () => {
  const voice = fakeVoice();
  const { heard } = await takeOn(voice, { fence: fenced(voice) });
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  voice.emit("state", { listening: "listening", recognising: 1 });
  voice.emit("state", { listening: "listening", recognising: 1 });
  voice.emit("turn", { phase: "finished", turn_id: "t1", text: "solo" });
  await expect(heard).resolves.toBe("solo");
  expect(names(voice).filter((name) => name === "fence")).toEqual(["fence"]);
  expect(names(voice)).not.toContain("endInput");
});

test("a voice without endInput, or whose endInput throws or refuses, fails the try by a code and still stops", async () => {
  const missing = fakeVoice();
  delete (missing as { endInput?: unknown }).endInput;
  const lacking = await takeOn(missing);
  missing.emit("turn", { phase: "started", turn_id: "t1" });
  lacking.stop();
  await expect(lacking.heard).rejects.toMatchObject({ code: "voice-module-unavailable" });
  expect(missing.calls.at(-1)).toEqual(["stop"]);
  expect(listeners(missing)).toBe(0);

  const throwing = Object.assign(fakeVoice(), { endInput: () => { throw Object.assign(new Error("gone"), { code: "audio-device-unavailable" }); } });
  const thrown = await takeOn(throwing);
  throwing.emit("turn", { phase: "started", turn_id: "t1" });
  thrown.stop();
  await expect(thrown.heard).rejects.toMatchObject({ code: "audio-device-unavailable" });
  expect(throwing.calls.at(-1)).toEqual(["stop"]);

  // A failure with no code of its own is the transcription's.
  const plain = Object.assign(fakeVoice(), { endInput: () => { throw new Error("boom"); } });
  const bare = await takeOn(plain);
  plain.emit("turn", { phase: "started", turn_id: "t1" });
  bare.stop();
  await expect(bare.heard).rejects.toMatchObject({ code: "transcription-failed" });

  // An endInput that returns nothing is an acknowledgement all the same.
  const undefinedReturn = Object.assign(fakeVoice(), { endInput: () => undefined });
  const quiet = await takeOn(undefinedReturn);
  quiet.stop();
  await expect(quiet.heard).rejects.toMatchObject({ code: "trial-silence" });
  expect(undefinedReturn.calls.at(-1)).toEqual(["stop"]);
});

test("a refusal of endInput on a take with no turn is the refusal, not silence; a fence that fails is too", async () => {
  const refusing = Object.assign(fakeVoice(), { endInput: async () => { throw Object.assign(new Error("gone"), { code: "device-gone" }); } });
  const quiet = await takeOn(refusing);
  quiet.stop();
  await expect(quiet.heard).rejects.toMatchObject({ code: "device-gone" });
  expect(refusing.calls.at(-1)).toEqual(["stop"]);

  const unrouted = fakeVoice();
  const failing = await takeOn(unrouted, { fence: async () => { throw Object.assign(new Error("no route"), { code: "audio-failed" }); } });
  unrouted.emit("turn", { phase: "started", turn_id: "t1" });
  failing.stop();
  await expect(failing.heard).rejects.toMatchObject({ code: "audio-failed" });
  expect(names(unrouted)).not.toContain("endInput");
  expect(unrouted.calls.at(-1)).toEqual(["stop"]);
});

test("leaving a try with a turn open (abort, replacement, Settings closed) closes it once and keeps the cancellation", async () => {
  const voice = fakeVoice();
  const abort = new AbortController();
  const tried = tryTranscription(voice as unknown as Host, SETTINGS as never, { signal: abort.signal, fence: fenced(voice) });
  await vi.waitFor(() => expect(voice.calls).toContainEqual(["start", LISTENING]));
  await new Promise((done) => setTimeout(done, 0));
  voice.emit("turn", { phase: "started", turn_id: "t1" });
  abort.abort();
  await expect(tried).rejects.toMatchObject({ code: "trial-cancelled" });
  expect(names(voice).slice(-3)).toEqual(["fence", "endInput", "stop"]);

  // Closing fails, or never answers: the voice stops all the same, with the cancellation as the result.
  for (const endInput of [async () => { throw new Error("gone"); }, () => new Promise<void>(() => {})]) {
    vi.useFakeTimers();
    const stuck = Object.assign(fakeVoice(), { endInput });
    const gone = new AbortController();
    const result = tryTranscription(stuck as unknown as Host, SETTINGS as never, { signal: gone.signal });
    const cancelled = expect(result).rejects.toMatchObject({ code: "trial-cancelled" });
    await vi.advanceTimersByTimeAsync(0);
    stuck.emit("turn", { phase: "started", turn_id: "t1" });
    gone.abort();
    await vi.advanceTimersByTimeAsync(1100);
    await cancelled;
    expect(stuck.calls.at(-1)).toEqual(["stop"]);
    expect(listeners(stuck)).toBe(0);
    vi.useRealTimers();
  }

  // No turn open, a start that never listened, a take the voice already ended: nothing to close.
  const idle = fakeVoice();
  const idleAbort = new AbortController();
  const idled = tryTranscription(idle as unknown as Host, SETTINGS as never, { signal: idleAbort.signal });
  await vi.waitFor(() => expect(idle.calls).toContainEqual(["start", LISTENING]));
  idleAbort.abort();
  await expect(idled).rejects.toMatchObject({ code: "trial-cancelled" });
  const ending = fakeVoice();
  const own = await takeOn(ending);
  ending.emit("turn", { phase: "started", turn_id: "t1" });
  ending.emit("state", { listening: "listening", recognising: 1 });
  own.stop();
  await expect(own.heard).rejects.toMatchObject({ code: "trial-cancelled" });
  for (const voice of [idle, ending]) expect(names(voice)).not.toContain("endInput");
});

test("an error of the voice racing Stop or the longest take keeps the error and closes the take once", async () => {
  const speaking = fakeVoice();
  const { heard } = await takeOn(speaking);
  speaking.emit("turn", { phase: "started", turn_id: "t1" });
  speaking.emit("error", { code: "microphone-lost" });
  await expect(heard).rejects.toMatchObject({ code: "microphone-lost" });
  expect(names(speaking).filter((name) => name === "endInput")).toHaveLength(1);
  expect(speaking.calls.at(-1)).toEqual(["stop"]);

  const racing = fakeVoice();
  const stopping = await takeOn(racing);
  racing.emit("turn", { phase: "started", turn_id: "t1" });
  stopping.stop();
  racing.emit("error", { code: "microphone-lost" });
  await expect(stopping.heard).rejects.toMatchObject({ code: "microphone-lost" });
  expect(names(racing).filter((name) => name === "endInput")).toHaveLength(1);
  expect(racing.calls.at(-1)).toEqual(["stop"]);
});
