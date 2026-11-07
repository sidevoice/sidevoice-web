import { expect, test } from "vitest";
import { SPEECH_LANGUAGES, systemLanguage } from "./system-language.js";
import { UI_LANGUAGES } from "../i18n/translator";

test("the system's first supported language wins, by its primary subtag", () => {
  expect(systemLanguage(UI_LANGUAGES, ["es-ES"])).toBe("es");
  expect(systemLanguage(SPEECH_LANGUAGES, ["de-DE", "fr-FR"])).toBe("fr");
  expect(systemLanguage(SPEECH_LANGUAGES, ["pt_BR"])).toBe("pt");
});

test("English when the system speaks nothing a setting supports", () => {
  expect(systemLanguage(UI_LANGUAGES, ["vi-VN"])).toBe("en");
  expect(systemLanguage(UI_LANGUAGES, ["vi-VN", "ru-RU"])).toBe("en");
  expect(systemLanguage(SPEECH_LANGUAGES, [])).toBe("en");
  expect(systemLanguage(SPEECH_LANGUAGES, null)).toBe("en");
});

test("the interface's language is the system's, English when it is not one of ours", () => {
  expect(systemLanguage(UI_LANGUAGES, ["vi-VN", "ru-RU"])).toBe("en");
  expect(systemLanguage(UI_LANGUAGES, ["vi-VN", "ko-KR"])).toBe("ko");
  expect(systemLanguage(UI_LANGUAGES, ["de-DE", "fr-FR"])).toBe("de");
  expect(systemLanguage(UI_LANGUAGES, ["es-419", "en-US"])).toBe("es");
});

test("every interface language is found by its primary subtag", () => {
  for (const [tag, language] of [["fr-CA", "fr"], ["it_IT.UTF-8", "it"], ["de-AT", "de"], ["ja-JP", "ja"], ["pl-PL", "pl"], ["ko-KR", "ko"], ["hi-IN", "hi"], ["en-GB", "en"]])
    expect(systemLanguage(UI_LANGUAGES, [tag]), tag).toBe(language);
});

test("Portuguese is one catalogue, Brazil's, until a European one exists; the speech languages keep their own pt", () => {
  for (const tag of ["pt", "pt-BR", "pt-PT", "pt_BR.UTF-8", "pt_PT", "PT-pt"]) expect(systemLanguage(UI_LANGUAGES, [tag]), tag).toBe("pt-BR");
  expect(systemLanguage(UI_LANGUAGES, ["ru-RU", "pt-PT", "de-DE"])).toBe("pt-BR");
  expect(systemLanguage(UI_LANGUAGES, ["pt-BR"])).toBe("pt-BR");
  expect(systemLanguage(SPEECH_LANGUAGES, ["pt-PT"])).toBe("pt");
});

test("Chinese is offered in Simplified script only, as the core does", () => {
  for (const tag of ["zh", "zh-CN", "zh-SG", "zh-Hans", "zh-Hans-SG", "zh_CN.UTF-8"]) expect(systemLanguage(UI_LANGUAGES, [tag]), tag).toBe("zh-Hans");
  for (const tag of ["zh-Hant", "zh-TW", "zh-HK", "zh_HK.UTF-8", "zh-Hant-MO", "zh-MO"]) expect(systemLanguage(UI_LANGUAGES, [tag]), tag).toBe("en");
  // A Traditional reader's next language still wins over English.
  expect(systemLanguage(UI_LANGUAGES, ["zh-TW", "ja-JP"])).toBe("ja");
  expect(systemLanguage(SPEECH_LANGUAGES, ["zh-CN"])).toBe("en");
});
