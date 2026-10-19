import { useSyncExternalStore } from "react";

/* The desktop app's floating call card, as this device keeps it (Settings → Floating card): its format and its starting
 * size. The room's Settings writes them, the card's page (call-controls.html, the same origin) reads them and hears a
 * change through the storage event. Where the card sits, its default corner and a size the person dragged it to are the
 * desktop app's own (services/desktop-host.ts CallControlsBridge). Captions are state/captions.ts. Decided in
 * sidevoice-playground#131 (briefs/UX-DECISIONS-2026-10-19.md "Call card: final"). */

export type CardFormat = "card" | "pip" | "avatar";
export type CardSize = "s" | "m" | "l";
export type CardCorner = "tl" | "tr" | "bl" | "br";

export const CARD_FORMATS: readonly CardFormat[] = ["card", "pip", "avatar"];
export const CARD_SIZES: readonly CardSize[] = ["s", "m", "l"];
export const CARD_CORNERS: readonly CardCorner[] = ["tl", "tr", "bl", "br"];

/** Each format's width at each size, in CSS pixels, without the window's margin: the title card's width, the picture's
 *  (its stage keeps 16:9), the avatar's square. */
export const CARD_WIDTHS: Record<CardFormat, Record<CardSize, number>> = {
  card: { s: 340, m: 390, l: 450 },
  pip: { s: 350, m: 420, l: 560 },
  avatar: { s: 120, m: 160, l: 220 },
};
/** The picture's least width when the person resizes it: a stage tall enough for two readable lines of a balloon. */
export const PIP_MIN_WIDTH = 350;

export interface FloatingCardPrefs { format: CardFormat; size: CardSize }
export const FLOATING_CARD_DEFAULTS: FloatingCardPrefs = { format: "card", size: "m" };
export const FLOATING_CARD_KEY = "sidevoice.floatingCard";

const listeners = new Set<() => void>();
let cached: { raw: string | null; prefs: FloatingCardPrefs } | null = null;

export function readFloatingCard(): FloatingCardPrefs {
  let raw: string | null = null;
  try { raw = globalThis.localStorage?.getItem(FLOATING_CARD_KEY) ?? null; } catch { /* the defaults */ }
  if (cached && cached.raw === raw) return cached.prefs;
  let stored: Partial<FloatingCardPrefs> = {};
  try { stored = JSON.parse(raw || "{}") ?? {}; } catch { /* the defaults */ }
  const prefs = {
    format: CARD_FORMATS.includes(stored.format as CardFormat) ? stored.format as CardFormat : FLOATING_CARD_DEFAULTS.format,
    size: CARD_SIZES.includes(stored.size as CardSize) ? stored.size as CardSize : FLOATING_CARD_DEFAULTS.size,
  };
  cached = { raw, prefs };
  return prefs;
}

export function setFloatingCard(change: Partial<FloatingCardPrefs>) {
  const next = { ...readFloatingCard(), ...change };
  try { globalThis.localStorage?.setItem(FLOATING_CARD_KEY, JSON.stringify(next)); } catch { /* this page only */ }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const fromAnotherPage = (event: StorageEvent) => { if (event.key === null || event.key === FLOATING_CARD_KEY) listener(); };
  window.addEventListener("storage", fromAnotherPage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", fromAnotherPage); };
}

export function useFloatingCard(): FloatingCardPrefs {
  return useSyncExternalStore(subscribe, readFloatingCard, () => FLOATING_CARD_DEFAULTS);
}
