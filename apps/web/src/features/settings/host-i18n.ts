import { createTranslator, type Translate } from "../../i18n/translator";
import { en, type HostMessageKey } from "./messages/en";
import { es } from "./messages/es";

export type HostTranslate = Translate<HostMessageKey>;

export const hostTranslator = createTranslator(en, { es });
