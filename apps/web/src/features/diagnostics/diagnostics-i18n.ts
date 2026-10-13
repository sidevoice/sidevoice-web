/* Keyed messages for the call's diagnostics (AGENTS.md), through the room's one translator (i18n/translator.ts). */
import { createTranslator, type Translate } from "../../i18n/translator";
import { en, type DiagnosticsMessageKey } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";
import { it } from "./messages/it";
import { de } from "./messages/de";
import { ja } from "./messages/ja";
import { zhHans } from "./messages/zh-Hans";
import { pl } from "./messages/pl";

export type DiagnosticsTranslate = Translate<DiagnosticsMessageKey>;

export const diagnosticsTranslator = createTranslator(en, { es, fr, it, de, ja, "zh-Hans": zhHans, pl });
