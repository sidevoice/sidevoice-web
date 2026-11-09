import { useEffect, useReducer, useRef, useState } from "react";
import { host, onHostMember } from "../../host";
import { useRoomStore } from "../../state/room-store";
import { readCallPreferences, subscribeCallPreferences, type PresenceSound as PresenceChoice } from "../../services/call-preferences";
import { playThinkingSound, thinkingSoundHeldForLock, type ThinkingSoundLoop } from "../../services/thinking-sound";
import { selectInCall, useStageConversation } from "./stage-view";

/* While the agent works on your turn in a call, a soft sound says so: for a call that goes on with the screen off — a
 * phone in a pocket, in the car, headphones on — where nothing else would. Settings → Call says when (never, only while
 * the screen is off, or always), which sound, how loud and how often. Who decides when it plays is here; the sound itself is the
 * player's (services/thinking-sound.ts).
 *
 * "Only with the screen off" where the app plays the cue itself and holds it for the lock (iOS): the page may be suspended
 * once the screen locks, and could not start it then. So the page holds the app's cue for as long as the agent works, locked
 * or not, with `whileLocked`, and the app plays it only while the screen is locked, starting and stopping by itself. */

/** Whether the sound plays: in a call, while its agent works, as the person chose (`hidden`: only while the screen is off,
 *  as `useScreenOff` reads it). */
export function breathPlays({ inCall, working, presence, screenOff }: { inCall: boolean; working: boolean; presence: PresenceChoice; screenOff: boolean }): boolean {
  return inCall && working && (presence === "always" || (presence === "hidden" && screenOff));
}

/** How often the app is asked whether the screen is locked, while the answer decides anything. */
export const SCREEN_POLL_MS = 2000;

/** Whether the screen counts as off, for "only with the screen off".
 *  - An app that says whether the screen is locked (`host.screen`): that, asked while `asking` (the sound would play on it),
 *    every SCREEN_POLL_MS and at once when the page is hidden; the page shown again is the screen on, without asking.
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
  // One question at a time, the next a while after the answer: an app that does not answer is not asked again and again.
  // The page hidden asks at once, not at the next one: an Android webview may be suspended soon after the screen goes off,
  // before a poll would come. Only the last question's answer counts: an answer never overtakes a later question, nor the
  // page shown again.
  useEffect(() => {
    if (!screen || !asking) { setLocked(false); return; }
    let gone = false;
    let next: ReturnType<typeof setTimeout> | undefined;
    let asked = 0;
    const ask = () => {
      clearTimeout(next);
      const question = ++asked;
      void screen.locked().then((now) => now === true, () => false).then((now) => {
        if (gone || question !== asked) return;
        setLocked(now);
        next = setTimeout(ask, SCREEN_POLL_MS);
      });
    };
    const changed = () => {
      if (document.hidden) { ask(); return; }
      asked++;
      setLocked(false);
      clearTimeout(next);
      next = setTimeout(ask, SCREEN_POLL_MS);
    };
    document.addEventListener("visibilitychange", changed);
    ask();
    return () => { gone = true; clearTimeout(next); document.removeEventListener("visibilitychange", changed); };
  }, [screen, asking]);
  return screen ? locked : callControls ? false : hidden;
}

export function PresenceSound() {
  const inCall = useRoomStore(selectInCall);
  const working = useStageConversation().mood === "working";
  const [prefs, setPrefs] = useState(readCallPreferences);
  useEffect(() => subscribeCallPreferences(() => setPrefs(readCallPreferences())), []);
  // Read as it draws, and drawn again when the app's cue is offered: the app offers it once it has answered whether the phone
  // has a player, which may be after a working call is back. Then the sound is handed over: the page's own copy stops and the
  // app's cue is held for the lock (the effect below, by `whileLocked`).
  const [, cueOffered] = useReducer((count: number) => count + 1, 0);
  useEffect(() => onHostMember("cue", cueOffered), []);
  const whileLocked = prefs.presence === "hidden" && thinkingSoundHeldForLock();
  const screenOff = useScreenOff(inCall && working && prefs.presence === "hidden" && !whileLocked);
  const plays = whileLocked ? inCall && working : breathPlays({ inCall, working, presence: prefs.presence, screenOff });
  const loop = useRef<ThinkingSoundLoop | null>(null);
  const gainDb = useRef(prefs.soundGainDb);
  const intervalScale = useRef(prefs.soundIntervalScale);
  // Another volume or frequency applies to the sound that plays; another sound chosen while it plays starts that one, at the
  // volume and frequency set.
  useEffect(() => { gainDb.current = prefs.soundGainDb; loop.current?.setGain(prefs.soundGainDb); }, [prefs.soundGainDb]);
  useEffect(() => { intervalScale.current = prefs.soundIntervalScale; loop.current?.setIntervalScale(prefs.soundIntervalScale); }, [prefs.soundIntervalScale]);
  useEffect(() => {
    if (!plays) return;
    const playing = playThinkingSound({ sound: prefs.sound, gainDb: gainDb.current, intervalScale: intervalScale.current, ...(whileLocked ? { whileLocked } : {}) });
    loop.current = playing;
    return () => { playing.stop(); if (loop.current === playing) loop.current = null; };
  }, [plays, prefs.sound, whileLocked]);
  return null;
}
