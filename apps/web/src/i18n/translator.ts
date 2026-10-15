/* The room's keyed messages (AGENTS.md): one catalogue per language in ./locales, found by file — a language is offered
 * by adding its file, and nothing else names the list. English is the reference (every other catalogue is typed against
 * its keys) and the fallback for a language without a catalogue. The language the interface speaks is kept here, and
 * whoever draws words subscribes to it, so a switch redraws them all. */
import { systemLanguage } from "../services/system-language.js";
import { messages as en, type MessageKey } from "./locales/en";

export type { MessageKey } from "./locales/en";
export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

interface Locale { name: string; messages: Partial<Record<MessageKey, string>> }
const files = import.meta.glob<Locale>("./locales/*.ts", { eager: true });
const locales: Record<string, Locale> = Object.fromEntries(Object.entries(files).map(([path, locale]) =>
  [path.slice("./locales/".length, -".ts".length), locale]));

/** Every language the interface can be shown in, in the order the language pickers list them: by their own names. */
export const UI_LANGUAGES = Object.keys(locales).sort((a, b) => locales[a].name.localeCompare(locales[b].name, "en"));
/** A language in its own name, as language pickers show it: not translated. */
export const languageName = (language: string) => locales[language]?.name ?? language;

/** Where the room keeps this device's settings (room-session-controller.js `SETTINGS_KEY`). */
export const SETTINGS_STORAGE_KEY = "sidevoice.settings";

/** The interface's language on this device, among `supported`: the one saved in its settings, else the system's. */
export function preferredLanguage(supported: string[] = UI_LANGUAGES) {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY) || "null")?.ui_language;
    if (typeof saved === "string") return systemLanguage(supported, [saved]);
  } catch { /* The device's language is the fallback when its preference cannot be read. */ }
  return systemLanguage(supported);
}

let current: string | null = null;
const listeners = new Set<() => void>();

/** The language the interface speaks now: the one the runtime last set, else (before it runs) this device's preference. */
export function uiLanguage() {
  return current ?? preferredLanguage();
}

/** Speak `value` (a language tag, or '' for the system's) from now on: the page's `<html lang>` says it, which every
 *  date and number is formatted in (locale.ts), and everything subscribed redraws in it. */
export function setUiLanguage(value: string) {
  const language = value ? systemLanguage(UI_LANGUAGES, [value]) : systemLanguage(UI_LANGUAGES);
  const root = globalThis.document?.documentElement;
  if (root) root.lang = language;
  if (language === current) return;
  current = language;
  for (const listener of listeners) listener();
}

/** Be told when the interface's language changes; returns the unsubscription. */
export function onUiLanguage(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The words of `language` (the interface's, by default), with `{name}` filled from `params`. */
export function translator(language = uiLanguage()): Translate {
  const bundle = locales[language]?.messages ?? en;
  return (key, params) => (bundle[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
    params?.[name] === undefined ? "" : String(params[name]));
}

/** Whether this language's own catalogue contains the key, without using the English UI fallback. */
export function hasTranslation(language: string, key: string): key is MessageKey {
  return Object.hasOwn(locales[language]?.messages ?? en, key);
}
