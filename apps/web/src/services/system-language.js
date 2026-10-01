/* The language a person who never chose gets: their system's. `navigator.languages`, in the person's own
 * order — the desktop app's webview fills it from the OS locale — and the first whose primary subtag a
 * setting supports wins; English when none does. The room's defaults are English because a node cannot know
 * the person's system; the device can, and sends it. Anything this device saved still wins over both. */

/** What the page itself can be shown in (room-i18n.js). */
export const UI_LANGUAGES = ['es', 'en'];
/** The speech languages a stage's language and voices are chosen in (sidevoice-core's voice catalogue). */
export const SPEECH_LANGUAGES = ['es', 'en', 'fr', 'it', 'pt', 'hi'];

export function systemLanguage(supported, preferred = globalThis.navigator?.languages ?? [globalThis.navigator?.language]) {
  for (const tag of preferred ?? []) {
    const primary = String(tag ?? '').toLowerCase().split(/[-_]/)[0];
    if (supported.includes(primary)) return primary;
  }
  return 'en';
}

/** The device settings that default to the person's language. The stages' language options default to the
 *  system's speech language too, where the stage is built (stage-settings.js `defaultStage`). */
export function systemPreferences(preferred) {
  return { ui_language: systemLanguage(UI_LANGUAGES, preferred) };
}
