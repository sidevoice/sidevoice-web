import { expect, test } from "vitest";
import type { WebEngine } from "@sidevoice/engine";
import { engineCatalogs, localStorageCredentials, nativeInstall, webInstallProgress } from "./model-catalogs.js";

/* The engine's catalogues and the providers' keys, as the settings pane reads them on the web. */

function memory() {
  const stored = new Map<string, string>();
  return { stored, storage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value), removeItem: (key: string) => void stored.delete(key) } as unknown as Storage };
}

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

test("in the desktop app the native engine installs it: its bytes as the share done, the signal as its cancel(job)", async () => {
  let report: ((event: object) => void) | null = null;
  let finish: (() => void) | null = null;
  let fail: ((error: unknown) => void) | null = null;
  const cancelled: string[] = [];
  const native = {
    install: (model: string, engine: string, onProgress: (event: object) => void) => {
      report = onProgress;
      return Object.assign(new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; }), { job: "install-1-" + model + "-" + engine });
    },
    cancel: async (job: string) => { cancelled.push(job); fail?.({ key: "install_cancelled", message: "cancelled" }); return true; },
  };
  const install = nativeInstall(native as unknown as Parameters<typeof nativeInstall>[0]);
  const progress: unknown[] = [];
  const done = install("whisper-small", { engine: "sherpa-onnx", onProgress: (p) => progress.push(p) });
  report!({ job: "install-1", done: 25, total: 100, bytes_per_s: null });
  finish!();
  await done;
  expect(progress).toEqual([{ fraction: 0.25, done: 25, total: 100 }]);
  const abort = new AbortController();
  const stopped = install("kokoro-82m-v1.0", { engine: "sherpa-onnx", signal: abort.signal });
  abort.abort();
  await expect(stopped).rejects.toMatchObject({ code: "install-cancelled" });
  expect(cancelled).toEqual(["install-1-kokoro-82m-v1.0-sherpa-onnx"]);
});
