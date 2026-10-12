import { useEffect, useState } from "react";
import { useRoomStore } from "../../state/room-store";
import { readCallPreferences, subscribeCallPreferences } from "../../services/call-preferences";
import { selectInCall, useStageConversation } from "./stage-view";
import { useVoiceSwitch } from "../../state/call-model";

/* While the agent works on your turn in a call, a soft breath says so: for a call that goes on with the screen off — a
 * phone in a pocket, in the car, headphones on — where nothing else would. Settings → Advanced says when: never, only
 * while the screen is off, or always. It is drawn here (a filtered noise breathing slowly, quiet), so it can later be
 * swapped for recorded "working" sounds without touching who decides when it plays. With the voice switch (call model B)
 * it plays while the voice is on, and Mute agents silences it too (D6). */

const LEVEL = 0.035;
const BREATH_SECONDS = 3.2;

function startBreath(context: AudioContext) {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700;
  const gain = context.createGain();
  gain.gain.value = 0;
  // A slow swell and fall, like breathing: the gain follows a low sine between silence and LEVEL.
  const lfo = context.createOscillator();
  lfo.frequency.value = 1 / BREATH_SECONDS;
  const depth = context.createGain();
  depth.gain.value = LEVEL / 2;
  const base = context.createConstantSource();
  base.offset.value = LEVEL / 2;
  lfo.connect(depth).connect(gain.gain);
  base.connect(gain.gain);
  noise.connect(filter).connect(gain).connect(context.destination);
  noise.start(); lfo.start(); base.start();
  return () => {
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    for (const node of [noise, lfo, base]) { try { node.stop(now + 0.3); } catch { /* Already stopped. */ } }
    setTimeout(() => { for (const node of [noise, filter, gain, lfo, depth, base]) node.disconnect(); }, 400);
  };
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
  const voiceSwitch = useVoiceSwitch();
  const inCall = useRoomStore((state) => (voiceSwitch ? state.facts.voiceOn && !state.facts.agentsMuted : selectInCall(state)));
  const working = useStageConversation().mood === "working";
  const screenOff = useScreenOff();
  const [presence, setPresence] = useState(() => readCallPreferences().presence);
  useEffect(() => subscribeCallPreferences(() => setPresence(readCallPreferences().presence)), []);
  const plays = inCall && working && (presence === "always" || (presence === "hidden" && screenOff));
  useEffect(() => {
    if (!plays || typeof AudioContext === "undefined") return;
    const context = new AudioContext();
    void context.resume().catch(() => undefined);
    const stop = startBreath(context);
    return () => { stop(); setTimeout(() => void context.close().catch(() => undefined), 500); };
  }, [plays]);
  return null;
}
