import { expect, test } from "vitest";
import { defaultVoiceSettings, editVoiceSettings, providerOf, readVoiceSettings, voiceChoices, writeVoiceSettings, VOICE_SETTINGS_KEY, type VoiceModel } from "./voice-settings.js";

/* The voice settings this device keeps, and the choices the pane offers from the voice's catalogue. */

const build = (id: string, extra: Record<string, unknown> = {}) => ({ id, backend: "sherpa-onnx", precision: "int8", downloadBytes: 80e6, memoryMb: 200, available: true, reasons: [], installed: false, ...extra });
const entry = { family: "test", parametersM: 1, license: "MIT" };
const catalogue: VoiceModel[] = [
  { ...entry, id: "whisper-base", capabilities: ["stt"], languages: ["es", "en"], voices: [], installed: true, recommendedBuild: "whisper-base/int8",
    builds: [build("whisper-base/int8", { accelerator: "cpu", installed: true }), build("whisper-base/fp16", { available: false, reasons: [{ code: "wasm-memory", params: {} }] })] },
  { ...entry, id: "whisper-large", capabilities: ["stt"], languages: ["en"], voices: [], installed: false, builds: [build("whisper-large/int8", { available: false, reasons: [{ code: "memory", params: {} }] })] },
  { ...entry, id: "kokoro-82m-v1.0", capabilities: ["tts"], languages: ["es", "en"], voices: [{ id: "ef_dora", languages: ["es"], gender: "female" }], installed: true, builds: [build("kokoro/int8")] },
  { ...entry, id: "gpt-4o-transcribe", capabilities: ["stt"], languages: [], voices: [], installed: false, builds: [build("gpt-4o-transcribe/openai", { backend: "openai", accelerator: "remote", precision: "remote" })] },
  { ...entry, id: "eleven-v3", capabilities: ["tts"], languages: [], voices: [], installed: true, builds: [build("eleven-v3/elevenlabs", { backend: "elevenlabs", accelerator: "remote", precision: "remote" })] },
];
function memory(entries: Record<string, string> = {}) {
  const stored = new Map(Object.entries(entries));
  return { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value), removeItem: (key: string) => void stored.delete(key) } as unknown as Storage;
}

test("with nothing kept, the defaults in the device's language; what is kept is read back field by field", () => {
  expect(readVoiceSettings(memory(), "es")).toEqual(defaultVoiceSettings("es"));
  const storage = memory({ [VOICE_SETTINGS_KEY]: JSON.stringify({ stt: { model: "gpt-4o-transcribe", language: null }, tts: { speed: 9 }, patience: "eager", end_of_turn: "smart-turn" }) });
  expect(readVoiceSettings(storage, "es")).toEqual({
    stt: { model: "gpt-4o-transcribe", build: null, language: null },
    tts: { model: "kokoro-82m-v1.0", build: null, voice: null, speed: 2 },
    patience: "normal", end_of_turn: "smart-turn",
  });
  expect(readVoiceSettings(memory({ [VOICE_SETTINGS_KEY]: "{broken" }), "en")).toEqual(defaultVoiceSettings("en"));
  writeVoiceSettings(storage, defaultVoiceSettings("en"));
  expect(readVoiceSettings(storage, "es")).toEqual(defaultVoiceSettings("en"));
});

test("a new model drops its build, a language it does not speak, and the voice of the old one", () => {
  const settings = { ...defaultVoiceSettings("es"), stt: { model: "whisper-base", build: "whisper-base/int8", language: "es" }, tts: { model: "kokoro-82m-v1.0", build: "kokoro/int8", voice: "ef_dora", speed: 1.2 } };
  const next = editVoiceSettings(settings, { stt: { model: "whisper-large" }, tts: { model: "eleven-v3" } }, catalogue);
  expect(next.stt).toEqual({ model: "whisper-large", build: null, language: null });
  expect(next.tts).toEqual({ model: "eleven-v3", build: null, voice: null, speed: 1.2 });
  expect(editVoiceSettings(settings, { stt: { language: "en" } }, catalogue).stt).toEqual({ model: "whisper-base", build: "whisper-base/int8", language: "en" });
});

test("the pane offers what runs here, greys out what does not with why, and a remote model until its key is kept", () => {
  const choices = voiceChoices(catalogue, defaultVoiceSettings("es"), { openai: false, elevenlabs: true }, ["es", "en", "fr"]);
  expect(choices.stt.options).toEqual([
    { id: "whisper-base", provider: null, disabled: false, note: "" },
    { id: "whisper-large", provider: null, disabled: true, note: "no cabe en la memoria de este dispositivo" },
    { id: "gpt-4o-transcribe", provider: "openai", disabled: true, note: "Falta la clave de OpenAI" },
  ]);
  expect(choices.stt.builds.map(({ id, disabled, note }) => [id, disabled, note])).toEqual([
    ["whisper-base/int8", false, ""],
    ["whisper-base/fp16", true, "necesita más memoria de la que una página puede usar"],
  ]);
  expect(choices.stt.builds[0].label).toBe("sherpa-onnx · int8 · cpu · 80 MB · descargado");
  expect(choices.stt.recommendedBuild).toBe("whisper-base/int8");
  expect(choices.stt.languages).toEqual(["es", "en"]);
  expect(choices.tts.options.find((option) => option.id === "eleven-v3")).toEqual({ id: "eleven-v3", provider: "elevenlabs", disabled: false, note: "" });
  expect(choices.tts.voices).toEqual([{ id: "ef_dora", languages: ["es"], gender: "female" }]);
  expect(choices.endOfTurn.smartTurn).toBe(false);
  expect(choices.endOfTurn.note).toMatch(/termina con el silencio/);
});

test("a remote model has no builds to choose, takes the offered languages, and the account's voice", () => {
  const settings = { ...defaultVoiceSettings("es"), stt: { model: "gpt-4o-transcribe", build: null, language: null }, tts: { model: "eleven-v3", build: null, voice: null, speed: 1 } };
  const choices = voiceChoices(catalogue, settings, { openai: true, elevenlabs: true }, ["es", "en"]);
  expect(choices.stt.builds).toEqual([]);
  expect(choices.stt.languages).toEqual(["es", "en"]);
  expect(choices.tts.voices).toEqual([]);
  expect(choices.tts.voiceNote).toBe("La primera voz de tu cuenta.");
  expect(providerOf(catalogue[3])).toBe("openai");
  expect(providerOf(catalogue[0])).toBeNull();
});

test("a kept model the catalogue lacks stays chosen and says so; smart-turn is offered once a model can end a turn", () => {
  const choices = voiceChoices([...catalogue, { ...entry, id: "smart-turn-v3", capabilities: ["end-of-turn"], languages: [], voices: [], installed: false, builds: [] }],
    { ...defaultVoiceSettings("es"), stt: { model: "parakeet", build: null, language: null } });
  expect(choices.stt.options[0]).toEqual({ id: "parakeet", provider: null, disabled: false, note: "no está en el catálogo de esta voz" });
  expect(choices.endOfTurn).toEqual({ smartTurn: true, note: "" });
});
