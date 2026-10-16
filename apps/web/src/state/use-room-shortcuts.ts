import { useEffect } from "react";
import { shortcutOf, type ShortcutId } from "./shortcuts";

/* The room's key handler: the table's pressed shortcuts (state/shortcuts.ts), each to what it does. Hold to talk is the
 * runtime's (room-session-controller.js), as it needs the key's release. A shortcut that has nothing to act on does
 * nothing: Skip with nothing playing. Skip is Cmd/Ctrl+S, so the key's own default (the browser's or webview's Save
 * dialog) is always prevented. */

const TYPING = "input,textarea,select,[contenteditable=true],[role=menu],[role=menuitem],[data-radix-popper-content-wrapper]";

export function useRoomShortcuts() {
  useEffect(() => {
    const act: Record<Exclude<ShortcutId, "holdToTalk">, () => void> = {
      mute: () => window.sidevoiceActions?.toggleMic(),
      skip: () => window.sidevoiceActions?.skipReply(),
    };
    const press = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const typing = !!target?.closest(TYPING);
      const found = shortcutOf(event, { typing: false });
      if (!found || found.hold) return;
      // Save is the browser's whether or not a field has focus; every other key waits for the field.
      if (typing && found.id !== "skip") return;
      event.preventDefault();
      if (typing) return;
      if (!event.repeat) act[found.id as keyof typeof act]();
    };
    window.addEventListener("keydown", press, true);
    return () => window.removeEventListener("keydown", press, true);
  }, []);
}
