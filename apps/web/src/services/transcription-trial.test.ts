import { describe, expect, it, vi } from "vitest";
import {
  TRIAL_MAX_SAMPLES,
  TRIAL_MIN_AUDIBLE_SAMPLES,
  TRANSCRIPTION_TRIAL_PATH,
  TranscriptionTrialError,
  pinTrialProviderRequest,
  transcriptionTrial,
  type TranscriptionTrialDependencies,
  type TranscriptionTrialOptions,
  type TrialBuild,
} from "./transcription-trial";

const checkedBuild: TrialBuild = { model: "whisper-small", engine: "transformers-js", accelerator: "wasm", native: false };

function fakeStream() {
  const track = { stopped: false, stop() { this.stopped = true; } };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  return { track, stream: stream as unknown as MediaStream };
}

function createHarness(overrides: Partial<TranscriptionTrialDependencies> = {}) {
  const { track, stream } = fakeStream();
  const calls: string[] = [];
  let worklet: FakeWorkletNode | null = null;
  let audioContextClosed = false;
  let contextCreations = 0;
  let acquired = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let timerId = 0;
  const worker = new FakeWorker(calls, () => track.stopped);
  const context = {
    state: "running",
    destination: {},
    audioWorklet: { addModule: async(url: string) => { calls.push(`worklet:${url}`); } },
    createMediaStreamSource: () => ({ connect() { calls.push("source:connect"); }, disconnect() { calls.push("source:disconnect"); } }),
    resume: async() => undefined,
    close: async() => { audioContextClosed = true; (context as any).state = "closed"; calls.push("context:close"); },
  } as unknown as AudioContext;
  const deps: TranscriptionTrialDependencies = {
    acquireMicrophone: async() => { acquired++; calls.push("mic:acquire"); return stream; },
    createAudioContext: () => { contextCreations++; return context; },
    createWorkletNode: () => { worklet = new FakeWorkletNode(calls); return worklet as unknown as AudioWorkletNode; },
    captureProviderRequest: () => async(path, init) => {
      calls.push(`provider:${path}`);
      expect(track.stopped).toBe(true);
      if (init.redirect !== "error") throw Error("redirects were allowed");
      const request = JSON.parse(String(init.body));
      calls.push(`provider-body:${request.audio.data_base64.length}`);
      return { ok: true, status: 200, json: async() => ({ text: "recognized words from the selected model" }) } as Response;
    },
    resolveDeviceBuild: () => checkedBuild,
    openWorker: () => worker as unknown as Worker,
    releaseDeviceBuild: () => { calls.push("build:release"); },
    now: () => 1,
    setTimer: callback => {
      const id = ++timerId;
      timers.set(id, { callback, delay: 0 });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: timer => { timers.delete(timer as unknown as number); },
    workerTimeoutMs: 30_000,
    providerTimeoutMs: 30_000,
    ...overrides,
  };
  return {
    deps,
    calls,
    worker,
    track,
    stream,
    get worklet() { return worklet; },
    get audioContextClosed() { return audioContextClosed; },
    get contextCreations() { return contextCreations; },
    get acquired() { return acquired; },
    runTimer(delay: number) {
      const current = [...timers.entries()].find(([, timer]) => timer.delay === delay);
      if (!current) throw Error(`No timer with delay ${delay}`);
      const [id, timer] = current;
      timers.delete(id);
      timer.callback();
    },
  };
}

class FakeWorkletNode {
  port: { onmessage: ((event: MessageEvent) => void) | null } = { onmessage: null };
  onprocessorerror: (() => void) | null = null;
  disconnected = false;
  constructor(private calls: string[]) {}
  connect() { this.calls.push("worklet:connect"); }
  disconnect() { this.disconnected = true; this.calls.push("worklet:disconnect"); }
  emit(samples: Int16Array) {
    this.port.onmessage?.({ data: samples.slice().buffer } as MessageEvent);
  }
  fail() { this.onprocessorerror?.(); }
}

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  responseText = "recognized words from the selected model";
  transcribeAnswer: "now" | "hold" = "now";
  constructor(private calls: string[], private micStopped: () => boolean) {}
  postMessage(message: any) {
    this.calls.push(`worker:${message.type}`);
    if (message.type === "transcribe") expect(this.micStopped()).toBe(true);
    if (message.type === "transcribe" && this.transcribeAnswer === "hold") return;
    queueMicrotask(() => this.onmessage?.({ data: message.type === "load"
      ? { id: message.id, type: "ready", runtime: checkedBuild }
      : { id: message.id, type: "result", result: { text: this.responseText } } } as MessageEvent));
  }
  terminate() { this.terminated = true; this.calls.push("worker:terminate"); }
}

function localOptions(signal?: AbortSignal, extra: Partial<TranscriptionTrialOptions> = {}): TranscriptionTrialOptions {
  return { hostFp: "host-a", stage: { place: "device", model: checkedBuild.model, options: { language: "auto" }, build: checkedBuild }, signal, ...extra };
}

function speechFrame() { return new Int16Array(320).fill(1400); }

async function captureSpeech(handle: ReturnType<typeof transcriptionTrial>, harness: ReturnType<typeof createHarness>, frames = 13) {
  await handle.ready;
  for (let index = 0; index < frames; index++) harness.worklet!.emit(speechFrame());
}

describe("standalone transcription trial", () => {
  it("finishes one real capture into the checked local worker and releases the mic before transcription", async() => {
    const harness = createHarness();
    const callWorker = { onmessage: vi.fn(), onerror: vi.fn(), postMessage: vi.fn(), terminate: vi.fn() };
    const sentinel = callWorker.onmessage;
    const handle = transcriptionTrial(localOptions(), {
      ...harness.deps,
      openWorker: () => harness.worker as unknown as Worker,
    });

    await captureSpeech(handle, harness);
    handle.finish();
    await expect(handle.result).resolves.toEqual({ text: "recognized words from the selected model" });

    expect(harness.calls).toContain("worker:load");
    expect(harness.calls).toContain("worker:transcribe");
    expect(harness.calls.indexOf("context:close")).toBeLessThan(harness.calls.indexOf("worker:transcribe"));
    expect(harness.calls).toContain("build:release");
    expect(harness.track.stopped).toBe(true);
    expect(harness.audioContextClosed).toBe(true);
    expect(harness.worklet!.disconnected).toBe(true);
    expect(callWorker.onmessage).toBe(sentinel);
    expect(callWorker.postMessage).not.toHaveBeenCalled();
    expect(callWorker.terminate).not.toHaveBeenCalled();
    expect(harness.calls.some(call => /socket|agent|history|conversation/i.test(call))).toBe(false);
  });

  it("uses the explicit host fingerprint route and posts only finite 16 kHz PCM", async() => {
    const harness = createHarness();
    let hostFp = "";
    let path = "";
    let captured: any;
    const handle = transcriptionTrial({ hostFp: "host-a", stage: { place: "openai", model: "gpt-4o-transcribe",
      options: { language: "auto", context: "terminal errors" } } }, {
      ...harness.deps,
      captureProviderRequest: fp => {
        hostFp = fp;
        return async(requestPath, init) => {
          path = requestPath;
          captured = JSON.parse(String(init.body));
          expect(harness.track.stopped).toBe(true);
          return { ok: true, status: 200, json: async() => ({ text: "recognized words from the selected model" }) } as Response;
        };
      },
    });
    await captureSpeech(handle, harness);
    handle.finish();
    await expect(handle.result).resolves.toMatchObject({ text: "recognized words from the selected model" });

    expect(hostFp).toBe("host-a");
    expect(path).toBe(TRANSCRIPTION_TRIAL_PATH);
    expect(captured).toMatchObject({ place: "openai", model: "gpt-4o-transcribe",
      options: { language: "auto", context: "terminal errors" },
      audio: { encoding: "pcm_s16le", sample_rate: 16_000 } });
    const decoded = Buffer.from(captured.audio.data_base64, "base64");
    expect(decoded.length).toBe(13 * 320 * 2);
    expect(decoded.length).toBeGreaterThanOrEqual(TRIAL_MIN_AUDIBLE_SAMPLES * 2);
    expect(captured.audio.data_base64.length).toBeLessThan(512 * 1024);
    expect(harness.calls).not.toContain("worker:load");
    expect(harness.track.stopped).toBe(true);
  });

  it("pins the verified route and bearer token to the requested selected host", async() => {
    let selected = "host-a";
    let pairingToken = "token-a";
    const fetcher = vi.fn(async() => ({ ok: true, status: 200, json: async() => ({ text: "ok" }) } as Response));
    const request = pinTrialProviderRequest({ requestedFp: "host-a", selectedFp: "host-a", pairingFp: "host-a",
      base: "https://host-a.example", token: "token-a", verified: true,
      isCurrent: () => selected === "host-a" && pairingToken === "token-a", fetcher });
    await request(TRANSCRIPTION_TRIAL_PATH, { method: "POST", redirect: "follow" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://host-a.example${TRANSCRIPTION_TRIAL_PATH}`);
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token-a");

    pairingToken = "replacement-token";
    await expect(request(TRANSCRIPTION_TRIAL_PATH, { method: "POST" })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    selected = "host-b";
    await expect(request(TRANSCRIPTION_TRIAL_PATH, { method: "POST" })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(() => pinTrialProviderRequest({ requestedFp: "host-a", selectedFp: "host-b", pairingFp: "host-a",
      base: "https://host-b.example", token: "token-b", verified: true, isCurrent: () => true, fetcher }))
      .toThrowError(TranscriptionTrialError);
  });

  it("keeps Finish speaking distinct from Cancel and does not submit a short sample", async() => {
    const harness = createHarness();
    const provider = vi.fn(async() => ({ ok: true, status: 200, json: async() => ({ text: "should not be sent" }) } as Response));
    const handle = transcriptionTrial({ hostFp: "host-a", stage: { place: "openai", model: "gpt-4o-transcribe" } }, {
      ...harness.deps,
      captureProviderRequest: () => provider,
    });
    await handle.ready;
    for (let index = 0; index < 5; index++) harness.worklet!.emit(speechFrame());
    handle.finish();
    await expect(handle.result).rejects.toMatchObject({ key: "trial.silent" });
    expect(provider).not.toHaveBeenCalled();
    expect(harness.track.stopped).toBe(true);
    expect(harness.audioContextClosed).toBe(true);

    const cancelled = createHarness();
    const request = vi.fn(async() => ({ ok: true, status: 200, json: async() => ({ text: "late" }) } as Response));
    const trial = transcriptionTrial({ hostFp: "host-a", stage: { place: "openai", model: "gpt-4o-transcribe" } }, {
      ...cancelled.deps,
      captureProviderRequest: () => request,
    });
    await trial.ready;
    for (let index = 0; index < 13; index++) cancelled.worklet!.emit(speechFrame());
    trial.cancel();
    await expect(trial.result).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
    expect(cancelled.track.stopped).toBe(true);
    expect(cancelled.audioContextClosed).toBe(true);
  });

  it("maps permission denial and silence to keyed failures with complete capture cleanup", async() => {
    const denied = createHarness({ acquireMicrophone: async() => { throw new DOMException("permission", "NotAllowedError"); } });
    const deniedTrial = transcriptionTrial(localOptions(), denied.deps);
    await expect(deniedTrial.result).rejects.toMatchObject({ key: "trial.mic_denied" });
    await expect(deniedTrial.ready).rejects.toMatchObject({ key: "trial.mic_denied" });
    expect(denied.contextCreations).toBe(0);

    const silent = createHarness();
    const trial = transcriptionTrial(localOptions(), silent.deps);
    await trial.ready;
    for (let index = 0; index < 14; index++) silent.worklet!.emit(new Int16Array(320));
    trial.finish();
    await expect(trial.result).rejects.toMatchObject({ key: "trial.silent" });
    expect(silent.track.stopped).toBe(true);
    expect(silent.audioContextClosed).toBe(true);
    expect(silent.calls).not.toContain("worker:load");
  });

  it("stops a microphone that resolves after Cancel before making an audio graph", async() => {
    let resolveMic!: (stream: MediaStream) => void;
    const pending = new Promise<MediaStream>(resolve => { resolveMic = resolve; });
    const harness = createHarness({ acquireMicrophone: () => pending });
    const controller = new AbortController();
    const trial = transcriptionTrial(localOptions(controller.signal), harness.deps);
    controller.abort();
    await expect(trial.result).rejects.toMatchObject({ name: "AbortError" });
    resolveMic(harness.stream);
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.track.stopped).toBe(true);
    expect(harness.contextCreations).toBe(0);
    expect(harness.calls).not.toContain("worker:load");
  });

  it("cancels local worker inference for an STT stage edit without touching a call worker", async() => {
    const harness = createHarness();
    harness.worker.transcribeAnswer = "hold";
    const callHandler = vi.fn();
    const callWorker = { onmessage: callHandler, onerror: null };
    const trial = transcriptionTrial(localOptions(), {
      ...harness.deps,
      openWorker: () => harness.worker as unknown as Worker,
    });
    await captureSpeech(trial, harness);
    trial.finish();
    await vi.waitFor(() => expect(harness.calls).toContain("worker:transcribe"));
    trial.cancel();
    await expect(trial.result).rejects.toMatchObject({ name: "AbortError" });
    expect(harness.worker.terminated).toBe(true);
    expect(callWorker.onmessage).toBe(callHandler);
    expect(harness.track.stopped).toBe(true);
    expect(harness.audioContextClosed).toBe(true);
  });

  it("finishes automatically after post-speech silence and caps capture at ten seconds", async() => {
    const timerCalls: { callback: () => void; delay: number }[] = [];
    const trialHarness = createHarness({
      setTimer: (callback, delay) => {
        timerCalls.push({ callback, delay });
        return timerCalls.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => undefined,
    });
    const trial = transcriptionTrial(localOptions(), trialHarness.deps);
    await captureSpeech(trial, trialHarness);
    const silence = timerCalls.find(timer => timer.delay === 800);
    expect(silence).toBeDefined();
    silence!.callback();
    await expect(trial.result).resolves.toMatchObject({ text: "recognized words from the selected model" });
    expect(trialHarness.track.stopped).toBe(true);

    const cappedTimers: { callback: () => void; delay: number }[] = [];
    const capped = createHarness({
      setTimer: (callback, delay) => { cappedTimers.push({ callback, delay }); return cappedTimers.length as unknown as ReturnType<typeof setTimeout>; },
      clearTimer: () => undefined,
    });
    const cappedTrial = transcriptionTrial(localOptions(), capped.deps);
    await cappedTrial.ready;
    for (let index = 0; index < TRIAL_MAX_SAMPLES / 320; index++) capped.worklet!.emit(speechFrame());
    const cap = cappedTimers.find(timer => timer.delay === 10_000);
    expect(cap).toBeDefined();
    cap!.callback();
    await expect(cappedTrial.result).resolves.toMatchObject({ text: "recognized words from the selected model" });
    expect(capped.calls).toContain("worker:transcribe");
  });

  it("does not accept unusable local text or unavailable places", async() => {
    const punctuation = createHarness();
    punctuation.worker.responseText = "...";
    const punctuationTrial = transcriptionTrial(localOptions(), punctuation.deps);
    await captureSpeech(punctuationTrial, punctuation);
    punctuationTrial.finish();
    await expect(punctuationTrial.result).rejects.toMatchObject({ key: "trial.unusable" });

    const repeated = createHarness();
    repeated.worker.responseText = "aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const trial = transcriptionTrial(localOptions(), repeated.deps);
    await captureSpeech(trial, repeated);
    trial.finish();
    await expect(trial.result).rejects.toMatchObject({ key: "trial.unusable" });

    let unavailable: unknown;
    try { transcriptionTrial({ hostFp: "host-a", stage: { place: "host", model: "model" } }, repeated.deps); }
    catch (error) { unavailable = error; }
    expect(unavailable).toBeInstanceOf(TranscriptionTrialError);
    expect(unavailable).toMatchObject({ key: "trial.place_unavailable" });

    const overContext = createHarness();
    expect(() => transcriptionTrial({ hostFp: "host-a", stage: { place: "openai", model: "gpt-4o-transcribe",
      options: { context: "x".repeat(401) } } }, overContext.deps)).toThrowError(TranscriptionTrialError);
    expect(overContext.acquired).toBe(0);
  });

  it("aborts an in-flight provider request and ignores its late answer", async() => {
    const harness = createHarness();
    const requestSignal: { value: AbortSignal | null } = { value: null };
    let resolvePending!: (response: Response) => void;
    const pendingRequest = vi.fn((_path: string, init: RequestInit) => new Promise<Response>(resolve => {
      const signal = init.signal as AbortSignal;
      requestSignal.value = signal;
      // This transport ignores abort and eventually delivers its response. The trial must still discard it.
      resolvePending = resolve;
    }));
    const trial = transcriptionTrial({ hostFp: "host-a", stage: { place: "openai", model: "gpt-4o-transcribe" } }, {
      ...harness.deps,
      captureProviderRequest: () => pendingRequest,
    });
    await captureSpeech(trial, harness);
    trial.finish();
    await vi.waitFor(() => expect(pendingRequest).toHaveBeenCalledOnce());
    trial.cancel();
    await expect(trial.result).rejects.toMatchObject({ name: "AbortError" });
    expect(requestSignal.value?.aborted).toBe(true);
    const json = vi.fn(async() => ({ text: "late answer must not escape" }));
    resolvePending({ ok: true, status: 200, json } as unknown as Response);
    await Promise.resolve();
    await Promise.resolve();
    expect(json).not.toHaveBeenCalled();
    expect(harness.track.stopped).toBe(true);
    expect(harness.audioContextClosed).toBe(true);
  });

  it("bounds provider inference even when the host never settles", async() => {
    let timeout: (() => void) | null = null;
    const requestSignal: { value: AbortSignal | null } = { value: null };
    const harness = createHarness({
      setTimer: (callback, delay) => {
        if (delay === 30_000) timeout = callback;
        return delay as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => undefined,
    });
    const request = vi.fn((_path: string, init: RequestInit) => {
      requestSignal.value = init.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    });
    const trial = transcriptionTrial({ hostFp: "host-a", stage: { place: "openai", model: "gpt-4o-transcribe" } }, {
      ...harness.deps,
      captureProviderRequest: () => request,
    });
    await trial.ready;
    for (let index = 0; index < 13; index++) harness.worklet!.emit(speechFrame());
    trial.finish();
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(timeout).toBeTypeOf("function");
    timeout!();
    await expect(trial.result).rejects.toMatchObject({ key: "trial.stt_failed" });
    expect(requestSignal.value?.aborted).toBe(true);
    expect(harness.track.stopped).toBe(true);
  });

  it("cancels while a provider response body is still being read", async() => {
    const harness = createHarness();
    let resolveBody!: (value: { text: string }) => void;
    const json = vi.fn(() => new Promise<{ text: string }>(resolve => { resolveBody = resolve; }));
    const trial = transcriptionTrial({ hostFp: "host-a", stage: { place: "openai", model: "gpt-4o-transcribe" } }, {
      ...harness.deps,
      captureProviderRequest: () => async() => ({ ok: true, status: 200, json } as unknown as Response),
    });
    await captureSpeech(trial, harness);
    trial.finish();
    await vi.waitFor(() => expect(json).toHaveBeenCalledOnce());
    trial.cancel();
    await expect(trial.result).rejects.toMatchObject({ name: "AbortError" });
    resolveBody({ text: "late body must not escape" });
    await Promise.resolve();
    expect(harness.track.stopped).toBe(true);
    expect(harness.audioContextClosed).toBe(true);
  });

  it("invalidates a selected-host route captured before speech if that host is switched", async() => {
    const harness = createHarness();
    let selected = "host-a";
    const fetcher = vi.fn(async() => ({ ok: true, status: 200, json: async() => ({ text: "late host result" }) } as Response));
    const trial = transcriptionTrial({ hostFp: "host-a", stage: { place: "openai", model: "gpt-4o-transcribe" } }, {
      ...harness.deps,
      captureProviderRequest: fp => pinTrialProviderRequest({ requestedFp: fp, selectedFp: "host-a", pairingFp: fp,
        base: "https://host-a.example", token: "token-a", verified: true, isCurrent: () => selected === fp, fetcher }),
    });
    await trial.ready;
    for (let index = 0; index < 13; index++) harness.worklet!.emit(speechFrame());
    selected = "host-b";
    trial.finish();
    await expect(trial.result).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(harness.track.stopped).toBe(true);
    expect(harness.audioContextClosed).toBe(true);
  });
});
