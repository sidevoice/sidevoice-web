import { expect, test, vi } from "vitest";
import { pageVoice, swappingVoiceHost } from "./voice-module.js";

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


/* A model changed mid-call (contract gap #31): the voice keeps its slots and is never restarted for it. The voice here
 * restarts as @sidevoice/voice does — on its first settings and when a slot's model or the end of turn changes —
 * loading its models then; anything else it takes as configuration. */
type Settings = { stt: { catalog: string; model: string; language?: string | null }; tts: { catalog: string; model: string; voice?: string | null }; end_of_turn?: string; turn_model?: string };
function fakeVoice() {
  const told: Settings[] = [];
  let restarts = 0;
  let models: { transcriber: { transcribe(...args: unknown[]): Promise<unknown> } } | null = null;
  let stages = "";
  const create = (source: { models(settings: Settings): Promise<{ load(): Promise<typeof models> }> }) => ({
    async setSettings(settings: Settings) {
      told.push(settings);
      const next = JSON.stringify([settings.stt.catalog, settings.stt.model, settings.tts.catalog, settings.tts.model, settings.end_of_turn ?? "silence"]);
      if (next !== stages) { restarts++; models = await (await source.models(settings)).load(); stages = next; }
    },
    transcribe: (samples: number) => models!.transcriber.transcribe(samples),
    onTurn: () => () => {},
  });
  return { create, told, restarts: () => restarts };
}
function modelSource() {
  const finishing: Record<string, () => void> = {};
  const source = {
    models: vi.fn(async (settings: Settings) => {
      if (settings.stt.model === "too-big") throw Object.assign(new Error("model-unfit"), { code: "model-unfit" });
      return { load: vi.fn(async () => ({
        vad: { accept: async () => [], reset: () => {} },
        transcriber: { transcribe: (samples: number) => samples === 0
          ? new Promise((resolve) => { finishing[settings.stt.model] = () => resolve(settings.stt.model); }) : Promise.resolve(settings.stt.model) },
        speaker: { speak: async () => new Float32Array() },
      })) };
    }),
  };
  return { source, finishing };
}
const settingsWith = (model: string, extra: Partial<Settings> = {}): Settings =>
  ({ stt: { catalog: "local", model, language: null }, tts: { catalog: "local", model: "kokoro" }, end_of_turn: "silence", ...extra });

test("another model mid-call moves the slot once it is ready, without restarting the voice; what was under way finishes on the model it began with", async () => {
  const voice = fakeVoice();
  const { source, finishing } = modelSource();
  const host = swappingVoiceHost(voice.create as never, source as never) as unknown as { setSettings(settings: Settings): Promise<void>; transcribe(samples: number): Promise<unknown> };
  await host.setSettings(settingsWith("whisper-base"));
  expect(voice.restarts()).toBe(1);
  expect(await host.transcribe(1)).toBe("whisper-base");
  const underWay = host.transcribe(0);
  await host.setSettings(settingsWith("whisper-small", { stt: { catalog: "local", model: "whisper-small", language: "es" } }));
  expect(voice.restarts()).toBe(1);
  // The voice was told the language, on the slots it was made with.
  expect(voice.told.at(-1)!.stt).toEqual({ catalog: "local", model: "whisper-base", language: "es" });
  expect(await host.transcribe(1)).toBe("whisper-small");
  finishing["whisper-base"]();
  expect(await underWay).toBe("whisper-base");
  // A model this device can't run is refused, and the one in use stays.
  await expect(host.setSettings(settingsWith("too-big"))).rejects.toMatchObject({ code: "model-unfit" });
  expect(await host.transcribe(1)).toBe("whisper-small");
  expect(voice.restarts()).toBe(1);
});

test("Smart and Silence swapped are the voice's to apply: it restarts on the models chosen then", async () => {
  const voice = fakeVoice();
  const { source } = modelSource();
  const host = swappingVoiceHost(voice.create as never, source as never) as unknown as { setSettings(settings: Settings): Promise<void>; transcribe(samples: number): Promise<unknown> };
  await host.setSettings(settingsWith("whisper-base"));
  await host.setSettings(settingsWith("whisper-small", { end_of_turn: "smart-turn" }));
  expect(voice.restarts()).toBe(2);
  expect(voice.told.at(-1)!.stt.model).toBe("whisper-small");
  expect(await host.transcribe(1)).toBe("whisper-small");
});
