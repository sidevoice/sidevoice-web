/* Keyed messages for the call's diagnostics (AGENTS.md), through the room's one translator (i18n/translator.ts). */
import { createTranslator, type Translate } from "../../i18n/translator";
import { en, type DiagnosticsMessageKey } from "./messages/en";
import { es } from "./messages/es";

export type DiagnosticsTranslate = Translate<DiagnosticsMessageKey>;

export const diagnosticsTranslator = createTranslator(en, { es });
