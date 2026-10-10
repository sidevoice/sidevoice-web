/** The conversation's own texts in English — the transcript panel and the karaoke of a reply — and the fallback for
 *  any key another language lacks (AGENTS.md). */
export const en = {
  "transcript.title": "Transcript",
  "transcript.close": "Close transcript",
  "transcript.compose": "Write a message",
  "transcript.message": "Written message",
  "transcript.placeholder": "Write a message…",
  "transcript.send": "Send",
  "transcript.sendLabel": "Send message",

  "karaoke.playing": "Playing this reply",
} as const;

export type ConversationMessageKey = keyof typeof en;
