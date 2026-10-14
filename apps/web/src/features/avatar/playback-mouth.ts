/** Smooth output samples without carrying speech across a real silence. */
export function smoothPlaybackLevel(previous: number, input: number): number {
  const level = Number.isFinite(input) ? Math.max(0, Math.min(1, input)) : 0;
  if (level < 0.06) return 0;
  return Math.max(0.06, previous + (level - previous) * (level > previous ? 0.7 : 0.5));
}
