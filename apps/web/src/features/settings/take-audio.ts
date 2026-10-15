import { waveColumn } from "../conversation/VoiceWaveform";
import type { VoiceTake } from "@sidevoice/voice";

/** How long a take lasts, in ms. */
export const takeMs = (take: VoiceTake) => (take.samples.length / take.sampleRate) * 1000;

/* A try's take as the page draws and plays it (TryTake.tsx): its loudness in columns, on the live waveform's own scale,
 * and a player over a copy of it in memory. Nothing of it leaves the page or is kept: the player's copy goes with
 * `release()`, the take with whoever holds it. */

/** How long a frame of loudness is: the take is measured once, in these, and drawn from them at any width. */
const FRAME_MS = 10;
const frames = new WeakMap<VoiceTake, Float32Array>();

/** The take's loudness per 10 ms frame, 0 to 1, as the live waveform measures it (`waveColumn`), measured once. */
function loudness(take: VoiceTake) {
  let known = frames.get(take);
  if (known) return known;
  const size = Math.max(1, Math.round((take.sampleRate * FRAME_MS) / 1000));
  known = new Float32Array(Math.ceil(take.samples.length / size));
  for (let frame = 0; frame < known.length; frame++) known[frame] = waveColumn(take.samples.subarray(frame * size, (frame + 1) * size));
  frames.set(take, known);
  return known;
}

/** The take in `count` columns from its start to its end, each the loudest moment it covers, 0 to 1. */
export function takeColumns(take: VoiceTake, count: number): number[] {
  const values = loudness(take);
  const columns = Math.max(1, Math.floor(count));
  return Array.from({ length: columns }, (_, column) => {
    const from = Math.floor((column * values.length) / columns);
    const to = Math.max(from + 1, Math.floor(((column + 1) * values.length) / columns));
    let loudest = 0;
    for (let frame = from; frame < to && frame < values.length; frame++) loudest = Math.max(loudest, values[frame]);
    return loudest;
  });
}

/** The take as a WAV file (mono, 16-bit, at its own rate), for the page's player. */
export function takeWav(take: VoiceTake): Blob {
  const { samples, sampleRate } = take;
  const data = samples.length * 2;
  const view = new DataView(new ArrayBuffer(44 + data));
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + data, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}

export interface TakePlayer {
  /** Plays from where it stands (from the start once it reached the end). */
  play(): Promise<void>;
  pause(): void;
  /** Moves to `ms` from the start, playing on if it plays. */
  seek(ms: number): void;
  /** Where it stands, in ms from the start. */
  position(): number;
  readonly playing: boolean;
  /** Hears each time it starts, pauses, ends or moves; returns how to stop hearing. */
  subscribe(listener: () => void): () => void;
  /** Stops it and lets go of its copy of the take. */
  release(): void;
}

/** A player for `take`: an audio element over a WAV copy of it, made the first time it plays, kept in memory. */
export function createTakePlayer(take: VoiceTake): TakePlayer {
  const length = takeMs(take);
  const listeners = new Set<() => void>();
  let media: HTMLAudioElement | null = null;
  let url = "";
  let playing = false;
  let at = 0;
  const told = () => { for (const listener of [...listeners]) listener(); };
  const clamp = (ms: number) => Math.max(0, Math.min(length, ms));
  const now = () => (media && playing ? clamp(media.currentTime * 1000) : at);
  function element() {
    if (media) return media;
    url = URL.createObjectURL(takeWav(take));
    media = new Audio(url);
    media.preload = "auto";
    // To the end: back to the start, for the next Play.
    media.addEventListener("ended", () => { playing = false; at = 0; told(); });
    media.addEventListener("pause", () => { if (playing) { at = now(); playing = false; told(); } });
    return media;
  }
  return {
    async play() {
      if (playing) return;
      const audio = element();
      if (at >= length) at = 0;
      audio.currentTime = at / 1000;
      playing = true;
      told();
      try {
        await audio.play();
      } catch (error) {
        playing = false;
        told();
        throw error;
      }
    },
    pause() {
      if (!playing) return;
      at = now();
      playing = false;
      media?.pause();
      told();
    },
    seek(ms) {
      at = clamp(ms);
      if (media) media.currentTime = at / 1000;
      told();
    },
    position: now,
    get playing() { return playing; },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    release() {
      playing = false;
      listeners.clear();
      if (media) {
        media.pause();
        media.removeAttribute("src");
        media.load();
        media = null;
      }
      if (url) URL.revokeObjectURL(url);
      url = "";
    },
  };
}
