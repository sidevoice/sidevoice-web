import { useEffect, useRef, useState } from "react";
import { host } from "../../host";
import { useRoomStore } from "../../state/room-store";
import { readCallPreferences, subscribeCallPreferences, type PresenceSound as PresenceChoice } from "../../services/call-preferences";
import { playThinkingSound, type ThinkingSoundLoop } from "../../services/thinking-sound";
import { selectInCall, useStageConversation } from "./stage-view";

/* While the agent works on your turn in a call, a soft sound says so: for a call that goes on with the screen off — a
 * phone in a pocket, in the car, headphones on — where nothing else would. Settings → Call says when (never, only while
 * the screen is off, or always), which sound and how loud. Who decides when it plays is here; the sound itself is the
 * player's (services/thinking-sound.ts). */

/** Whether the sound plays: in a call, while its agent works, as the person chose (`hidden`: only while the screen is off,
 *  as `useScreenOff` reads it). */
export function breathPlays({ inCall, working, presence, screenOff }: { inCall: boolean; working: boolean; presence: PresenceChoice; screenOff: boolean }): boolean {
  return inCall && working && (presence === "always" || (presence === "hidden" && screenOff));
}

/** How often the app is asked whether the screen is locked, while the answer decides anything. */
export const SCREEN_POLL_MS = 2000;

/** Whether the screen counts as off, for "only with the screen off".
 *  - An app that says whether the screen is locked (`host.screen`): that, asked while `asking` (the sound would play on it).
 *  - The desktop app without it (`host.callControls`): never. Its window hidden or minimised is not the screen off: the
 *    call goes on in sight in its floating card, or the person is in another app.
 *  - A browser or a phone: the page not shown (in the background, behind the lock screen), as the browser says it. */
function useScreenOff(asking: boolean) {
  const { screen, callControls } = host();
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    if (!screen || !asking) { setLocked(false); return; }
    let gone = false;
    const ask = () => { void screen.locked().then((now) => { if (!gone) setLocked(now === true); }, () => { if (!gone) setLocked(false); }); };
    ask();
    const every = setInterval(ask, SCREEN_POLL_MS);
    return () => { gone = true; clearInterval(every); };
  }, [screen, asking]);
  return screen ? locked : callControls ? false : hidden;
}

export function PresenceSound() {
  const inCall = useRoomStore(selectInCall);
  const working = useStageConversation().mood === "working";
  const [prefs, setPrefs] = useState(readCallPreferences);
  useEffect(() => subscribeCallPreferences(() => setPrefs(readCallPreferences())), []);
  const screenOff = useScreenOff(inCall && working && prefs.presence === "hidden");
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
