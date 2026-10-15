import { useEffect } from "react";
import { shortcutOf, type ShortcutId } from "./shortcuts";
import type { CallLayoutStore } from "./call-layout";

/* The room's key handler: the table's pressed shortcuts (state/shortcuts.ts), each to what it does. Hold to talk is the
 * runtime's (room-session-controller.js), as it needs the key's release. A shortcut that has nothing to act on does
 * nothing: Skip with nothing playing, cancel with nothing to take back. */

/** Opens or closes the conversations' list; the sidebar owns how, for its layout (ConversationSidebar). */
export const TOGGLE_CONVERSATIONS = "sidevoice-conversations-toggle";

const TYPING = "input,textarea,select,[contenteditable=true],[role=menu],[role=menuitem],[data-radix-popper-content-wrapper]";
const DIALOG = "dialog,[role=dialog],[aria-modal=true]";

export function useRoomShortcuts(layout: CallLayoutStore) {
  useEffect(() => {
    const act: Record<Exclude<ShortcutId, "holdToTalk">, () => void> = {
      mute: () => window.sidevoiceActions?.toggleMic(),
      skip: () => window.sidevoiceActions?.skipReply(),
      cancelInput: () => void window.sidevoiceActions?.cancelInput(),
      call: () => void window.sidevoiceActions?.toggleCall(),
      transcript: () => layout.getState().toggleTranscript(),
      conversations: () => window.dispatchEvent(new Event(TOGGLE_CONVERSATIONS)),
    };
    const press = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const found = shortcutOf(event, { typing: !!target?.closest(TYPING), dialog: !!target?.closest(DIALOG) });
      if (!found || found.hold) return;
      event.preventDefault();
      if (!event.repeat) act[found.id as keyof typeof act]();
    };
    window.addEventListener("keydown", press, true);
    return () => window.removeEventListener("keydown", press, true);
  }, [layout]);
}

