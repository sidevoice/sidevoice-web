import type { CatalogView } from "./model-catalogs.js";
import type { DeviceVoiceSettings } from "./voice-settings.js";
import { hasTranslation, translator, UI_LANGUAGES } from "../i18n/translator";
import { messages as pt } from "../i18n/speech-samples/pt";
import { messages as hi } from "../i18n/speech-samples/hi";

const extraSamples: Record<string, string> = { pt: pt["wizard.sampleText"], hi: hi["wizard.sampleText"] };

/** The preview describes the selected speaker, not the interface's language. For an automatic voice, the engine uses
 * the model's first voice; use that voice's languages when the catalogue names it. */
export function voicePreview(settings: DeviceVoiceSettings, catalogs: CatalogView[], deviceSpeechLanguage: string) {
  const model = catalogs.find((catalog) => catalog.id === settings.tts.catalog)?.models
    .find((candidate) => candidate.id === settings.tts.model);
  const voice = settings.tts.voice
    ? model?.voices.find((candidate) => candidate.id === settings.tts.voice)
    : model?.voices[0];
  const languages = voice?.languages?.length ? voice.languages : model?.languages ?? [];
  const preferred = [settings.stt.language, deviceSpeechLanguage].filter((tag): tag is string => !!tag);
  const primary = (tag: string) => tag.toLowerCase().split(/[-_]/)[0];
  const matching = (tag: string) => languages.find((supported) => supported.toLowerCase() === tag.toLowerCase())
    ?? languages.find((supported) => primary(supported) === primary(tag));
  const language = preferred.map(matching).find(Boolean) ?? languages[0] ?? preferred[0] ?? "en";
  // A missing bundle must not supply the translator's English fallback while keeping a different speech language.
  // The person can enter their own phrase; never claim that an English example is suitable for an unknown voice.
  const locale = primary(language) === "zh" ? "zh-Hans" : primary(language);
  const sample = extraSamples[locale]
    ?? (UI_LANGUAGES.includes(locale) && hasTranslation(locale, "wizard.sampleText")
      ? translator(locale)("wizard.sampleText") : "");
  return { language, sample };
}
