import { systemLanguage } from "../../services/system-language.js";
import { en, type HostMessageKey } from "./messages/en";
import { es } from "./messages/es";

const bundles: Record<string, Partial<Record<HostMessageKey, string>>> = { en, es };
export type HostTranslate = (key: HostMessageKey, params?: Record<string, string | number>) => string;

function preferredLanguage() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem("sidevoice.settings") || "null")?.ui_language;
    if (typeof saved === "string") return systemLanguage(Object.keys(bundles), [saved]);
  } catch { /* The device's language is the fallback when its preference cannot be read. */ }
  return systemLanguage(Object.keys(bundles));
}

export function hostTranslator(language = preferredLanguage()): HostTranslate {
  const bundle = bundles[language] ?? en;
  return (key, params) => (bundle[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
    params?.[name] === undefined ? "" : String(params[name]));
}
