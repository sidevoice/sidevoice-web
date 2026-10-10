/* The room's keyed messages (AGENTS.md): one bundle per language, English the fallback for a missing key or for a
 * language without a bundle, in the language this device's interface is set to. Each part of the room keeps its own
 * bundles and makes its translator here, so they all resolve the same language the same way. */
import { systemLanguage } from "../services/system-language.js";

export type Translate<Key extends string> = (key: Key, params?: Record<string, string | number>) => string;

/** The interface's language on this device, among `supported`: the one saved in its settings, else the system's. */
export function preferredLanguage(supported: string[]) {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem("sidevoice.settings") || "null")?.ui_language;
    if (typeof saved === "string") return systemLanguage(supported, [saved]);
  } catch { /* The device's language is the fallback when its preference cannot be read. */ }
  return systemLanguage(supported);
}

/** A translator factory over `en` and the other languages' bundles: called with no language, it speaks the device's. */
export function createTranslator<Key extends string>(en: Record<Key, string>, others: Record<string, Partial<Record<Key, string>>>) {
  const bundles: Record<string, Partial<Record<Key, string>>> = { en, ...others };
  return (language = preferredLanguage(Object.keys(bundles))): Translate<Key> => {
    const bundle = bundles[language] ?? en;
    return (key, params) => (bundle[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
      params?.[name] === undefined ? "" : String(params[name]));
  };
}
