import { useSyncExternalStore } from "react";

/* Design alternatives the operator compares on a live page (A/B, left/centre/right…): which one this page shows is kept
 * in localStorage under `sidevoice.variants` — `{ "<name>": "<value>" }` — and set from outside it, by the playground
 * preview's VARIANTS panel (sidevoice-playground, preview/mock/shell.mjs). Each variant names its values and its
 * default here, at its point of use; an unknown or missing value is the default. Once one is chosen, its variant goes
 * and the choice is simply the code. */

export const VARIANTS_KEY = "sidevoice.variants";

function read(): Record<string, unknown> {
  try { return JSON.parse(globalThis.localStorage?.getItem(VARIANTS_KEY) || "{}") ?? {}; } catch { return {}; }
}

function subscribe(changed: () => void) {
  // Another document of this origin (the preview's shell) writes the key: `storage` tells this one.
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === VARIANTS_KEY) changed(); };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/** The value of the variant `name` among `values`, `values[0]` by default; it follows the preview's panel live. */
export function useVariant<Value extends string>(name: string, values: readonly Value[]): Value {
  const pick = () => {
    const value = read()[name];
    return values.includes(value as Value) ? (value as Value) : values[0];
  };
  return useSyncExternalStore(subscribe, pick, () => values[0]);
}

/** Forgets the stored value of a variant that was decided: its choice is inert, and the key would only linger. */
export function forgetVariant(name: string) {
  try {
    const stored = read();
    if (!(name in stored)) return;
    delete stored[name];
    if (Object.keys(stored).length) globalThis.localStorage?.setItem(VARIANTS_KEY, JSON.stringify(stored));
    else globalThis.localStorage?.removeItem(VARIANTS_KEY);
  } catch { /* storage blocked: nothing was kept */ }
}
