/* Where the voice is in a reply on the stage, the way it says it: its cue — the part of the reply sounding now — so the
 * words lit follow the voice; within that part, which may be a whole sentence, the words move on at a speaking pace and
 * never past its end. */

import type { KaraokeRange } from "../../state/room-types";

/** A calm speaking pace, in characters a second: how fast the words move on where the voice says nothing finer. */
export const PACE = 15;

/** Where a reply is being read, on a clock that runs only while the reply sounds. Before the voice gives a cue, the
 *  clock at a speaking pace from the start; with one, the same pace from the start of the part sounding, up to its
 *  end. It never goes back, so a late cue does not send the bubble back. */
export interface Reading {
  segment: string;
  /** Milliseconds the reply has sounded before \`since\`. */
  elapsed: number;
  /** When it started sounding this time, or null while it does not. */
  since: number | null;
  /** The voice's last cue, and how long the reply had sounded when it came. */
  cue: (KaraokeRange & { at: number }) | null;
  /** How many characters the bubble takes as said. */
  position: number;
}

const paced = (milliseconds: number) => Math.round((milliseconds / 1000) * PACE);

/** The reading after this moment: \`segment\` is the reply on the stage (null while there is none), \`sounding\` whether
 *  the voice is saying it, \`cue\` the part the voice says is sounding (null while it gives none). The same reply keeps
 *  its reading through a pause; a new reply, or this one heard again from the start (its cue goes back), starts over. */
export function readOn(previous: Reading | null, segment: string | null, sounding: boolean, cue: KaraokeRange | null, now: number): Reading | null {
  if (!segment) return previous?.since == null ? previous : { ...previous, elapsed: previous.elapsed + now - previous.since, since: null };
  const replayed = cue !== null && previous?.cue != null && cue.from < previous.cue.from;
  const reading: Reading = previous && previous.segment === segment && !replayed ? { ...previous }
    : { segment, elapsed: 0, since: null, cue: null, position: 0 };
  if (sounding && reading.since === null) reading.since = now;
  if (!sounding && reading.since !== null) { reading.elapsed += now - reading.since; reading.since = null; }
  const sounded = reading.elapsed + (reading.since === null ? 0 : now - reading.since);
  if (cue !== null && (reading.cue?.from !== cue.from || reading.cue?.to !== cue.to)) reading.cue = { from: cue.from, to: cue.to, at: sounded };
  const reached = reading.cue ? Math.min(reading.cue.to, reading.cue.from + paced(sounded - reading.cue.at)) : paced(sounded);
  reading.position = Math.max(reading.position, reached);
  return reading;
}

/** How many characters of the reply the bubble takes as said. */
export function readingPosition(reading: Reading) {
  return reading.position;
}

/** Whether the reading moves on by itself: the reply sounds, and the part the voice says is sounding is not all lit. */
export function readingMoves(reading: Reading) {
  return reading.since !== null && (reading.cue === null || reading.position < reading.cue.to);
}
