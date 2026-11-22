import { DEFAULT_THINKING_SOUND, thinkingSound, thinkingSoundGain, thinkingSoundIntervalScale } from "./thinking-sounds";

/* How a call behaves on this device, apart from its voice: whether a soft sound says the agent is working (never, only
 * while the screen is off, always), which sound, how loud and how often, and whether the screen is kept on during a call. Kept on
 * this device and applied at once (Settings → Call); the runtime and the page read them here. */

export type PresenceSound = "off" | "hidden" | "always";
export interface CallPreferences {
  presence: PresenceSound;
  /** The thinking sound's id (services/thinking-sounds.ts); always one the manifest has. */
  sound: string;
  /** Its volume: an offset in whole dB from the sound's own level (0: as it is). */
  soundGainDb: number;
  /** Its frequency: a factor on the sound's own gaps between plays (1: its own cadence; services/thinking-sounds.ts). */
  soundIntervalScale: number;
  keepAwake: boolean;
}

export const CALL_PREFERENCES_KEY = "sidevoice.call-preferences";
const CHANGED = "sidevoice-call-preferences";
/** By default the sound plays when the screen is off — the call goes on in a pocket, a car — as the default sound at its
 *  own level and cadence, and the screen turns off as the device says; it is kept on only when chosen. */
export const DEFAULT_CALL_PREFERENCES: CallPreferences = {
  presence: "hidden", sound: DEFAULT_THINKING_SOUND, soundGainDb: 0, soundIntervalScale: 1, keepAwake: false,
};

export function readCallPreferences(): CallPreferences {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(CALL_PREFERENCES_KEY) || "{}") ?? {};
    return {
      presence: ["off", "hidden", "always"].includes(stored.presence) ? stored.presence : DEFAULT_CALL_PREFERENCES.presence,
      // A sound a later build no longer ships is the default; an offset or a frequency it cannot be, the nearest it can.
      sound: thinkingSound(stored.sound).id,
      soundGainDb: thinkingSoundGain(stored.soundGainDb),
      soundIntervalScale: thinkingSoundIntervalScale(stored.soundIntervalScale),
      keepAwake: typeof stored.keepAwake === "boolean" ? stored.keepAwake : DEFAULT_CALL_PREFERENCES.keepAwake,
    };
  } catch { return { ...DEFAULT_CALL_PREFERENCES }; }
}

export function writeCallPreferences(patch: Partial<CallPreferences>) {
  const next = { ...readCallPreferences(), ...patch };
  try { globalThis.localStorage?.setItem(CALL_PREFERENCES_KEY, JSON.stringify(next)); } catch { /* For this visit only. */ }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return next;
}

export function subscribeCallPreferences(changed: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === CALL_PREFERENCES_KEY) changed(); };
  globalThis.addEventListener?.(CHANGED, changed);
  globalThis.addEventListener?.("storage", onStorage);
  return () => { globalThis.removeEventListener?.(CHANGED, changed); globalThis.removeEventListener?.("storage", onStorage); };
}
