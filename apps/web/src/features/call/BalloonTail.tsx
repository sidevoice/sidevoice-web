/* A speech balloon's tail on the stage (call-view.css .balloon-tail): an ink line along its two sides, drawn in a 72 × 40
 * box hung from the balloon's bottom edge, and under it a fill of the balloon's own colour that closes it against the
 * balloon a pixel inside its ink, so the edge opens where the tail leaves it. Each starts square to the edge and curves
 * to its tip: the agent's ones down to the agent under the balloon, the person's out of the tile's corner toward
 * whoever is speaking, off the picture as a comic draws a speaker out of frame. */
const TAILS = {
  /** From left of the middle, hooking to a sharp tip over the agent. */
  a: "M12 1C12 15 25 24 36 38C33 26 32 14 32 1",
  /** A long swoosh from right of the middle, its outer side one sweeping curve. */
  b: "M42 1C42 14 40 26 34 39C48 30 62 18 62 1",
  /** A stubby nub with a round end, as the bichos' own feet and arms. */
  c: "M16 1C16 12 22 24 30 31Q36 36 38 30C40 22 38 12 38 1",
  /** The person's: from near the balloon's right end, out toward the tile's corner. */
  person: "M24 1C24 14 40 28 64 36C52 26 46 14 46 1",
} as const;

export type TailShape = keyof typeof TAILS;

export function BalloonTail({ shape }: { shape: TailShape }) {
  const ink = TAILS[shape];
  const start = /^M([\d.]+) /.exec(ink)![1], end = /([\d.]+) 1$/.exec(ink)![1];
  return <svg className="balloon-tail" data-tail={shape} viewBox="0 0 72 40" aria-hidden="true">
    <path className="tail-fill" d={`M${start} 0L${ink.slice(1)}L${end} 0Z`} />
    <path className="tail-ink" d={ink} />
  </svg>;
}
