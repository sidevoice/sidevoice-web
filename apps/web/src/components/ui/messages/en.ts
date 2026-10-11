/* The shared components' own words (AGENTS.md): English, the fallback for every other language. */
export const en = {
  "ui.close": "Close",
  "ui.closeNamed": "Close {name}",
  "ui.loading": "Working…",
  "ui.copy": "Copy",
  "ui.copied": "Copied.",
  "ui.copyFailed": "Select it and copy it.",
} as const;

export type UiMessageKey = keyof typeof en;
