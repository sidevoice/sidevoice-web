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
  "state.unread": "{n} new",
  "state.withUnread": "{state} · {unread}",

  "stage.label": "Call",
  "stage.agent": "{title}",
  "stage.you": "You",
  "stage.yourAvatar": "Your avatar",
  "stage.working": "Working…",
  "stage.empty": "Choose a conversation to talk to.",
  "stage.chooseConversation": "Choose a conversation",
  "stage.cancelTurn": "Cancel sending",

  "toolbar.micLevel": "Microphone level",
  "stage.effort": "{effort} effort",
  "toolbar.skip": "Skip what is playing",

  "transcript.show": "Show transcript",
  "transcript.hide": "Hide transcript",
} as const;

export type CallMessageKey = keyof typeof en;
