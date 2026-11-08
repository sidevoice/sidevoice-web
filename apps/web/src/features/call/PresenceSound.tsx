import { useEffect, useRef, useState } from "react";
import { useRoomStore } from "../../state/room-store";
import { readCallPreferences, subscribeCallPreferences, type PresenceSound as PresenceChoice } from "../../services/call-preferences";
import { playThinkingSound, type ThinkingSoundLoop } from "../../services/thinking-sound";
import { selectInCall, useStageConversation } from "./stage-view";

/* While the agent works on your turn in a call, a soft sound says so: for a call that goes on with the screen off — a
 * phone in a pocket, in the car, headphones on — where nothing else would. Settings → Call says when (never, only while
 * the screen is off, or always), which sound and how loud. Who decides when it plays is here; the sound itself is the
 * player's (services/thinking-sound.ts). */

/** Whether the sound plays: in a call, while its agent works, as the person chose (`hidden`: only while the page is not
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
  const [prefs, setPrefs] = useState(readCallPreferences);
  useEffect(() => subscribeCallPreferences(() => setPrefs(readCallPreferences())), []);
  const plays = breathPlays({ inCall, working, presence: prefs.presence, screenOff });
  const loop = useRef<ThinkingSoundLoop | null>(null);
  const gainDb = useRef(prefs.soundGainDb);
  // Another volume applies to the sound that plays; another sound chosen while it plays starts that one, at the volume set.
  useEffect(() => { gainDb.current = prefs.soundGainDb; loop.current?.setGain(prefs.soundGainDb); }, [prefs.soundGainDb]);
  useEffect(() => {
    if (!plays) return;
    const playing = playThinkingSound({ sound: prefs.sound, gainDb: gainDb.current });
    loop.current = playing;
    return () => { playing.stop(); if (loop.current === playing) loop.current = null; };
  }, [plays, prefs.sound]);
  return null;
}
