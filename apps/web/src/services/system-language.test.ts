import { expect, test } from "vitest";
import { SPEECH_LANGUAGES, UI_LANGUAGES, systemLanguage, systemPreferences } from "./system-language.js";

test("the system's first supported language wins, by its primary subtag", () => {
  expect(systemLanguage(UI_LANGUAGES, ["es-ES"])).toBe("es");
  expect(systemLanguage(SPEECH_LANGUAGES, ["de-DE", "fr-FR"])).toBe("fr");
  expect(systemLanguage(SPEECH_LANGUAGES, ["pt_BR"])).toBe("pt");
});

test("English when the system speaks nothing a setting supports", () => {
  expect(systemLanguage(UI_LANGUAGES, ["ko-KR"])).toBe("en");
  expect(systemLanguage(UI_LANGUAGES, ["ko-KR", "pt-BR"])).toBe("en");
  expect(systemLanguage(SPEECH_LANGUAGES, [])).toBe("en");
  expect(systemLanguage(SPEECH_LANGUAGES, null)).toBe("en");
});

test("the interface's language is the system's, English when it is not one of ours", () => {
  expect(systemPreferences(["ko-KR", "pt-BR"])).toEqual({ ui_language: "en" });
  expect(systemPreferences(["de-DE", "fr-FR"])).toEqual({ ui_language: "de" });
  expect(systemPreferences(["es-419", "en-US"])).toEqual({ ui_language: "es" });
});

test("every interface language is found by its primary subtag", () => {
  for (const [tag, language] of [["fr-CA", "fr"], ["it_IT.UTF-8", "it"], ["de-AT", "de"], ["ja-JP", "ja"], ["pl-PL", "pl"], ["en-GB", "en"]])
    expect(systemLanguage(UI_LANGUAGES, [tag]), tag).toBe(language);
});

test("Chinese is offered in Simplified script only, as the core does", () => {
  for (const tag of ["zh", "zh-CN", "zh-SG", "zh-Hans", "zh-Hans-SG", "zh_CN.UTF-8"]) expect(systemLanguage(UI_LANGUAGES, [tag]), tag).toBe("zh-Hans");
  for (const tag of ["zh-Hant", "zh-TW", "zh-HK", "zh_HK.UTF-8", "zh-Hant-MO", "zh-MO"]) expect(systemLanguage(UI_LANGUAGES, [tag]), tag).toBe("en");
  // A Traditional reader's next language still wins over English.
  expect(systemLanguage(UI_LANGUAGES, ["zh-TW", "ja-JP"])).toBe("ja");
  expect(systemLanguage(SPEECH_LANGUAGES, ["zh-CN"])).toBe("en");
});
