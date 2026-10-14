import { translator } from "../i18n/translator";
import { useVariant } from "./variants";

/** The first option retains the shipped look while the three proposals remain open. */
export const BUBBLE_STYLES = ["current", "soft", "illustrated", "panel"] as const;
export type BubbleStyle = typeof BUBBLE_STYLES[number];

export function useBubbleVariant(): BubbleStyle {
  return useVariant("bubbles-style", BUBBLE_STYLES);
}

/** The same-origin playground reads this from the room, including after a language change. */
export function bubbleVariantMetadata() {
  const t = translator();
  return {
    name: "bubbles-style",
    label: t("variants.bubbles.title"),
    note: t("variants.bubbles.note"),
    values: BUBBLE_STYLES.map((value) => ({ value, label: t(`variants.bubbles.${value}`) })),
  };
}
