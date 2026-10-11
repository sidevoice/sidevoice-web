/* Keyed messages for the call view (AGENTS.md), through the room's one translator (i18n/translator.ts). */
import { createTranslator, preferredLanguage, type Translate } from "../../i18n/translator";
import { en, type CallMessageKey } from "./messages/en";
import { es } from "./messages/es";

export type CallTranslate = Translate<CallMessageKey>;

const others = { es };
export const callTranslator = createTranslator(en, others);
/** The language the call view speaks on this device (for what is formatted rather than translated: numbers). */
export const callLanguage = () => preferredLanguage(["en", ...Object.keys(others)]);
