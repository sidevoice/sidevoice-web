import { useSyncExternalStore } from "react";

/* Design alternatives the operator compares on a live page (A/B, left/centre/right…): which one this page shows is kept
 * in localStorage under `sidevoice.variants` — `{ "<name>": "<value>" }` — and set from outside it, by the playground
 * preview's VARIANTS panel (sidevoice-playground, preview/mock/shell.mjs). Each variant names its values and its
 * default here, at its point of use; an unknown or missing value is the default. Only Vite dev runs and explicit
 * `--mode preview` builds read choices. Release builds always use the default, ignoring persisted preview choices.
 * Once one is chosen, its variant goes and the choice is simply the code. */

export const VARIANTS_KEY = "sidevoice.variants";
const preview = import.meta.env.DEV || import.meta.env.MODE === "preview";

function read(): Record<string, unknown> {
  try { return JSON.parse(globalThis.localStorage?.getItem(VARIANTS_KEY) || "{}") ?? {}; } catch { return {}; }
}

function subscribe(changed: () => void) {
  if (!preview) return () => {};
  // Another document of this origin (the preview's shell) writes the key: `storage` tells this one.
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === VARIANTS_KEY) changed(); };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/** Follows the preview's panel live; a release build always returns `values[0]`. */
export function useVariant<Value extends string>(name: string, values: readonly Value[]): Value {
  const pick = () => {
    if (!preview) return values[0];
    const value = read()[name];
    return values.includes(value as Value) ? (value as Value) : values[0];
  };
  return useSyncExternalStore(subscribe, pick, () => values[0]);
}
