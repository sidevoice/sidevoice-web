import { uiLocale } from "../../i18n/locale";
/** A span in seconds as a try says it: one decimal ("0.9"). */
export const seconds = (ms: number) => new Intl.NumberFormat(uiLocale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(ms / 1000);
