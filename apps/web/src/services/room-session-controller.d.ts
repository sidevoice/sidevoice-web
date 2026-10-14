export {};

import type { SidevoiceActions } from "../state/room-types";

declare global {
  interface Window {
    roomVoice?: {
      context?: AudioContext;
      supportsOutputSelection?: boolean;
      unlock(): Promise<void>;
      prepare(options: Record<string, unknown>, onStatus?: (text: string) => void): Promise<unknown>;
      speak(options: Record<string, unknown>, onStatus?: (text: string) => void, onPlaying?: () => void, onCue?: (cue: unknown) => void): Promise<void>;
      playEncoded(options: Record<string, unknown>, onStatus?: (text: string) => void, onPlaying?: () => void, onCue?: (cue: unknown) => void): Promise<void>;
      cancel(): void;
      setOutputDevice(id: string): Promise<void>;
    };
    roomTranscription?: Record<string, unknown>;
    sidevoiceSessionId?: () => string | null;
    sidevoiceUI?: {
      store?: import("../state/room-store").RoomStore;
      /** The room's error above the stage: a sentence worded for people, or a failure as error-message.ts words it. */
      setBootError(value: string | import("../components/ui/ErrorText").ErrorMessage | null): void;
      /** The microphone's level as the meter measures it (state/mic-level.ts). */
      micLevel?: import("../state/mic-level").MicLevelChannel;
      /** The agent's rendered output level, separate from the microphone. */
      playbackLevel?: import("../state/playback-level").PlaybackLevelChannel;
    };
    /** The meter's analyser, pulled per animation frame by the waveform bubble; null while no call captures. */
    sidevoiceAudio?: { readWaveform(): Float32Array | null };
    /** One uncaught error in the interface, on its way to the room. Never any transcript text. */
    sidevoiceReportError?: (report: { kind: string; message: string; stack?: string; component?: string }) => void;
    /** Reports raised before the controller (and its socket) exist. */
    sidevoiceClientErrors?: { kind: string; message: string; stack?: string; component?: string }[];
    sidevoiceBuildId?: string;
    sidevoiceActions?: SidevoiceActions;
  }
}
