import { expect, test, vi } from "vitest";
import { pageVoice } from "./voice-module.js";
import type { VoiceHost, VoiceModelSource } from "@sidevoice/voice";

/* Where the page's voice and its models' catalogues come from: the desktop app's, or one engine on this page. */

test("in the desktop app both are the app's: the voice, and the engine's catalogues and keys", async () => {
  const builds = [{ accelerator: "metal", acceleratorClass: "gpu" }, { accelerator: "cpu" }];
  const engine = { catalogs: async () => [{ models: [{ builds }] }], setCredential: async () => {}, hasCredential: async () => false };
  const host = { voice: { say: () => null }, engine };
  const load = vi.fn();
  const page = pageVoice({ host, load });
  expect(await page.voice()).toBe(host.voice);
  expect(await page.catalogs()).toBe(engine);
  expect((await (await page.catalogs()).catalogs())[0].models[0].builds).toBe(builds);
  expect(builds[1]).not.toHaveProperty("acceleratorClass");
  expect(load).not.toHaveBeenCalled();
  // An app that does not give the page its catalogues yet says so, by code.
  await expect(pageVoice({ host: { voice: host.voice, engine: {} }, load }).catalogs()).rejects.toMatchObject({ code: "catalogs-unavailable" });
});

test("on the web the voice and the catalogues share one engine, made once, whose host reads the keys this page keeps", async () => {
  const hosts: { credential(provider: string): Promise<string | null> }[] = [];
  const builds = [{ accelerator: "webgpu", acceleratorClass: "gpu" }, { accelerator: "wasm" }];
  const webEngine = { catalogs: () => [{ id: "local", name: undefined, status: async () => ({ stale: false }), models: async () => [{ id: "whisper", builds }] }] };
  const create = vi.fn(async (host: (typeof hosts)[number]) => { hosts.push(host); return webEngine; });
  const createVoiceHost = vi.fn((source: object) => ({ source }));
  const load = vi.fn(async () => [{ default: async () => {}, createVoiceHost }, { default: async () => {}, WebEngine: { create } }]);
  const page = pageVoice({ host: {}, load });
  const voice = await page.voice() as unknown as { source: { models: unknown } };
  const catalogs = await page.catalogs();
  expect(create).toHaveBeenCalledTimes(1);
  expect(typeof voice.source.models).toBe("function");
  expect(await catalogs.catalogs()).toEqual([{ id: "local", name: null, status: { stale: false }, models: [{ id: "whisper", builds }] }]);
  expect(builds[1]).not.toHaveProperty("acceleratorClass");
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


test("the browser supplies the new shared owner and creates separate calls through it", async () => {
  const calls: string[] = [];
  const source: VoiceModelSource = { models: () => { throw Error("unused"); } };
  const owner = {
    createCall: () => ({ id: `call-${calls.push("created")}` }),
    routeInput: async (call: { id: string } | null) => { calls.push(call?.id ?? "none"); },
  };
  const create = vi.fn((_source: VoiceModelSource) => owner);
  const { voice } = pageVoice({ host: {}, load: async () => [
    { default: async () => {}, createVoiceHost: create },
    { default: async () => {}, WebEngine: { create: async () => ({ catalogs: () => [] }) } },
  ] });
  const host = await voice();
  const a = host.createCall();
  const b = host.createCall();
  expect(a).not.toBe(b);
  await host.routeInput(a);
  await host.routeInput(b);
  await host.routeInput(null);
  expect(calls).toEqual(["created", "created", "call-1", "call-2", "none"]);
  expect(create).toHaveBeenCalledOnce();
  expect(source.models).toBeDefined();
});
