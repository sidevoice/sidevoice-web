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

test("on the web a model installs through the engine, its progress a share of its files, and a cancel is install-cancelled", async () => {
  const seen: unknown[] = [];
  let signalled: AbortSignal | undefined;
  const engine = {
    catalogs: () => [],
    install: async (model: string, build: string | undefined, onProgress: (p: object) => void, signal?: AbortSignal) => {
      seen.push(["install", model, build]);
      onProgress({ files: 4, done: 1, received: 50, size: 100 });
      signalled = signal;
      if (signal?.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled" });
    },
  } as unknown as WebEngine;
  const catalogs = engineCatalogs(engine, localStorageCredentials(memory().storage));
  const progress: unknown[] = [];
  await catalogs.install("kokoro-82m-v1.0", { build: "kokoro/q8", onProgress: (p) => progress.push(p) });
  expect(seen).toEqual([["install", "kokoro-82m-v1.0", "kokoro/q8"]]);
  expect(progress).toEqual([{ fraction: 0.375, done: null, total: null }]);
  expect(webInstallProgress({ files: 0 })).toEqual({ fraction: null, done: null, total: null });
  const abort = new AbortController();
  abort.abort();
  await expect(catalogs.install("kokoro-82m-v1.0", { signal: abort.signal })).rejects.toMatchObject({ code: "install-cancelled" });
  expect(signalled?.aborted).toBe(true);
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
