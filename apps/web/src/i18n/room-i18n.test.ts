import { afterAll, expect, test } from "vitest";
import { sources } from "./room-i18n.js";
import { de } from "./room-i18n/de.js";
import { fr } from "./room-i18n/fr.js";
import { it as italian } from "./room-i18n/it.js";
import { ja } from "./room-i18n/ja.js";
import { pl } from "./room-i18n/pl.js";
import { zhHans } from "./room-i18n/zh-Hans.js";

/* The legacy DOM translator's tables (room-i18n/<lang>.js): each says every Spanish source room-i18n.js translates to
 * English, and its rules are the same rules, so no language is left with Spanish where English would have none. */
type Table = { pairs: Record<string, string>; prefixes: [string, string][]; patterns: [string, string][]; unreadSuffix: [string, string]; fragments: [string, string][] };
const tables = { fr, it: italian, de, ja, "zh-Hans": zhHans, pl } as unknown as Record<string, Table>;
const roomI18n = () => (window as unknown as { roomI18n: { setLanguage(language: string): void; translate(value: string): string } }).roomI18n;
afterAll(() => roomI18n().setLanguage("en"));

/** How many capturing groups a pattern has, and the highest `$n` its replacement uses. */
const groups = (pattern: string) => new RegExp(`${pattern}|`).exec("")!.length - 1;
const highest = (replacement: string) => Math.max(0, ...[...replacement.matchAll(/\$(\d)/g)].map((match) => Number(match[1])));

test.each(Object.entries(tables))("the %s table says every Spanish source, by the same rules, with valid groups", (_, table) => {
  expect(Object.keys(table.pairs).sort()).toEqual([...sources.pairs].sort());
  for (const [source, text] of Object.entries(table.pairs)) expect(text.trim(), source).not.toBe("");
  expect([...new Set(table.prefixes.map(([source]) => source))].sort()).toEqual([...sources.prefixes].sort());
  // The rules are room-i18n.js's English ones as data: every table has the same, the French one as the reference.
  expect(table.patterns.map(([pattern]) => pattern)).toEqual(fr.patterns.map(([pattern]) => pattern));
  expect(table.fragments.map(([pattern]) => pattern)).toEqual(fr.fragments.map(([pattern]) => pattern));
  expect(table.unreadSuffix[0]).toBe(fr.unreadSuffix[0]);
  for (const [pattern, replacement] of [...table.patterns, ...table.fragments, table.unreadSuffix])
    expect(highest(replacement), pattern).toBeLessThanOrEqual(groups(pattern));
});

test.each(Object.entries(tables))("in %s the page's Spanish is said by its table, units included, and <html lang> follows", (language, table) => {
  roomI18n().setLanguage(language);
  expect(document.documentElement.lang).toBe(language);
  expect(roomI18n().translate("Configuración")).toBe(table.pairs["Configuración"]);
  for (const [said, value] of [["Vista hace 5 min", "5"], ["Emparejada hace 2 h", "2"]]) {
    const text = roomI18n().translate(said);
    expect(text, said).toContain(value);
    expect(text, said).not.toMatch(/hace/);
  }
  expect(roomI18n().translate("Vista hace 5 min")).not.toBe(roomI18n().translate("Vista hace 5 h"));
  expect(roomI18n().translate("Configuración · 3 nuevas")).toBe(table.pairs["Configuración"] + " · 3 nuevas".replace(new RegExp(table.unreadSuffix[0]), table.unreadSuffix[1]));
});

test("English is unchanged, and anything not offered is English", () => {
  roomI18n().setLanguage("en");
  expect(roomI18n().translate("Vista hace 5 min")).toBe("Seen 5 min ago");
  expect(roomI18n().translate("Emparejada hace 2 h")).toBe("Paired 2 h ago");
  expect(roomI18n().translate("Configuración · 3 nuevas")).toBe("Settings · 3 new");
  roomI18n().setLanguage("ko");
  expect(document.documentElement.lang).toBe("en");
  roomI18n().setLanguage("zh-TW");
  expect(document.documentElement.lang).toBe("en");
  roomI18n().setLanguage("es");
  expect(roomI18n().translate("Vista hace 5 min")).toBe("Vista hace 5 min");
});
