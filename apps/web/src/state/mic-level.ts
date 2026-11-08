/** The microphone's level, 0–100, as the room measures it: about every 80 ms while a call captures, 0 when the
 *  capture stops. The room's meter draws its own pixels from it; this channel hands the same number to whoever else
 *  shows it — the desktop app's call controls card, through its bridge — without anyone reading the DOM. */
export interface MicLevelChannel {
  publish(value: number): void;
  /** Called with every published value; returns the function that stops it. */
  subscribe(listener: (value: number) => void): () => void;
  current(): number;
}

export function createMicLevelChannel(): MicLevelChannel {
  const listeners = new Set<(value: number) => void>();
  let last = 0;
  return {
    publish(value) {
      last = Math.max(0, Math.min(100, Number(value) || 0));
      for (const listener of listeners) listener(last);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    current: () => last,
  };
}
