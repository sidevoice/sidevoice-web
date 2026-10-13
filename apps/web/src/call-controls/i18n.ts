/* Keyed messages for the call controls card (AGENTS.md): one bundle per language, English the fallback for a
 * missing key or a language without a bundle, in the language this device's interface is set to. */
import { preferredLanguage } from "../i18n/translator";
import { systemLanguage } from "../services/system-language.js";
import { en, type MessageKey } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";
import { it } from "./messages/it";
import { de } from "./messages/de";
import { ja } from "./messages/ja";
import { zhHans } from "./messages/zh-Hans";
import { pl } from "./messages/pl";

const bundles: Record<string, Partial<Record<MessageKey, string>>> = { en, es, fr, it, de, ja, "zh-Hans": zhHans, pl };

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function translator(language: string): Translate {
  const bundle = bundles[language] ?? en;
  return (key, params) => {
    const text = bundle[key] ?? en[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name: string) => (params && params[name] !== undefined ? String(params[name]) : ""));
  };
}

/** The language the card speaks: the one this device's settings chose, else the system's (or `preferred`'s), among
 *  those it has a bundle for; English otherwise. */
export function cardLanguage(preferred?: readonly (string | undefined)[] | null): string {
  return preferred ? systemLanguage(Object.keys(bundles), preferred) : preferredLanguage(Object.keys(bundles));
}
