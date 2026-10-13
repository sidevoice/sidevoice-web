/** A span in seconds as a try says it: one decimal ("0.9"). */
export const seconds = (ms: number) => new Intl.NumberFormat(navigator.language, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(ms / 1000);
