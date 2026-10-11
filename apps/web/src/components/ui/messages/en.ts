/* The shared components' own words (AGENTS.md): English, the fallback for every other language. */
export const en = {
  "ui.close": "Close",
  "ui.closeNamed": "Close {name}",
  "ui.loading": "Working…",
} as const;

export type UiMessageKey = keyof typeof en;
