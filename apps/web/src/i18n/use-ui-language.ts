/* The interface's language as React reads it: a component that calls this redraws, with everything under it, when the
 * language changes (translator.ts `setUiLanguage`). The room's root calls it, so a switch redraws the whole page. */
import { useSyncExternalStore } from "react";
import { onUiLanguage, uiLanguage } from "./translator";

export function useUiLanguage() {
  return useSyncExternalStore(onUiLanguage, uiLanguage, uiLanguage);
}
