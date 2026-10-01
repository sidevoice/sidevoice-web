/* Keyed messages for the call controls card (AGENTS.md): one bundle per language, English the fallback for a
 * missing key or a language without a bundle, the system's language when there is a bundle for it. */
import { systemLanguage } from "../services/system-language.js";
import { en, type MessageKey } from "./messages/en";
import { es } from "./messages/es";

const bundles: Record<string, Partial<Record<MessageKey, string>>> = { en, es };

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function translator(language: string): Translate {
  const bundle = bundles[language] ?? en;
  return (key, params) => {
    const text = bundle[key] ?? en[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name: string) => (params && params[name] !== undefined ? String(params[name]) : ""));
  };
}

/** The language the card speaks: the system's, among those it has a bundle for; English otherwise. */
export function cardLanguage(preferred?: readonly (string | undefined)[] | null): string {
  return systemLanguage(Object.keys(bundles), preferred);
}
