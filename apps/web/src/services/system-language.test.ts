import { expect, test } from "vitest";
import { SPEECH_LANGUAGES, UI_LANGUAGES, systemLanguage, systemPreferences } from "./system-language.js";

test("the system's first supported language wins, by its primary subtag", () => {
  expect(systemLanguage(UI_LANGUAGES, ["es-ES"])).toBe("es");
  expect(systemLanguage(SPEECH_LANGUAGES, ["de-DE", "fr-FR"])).toBe("fr");
  expect(systemLanguage(SPEECH_LANGUAGES, ["pt_BR"])).toBe("pt");
});

test("English when the system speaks nothing a setting supports", () => {
  expect(systemLanguage(UI_LANGUAGES, ["de-DE"])).toBe("en");
  expect(systemLanguage(UI_LANGUAGES, ["de-DE", "fr-FR"])).toBe("en");
  expect(systemLanguage(SPEECH_LANGUAGES, [])).toBe("en");
  expect(systemLanguage(SPEECH_LANGUAGES, null)).toBe("en");
});

test("each setting reads the same system list against what it supports", () => {
  expect(systemPreferences(["de-DE", "fr-FR"])).toEqual({ ui_language: "en", stt_language: "fr", default_tts_language: "fr" });
  expect(systemPreferences(["es-419", "en-US"])).toEqual({ ui_language: "es", stt_language: "es", default_tts_language: "es" });
  expect(systemPreferences(["de-DE"])).toEqual({ ui_language: "en", stt_language: "en", default_tts_language: "en" });
});
