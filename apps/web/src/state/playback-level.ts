/** Output level of the active conversation, separate from the microphone and room projections. */
export interface PlaybackLevelSample {
  threadId: string | null;
  level: number;
  receivedAt: number;
}

export interface PlaybackLevelChannel {
  publish(level: number, threadId: string | null): void;
  clear(): void;
  subscribe(listener: (sample: PlaybackLevelSample) => void): () => void;
  current(): PlaybackLevelSample;
}

export function createPlaybackLevelChannel(): PlaybackLevelChannel {
  const listeners = new Set<(sample: PlaybackLevelSample) => void>();
  let sample: PlaybackLevelSample = { threadId: null, level: 0, receivedAt: 0 };
  const send = () => { for (const listener of listeners) listener(sample); };
  return {
    publish(level, threadId) {
      const value = Number(level);
      sample = { threadId, level: Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0, receivedAt: Date.now() };
      send();
    },
    clear() { sample = { threadId: null, level: 0, receivedAt: Date.now() }; send(); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    current: () => sample,
  };
}

/** Shared with the stage before the controller installs the window bridge. */
export const playbackLevel = createPlaybackLevelChannel();
