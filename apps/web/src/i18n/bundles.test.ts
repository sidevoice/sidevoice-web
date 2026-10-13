import { expect, test } from "vitest";
import { UI_LANGUAGES } from "../services/system-language.js";

/* AGENTS.md: English has every key (each translator's type holds its callers to it). Every language the interface is
 * offered in says every one of them too, with the same placeholders and never an empty text: a missing key would fall
 * back to English in the middle of another language. Found by file, so a new bundle or language cannot be skipped. */
const files = import.meta.glob<Record<string, Record<string, string>>>(["../**/messages/*.ts", "!../**/*.test.ts"], { eager: true });
const bundles = new Map<string, Record<string, Record<string, string>>>();
for (const [path, module] of Object.entries(files)) {
  const [, dir, language] = path.match(/^\.\.\/(.+)\/messages\/([\w-]+)\.ts$/)!;
  const exported = Object.values(module).filter((value) => typeof value === "object");
  expect(exported, path).toHaveLength(1);
  bundles.set(dir, { ...bundles.get(dir), [language]: exported[0] });
}
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test("every keyed bundle is found, in every interface language and no other", () => {
  expect([...bundles.keys()].sort()).toEqual(["call-controls", "components/ui", "features/call", "features/conversation", "features/diagnostics", "features/settings"]);
  for (const [dir, languages] of bundles) expect(Object.keys(languages).sort(), dir).toEqual([...UI_LANGUAGES].sort());
});

test.each([...bundles].flatMap(([dir, languages]) => UI_LANGUAGES.map((language) => [dir, language, languages] as const)))(
  "the %s bundle in %s: exactly English's keys, the same placeholders, no empty text", (_, language, languages) => {
    const english = languages.en;
    const bundle = languages[language];
    expect(Object.keys(bundle).sort()).toEqual(Object.keys(english).sort());
    for (const [key, text] of Object.entries(bundle)) {
      expect(text.trim(), key).not.toBe("");
      expect(placeholders(text), key).toEqual(placeholders(english[key]));
    }
  });
