import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { verifyDevice, verifyProvider, type ProtocolWorker } from "./load-and-verify.js";
import checks from "../../../../packages/browser-audio/checks/checks.json";

/* One model checked on this device through the engines' worker protocol, and a provider's through the machine. The
 * worker is scripted: each request is answered by `script[type]`, which may emit progress or audio first. */
const clipBytes = (url: string) => {
  const bytes = readFileSync(new URL("../../../../packages/browser-audio/checks/" + url.split("/").pop(), import.meta.url));
  return Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
};
type Send = (data: Record<string, unknown>) => void;
type Script = Record<string, (message: Record<string, unknown>, send: Send) => void | Promise<void>>;

function worker(script: Script) {
  const posted: Record<string, unknown>[] = [];
  const fake: ProtocolWorker & { posted: typeof posted; terminated: boolean } = {
    posted, terminated: false, onmessage: null, onerror: null,
    postMessage(message: unknown) {
      const data = message as Record<string, unknown>;
      posted.push(data);
      const send: Send = (reply) => setTimeout(() => fake.onmessage?.({ data: { id: data.id, ...reply } }), 0);
      void script[String(data.type)]?.(data, send);
    },
    terminate() { fake.terminated = true; },
  };
  return fake;
}
const BUILD = { model: "whisper-base", engine: "transformers-js", accelerator: "wasm", native: false };
const ES = checks.stt.clips.es.text;

function clock(step: number) {
  // performance.now() that moves `step` ms on every read: every interval measured is `step` long.
  let at = 0;
  return vi.spyOn(performance, "now").mockImplementation(() => (at += step));
}

test("a transcription model is downloaded with progress in bytes, loaded, then checked twice; the second pass is measured", async () => {
  const fake = worker({
    load: (_m, send) => {
      send({ type: "progress", progress: { status: "initiate", file: "onnx/encoder_model_quantized.onnx" } });
      send({ type: "progress", progress: { status: "progress", file: "onnx/encoder_model_quantized.onnx", loaded: 30, total: 60 } });
      send({ type: "progress", progress: { status: "done", file: "onnx/encoder_model_quantized.onnx" } });
      send({ type: "ready", runtime: { model: "whisper-base", engine: "transformers-js", accelerator: "wasm", cached: false } });
    },
    transcribe: (_m, send) => send({ type: "result", result: { text: ES } }),
  });
  const progress: unknown[] = [];
  const result = await verifyDevice({ task: "stt", build: BUILD, open: () => fake, fetchClip: clipBytes, language: "es", expected: 100, onProgress: (p) => progress.push(p) });
  expect(result).toMatchObject({ ok: true, step: "done", loaded: true, language: "es", slow: false });
  expect(result.passes).toHaveLength(2);
  expect(result.latency_ms).toBe(result.passes[1].latency_ms);
  expect(progress).toContainEqual({ step: "download", done: 30, total: 100, bytes_per_s: null });
  expect(progress).toContainEqual({ step: "download", done: 60, total: 100, bytes_per_s: null });
  expect(progress.some((p) => (p as { step: string }).step === "load")).toBe(false);
  expect(progress).toContainEqual({ step: "check", pass: 2, passes: 2 });
  expect(fake.posted.map((m) => m.type)).toEqual(["load", "transcribe", "transcribe"]);
  expect(fake.posted[1]).toMatchObject({ language: "es", accelerator: "wasm" });
  expect(result.worker).toBe(fake);
  expect(fake.terminated).toBe(false);
});

test("a measured pass above the comfort line is slow, not failed", async () => {
  const now = clock(checks.stt.comfort_ms + 500);
  const fake = worker({ load: (_m, send) => send({ type: "ready", runtime: {} }), transcribe: (_m, send) => send({ type: "result", result: { text: ES } }) });
  const result = await verifyDevice({ task: "stt", build: BUILD, open: () => fake, fetchClip: clipBytes, language: "es" });
  now.mockRestore();
  expect(result.ok).toBe(true);
  expect(result.slow).toBe(true);
  expect(result.latency_ms).toBeGreaterThan(checks.stt.comfort_ms);
});

test("each failure names its step and cause, and lets the worker go", async () => {
  const cases: [Script, string, string][] = [
    [{ load: (_m, send) => { send({ type: "progress", progress: { status: "progress", file: "a.onnx", loaded: 5, total: 50 } }); send({ type: "error", error: "Failed to fetch" }); } }, "download", "download_failed"],
    [{ load: (_m, send) => send({ type: "error", error: "Aborted(OOM)" }) }, "load", "memory_insufficient"],
    [{ load: (_m, send) => send({ type: "error", error: "x", step: "download", reason: { key: "download_corrupt", message: "not the file" } }) }, "download", "download_corrupt"],
    [{ load: (_m, send) => send({ type: "ready", runtime: {} }), transcribe: (_m, send) => send({ type: "result", result: { text: "" } }) }, "check", "check_silent"],
    [{ load: (_m, send) => send({ type: "ready", runtime: {} }), transcribe: (_m, send) => send({ type: "result", result: { text: "Thank you for watching." } }) }, "check", "check_mismatch"],
    [{ load: (_m, send) => send({ type: "ready", runtime: {} }), transcribe: (_m, send) => send({ type: "error", error: "invalid dims", step: "run" }) }, "check", "run_failed"],
  ];
  for (const [script, step, key] of cases) {
    const fake = worker(script);
    const result = await verifyDevice({ task: "stt", build: BUILD, open: () => fake, fetchClip: clipBytes, language: "es" });
    expect(result, key).toMatchObject({ ok: false, step, reason: { key } });
    expect(fake.terminated, key).toBe(true);
    expect(result.worker).toBeUndefined();
  }
});

test("a voice is checked audible and plausible, measured by its first audio and its speed against real time", async () => {
  const tone = (seconds: number, level = 0.3) => Float32Array.from({ length: Math.round(24000 * seconds) }, (_, i) => level * Math.sin(i / 7));
  const speaking = (level: number): Script => ({
    load: (_m, send) => send({ type: "ready", accelerator: "wasm", load_ms: 5 }),
    speak: (_m, send) => { send({ type: "audio", samples: tone(1, level), sampleRate: 24000 }); send({ type: "audio", samples: tone(4, level), sampleRate: 24000 }); send({ type: "done" }); },
  });
  const fake = worker(speaking(0.3));
  const ok = await verifyDevice({ task: "tts", build: { ...BUILD, model: "kokoro-82m-v1.0" }, open: () => fake, fetchClip: clipBytes, language: "fr", voice: "af_heart", speed: 1 });
  expect(ok).toMatchObject({ ok: true, language: "en" });
  expect(ok.passes[1]).toMatchObject({ audio_seconds: 5 });
  expect(ok.passes[1].first_audio_ms).toBeLessThanOrEqual(ok.passes[1].total_ms!);
  expect(fake.posted[1]).toMatchObject({ type: "speak", text: checks.tts.phrases.en, voice: "af_heart" });
  const silent = await verifyDevice({ task: "tts", build: BUILD, open: () => worker(speaking(0)), fetchClip: clipBytes, language: "es" });
  expect(silent).toMatchObject({ ok: false, step: "check", reason: { key: "check_silent" } });
});

test("the desktop app's own load time is the one reported", async () => {
  const fake = worker({ load: (_m, send) => send({ type: "ready", runtime: { load_ms: 1234 } }), transcribe: (_m, send) => send({ type: "result", result: { text: ES } }) });
  const result = await verifyDevice({ task: "stt", build: { ...BUILD, engine: "sherpa-onnx", accelerator: "cpu", native: true }, open: () => fake, fetchClip: clipBytes, language: "es" });
  expect(result.load_ms).toBe(1234);
});

test("a cancel stops the download and lets the worker go", async () => {
  const fake = worker({ load: (_m, send) => send({ type: "progress", progress: { status: "progress", file: "a", loaded: 1, total: 9 } }) });
  const controller = new AbortController();
  const pending = verifyDevice({ task: "stt", build: BUILD, open: () => fake, fetchClip: clipBytes, language: "es", signal: controller.signal });
  await new Promise((r) => setTimeout(r, 5));
  controller.abort();
  expect(await pending).toMatchObject({ ok: false, cancelled: true });
  expect(fake.terminated).toBe(true);
});

test("a provider is checked by the machine; a machine that cannot be reached, or refuses, is a failure too", async () => {
  const answer = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
  const stage = { place: "openai", model: "gpt-4o-transcribe", options: { language: "es" } };
  const request = vi.fn(() => answer(200, { ok: true, step: "done", passes: [{ latency_ms: 700 }, { latency_ms: 650 }], latency_ms: 650, slow: false }));
  expect(await verifyProvider({ task: "stt", stage, language: "es", request })).toMatchObject({ ok: true, latency_ms: 650 });
  expect(JSON.parse(String((request.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ stage: "stt", place: "openai", model: "gpt-4o-transcribe", options: { language: "es" }, language: "es" });
  expect(await verifyProvider({ task: "stt", stage, request: () => answer(200, { ok: false, step: "key", reason: { key: "provider_key_refused", message: "no" }, passes: [] }) }))
    .toMatchObject({ ok: false, step: "key", reason: { key: "provider_key_refused" } });
  expect(await verifyProvider({ task: "stt", stage, request: () => Promise.reject(new TypeError("Failed to fetch")) }))
    .toMatchObject({ ok: false, step: "host", reason: { key: "host_unreachable" } });
  expect(await verifyProvider({ task: "stt", stage: { ...stage, place: "host" }, request: () => answer(409, { detail: { key: "place_host_unavailable", message: "not yet" } }) }))
    .toMatchObject({ ok: false, step: "host", reason: { key: "place_host_unavailable" } });
});

test("a model already on disk is loaded, not downloaded, though its files are read with progress events", async () => {
  const fake = worker({
    load: (_m, send) => {
      send({ type: "progress", progress: { status: "progress", file: "onnx/model.onnx", loaded: 0, total: 50 } });
      send({ type: "progress", progress: { status: "done", file: "onnx/model.onnx" } });
      send({ type: "ready", runtime: {} });
    },
    transcribe: (_m, send) => send({ type: "result", result: { text: ES } }),
  });
  const progress: { step: string }[] = [];
  await verifyDevice({ task: "stt", build: BUILD, open: () => fake, fetchClip: clipBytes, language: "es", download: false, onProgress: (p) => progress.push(p) });
  expect(progress.some((p) => p.step === "download")).toBe(false);
  const failing = worker({ load: (_m, send) => { send({ type: "progress", progress: { status: "progress", file: "a", loaded: 1, total: 9 } }); send({ type: "error", error: "bad graph" }); } });
  expect(await verifyDevice({ task: "stt", build: BUILD, open: () => failing, fetchClip: clipBytes, language: "es", download: false })).toMatchObject({ step: "load", reason: { key: "load_failed" } });
});

test("a configuration file that finishes before the weights start does not end the download (review N02)", async () => {
  let release!: () => void;
  const fake = worker({
    load: async (_m, send) => {
      send({ type: "progress", progress: { status: "progress", file: "config.json", loaded: 100, total: 100 } });
      send({ type: "progress", progress: { status: "done", file: "config.json" } });
      send({ type: "progress", progress: { status: "progress", file: "onnx/encoder_model_quantized.onnx", loaded: 1024, total: 30_000_000 } });
      await new Promise<void>((resolve) => { release = resolve; });
      send({ type: "ready", runtime: {} });
    },
    transcribe: (_m, send) => send({ type: "result", result: { text: ES } }),
  });
  const progress: { step: string; done?: number }[] = [];
  const pending = verifyDevice({ task: "stt", build: BUILD, open: () => fake, fetchClip: clipBytes, language: "es", expected: 79_664_191, onProgress: (p) => progress.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  expect(progress.map((p) => p.step)).toEqual(["download", "download", "download"]);
  expect(progress.at(-1)).toMatchObject({ step: "download", done: 1124 });
  release();
  expect((await pending).ok).toBe(true);
  expect(progress.find((p) => p.step !== "download")?.step).toBe("check");
});
