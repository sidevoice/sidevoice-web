/* The language a person who never chose gets: their system's. `navigator.languages`, in the person's own
 * order — the desktop app's webview fills it from the OS locale — and the first whose primary subtag a
 * setting supports wins; English when none does. Chinese is offered in Simplified script only, as sidevoice-core's
 * `ui_locale` does: zh, zh-CN, zh-SG and zh-Hans* are zh-Hans; zh-Hant*, zh-TW, zh-HK and zh-MO are not supported.
 * The room's defaults are English because a node cannot know the person's system; the device can, and sends it.
 * Anything this device saved still wins over both. The interface's languages are its catalogues' (i18n/translator.ts
 * `UI_LANGUAGES`); the speech languages are listed here. */

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

