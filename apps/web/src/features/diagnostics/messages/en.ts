/** The connection statistics dialog's own words in English, and the fallback for any key another language lacks
 *  (AGENTS.md). The figures, facts, rows and status lines inside it are written by the runtime, not from here. */
export const en = {
  "stats.eyebrow": "Call diagnostics",
  "stats.title": "Connection and latency",
  "stats.close": "Close connection statistics",
  "stats.collecting": "Collecting measurements…",
  "stats.recognition": "End of turn → text",
  "stats.recognitionNote": "Median · recognition on this device",
  "stats.response": "Text sent → reply",
  "stats.responseNote": "Median · first reply per turn",
  "stats.connection": "Connection status",
  "stats.stages": "Stages of the last turn",
  "stats.stagesNote": "From your last words to the reply sent to this device, in the order they happen; each stage is measured on its own clock.",
  "stats.aggregates": "Session aggregates",
  "stats.aggregatesNote": "Count, mean, p50, p90 and maximum per stage. Stages overlap: do not add them up.",
  "stats.copyAggregates": "Copy as text",
  "stats.turns": "Latest replies",
  "stats.turnsNote": "Stages overlap: do not add them up. “Agent” includes delivery, queues and generation, not just the model.",
  "stats.turnsTable": "Measurements per reply",
  "stats.column.turn": "Turn",
  "stats.column.silence": "Silence",
  "stats.column.recognition": "Recognition",
  "stats.column.agent": "Agent",
  "stats.column.dispatch": "Reply → device",
  "stats.column.state": "State",
  "stats.limitations": "These are the app's measurements, not the sound leaving the speaker. Missing data shows as “—”, never as zero.",
  "stats.updated": "Updated",
  "stats.refresh": "Refresh",
} as const;

export type DiagnosticsMessageKey = keyof typeof en;
