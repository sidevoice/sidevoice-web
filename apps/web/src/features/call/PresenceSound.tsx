import { useEffect, useState } from "react";
import { useRoomStore } from "../../state/room-store";
import { readCallPreferences, subscribeCallPreferences, type PresenceSound as PresenceChoice } from "../../services/call-preferences";
import { playThinkingSound } from "../../services/thinking-sound";
import { selectInCall, useStageConversation } from "./stage-view";

/* While the agent works on your turn in a call, a soft breath says so: for a call that goes on with the screen off — a
 * phone in a pocket, in the car, headphones on — where nothing else would. Settings → Call says when: never, only
 * while the screen is off, or always. Who decides when it plays is here; the sound itself is the player's
 * (services/thinking-sound.ts), so it can later be swapped for recorded "working" sounds without touching this. */

/** Whether the breath plays: in a call, while its agent works, as the person chose (`hidden`: only while the page is not
 *  shown, the screen off or the page in the background). */
export function breathPlays({ inCall, working, presence, screenOff }: { inCall: boolean; working: boolean; presence: PresenceChoice; screenOff: boolean }): boolean {
  return inCall && working && (presence === "always" || (presence === "hidden" && screenOff));
}

function useScreenOff() {
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  return hidden;
}

export function PresenceSound() {
  const inCall = useRoomStore(selectInCall);
  const working = useStageConversation().mood === "working";
  const screenOff = useScreenOff();
  const [presence, setPresence] = useState(() => readCallPreferences().presence);
  useEffect(() => subscribeCallPreferences(() => setPresence(readCallPreferences().presence)), []);
  const plays = breathPlays({ inCall, working, presence, screenOff });
  useEffect(() => (plays ? playThinkingSound() : undefined), [plays]);
  return null;
}
