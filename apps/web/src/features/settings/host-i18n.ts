import { createTranslator, type Translate } from "../../i18n/translator";
import { en, type HostMessageKey } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";
import { it } from "./messages/it";
import { de } from "./messages/de";
import { ja } from "./messages/ja";
import { zhHans } from "./messages/zh-Hans";
import { pl } from "./messages/pl";

export type HostTranslate = Translate<HostMessageKey>;

export const hostTranslator = createTranslator(en, { es, fr, it, de, ja, "zh-Hans": zhHans, pl });
