import { expect, test } from "vitest";
import { pluralKey, translator, UI_LANGUAGES } from "./translator";

/* A text that depends on a count has a form per count (`<base>.one`, `.few`, `.other`), chosen by the language's own plural
 * rules. "+N more" of a model's languages is one: its visible words and its accessible name. */

const more = (language: string, n: number) => translator(language)(pluralKey("voice.languages.more", n, language), { n });
const label = (language: string, n: number) => translator(language)(pluralKey("voice.languages.moreLabel", n, language), { n });

test("the forms by language: one, few (Polish's 2–4) and the rest", () => {
  expect([1, 2, 5, 12, 14, 22, 24, 112].map((n) => pluralKey("x", n, "pl"))).toEqual(["x.one", "x.few", "x.other", "x.other", "x.other", "x.few", "x.few", "x.other"]);
  expect([1, 2, 5, 22].map((n) => pluralKey("x", n, "en"))).toEqual(["x.one", "x.other", "x.other", "x.other"]);
  expect([1, 2].map((n) => pluralKey("x", n, "zh-Hans"))).toEqual(["x.other", "x.other"]);
});

test("Spanish and English say '+1 idioma más' / '+1 more language' and the plural for the rest", () => {
  expect(label("es", 1)).toBe("+1 idioma más");
  expect([2, 5, 12, 22, 27].map((n) => label("es", n))).toEqual(["+2 idiomas más", "+5 idiomas más", "+12 idiomas más", "+22 idiomas más", "+27 idiomas más"]);
  expect(label("en", 1)).toBe("+1 more language");
  expect([2, 27].map((n) => label("en", n))).toEqual(["+2 more languages", "+27 more languages"]);
  expect([1, 27].map((n) => more("en", n))).toEqual(["+1 more", "+27 more"]);
});

test("Polish: 1 język, 2–4 języki, 5–21 języków, 22–24 języki, 25 języków", () => {
  expect([1, 2, 5, 12, 22].map((n) => label("pl", n))).toEqual([
    "+1 język więcej", "+2 języki więcej", "+5 języków więcej", "+12 języków więcej", "+22 języki więcej",
  ]);
  expect([4, 14, 21, 24, 25].map((n) => label("pl", n))).toEqual([
    "+4 języki więcej", "+14 języków więcej", "+21 języków więcej", "+24 języki więcej", "+25 języków więcej",
  ]);
});

test("the singular forms of the other languages", () => {
  expect(label("fr", 1)).toBe("+1 autre langue");
  expect(label("fr", 3)).toBe("+3 autres langues");
  expect(label("de", 1)).toBe("+1 weitere Sprache");
  expect(label("de", 3)).toBe("+3 weitere Sprachen");
  expect(label("it", 1)).toBe("+1 altra lingua");
  expect(label("it", 3)).toBe("+3 altre lingue");
  expect(label("ja", 1)).toBe("他 1 言語");
  expect(label("ja", 3)).toBe("他 3 言語");
});

test.each(UI_LANGUAGES)("%s: the accessible name of '+N more' contains its visible text, for every count (WCAG 2.5.3)", (language) => {
  for (const n of [1, 2, 3, 4, 5, 12, 21, 22, 27, 96]) expect(label(language, n), `${language} ${n}`).toContain(more(language, n));
});
