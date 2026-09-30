/* The language a person who never chose gets: their system's. `navigator.languages`, in the person's own
 * order — the desktop app's webview fills it from the OS locale — and the first whose primary subtag a
 * setting supports wins; English when none does. The room's defaults are English because a node cannot know
 * the person's system; the device can, and sends it. Anything this device saved still wins over both. */

/** What the page itself can be shown in (room-i18n.js). */
export const UI_LANGUAGES = ['es', 'en'];
/** What a device's `stt_language` and `default_tts_language` accept (sidevoice-core's settings.py owns it). */
export const SPEECH_LANGUAGES = ['es', 'en', 'fr', 'it', 'pt', 'hi'];

export function systemLanguage(supported, preferred = globalThis.navigator?.languages ?? [globalThis.navigator?.language]) {
  for (const tag of preferred ?? []) {
    const primary = String(tag ?? '').toLowerCase().split(/[-_]/)[0];
    if (supported.includes(primary)) return primary;
  }
  return 'en';
}

/** Every default that depends on the person's language, from one reading of the system's. */
export function systemPreferences(preferred) {
  const speech = systemLanguage(SPEECH_LANGUAGES, preferred);
  return { ui_language: systemLanguage(UI_LANGUAGES, preferred), stt_language: speech, default_tts_language: speech };
}
