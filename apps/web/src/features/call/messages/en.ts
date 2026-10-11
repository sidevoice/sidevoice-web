/** The call view's texts in English — the stage, the conversations sidebar, the header and the transcript panel —
 *  and the fallback for any key another language lacks (AGENTS.md). */
export const en = {
  "header.menu": "More options",
  "header.settings": "Settings",
  "header.stats": "Connection statistics",
  "header.noConversation": "No conversation selected",
  "header.showConversations": "Show conversations",
  "header.otherConversation": "{title} · {state}",
  "header.allConversations": "All conversations ({n})",

  "sidebar.title": "Conversations",
  "sidebar.collapse": "Collapse conversations",
  "sidebar.expand": "Expand conversations",
  "sidebar.close": "Close conversations",
  "sidebar.empty": "No conversation is in the room yet.",
  "sidebar.unknownMachine": "Unknown machine",
  "sidebar.options": "Options for {title}",
  "sidebar.closeConversation": "Close conversation",

  "state.inCall": "In call",
  "state.working": "Working",
  "state.waiting": "Waiting for you",
  "state.holding": "Can't receive",
  "state.offline": "Offline",
  "state.speaking": "Speaking",
  "state.listening": "Listening to you",
  "state.resting": "Resting",
  "state.unread": "{n} new",
  "state.withUnread": "{state} · {unread}",

  "stage.label": "Call",
  "stage.agentState": "{title} · {state}",
  "stage.you": "You",
  "stage.yourAvatar": "Your avatar",
  "stage.working": "Working…",
  "stage.empty": "Choose a conversation to talk to.",
  "stage.chooseConversation": "Choose a conversation",
  "stage.cancelTurn": "Cancel sending",
  /* The wanted poster an offline conversation's bicho is shown on (each fine-print key is one line of it). */
  "stage.poster.title": "WANTED",
  "stage.poster.status": "ONLINE OR PAUSED",
  "stage.poster.fine1": "THIS CREATURE IS FICTIONAL. ANY RESEMBLANCE TO A REAL",
  "stage.poster.fine2": "AGENT THAT LOST ITS CONNECTION IS PURELY",
  "stage.poster.fine3": "COINCIDENTAL. IF SEEN, PLEASE TELL ITS HUMAN.",

  "toolbar.micLevel": "Microphone level",

  "transcript.show": "Show transcript",
  "transcript.hide": "Hide transcript",
} as const;

export type CallMessageKey = keyof typeof en;
