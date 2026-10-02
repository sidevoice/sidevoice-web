/** A finite microphone sample for one already checked transcription stage. This service owns its
 * audio graph and worker lease; it never uses the room socket or the worker serving a call. */

export const TRANSCRIPTION_TRIAL_PATH = "/api/models/transcription/preview";
export const TRIAL_SAMPLE_RATE = 16_000;
export const TRIAL_MAX_SAMPLES = 10 * TRIAL_SAMPLE_RATE;
export const TRIAL_MIN_AUDIBLE_SAMPLES = Math.round(0.25 * TRIAL_SAMPLE_RATE);
export const TRIAL_SILENCE_MS = 800;

export interface TranscriptionTrialStage {
  place: string;
  model: string;
  options?: Record<string, unknown>;
  build?: { engine: string; accelerator: string; native?: boolean; fallback?: string } | null;
}

export interface TrialBuild {
  model: string;
  engine: string;
  accelerator: string;
  native: boolean;
  fallback?: string;
}

export type TrialState = "listening" | "transcribing";

export interface TranscriptionTrialHandle {
  /** Resolves when the microphone and worklet are ready to hear speech. */
  ready: Promise<void>;
  /** Resolves only with usable speech from the checked stage. */
  result: Promise<{ text: string }>;
  /** Ends capture and submits the sample when it contains at least 250 ms of audible speech. */
  finish(): void;
  /** Discards capture or aborts transcription, rejecting with AbortError. */
  cancel(): void;
}

export interface TranscriptionTrialOptions {
  hostFp: string;
  stage: TranscriptionTrialStage;
  signal?: AbortSignal;
  onLevel?: (level: number) => void;
  onState?: (state: TrialState) => void;
}

export interface TrialProviderRequest {
  (path: string, options: RequestInit): Promise<Response>;
}

export interface PinnedTrialRouteSnapshot {
  requestedFp: string;
  selectedFp: string | null;
  pairingFp: string | null;
  base: string | null;
  token: string | null;
  verified: boolean;
  revoked?: boolean;
  /** Rechecks the captured selection, pairing and base immediately before the one request. */
  isCurrent(): boolean;
  fetcher?: typeof fetch;
  onUnauthorized?(): void;
}

export interface TranscriptionTrialDependencies {
  acquireMicrophone(): Promise<MediaStream>;
  createAudioContext(): AudioContext;
  createWorkletNode(context: AudioContext): AudioWorkletNode;
  captureProviderRequest(hostFp: string): TrialProviderRequest;
  resolveDeviceBuild(stage: TranscriptionTrialStage): TrialBuild | null;
  openWorker(native: boolean): Worker;
  releaseDeviceBuild(build: TrialBuild): void | Promise<void>;
  now(): number;
  setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
  workerTimeoutMs: number;
}

export class TranscriptionTrialError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.name = "TranscriptionTrialError";
    this.key = key;
  }
}

/** Capture one already verified pairing route. This never consults a changing global node base. */
export function pinTrialProviderRequest(snapshot: PinnedTrialRouteSnapshot): TrialProviderRequest {
  if (!snapshot.requestedFp || snapshot.selectedFp !== snapshot.requestedFp || snapshot.pairingFp !== snapshot.requestedFp ||
      !snapshot.base || !snapshot.token || !snapshot.verified || snapshot.revoked) {
    throw keyedError("trial.host_unavailable");
  }
  const { base, token } = snapshot;
  const fetcher = snapshot.fetcher || globalThis.fetch;
  return async(path, options) => {
    if (path !== TRANSCRIPTION_TRIAL_PATH || options.method !== "POST") throw keyedError("trial.invalid_stage");
    if (!snapshot.isCurrent()) throw abortError();
    const headers = new Headers(options.headers);
    headers.set("Authorization", "Bearer " + token);
    let response: Response;
    try {
      response = await fetcher(base + path, { ...options, headers, redirect: "error" });
    } catch (error) {
      if (asAbort(error)) throw abortError();
      throw keyedError("trial.host_unavailable");
    }
    if (response.status === 401) {
      try { snapshot.onUnauthorized?.(); } catch { /* The route refusal remains authoritative. */ }
      throw keyedError("trial.pairing_refused");
    }
    return response;
  };
}

function abortError(): DOMException {
  return new DOMException("The transcription trial was cancelled.", "AbortError");
}

function keyedError(key: string): TranscriptionTrialError {
  return new TranscriptionTrialError(key);
}

function usefulTranscript(value: unknown): value is string {
  const text = String(value || "").trim();
  const compact = text.replace(/\s/g, "");
  if (!text || (!/[\p{L}\p{N}]/u.test(text) && compact.length >= 8)) return false;
  if (compact.length >= 24 && new Set(compact).size <= 3) return false;
  const tokens = text.split(/\s+/);
  if (tokens.length >= 10 && new Set(tokens).size / tokens.length < 0.15) return false;
  return true;
}

function errorKey(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const key = (error as { key?: unknown }).key;
  return typeof key === "string" && /^trial\.[a-z0-9._-]+$/.test(key) ? key : null;
}

function asAbort(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError";
}

function normalizedFailure(error: unknown, step: "capture" | "model" | "provider"): Error {
  if (asAbort(error)) return abortError();
  const key = errorKey(error);
  if (key) return keyedError(key);
  if (step === "capture") {
    const name = error && typeof error === "object" ? (error as { name?: unknown }).name : "";
    if (name === "NotAllowedError" || name === "SecurityError") return keyedError("trial.mic_denied");
    if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") return keyedError("trial.no_mic");
    return keyedError("trial.capture_failed");
  }
  if (step === "provider" && error instanceof TypeError) return keyedError("trial.host_unavailable");
  return keyedError(step === "model" ? "trial.model_unavailable" : "trial.stt_failed");
}

function copyStage(stage: TranscriptionTrialStage): TranscriptionTrialStage {
  return { ...stage, options: stage.options ? { ...stage.options } : {} , build: stage.build ? { ...stage.build } : null };
}

function defaultDependencies(): TranscriptionTrialDependencies {
  const actions = () => window.sidevoiceActions;
  return {
    acquireMicrophone() {
      const acquire = actions()?.acquireTrialMicrophone;
      if (!acquire) throw keyedError("trial.no_mic");
      return acquire();
    },
    createAudioContext() {
      try { return new AudioContext({ sampleRate: TRIAL_SAMPLE_RATE }); }
      catch { return new AudioContext(); }
    },
    createWorkletNode(context) {
      return new AudioWorkletNode(context, "mic-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: "explicit",
        processorOptions: { sampleRate: TRIAL_SAMPLE_RATE },
      });
    },
    captureProviderRequest(hostFp) {
      const capture = actions()?.captureTranscriptionTrialRoute;
      if (!capture) throw keyedError("trial.host_unavailable");
      return capture(hostFp);
    },
    resolveDeviceBuild(stage) {
      return actions()?.transcriptionTrialBuild?.(stage) || null;
    },
    openWorker(native) {
      const candidate = window.roomTranscription?.candidate;
      if (typeof candidate !== "function") throw keyedError("trial.model_unavailable");
      return candidate(native) as Worker;
    },
    releaseDeviceBuild(build) { actions()?.releaseTranscriptionTrialBuild?.(build); },
    now: () => performance.now(),
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: (timer) => clearTimeout(timer),
    workerTimeoutMs: 30_000,
  };
}

function awaitAbortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(abortError()); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

function stopTracks(stream: MediaStream | null): void {
  for (const track of stream?.getTracks?.() || []) {
    try { track.stop(); } catch { /* A track can end between enumeration and stop. */ }
  }
}

function rmsOf(samples: Int16Array): number {
  if (!samples.length) return 0;
  let squares = 0;
  for (const sample of samples) {
    const value = sample / 32768;
    squares += value * value;
  }
  return Math.sqrt(squares / samples.length);
}

function samplesFromFrames(frames: Int16Array[]): Int16Array {
  const count = frames.reduce((sum, frame) => sum + frame.length, 0);
  const audio = new Int16Array(count);
  let offset = 0;
  for (const frame of frames) { audio.set(frame, offset); offset += frame.length; }
  return audio;
}

function pcmBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < pcm.length; i++) view.setInt16(i * 2, pcm[i], true);
  let binary = "";
  const block = 0x8000;
  for (let i = 0; i < bytes.length; i += block) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + block)));
  }
  return btoa(binary);
}

function askWorker(worker: Worker, message: Record<string, unknown>, signal: AbortSignal,
  deps: TranscriptionTrialDependencies, transfer: Transferable[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (settle: (value: any) => void, value: any) => {
      if (timer !== null) deps.clearTimer(timer);
      signal.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      settle(value);
    };
    const onAbort = () => finish(reject, abortError());
    if (signal.aborted) return reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    timer = deps.setTimer(() => finish(reject, keyedError("trial.stt_failed")), deps.workerTimeoutMs);
    worker.onmessage = ({ data }) => {
      if (data?.id !== message.id) return;
      if (data.type === "progress") return;
      if (data.type === "error") finish(reject, Object.assign(new Error("The transcription model failed."), { step: data.step, reason: data.reason }));
      else if (["ready", "result"].includes(data.type)) finish(resolve, data);
    };
    worker.onerror = () => finish(reject, keyedError("trial.stt_failed"));
    try { worker.postMessage(message, transfer); }
    catch (error) { finish(reject, error); }
  });
}

async function runLocal(stage: TranscriptionTrialStage, build: TrialBuild, pcm: Int16Array,
  signal: AbortSignal, deps: TranscriptionTrialDependencies): Promise<string> {
  let worker: Worker | null = null;
  let loaded = false;
  try {
    worker = deps.openWorker(build.native);
    const load: Record<string, unknown> = { id: 1, type: "load", model: build.model, engine: build.engine,
      accelerator: build.accelerator, native: build.native };
    if (build.fallback) load.fallback = build.fallback;
    const loadAnswer = await askWorker(worker, load, signal, deps);
    if (loadAnswer.type !== "ready") throw keyedError("trial.model_unavailable");
    loaded = true;
    if (signal.aborted) throw abortError();
    const audio = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) audio[i] = pcm[i] / 32768;
    const language = typeof stage.options?.language === "string" ? stage.options.language : "auto";
    const answer = await askWorker(worker, { id: 2, type: "transcribe", audio: audio.buffer,
      model: build.model, engine: build.engine, accelerator: build.accelerator, native: build.native,
      language: language || "auto" }, signal, deps, [audio.buffer]);
    const text = answer.type === "result" ? answer.result?.text : "";
    if (!usefulTranscript(text)) throw keyedError("trial.unusable");
    return String(text).trim();
  } finally {
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      try { worker.terminate(); } catch { /* The lease has already ended. */ }
    }
    if (loaded) await deps.releaseDeviceBuild(build);
    pcm.fill(0);
  }
}

async function runProvider(stage: TranscriptionTrialStage, pcm: Int16Array, request: TrialProviderRequest,
  signal: AbortSignal): Promise<string> {
  const language = typeof stage.options?.language === "string" ? stage.options.language : "auto";
  const context = typeof stage.options?.context === "string" ? stage.options.context.trim() : "";
  if (context.length > 400) throw keyedError("trial.invalid_stage");
  const options: Record<string, string> = { language: language || "auto" };
  if (context) options.context = context;
  const response = await awaitAbortable(request(TRANSCRIPTION_TRIAL_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    redirect: "error",
    signal,
    body: JSON.stringify({ place: "openai", model: stage.model, options,
      audio: { encoding: "pcm_s16le", sample_rate: TRIAL_SAMPLE_RATE, data_base64: pcmBase64(pcm) } }),
  }), signal);
  pcm.fill(0);
  let body: any = null;
  try { body = await awaitAbortable(response.json(), signal); }
  catch (error) {
    if (signal.aborted || (error as Error)?.name === "AbortError") throw abortError();
    /* A refusal without JSON keeps its keyed fallback. */
  }
  if (!response.ok || !body || typeof body !== "object") {
    if (response.status === 401) throw keyedError("trial.pairing_refused");
    if (response.status === 403) throw keyedError("trial.origin_refused");
    const key = errorKey(body?.detail);
    throw keyedError(key || "trial.stt_failed");
  }
  if (!usefulTranscript(body.text)) throw keyedError("trial.unusable");
  return String(body.text).trim();
}

/** Start capture synchronously from Speak, then use finish() for the explicit Finish speaking action.
 * The caller aborts its generation controller when the step closes or host/model changes. */
export function transcriptionTrial(options: TranscriptionTrialOptions,
  suppliedDependencies?: Partial<TranscriptionTrialDependencies>): TranscriptionTrialHandle {
  const deps = { ...defaultDependencies(), ...suppliedDependencies };
  if (!options.hostFp || !options.stage || options.stage.place === "host") throw keyedError("trial.place_unavailable");
  if (!options.stage.model) throw keyedError("trial.model_unavailable");

  const stage = copyStage(options.stage);
  let providerRequest: TrialProviderRequest | null = null;
  let build: TrialBuild | null = null;
  if (stage.place === "device") {
    try { build = deps.resolveDeviceBuild(stage); } catch { build = null; }
    if (!build || build.model !== stage.model) throw keyedError("trial.model_unavailable");
  } else if (stage.place === "openai") {
    const context = typeof stage.options?.context === "string" ? stage.options.context.trim() : "";
    if (context.length > 400) throw keyedError("trial.invalid_stage");
    try { providerRequest = deps.captureProviderRequest(options.hostFp); }
    catch (error) { throw normalizedFailure(error, "provider"); }
  } else {
    throw keyedError("trial.place_unavailable");
  }

  const lifetime = new AbortController();
  const externalSignal = options.signal;
  const relayAbort = () => lifetime.abort();
  if (externalSignal?.aborted) throw abortError();
  externalSignal?.addEventListener("abort", relayAbort, { once: true });
  let finishCapture: (value?: void) => void = () => undefined;
  let finishRequested = false;
  const finishSignal = new Promise<void>(resolve => { finishCapture = resolve; });
  const finish = () => { finishRequested = true; finishCapture(); };
  const cancel = () => lifetime.abort();

  let resolveReady!: () => void;
  let rejectReady!: (reason: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // A consumer can await ready; suppress an unhandled rejection if it observes only result.
  void ready.catch(() => undefined);

  const result = (async(): Promise<{ text: string }> => {
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let node: AudioWorkletNode | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let cleanupPromise: Promise<void> | null = null;
    const frames: Int16Array[] = [];
    let sampleCount = 0;
    let audibleSamples = 0;
    let settled = false;
    let captureFailed = false;
    const signal = lifetime.signal;

    const cleanupCapture = (): Promise<void> => {
      if (cleanupPromise) return cleanupPromise;
      cleanupPromise = (async() => {
        if (maxTimer !== null) deps.clearTimer(maxTimer);
        if (silenceTimer !== null) deps.clearTimer(silenceTimer);
        maxTimer = silenceTimer = null;
        if (node) {
          node.port.onmessage = null;
          node.onprocessorerror = null;
          try { node.disconnect(); } catch { /* Already disconnected. */ }
          node = null;
        }
        if (source) { try { source.disconnect(); } catch { /* Already disconnected. */ } source = null; }
        stopTracks(stream);
        stream = null;
        if (context) {
          const closing = context;
          context = null;
          try { if (closing.state !== "closed") await closing.close(); } catch { /* Closing is best effort. */ }
        }
      })();
      return cleanupPromise;
    };

    try {
      let mediaPromise: Promise<MediaStream>;
      try { mediaPromise = Promise.resolve(deps.acquireMicrophone()); }
      catch (error) { throw error; }
      // If permission resolves after Cancel, its newly returned tracks are stopped without creating audio nodes.
      void mediaPromise.then(value => { if (signal.aborted) stopTracks(value); }, () => undefined);
      stream = await awaitAbortable(mediaPromise, signal);
      if (!stream.getAudioTracks?.().length) throw keyedError("trial.no_mic");
      if (signal.aborted) throw abortError();

      context = deps.createAudioContext();
      if (context.state !== "running") {
        await awaitAbortable(context.resume(), signal);
        if (String(context.state) !== "running") throw keyedError("trial.capture_failed");
      }
      const buildId = encodeURIComponent(window.sidevoiceBuildId || "dev");
      await awaitAbortable(context.audioWorklet.addModule(`/voice/mic_capture.js?v=${buildId}`), signal);
      if (signal.aborted) throw abortError();
      source = context.createMediaStreamSource(stream);
      node = deps.createWorkletNode(context);
      node.port.onmessage = event => {
        if (settled || signal.aborted || !event.data) return;
        const incoming = new Int16Array(event.data);
        const count = Math.min(incoming.length, TRIAL_MAX_SAMPLES - sampleCount);
        if (count <= 0) { finish(); return; }
        const frame = incoming.slice(0, count);
        frames.push(frame);
        sampleCount += count;
        const rms = rmsOf(frame);
        if (rms >= 0.008) {
          audibleSamples += frame.length;
          if (silenceTimer !== null) deps.clearTimer(silenceTimer);
          silenceTimer = deps.setTimer(finish, TRIAL_SILENCE_MS);
        }
        try { options.onLevel?.(Math.max(0, Math.min(100, Math.round((20 * Math.log10(Math.max(rms, 1e-6)) + 60) / 60 * 100)))); }
        catch { /* A view's meter cannot stop capture. */ }
        if (sampleCount >= TRIAL_MAX_SAMPLES) finish();
      };
      node.onprocessorerror = () => { captureFailed = true; finish(); };
      source.connect(node);
      node.connect(context.destination);
      maxTimer = deps.setTimer(finish, 10_000);
      if (finishRequested) finishCapture();
      resolveReady();
      try { options.onState?.("listening"); } catch { /* State display is best effort. */ }

      await awaitAbortable(finishSignal, signal);
      if (signal.aborted) throw abortError();
      settled = true;
      await cleanupCapture();
      if (signal.aborted) throw abortError();
      if (captureFailed) throw keyedError("trial.capture_failed");
      if (audibleSamples < TRIAL_MIN_AUDIBLE_SAMPLES) throw keyedError("trial.silent");

      const pcm = samplesFromFrames(frames);
      frames.length = 0;
      try {
        try { options.onState?.("transcribing"); } catch { /* State display is best effort. */ }
        const text = stage.place === "device"
          ? await runLocal(stage, build!, pcm, signal, deps)
          : await runProvider(stage, pcm, providerRequest!, signal);
        if (signal.aborted) throw abortError();
        if (!usefulTranscript(text)) throw keyedError("trial.unusable");
        return { text };
      } catch (error) {
        throw normalizedFailure(error, stage.place === "device" ? "model" : "provider");
      } finally { pcm.fill(0); }
    } catch (error) {
      settled = true;
      const normalized = normalizedFailure(error, "capture");
      rejectReady(normalized);
      throw normalized;
    } finally {
      settled = true;
      await cleanupCapture();
      for (const frame of frames) frame.fill(0);
      frames.length = 0;
      externalSignal?.removeEventListener("abort", relayAbort);
      try { options.onLevel?.(0); } catch { /* Release is more important than meter cleanup. */ }
    }
  })();

  return { ready, result, finish, cancel };
}
