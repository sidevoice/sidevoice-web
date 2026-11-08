import manifest from "../../public/sounds/thinking/sounds.json";

/* The thinking sounds: the cues that say the agent is working on your turn. The web ships them as files
 * (public/sounds/thinking/, made by scripts/encode-thinking-sounds.mjs, which keeps the level each was approved at), and
 * their manifest there, sounds.json, is the one place that says which there are, in Settings' order, which one is the
 * default and how often each plays. The iOS app reads that same file from the web it bundles, to play the one chosen
 * (sidevoice-desktop docs/BRIDGE.md → "The cues"). Each sound's name is a catalogue text, `settings.call.sound.<id>`. */

export interface ThinkingSound {
  id: string;
  /** How long, in seconds, between the end of one play and the start of the next: drawn anew each time, in [min, max]. */
  interval: readonly [number, number];
  /** Its file in each format, beside the manifest: Opus in WebM, and AAC in MP4 for what does not decode Opus. */
  files: { webm: string; m4a: string };
}

export const THINKING_SOUNDS: readonly ThinkingSound[] = manifest.sounds.map((sound) => ({
  id: sound.id, interval: [sound.interval[0], sound.interval[1]] as const, files: sound.files,
}));
export const DEFAULT_THINKING_SOUND: string = manifest.default;

/** The sound with this id; the default for one the manifest no longer has (or none). */
export function thinkingSound(id: unknown): ThinkingSound {
  return THINKING_SOUNDS.find((sound) => sound.id === id) ?? THINKING_SOUNDS.find((sound) => sound.id === DEFAULT_THINKING_SOUND)!;
}

/** The person's volume: an offset in dB from the level the sound has as it is, in whole steps. */
export const THINKING_SOUND_GAIN = { min: -20, max: 10, step: 1 } as const;

/** `value` as an offset the volume can be: whole dB within its range, 0 (the sound as it is) for anything else. */
export function thinkingSoundGain(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(THINKING_SOUND_GAIN.max, Math.max(THINKING_SOUND_GAIN.min, Math.round(value)));
}

/** How long to wait after a play ends before the next one, in seconds: somewhere in the sound's interval. */
export function nextGapSeconds(sound: ThinkingSound, random: () => number = Math.random): number {
  const [min, max] = sound.interval;
  return min + random() * (max - min);
}

/** Where a sound's file is served from, beside the page (`/voice/`), with the build in its URL: the files keep their names
 *  from build to build, and a browser's cache must not keep an old one. */
export function thinkingSoundUrl(file: string): string {
  const build = (globalThis as { sidevoiceBuildId?: string }).sidevoiceBuildId ?? "dev";
  return new URL(`sounds/thinking/${file}?v=${encodeURIComponent(build)}`, document.baseURI).href;
}
