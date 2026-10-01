/** The call controls card's texts in English, the fallback for any key another language lacks (AGENTS.md). */
export const en = {
  "card.agent.idle": "The agent is idle",
  "card.agent.working": "The agent is working",
  "card.agent.speaking": "The agent is speaking",
  "card.reconnecting": "Reconnecting…",
  "card.switchConversation": "Switch conversation",
  "card.conversations": "Conversations",
  "card.openApp": "Open Sidevoice",
  "card.mute": "Mute",
  "card.unmute": "Unmute",
  "card.shortcut": "{action} ({shortcut})",
  "card.devices": "Microphone and speaker",
  "card.microphone": "Microphone",
  "card.speaker": "Speaker",
  "card.systemDefault": "System default",
  "card.skip": "Skip what is playing",
  "card.hangUp": "Hang up",
  "card.yourMicrophone": "Your microphone",
  "card.youAreMuted": "You are muted",
} as const;

export type MessageKey = keyof typeof en;
