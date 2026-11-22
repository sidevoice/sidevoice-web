import { useSyncExternalStore } from "react";
import { bindings, subscribeShortcuts, type Binding, type ShortcutId } from "./shortcuts";

/** The shortcuts table, following every change to it (Settings, or another page of this device): whoever reads a key to
 *  show it (a tooltip, `aria-keyshortcuts`, a Settings row) reads it here, so a changed key shows at once. */
export function useBindings(): Record<ShortcutId, Binding | null> {
  return useSyncExternalStore(subscribeShortcuts, bindings, bindings);
}

export function useBinding(id: ShortcutId): Binding | null {
  return useBindings()[id];
}
