/** The conversation's own texts in English — the transcript panel and the karaoke of a reply — and the fallback for
 *  any key another language lacks (AGENTS.md). */
export const en = {
  "transcript.title": "Transcript",
  "transcript.close": "Close transcript",
  "transcript.message": "Written message",
  "transcript.placeholder": "Send a message",
  "transcript.send": "Send",
  "transcript.sendLabel": "Send message",

  "karaoke.playing": "Playing this reply",

  "messages.group": "Messages from {name}",
  "messages.message": "{name}: {text}",
  "messages.interrupted": "{name}, interrupted: {text}",
  "messages.today": "Today",
  "messages.empty": "Nothing said yet. What you say and the agent's replies appear here.",
  "messages.yesterday": "Yesterday",
  "messages.listenAgain": "Listen again",
  "messages.cancel": "Cancel sending",
  "messages.thinking": "The conversation is working on your message",
  "messages.new": "New messages",
  "messages.latest": "Go to the end",
  "messages.toLatest": "Go to the end of the conversation",

  "wave.listening": "Listening",
  "wave.listeningTitle": "Listening…",
  "wave.transcribing": "Transcribing what you said",
  "wave.transcribingTitle": "Transcribing…",

  // Call model B (VARIANTS `call-model`, the voice switch): the box, and why a reply had no audio.
  "composer.noConversation": "Choose a conversation to write to",
  "composer.cantReceive": "{title} can't receive messages right now",
  "composer.switching": "Switching to {title}…",
  "audio.agentsMuted": "Agents were muted",
  "audio.voiceOff": "Voice was off",
} as const;

export type ConversationMessageKey = keyof typeof en;
