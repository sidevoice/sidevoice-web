/* Keyed messages for the hosts, onboarding and settings screens (AGENTS.md): one bundle per language, English the
 * fallback for a missing key or a language without a bundle; the device's system language when there is a bundle
 * for it, never a hard-coded Spanish. The older screens still go through room-i18n.js pairs (#128); setting the
 * language here tells that one too, so a page speaks one language. */
import { useSyncExternalStore } from "react";
import { systemLanguage } from "../services/system-language.js";
import { en } from "./messages/en";
import { es } from "./messages/es";

const bundles: Record<string, Record<string, string>> = { en, es };
export const LANGUAGES = Object.keys(bundles);

export type Params = Record<string, string | number | undefined>;
export type Translate = (key: string, params?: Params) => string;

let language = systemLanguage(LANGUAGES);
const listeners = new Set<() => void>();

export function translator(lang: string): Translate {
  const bundle = bundles[lang] ?? en;
  return (key, params) => {
    const text = bundle[key] ?? en[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name: string) => (params && params[name] !== undefined ? String(params[name]) : ""));
  };
}

export function currentLanguage(): string { return language; }

export function setLanguage(next: string) {
  language = bundles[next] ? next : "en";
  if (typeof document !== "undefined") document.documentElement.lang = language;
  window.roomI18n?.setLanguage(language);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** The translator for the language in effect; re-renders when it changes. */
export function useT(): Translate {
  const lang = useSyncExternalStore(subscribe, currentLanguage, currentLanguage);
  return translator(lang);
}

export const t: Translate = (key, params) => translator(language)(key, params);
