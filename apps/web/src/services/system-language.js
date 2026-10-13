/* The language a person who never chose gets: their system's. `navigator.languages`, in the person's own
 * order — the desktop app's webview fills it from the OS locale — and the first whose primary subtag a
 * setting supports wins; English when none does. Chinese is offered in Simplified script only, as sidevoice-core's
 * `ui_locale` does: zh, zh-CN, zh-SG and zh-Hans* are zh-Hans; zh-Hant*, zh-TW, zh-HK and zh-MO are not supported.
 * The room's defaults are English because a node cannot know the person's system; the device can, and sends it.
 * Anything this device saved still wins over both. */

/** What the page itself can be shown in (room-i18n.js). */
export const UI_LANGUAGES = ['es', 'en', 'fr', 'it', 'de', 'ja', 'zh-Hans', 'pl'];
/** Each of them in its own name, as language pickers show them: not translated. */
export const UI_LANGUAGE_NAMES = { es: 'Español', en: 'English', fr: 'Français', it: 'Italiano', de: 'Deutsch', ja: '日本語', 'zh-Hans': '简体中文', pl: 'Polski' };
/** The speech languages a stage's language and voices are chosen in (sidevoice-core's voice catalogue). */
export const SPEECH_LANGUAGES = ['es', 'en', 'fr', 'it', 'pt', 'hi'];

export function systemLanguage(supported, preferred = globalThis.navigator?.languages ?? [globalThis.navigator?.language]) {
  for (const tag of preferred ?? []) {
    const language = supportedLanguage(supported, tag);
    if (language) return language;
  }
  return 'en';
}

/** The language among `supported` a BCP 47 tag or a POSIX locale (`zh_CN.UTF-8`) names, if any. */
function supportedLanguage(supported, tag) {
  const [primary, ...rest] = String(tag ?? '').toLowerCase().split(/[-_.@]/);
  if (primary === 'zh') {
    const traditional = rest.some((subtag) => ['hant', 'tw', 'hk', 'mo'].includes(subtag));
    return !traditional && supported.includes('zh-Hans') ? 'zh-Hans' : undefined;
  }
  return supported.includes(primary) ? primary : undefined;
}

/** The device settings that default to the person's language. The stages' language options default to the
 *  system's speech language too, where the stage is built (stage-settings.js `defaultStage`). */
export function systemPreferences(preferred) {
  return { ui_language: systemLanguage(UI_LANGUAGES, preferred) };
}
