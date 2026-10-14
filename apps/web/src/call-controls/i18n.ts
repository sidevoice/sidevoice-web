/* The language the call controls card speaks. Its words are the room's catalogues (i18n/translator.ts), keys `card.*`. */
import { preferredLanguage, UI_LANGUAGES } from "../i18n/translator";
import { systemLanguage } from "../services/system-language.js";

/** The language the card speaks: the one this device's settings chose, else the system's (or `preferred`'s), among
 *  those the room has a catalogue for; English otherwise. */
export function cardLanguage(preferred?: readonly (string | undefined)[] | null): string {
  return preferred ? systemLanguage(UI_LANGUAGES, preferred) : preferredLanguage();
}
