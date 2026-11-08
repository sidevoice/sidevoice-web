import { expect, test } from "vitest";
import { languagePrimary, languageSupported, orderLanguages } from "./model-languages";

/* A model's languages as its block says them: the interface's and the chosen one first, then the engine's order. */

test("a language is its primary subtag, lower-case", () => {
  expect(["en", "en-US", "EN_gb", "zh-Hans", "pt-BR"].map(languagePrimary)).toEqual(["en", "en", "en", "zh", "pt"]);
});

test("the interface's language comes first, then the chosen one, then the rest in the engine's order", () => {
  const tags = ["en", "ko", "ja", "de", "es", "fr"];
  expect(orderLanguages(tags, ["es", null])).toEqual(["es", "en", "ko", "ja", "de", "fr"]);
  expect(orderLanguages(tags, ["ja", null])).toEqual(["ja", "en", "ko", "de", "es", "fr"]);
  expect(orderLanguages(tags, ["es", "de"])).toEqual(["es", "de", "en", "ko", "ja", "fr"]);
  // The same language twice, or none, moves nothing more.
  expect(orderLanguages(tags, ["de", "de-AT"])).toEqual(["de", "en", "ko", "ja", "es", "fr"]);
  expect(orderLanguages(tags, [null, null])).toEqual(tags);
});

test("regional tags match their language, all of them first, each once", () => {
  expect(orderLanguages(["ko", "en-US", "es", "en-GB"], ["en", "en-GB"])).toEqual(["en-US", "en-GB", "ko", "es"]);
  expect(orderLanguages(["en", "zh", "ja"], ["zh-Hans", null])).toEqual(["zh", "en", "ja"]);
});

test("a language is supported when the model lists it in any region, or lists none", () => {
  expect(languageSupported(["en-US", "es"], "en")).toBe(true);
  expect(languageSupported(["es"], "en-GB")).toBe(false);
  expect(languageSupported([], "pl")).toBe(true);
});
