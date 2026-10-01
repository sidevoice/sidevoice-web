export const UI_LANGUAGES: string[];
export const SPEECH_LANGUAGES: string[];

export function systemLanguage(supported: string[], preferred?: readonly (string | undefined)[] | null): string;
export function systemPreferences(preferred?: readonly (string | undefined)[] | null): {
  ui_language: string;
};
