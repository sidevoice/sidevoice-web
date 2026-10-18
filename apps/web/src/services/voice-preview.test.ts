import { expect, test } from "vitest";
import type { CatalogView } from "./model-catalogs.js";
import { defaultVoiceSettings } from "./voice-settings.js";
import { voicePreview } from "./voice-preview";

const settings = defaultVoiceSettings();
const catalogs = (languages: string[], voices: { id: string; languages: string[] }[]): CatalogView[] => [{
  id: "local", name: null, status: { stale: false }, models: [{
    id: "kokoro-82m-v1.0", family: "kokoro", capabilities: ["tts"], languages, voices,
  }],
}] as CatalogView[];

test("Spanish-only Dora keeps Spanish words and locale even when the interface and transcription are English", () => {
  const chosen = { ...settings, stt: { ...settings.stt, language: "en" }, tts: { ...settings.tts, voice: "ef_dora" } };
  expect(voicePreview(chosen, catalogs(["en", "es"], [{ id: "ef_dora", languages: ["es"] }]), "en")).toEqual({
    language: "es", sample: "¡Hola! Así leerá Sidevoice las respuestas de tu agente.",
  });
});

test("multilingual voice follows a supported explicit speech preference and then the device's speech language", () => {
  const available = catalogs(["en", "es"], [{ id: "multi", languages: ["en", "es"] }]);
  const chosen = { ...settings, tts: { ...settings.tts, voice: "multi" } };
  expect(voicePreview({ ...chosen, stt: { ...chosen.stt, language: "es" } }, available, "en").language).toBe("es");
  expect(voicePreview(chosen, available, "es").language).toBe("es");
  expect(voicePreview(chosen, available, "en")).toEqual({
    language: "en", sample: "Hi! This is how Sidevoice will read your agent's replies.",
  });
});

test("ordinary English voice keeps English text and its regional speech locale", () => {
  const chosen = { ...settings, tts: { ...settings.tts, voice: "af_heart" } };
  expect(voicePreview(chosen, catalogs(["en-US", "es"], [{ id: "af_heart", languages: ["en-US"] }]), "es")).toEqual({
    language: "en-US", sample: "Hi! This is how Sidevoice will read your agent's replies.",
  });
});

test("automatic voice follows the model's first voice rather than the model-wide language list", () => {
  expect(voicePreview(settings, catalogs(["en", "es"], [{ id: "ef_dora", languages: ["es"] }, { id: "af_heart", languages: ["en"] }]), "en").language).toBe("es");
});

test("speech languages without a full interface bundle still use matching example words", () => {
  const chosen = { ...settings, tts: { ...settings.tts, voice: "pf_dora" } };
  expect(voicePreview(chosen, catalogs(["en"], [{ id: "pf_dora", languages: ["pt-BR"] }]), "en")).toEqual({
    language: "pt-BR", sample: "Olá! É assim que o Sidevoice vai ler as respostas do seu agente.",
  });
  expect(voicePreview({ ...chosen, tts: { ...chosen.tts, voice: "hf_alpha" } }, catalogs(["en"], [{ id: "hf_alpha", languages: ["hi"] }]), "en")).toEqual({
    language: "hi", sample: "नमस्ते! Sidevoice आपके एजेंट के जवाब इसी तरह पढ़ेगा।",
  });
});

test("a Korean-only voice never receives an English fallback sample or an unsupported English locale", () => {
  expect(voicePreview(settings, catalogs(["ko"], []), "en")).toEqual({ language: "ko", sample: "" });
});
