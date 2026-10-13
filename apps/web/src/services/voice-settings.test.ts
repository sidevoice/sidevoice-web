import { expect, test } from "vitest";
import { defaultVoiceSettings, editVoiceSettings, readVoiceSettings, readyVoiceSettings, remoteProviders, voiceChoices, writeVoiceSettings, VOICE_SETTINGS_KEY } from "./voice-settings.js";
import type { CatalogView } from "./model-catalogs.js";

/* The voice settings this device keeps, and the choices the pane offers from the engine's catalogues. */

const build = (id: string, extra: Record<string, unknown> = {}) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 80e6, memoryMb: 200, available: true, reasons: [], installed: false, ...extra });
const local = (id: string, family: string, capabilities: string[], extra: Record<string, unknown> = {}) =>
  ({ id, family, capabilities, parametersM: 1, license: "MIT", languages: ["es", "en"], voices: [], installed: true, builds: [build(id + "/int8")], ...extra });
const CATALOGS = [
  { id: "local", name: null, status: { stale: false }, models: [
    local("whisper-base", "whisper", ["stt"]),
    local("whisper-large", "whisper", ["stt"], { languages: ["en"], builds: [build("whisper-large/int8", { available: false, reasons: [{ code: "memory", params: {} }] })] }),
    local("moonshine-tiny", "moonshine", ["stt"], { languages: ["en"] }),
    local("kokoro-82m-v1.0", "kokoro", ["tts"], { voices: [{ id: "ef_dora", languages: ["es"], gender: "female" }], speed: { min: 0.5, max: 2 } }),
    local("silero-vad", "silero-vad", ["vad"]),
  ] },
  { id: "elevenlabs", name: "ElevenLabs", status: { stale: false }, models: [
    { id: "scribe_v2", capabilities: ["stt"], languages: [], voices: [] },
    { id: "eleven_flash_v2_5", capabilities: ["tts"], languages: [], voices: [{ id: "v1", name: "Rachel", languages: ["en"] }], speed: { min: 0.7, max: 1.2 } },
  ] },
  { id: "openai", name: "OpenAI", status: { stale: false, reason: { code: "credential-missing", params: {} } }, models: [] },
] as unknown as CatalogView[];
function memory(entries: Record<string, string> = {}) {
  const stored = new Map(Object.entries(entries));
  return { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value), removeItem: (key: string) => void stored.delete(key) } as unknown as Storage;
}

test("with nothing kept, the defaults on this device's catalogue, the language heard detected; what is kept is read back field by field", () => {
  expect(readVoiceSettings(memory())).toEqual(defaultVoiceSettings());
  expect(defaultVoiceSettings().stt).toEqual({ catalog: "local", model: "whisper-base", language: null });
  const storage = memory({ [VOICE_SETTINGS_KEY]: JSON.stringify({
    stt: { catalog: "elevenlabs", model: "scribe_v2", language: null }, tts: { model: "eleven_flash_v2_5", voice: "v1", speed: 1.1 },
    patience: "eager", end_of_turn: "smart-turn",
  }) });
  // A slot that does not name its catalogue is the default slot whole: a model is never looked for in another catalogue.
  expect(readVoiceSettings(storage)).toEqual({
    stt: { catalog: "elevenlabs", model: "scribe_v2", language: null },
    tts: { catalog: "local", model: "kokoro-82m-v1.0", voice: null, speed: 1.1 },
    patience: "normal", end_of_turn: "smart-turn", idle_unload_minutes: 10,
  });
  expect(readVoiceSettings(memory({ [VOICE_SETTINGS_KEY]: "{broken" }))).toEqual(defaultVoiceSettings());
  writeVoiceSettings(storage, defaultVoiceSettings());
  expect(readVoiceSettings(storage)).toEqual(defaultVoiceSettings());
});

test("another source takes its first model that runs; another model drops a language and a voice it lacks, and keeps the speed in its range", () => {
  const settings = { ...defaultVoiceSettings(), stt: { catalog: "local", model: "whisper-base", language: "es" }, tts: { catalog: "local", model: "kokoro-82m-v1.0", voice: "ef_dora", speed: 1.8 } };
  const remote = editVoiceSettings(settings, { stt: { catalog: "elevenlabs" }, tts: { catalog: "elevenlabs" } }, CATALOGS);
  expect(remote.stt).toEqual({ catalog: "elevenlabs", model: "scribe_v2", language: "es" });
  expect(remote.tts).toEqual({ catalog: "elevenlabs", model: "eleven_flash_v2_5", voice: null, speed: 1.2 });
  expect(editVoiceSettings(settings, { stt: { model: "moonshine-tiny" } }, CATALOGS).stt).toEqual({ catalog: "local", model: "moonshine-tiny", language: null });
  // Only the language changes: the model, and the voice, stay.
  expect(editVoiceSettings(settings, { stt: { language: "en" } }, CATALOGS).tts).toEqual(settings.tts);
  // A source with nothing for the slot leaves it with no model, for the person to choose one.
  expect(editVoiceSettings(settings, { stt: { catalog: "openai" } }, CATALOGS).stt.model).toBe("");
});

test("each slot offers this device first, then each provider, one with no models disabled with why; local models by family", () => {
  const choices = voiceChoices(CATALOGS, defaultVoiceSettings(), ["es", "en", "fr"]);
  expect(choices.stt.sources).toEqual([
    { id: "local", local: true, name: null, disabled: false, note: null },
    { id: "elevenlabs", local: false, name: "ElevenLabs", disabled: false, note: null },
    { id: "openai", local: false, name: "OpenAI", disabled: true, note: { key: "voice.catalog.reason", params: { code: "credential-missing" } } },
  ]);
  expect(choices.stt.options).toEqual([
    { id: "whisper-base", group: "whisper", disabled: false, note: null },
    { id: "whisper-large", group: "whisper", disabled: true, note: { key: "voice.model.unfit", reasons: ["memory"] } },
    { id: "moonshine-tiny", group: "moonshine", disabled: false, note: null },
  ]);
  expect(choices.stt.languages).toEqual(["es", "en"]);
  expect(choices.tts.speed).toEqual({ min: 0.5, max: 2 });
  expect(choices.tts.voices).toEqual([{ id: "ef_dora", name: null, languages: ["es"], gender: "female" }]);
  expect(choices.endOfTurn).toEqual({ smartTurn: false, note: { key: "voice.endOfTurn.none" } });
});

test("a remote slot: the provider's models, its voices by name, languages for the person to pick, and its words when it refuses", () => {
  const settings = { ...defaultVoiceSettings(), stt: { catalog: "elevenlabs", model: "scribe_v2", language: null }, tts: { catalog: "elevenlabs", model: "eleven_flash_v2_5", voice: null, speed: 1 } };
  const choices = voiceChoices(CATALOGS, settings, ["es", "en", "fr"]);
  expect(choices.stt.options).toEqual([{ id: "scribe_v2", group: null, disabled: false, note: null }]);
  expect(choices.stt.languages).toEqual(["es", "en", "fr"]);
  expect(choices.tts.voices).toEqual([{ id: "v1", name: "Rachel", languages: ["en"], gender: null }]);
  expect(choices.tts.speed).toEqual({ min: 0.7, max: 1.2 });
  const refusing = CATALOGS.map((catalog) => catalog.id === "elevenlabs" ? { ...catalog, status: { stale: true, reason: { code: "provider-refused" }, detail: "quota_exceeded" } } : catalog) as CatalogView[];
  expect(voiceChoices(refusing, settings).stt.sources[1].note).toEqual({ key: "voice.catalog.reason", params: { code: "provider-refused" }, detail: "quota_exceeded" });
});

test("a kept model its catalogue no longer lists stays chosen and says so; smart-turn once this device has a model that ends turns", () => {
  const settings = { ...defaultVoiceSettings(), stt: { catalog: "local", model: "parakeet", language: null } };
  const withTurns = CATALOGS.map((catalog) => catalog.id === "local" ? { ...catalog, models: [...catalog.models, local("smart-turn-v3", "smart-turn", ["end-of-turn"])] } : catalog) as CatalogView[];
  const choices = voiceChoices(withTurns, settings);
  expect(choices.stt.options[0]).toEqual({ id: "parakeet", group: null, disabled: false, note: { key: "voice.model.missing" } });
  expect(choices.endOfTurn).toEqual({ smartTurn: true, note: null });
  const gone = voiceChoices(CATALOGS, { ...settings, stt: { catalog: "deepgram", model: "nova", language: null } });
  expect(gone.stt.sources.at(-1)).toEqual({ id: "deepgram", local: false, name: null, disabled: false, note: { key: "voice.catalog.missing" } });
});

test("the remote providers are the remote catalogues", () => {
  expect(remoteProviders(CATALOGS)).toEqual([{ id: "elevenlabs", name: "ElevenLabs" }, { id: "openai", name: "OpenAI" }]);
});

test("a build chosen is the model's: another model, or Automatic, drops it", () => {
  const settings = { ...defaultVoiceSettings(), stt: { catalog: "local", model: "whisper-base", language: null, build: "whisper-base/q8" } };
  expect(editVoiceSettings(settings, { stt: { language: "es" } }, CATALOGS).stt.build).toBe("whisper-base/q8");
  expect(editVoiceSettings(settings, { stt: { model: "moonshine-tiny" } }, CATALOGS).stt).not.toHaveProperty("build");
  expect(editVoiceSettings(settings, { stt: { build: null } } as never, CATALOGS).stt).not.toHaveProperty("build");
});

test("a model chosen before it is here waits: the one in use stays, the rest of the change applies, and it switches once ready", () => {
  const saved = defaultVoiceSettings();
  const draft = { ...saved, stt: { catalog: "local", model: "moonshine-tiny", language: "en" }, patience: "calm" as const };
  const notHere = CATALOGS.map((catalog) => catalog.id === "local" ? { ...catalog, models: catalog.models.map((model) => model.id === "moonshine-tiny" ? { ...model, installed: false, builds: [build("moonshine-tiny/int8")] } : model) } : catalog) as CatalogView[];
  expect(readyVoiceSettings(draft, saved, notHere)).toEqual({ ...saved, patience: "calm" });
  expect(readyVoiceSettings(draft, saved, CATALOGS).stt).toEqual(draft.stt);
  // The same model takes its other changes at once.
  expect(readyVoiceSettings({ ...saved, stt: { ...saved.stt, language: "es" } }, saved, []).stt.language).toBe("es");
});

test("the voice detector every call uses is the local Silero VAD where it runs, else another VAD that does", async () => {
  const { vadModel } = await import("./voice-settings.js");
  const vad = (id: string, family: string, runs = true) => ({ id, family, capabilities: ["vad"], builds: [{ id: id + "-b", available: runs, installed: true }] });
  const catalogs = (models: unknown[]) => [{ id: "local", name: null, status: { stale: false }, models }] as never;
  expect(vadModel(catalogs([vad("other-vad", "other"), vad("silero-vad", "silero-vad")]))?.id).toBe("silero-vad");
  expect(vadModel(catalogs([vad("other-vad", "other"), vad("silero-vad", "silero-vad", false)]))?.id).toBe("other-vad");
});

test("a catalogue from a newer engine is read: a model without capabilities, or with them in a shape not known, offers none (core#112)", () => {
  const newer = [{ ...CATALOGS[0], models: [...(CATALOGS[0] as unknown as { models: unknown[] }).models,
    { id: "future-model", family: "future", languages: ["en"], voices: [], builds: [build("future-model/int8")], tier: "pro" },
    { id: "odd-model", family: "odd", capabilities: { stt: true }, languages: ["en"], voices: [], builds: [build("odd-model/int8")] }] },
    ...CATALOGS.slice(1)] as unknown as CatalogView[];
  const choices = voiceChoices(newer, defaultVoiceSettings(), ["es", "en"]);
  expect(choices.stt.options.map((option: { id: string }) => option.id)).toEqual(["whisper-base", "whisper-large", "moonshine-tiny"]);
  expect(choices.tts.options.map((option: { id: string }) => option.id)).toEqual(["kokoro-82m-v1.0"]);
});
