import { expect, test } from "vitest";
import { languageName, translator, UI_LANGUAGES } from "./translator";
import { systemLanguage } from "../services/system-language.js";

/* AGENTS.md: English has every key (each catalogue's type holds it to them). Every language the interface is offered in
 * says every one of them too, with the same placeholders and never an empty text: a missing key would fall back to
 * English in the middle of another language. Found by file, as the translator finds them, so a new language is held to
 * the same rules the moment its file exists. */
const files = import.meta.glob<{ name: string; messages: Record<string, string> }>(["./locales/*.ts"], { eager: true });
const locales = new Map(Object.entries(files).map(([path, locale]) => [path.match(/^\.\/locales\/([\w-]+)\.ts$/)![1], locale]));
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test("the interface is offered in exactly the languages that have a catalogue, each in its own name", () => {
  expect([...UI_LANGUAGES].sort()).toEqual([...locales.keys()].sort());
  expect([...locales.keys()].sort()).toEqual(["de", "en", "es", "fr", "it", "ja", "pl", "zh-Hans"]);
  for (const [language, locale] of locales) {
    expect(locale.name.trim(), language).not.toBe("");
    expect(languageName(language)).toBe(locale.name);
  }
});

test("a system's language finds its catalogue: Simplified Chinese only, and English for anything else", () => {
  expect(systemLanguage(UI_LANGUAGES, ["zh-CN"])).toBe("zh-Hans");
  for (const tag of ["zh-Hant", "zh-TW", "zh-HK", "zh-MO", "ko-KR"]) expect(systemLanguage(UI_LANGUAGES, [tag]), tag).toBe("en");
  for (const language of UI_LANGUAGES) expect(systemLanguage(UI_LANGUAGES, [language]), language).toBe(language);
});

test.each([...locales.keys()])("the %s catalogue: exactly English's keys, the same placeholders, no empty text", (language) => {
  const english = locales.get("en")!.messages;
  const catalogue = locales.get(language)!.messages;
  expect(Object.keys(catalogue).sort()).toEqual(Object.keys(english).sort());
  for (const [key, text] of Object.entries(catalogue)) {
    expect(text.trim(), key).not.toBe("");
    expect(placeholders(text), key).toEqual(placeholders(english[key]));
  }
});
test("unheard and partial labels agree at 1, 2, 5 and 21 in French, Italian and Polish", () => {
  for(const [language,unheard,partial] of [
    ["fr","À écouter : ","Caractères lus : 1/1"],
    ["it","Da ascoltare: ","Caratteri riprodotti: 1/1"],
    ["pl","Nieodsłuchane: ","Odtworzone znaki: 1/1"],
  ] as const){
    const t=translator(language);
    for(const n of [1,2,5,21])expect(t("state.unheard",{n})).toBe(unheard+n);
    expect(t("messages.audio.partial",{heard:1,total:1})).toBe(partial);
  }
});
test("output restoration and unknown hearing copy name the sound and measured extent", () => {
  expect(translator("es")("toolbar.agentsUnmute")).toBe("Quitar el silencio a los agentes");
  expect(translator("it")("toolbar.agentsUnmute")).toBe("Riattiva l'audio degli agenti");
  expect(translator("fr")("messages.audio.unknown")).toBe("Audio interrompu · Partie écoutée inconnue");
  expect(translator("fr")("messages.audio.notPlayed")).toBe("Audio non lu");
});
