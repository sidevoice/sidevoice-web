import { expect, test } from "vitest";
import type { WebEngine } from "@sidevoice/engine";
import { engineCatalogs, localStorageCredentials } from "./model-catalogs.js";

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
