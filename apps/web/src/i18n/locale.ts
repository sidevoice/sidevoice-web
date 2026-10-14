/* The locale every date, number, list and relative time is formatted in: the interface's language, which
 * translator.ts keeps on `<html lang>`; the browser's own until it is set. Never `navigator.language`, which can
 * differ from the language the page speaks. */
export function uiLocale(): string | undefined {
  return globalThis.document?.documentElement.lang || undefined;
}
