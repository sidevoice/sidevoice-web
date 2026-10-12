/* A try's recorded take: what the microphone gave the voice from the moment it listened to the moment it stopped, with
 * where in it the person's turns started, paused and were ended. Shown once the try is over (features/settings/
 * TryTake.tsx), played from memory, never sent or kept anywhere.
 *
 * CONTRACT GAP #40 (briefs/CONTRACT-GAPS-75.md), pending in @sidevoice/voice: no voice hands a take yet. 0.3.x's
 * `VoiceHost` tells turns (in Unix ms), states and levels, never the samples, and nothing places a turn's moments in
 * the audio; the desktop app's host is the same seam. So `onTake` is optional here, absent from every real voice, and a
 * try then shows no take (voice-trial.js asks for one only where the voice has `onTake`). The shapes below are what the
 * voice module is asked for; the playground's mocked voice implements them. Once the module ships them they are its
 * own, imported from @sidevoice/voice, and this file goes. */
import type { VoiceHost } from "@sidevoice/voice";

/** One of the person's turns within a take, by the voice's `turn_id` (the one `onTurn` tells); every time in ms from
 *  the take's first sample, at the call's own positions in the audio (not when its events reached the page). */
export interface VoiceTakeTurn {
  turn_id: string;
  /** Where the person started speaking: the speech the turn opened at. */
  speech_ms: number;
  /** Within the turn, where the speech stopped and where it came back, before its end was decided. */
  pauses: { from_ms: number; to_ms: number }[];
  /** Where the voice decided the turn had ended (its transcription started); null when the take ended first. */
  end_ms: number | null;
}

/** What the microphone gave from the moment the voice listened (sample 0) to the moment it stopped. */
export interface VoiceTake {
  /** 16000: the call's own rate. */
  sampleRate: number;
  /** Mono, as the call heard it (after the browser's echo cancellation), in order. */
  samples: Float32Array;
  /** Unix ms of its first sample, and of its end. */
  started_at: number;
  ended_at: number;
  /** The turns the voice opened in it, in order. */
  turns: VoiceTakeTurn[];
}

/** The voice seam with a take (gap #40): `start({take: true})` keeps what the microphone gives from the moment the
 *  voice listens until that listening ends (a stop, a failure, a restart for other models); `onTake` is told it once
 *  then — before `stop()` resolves, before the error that ended it — and the voice keeps no copy. */
export type TakingVoiceHost = VoiceHost & {
  start(options?: { take?: boolean }): Promise<void>;
  onTake?(listener: (take: VoiceTake) => void): () => void;
};

/** How long a take lasts, in ms. */
export const takeMs = (take: VoiceTake) => (take.samples.length / take.sampleRate) * 1000;
