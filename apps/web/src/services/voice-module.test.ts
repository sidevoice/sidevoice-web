import { expect, test, vi } from "vitest";
import { pageVoice } from "./voice-module.js";

/* Where the page's voice and its models' catalogues come from: the desktop app's, or one engine on this page. */

test("in the desktop app both are the app's: the voice, and the engine's catalogues and keys", async () => {
  const engine = { catalogs: async () => [], setCredential: async () => {}, hasCredential: async () => false };
  const host = { voice: { say: () => null }, engine };
  const load = vi.fn();
  const page = pageVoice({ host, load });
  expect(await page.voice()).toBe(host.voice);
  expect(await page.catalogs()).toBe(engine);
  expect(load).not.toHaveBeenCalled();
  // An app that does not give the page its catalogues yet says so, by code.
  await expect(pageVoice({ host: { voice: host.voice, engine: {} }, load }).catalogs()).rejects.toMatchObject({ code: "catalogs-unavailable" });
});

test("on the web the voice and the catalogues share one engine, made once, whose host reads the keys this page keeps", async () => {
  const hosts: { credential(provider: string): Promise<string | null> }[] = [];
  const webEngine = { catalogs: () => [{ id: "local", name: undefined, status: async () => ({ stale: false }), models: async () => [] }] };
  const create = vi.fn(async (host: (typeof hosts)[number]) => { hosts.push(host); return webEngine; });
  const createVoiceHost = vi.fn((source: object) => ({ source }));
  const load = vi.fn(async () => [{ default: async () => {}, createVoiceHost }, { default: async () => {}, WebEngine: { create } }]);
  const page = pageVoice({ host: {}, load });
  const voice = await page.voice() as unknown as { source: { models: unknown } };
  const catalogs = await page.catalogs();
  expect(create).toHaveBeenCalledTimes(1);
  expect(typeof voice.source.models).toBe("function");
  expect(await catalogs.catalogs()).toEqual([{ id: "local", name: null, status: { stale: false }, models: [] }]);
  await catalogs.setCredential("openai", "sk-1");
  expect(await hosts[0].credential("openai")).toBe("sk-1");
  await catalogs.setCredential("openai", null);
});

test("packages that do not load are the voice's own refusal, and the next ask tries again", async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error("chunk")).mockResolvedValue([
    { default: async () => {}, createVoiceHost: () => ({}) }, { default: async () => {}, WebEngine: { create: async () => ({ catalogs: () => [] }) } },
  ]);
  const page = pageVoice({ host: {}, load });
  await expect(page.voice()).rejects.toMatchObject({ code: "voice-module-unavailable" });
  await expect(page.voice()).resolves.toBeTruthy();
});

test("an engine the browser will not let keep files (site data blocked) is the voice's storage-blocked, never a bare number", async () => {
  const load = vi.fn(async () => [
    { default: async () => {}, createVoiceHost: () => ({}) },
    { default: async () => {}, WebEngine: { create: async () => { throw new DOMException("The operation is insecure.", "SecurityError"); } } },
  ]);
  const page = pageVoice({ host: {}, load });
  await expect(page.voice()).rejects.toMatchObject({ code: "storage-blocked" });
  await expect(page.catalogs()).rejects.toMatchObject({ code: "storage-blocked" });
});
