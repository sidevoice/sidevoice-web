/* Keyed messages for the shared components, through the room's one translator (i18n/translator.ts). */
import { createTranslator, type Translate } from "../../i18n/translator";
import { en, type UiMessageKey } from "./messages/en";
import { es } from "./messages/es";

export type UiTranslate = Translate<UiMessageKey>;

export const uiTranslator = createTranslator(en, { es });
