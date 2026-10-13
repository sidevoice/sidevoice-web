/* Keyed messages for the call view (AGENTS.md), through the room's one translator (i18n/translator.ts). */
import { createTranslator, preferredLanguage, type Translate } from "../../i18n/translator";
import { en, type CallMessageKey } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";
import { it } from "./messages/it";
import { de } from "./messages/de";
import { ja } from "./messages/ja";
import { zhHans } from "./messages/zh-Hans";
import { pl } from "./messages/pl";

export type CallTranslate = Translate<CallMessageKey>;

const others = { es, fr, it, de, ja, "zh-Hans": zhHans, pl };
export const callTranslator = createTranslator(en, others);
/** The language the call view speaks on this device (for what is formatted rather than translated: numbers). */
export const callLanguage = () => preferredLanguage(["en", ...Object.keys(others)]);
