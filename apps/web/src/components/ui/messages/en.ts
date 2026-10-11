/* The shared components' own words (AGENTS.md): English, the fallback for every other language. */
export const en = {
  "ui.close": "Close",
  "ui.closeNamed": "Close {name}",
  "ui.loading": "Working…",
  "ui.copy": "Copy",
  "ui.copied": "Copied",
  "ui.copyFailed": "Couldn’t copy — select the text",
} as const;

export type UiMessageKey = keyof typeof en;
