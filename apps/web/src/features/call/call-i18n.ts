/* Keyed messages for the call view (AGENTS.md), through the room's one translator (i18n/translator.ts). */
import { createTranslator, type Translate } from "../../i18n/translator";
import { en, type CallMessageKey } from "./messages/en";
import { es } from "./messages/es";

export type CallTranslate = Translate<CallMessageKey>;

export const callTranslator = createTranslator(en, { es });
