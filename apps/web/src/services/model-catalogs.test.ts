import { expect, test } from "vitest";
import type { ModelBuild, WebEngine } from "@sidevoice/engine";
import { engineCatalogs, localStorageCredentials, webInstallProgress } from "./model-catalogs.js";

/* The engine's catalogues and the providers' keys, as the settings pane reads them on the web. */

function memory() {
  const stored = new Map<string, string>();
  return { stored, storage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value), removeItem: (key: string) => void stored.delete(key) } as unknown as Storage };
}

test("browser catalogues preserve the engine's build classes and leave missing classes missing", async () => {
  const gpu: ModelBuild = { id: "whisper/gpu", backend: "transformers-js", accelerator: "webgpu", acceleratorClass: "gpu",
    precision: "fp16", downloadBytes: 1, memoryMb: 1, available: true, reasons: [], installed: true };
  const unclassified: ModelBuild = { ...gpu, id: "whisper/other", accelerator: "metal", acceleratorClass: undefined };
  delete unclassified.acceleratorClass;
  const model = { id: "whisper", capabilities: ["stt"], languages: ["en"], voices: [], builds: [gpu, unclassified] };
  const engine = { catalogs: () => [{ id: "local", status: async () => ({ stale: false }), models: async () => [model] }] } as unknown as WebEngine;
  const result = await engineCatalogs(engine, localStorageCredentials(memory().storage)).catalogs();
  expect(result[0].models[0].builds).toEqual([gpu, unclassified]);
  expect(result[0].models[0].builds?.[0].acceleratorClass).toBe("gpu");
  expect(result[0].models[0].builds?.[1]).not.toHaveProperty("acceleratorClass");
});

test("every catalogue with its status and models; one that cannot list has none, and one that cannot answer says why", async () => {
  const catalogs = [
    { id: "local", name: undefined, status: async () => ({ stale: false }), models: async (capability?: string) => (capability ? [] : [{ id: "whisper-base" }]) },
    { id: "elevenlabs", name: "ElevenLabs", status: async () => ({ stale: false, reason: { code: "credential-missing", params: {} } }),
      models: async () => { throw Object.assign(new Error("no key"), { code: "credential-missing" }); } },
    { id: "openai", name: "OpenAI", status: async () => { throw Object.assign(new Error("down"), { code: "provider-unreachable", params: {}, detail: "502" }); }, models: async () => [] },
  ];
  const engine = { catalogs: () => catalogs } as unknown as WebEngine;
  const { storage } = memory();
  expect(await engineCatalogs(engine, localStorageCredentials(storage)).catalogs()).toEqual([
    { id: "local", name: null, status: { stale: false }, models: [{ id: "whisper-base" }] },
    { id: "elevenlabs", name: "ElevenLabs", status: { stale: false, reason: { code: "credential-missing", params: {} } }, models: [] },
    { id: "openai", name: "OpenAI", status: { stale: false, reason: { code: "provider-unreachable", params: {} }, detail: "502" }, models: [] },
  ]);
});

test("a provider's key is kept in this browser where the engine's host reads it, trimmed, and removed when empty", async () => {
  const { stored, storage } = memory();
  const credentials = localStorageCredentials(storage);
  const catalogs = engineCatalogs({ catalogs: () => [] } as unknown as WebEngine, credentials);
  expect(await catalogs.hasCredential("openai")).toBe(false);
  await catalogs.setCredential("openai", "  sk-1 ");
  expect(credentials.get("openai")).toBe("sk-1");
  expect([...stored.keys()]).toEqual(["sidevoice.provider-key.openai"]);
  expect(await catalogs.hasCredential("openai")).toBe(true);
  await catalogs.setCredential("openai", "   ");
  expect(await catalogs.hasCredential("openai")).toBe(false);
  await catalogs.setCredential("openai", "sk-2");
  await catalogs.setCredential("openai", null);
  expect(stored.size).toBe(0);
});

test("a catalogue whose listing fails with no reason of its own is not an empty list: the failure is its status", async () => {
  const blocked = new DOMException("The operation is insecure.", "SecurityError");
  const engine = { catalogs: () => [{ id: "local", name: undefined, status: async () => ({ stale: false }), models: async () => { throw blocked; } }] } as unknown as WebEngine;
  const { storage } = memory();
  expect(await engineCatalogs(engine, localStorageCredentials(storage)).catalogs()).toEqual([
    { id: "local", name: null, status: { stale: false, reason: { code: "storage-blocked", params: {} } }, models: [] },
  ]);
});

/** What the web engine tells while it installs files of `sizes` bytes, as its installer does: a report as a file starts
 *  (nothing received, its size), after each part of it, and as it is done (nothing received, none being downloaded).
 *  A file in `stored` is found already stored: only counted done. */
function engineReports(sizes: number[], { part = 100, stored = [] as number[] } = {}) {
  const reports: { files: number; done: number; received: number; size?: number }[] = [];
  let done = 0;
  sizes.forEach((size, index) => {
    if (!stored.includes(index)) {
      reports.push({ files: sizes.length, done, received: 0, size });
      for (let received = part; received < size + part; received += part) reports.push({ files: sizes.length, done, received: Math.min(received, size), size });
    }
    done += 1;
    reports.push({ files: sizes.length, done, received: 0 });
  });
  return reports;
}

test("a web install's progress is the share of its bytes, not of its files", () => {
  // A model file, then a small one, then a large one again: a share of the files would be 1/3 at the first's end.
  const sizes = [600, 100, 300];
  const report = webInstallProgress(1000);
  const seen = engineReports(sizes).map(report);
  expect(seen[0]).toEqual({ fraction: 0, done: 0, total: 1000 });
  const afterFirstFile = engineReports(sizes).findIndex((r) => r.done === 1);
  expect(seen[afterFirstFile]).toEqual({ fraction: 0.6, done: 600, total: 1000 });
  expect(seen.at(-1)).toEqual({ fraction: 1, done: 1000, total: 1000 });
  // Never back, whatever the engine's parts: the sum of what was received only grows.
  const fractions = seen.map((p) => p.fraction as number);
  expect(fractions.every((fraction, i) => i === 0 || fraction >= fractions[i - 1])).toBe(true);
});

test("a web install's progress follows the bytes whether or not the server told the size of the file", () => {
  const report = webInstallProgress(300);
  const files = 3;
  const fractions = [
    { files, done: 0, received: 0 },
    { files, done: 0, received: 60 },
    { files, done: 0, received: 100 },
    { files, done: 1, received: 0 },
    { files, done: 1, received: 0, size: 100 },
    { files, done: 1, received: 100, size: 100 },
    { files, done: 2, received: 0 },
  ].map((progress) => report(progress).fraction as number);
  expect(fractions).toEqual([0, 0.2, 1 / 3, 1 / 3, 1 / 3, 2 / 3, 2 / 3]);
});

test("a web install whose size the catalogue does not say has no share, so its bar is indeterminate", () => {
  const report = webInstallProgress(0);
  expect(report({ files: 2, done: 0, received: 50, size: 100 })).toEqual({ fraction: null, done: null, total: null });
  expect(webInstallProgress(100)({ files: 0, done: 0, received: 0 })).toEqual({ fraction: null, done: null, total: null });
});

test("a web install never reports more than the build downloads", () => {
  expect(webInstallProgress(100)({ files: 1, done: 0, received: 130, size: 100 })).toEqual({ fraction: 1, done: 100, total: 100 });
});

test("a web install that finds files already stored ends short of the whole, never back", () => {
  const sizes = [600, 100, 300];
  const report = webInstallProgress(1000);
  const fractions = engineReports(sizes, { stored: [0] }).map((progress) => report(progress).fraction as number);
  expect(fractions.every((fraction, i) => i === 0 || fraction >= fractions[i - 1])).toBe(true);
  expect(fractions.at(-1)).toBe(0.4);
});

test("on the web a model installs through the engine, its progress the share of the bytes its build downloads, and a cancel is install-cancelled", async () => {
  const seen: unknown[] = [];
  let signalled: AbortSignal | undefined;
  const builds = [{ id: "kokoro/fp32", downloadBytes: 900 }, { id: "kokoro/q8", downloadBytes: 400 }];
  const engine = {
    catalogs: () => [],
    localCatalog: () => ({ models: async () => [{ id: "other", builds: [{ id: "other/q8", downloadBytes: 1 }] }, { id: "kokoro-82m-v1.0", recommendedBuild: "kokoro/fp32", builds }] }),
    install: async (model: string, build: string | undefined, onProgress: (p: object) => void, signal?: AbortSignal) => {
      seen.push(["install", model, build]);
      for (const report of engineReports([300, 100], { part: 50 }).slice(0, 4)) onProgress(report);
      signalled = signal;
      if (signal?.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled" });
    },
  } as unknown as WebEngine;
  const catalogs = engineCatalogs(engine, localStorageCredentials(memory().storage));
  const progress: unknown[] = [];
  await catalogs.install("kokoro-82m-v1.0", { build: "kokoro/q8", onProgress: (p) => progress.push(p) });
  expect(seen).toEqual([["install", "kokoro-82m-v1.0", "kokoro/q8"]]);
  expect(progress).toEqual([
    { fraction: 0, done: 0, total: 400 }, { fraction: 0.125, done: 50, total: 400 },
    { fraction: 0.25, done: 100, total: 400 }, { fraction: 0.375, done: 150, total: 400 },
  ]);
  // With no build named, the engine's recommended one is the one whose size is said.
  progress.length = 0;
  await catalogs.install("kokoro-82m-v1.0", { onProgress: (p) => progress.push(p) });
  expect(progress.at(-1)).toEqual({ fraction: 150 / 900, done: 150, total: 900 });
  const abort = new AbortController();
  abort.abort();
  await expect(catalogs.install("kokoro-82m-v1.0", { signal: abort.signal })).rejects.toMatchObject({ code: "install-cancelled" });
  expect(signalled?.aborted).toBe(true);
});

test("on the web an install whose build size cannot be read still installs, its bar indeterminate", async () => {
  const engine = {
    catalogs: () => [],
    localCatalog: () => ({ models: async () => { throw new Error("no list"); } }),
    install: async (_model: string, _build: string | undefined, onProgress: (p: object) => void) => onProgress({ files: 1, done: 0, received: 10, size: 100 }),
  } as unknown as WebEngine;
  const progress: unknown[] = [];
  await engineCatalogs(engine, localStorageCredentials(memory().storage)).install("m", { onProgress: (p) => progress.push(p) });
  expect(progress).toEqual([{ fraction: null, done: null, total: null }]);
});

test("on the web a model is taken off this device through the engine, every build of it", async () => {
  const seen: unknown[] = [];
  const engine = { catalogs: () => [], uninstall: async (...args: unknown[]) => void seen.push(args) } as unknown as WebEngine;
  await engineCatalogs(engine, localStorageCredentials(memory().storage)).uninstall!("whisper-base");
  expect(seen).toEqual([["whisper-base"]]);
});

test("a key is tried with the provider without being kept: the engine reads it during the try, then the kept one again", async () => {
  const { stored, storage } = memory();
  stored.set("sidevoice.provider-key.openai", "sk-old");
  const credentials = localStorageCredentials(storage);
  const seen: (string | null)[] = [];
  const catalog = {
    id: "openai",
    refresh: async () => void seen.push(credentials.get("openai")),
    status: async () => (credentials.get("openai") === "sk-bad" ? { stale: false, reason: { code: "credential-rejected" } } : { stale: false }),
    models: async () => [],
  };
  const catalogs = engineCatalogs({ catalogs: () => [catalog] } as unknown as WebEngine, credentials);
  expect(await catalogs.testCredential!("openai", " sk-bad ")).toEqual({ code: "credential-rejected" });
  expect(seen).toEqual(["sk-bad", "sk-old"]);
  expect(stored.get("sidevoice.provider-key.openai")).toBe("sk-old");
  expect(await catalogs.testCredential!("openai", "sk-good")).toBeNull();
  expect(stored.get("sidevoice.provider-key.openai")).toBe("sk-old");
});
