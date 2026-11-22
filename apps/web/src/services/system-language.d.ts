export const SPEECH_LANGUAGES: string[];

export function systemLanguage(supported: string[], preferred?: readonly (string | undefined)[] | null): string;

/** The language among `supported` that a BCP 47 tag or POSIX locale names, if any. */
export function supportedLanguage(supported: string[], tag: string | undefined | null): string | undefined;
