/* A reply on the stage is read in chunks, the way the voice says it: a clause or two at a time, never more than a
 * short line's worth of words, with the previous chunk kept as a dim line above. Where the voice is comes from its
 * cue — the part of the reply sounding now — so the chunk follows the voice; within that part, which may be a whole
 * sentence, the words move on at a speaking pace and never past its end. */

import type { KaraokeRange } from "../../state/room-types";

export interface SpeechChunk {
  /** Offsets into the reply's text: the chunk is `text.slice(start, end)`. */
  start: number;
  end: number;
  text: string;
}

const MAX_WORDS = 11;
/** How many of the previous chunk's last words stay above the current one. */
const TAIL_WORDS = 6;
const CLAUSE_END = /[.?!,;:…]["'”’)\]]*$/;

/** The reply's words grouped into chunks: whole clauses, merged while they fit in MAX_WORDS; a clause longer than
 *  that is cut into as few even pieces as fit, so no piece is left a lone word. */
export function speechChunks(text: string): SpeechChunk[] {
  const words = [...text.matchAll(/\S+/g)].map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, word: match[0] }));
  const clauses: (typeof words)[] = [];
  let clause: typeof words = [];
  for (const word of words) {
    clause.push(word);
    if (CLAUSE_END.test(word.word)) { clauses.push(...evenly(clause)); clause = []; }
  }
  if (clause.length) clauses.push(...evenly(clause));

  const chunks: (typeof words)[] = [];
  let current: typeof words = [];
  for (const next of clauses) {
    if (current.length && current.length + next.length > MAX_WORDS) { chunks.push(current); current = []; }
    current = current.concat(next);
  }
  if (current.length) chunks.push(current);
  return chunks.map((chunk) => {
    const start = chunk[0].start, end = chunk[chunk.length - 1].end;
    return { start, end, text: text.slice(start, end) };
  });
}

function evenly<T>(words: T[]): T[][] {
  const pieces = Math.ceil(words.length / MAX_WORDS);
  const size = Math.ceil(words.length / pieces);
  return Array.from({ length: pieces }, (_, index) => words.slice(index * size, (index + 1) * size)).filter((piece) => piece.length);
}

export interface BubbleView {
  current: SpeechChunk;
  /** The chunk before, as its last few words, or null at the start of the reply. */
  previous: string | null;
  /** How many characters of the current chunk have been said. */
  spoken: number;
}

/** What the bubble shows when the voice has said up to `spokenTo` characters of `text`. */
export function bubbleAt(text: string, spokenTo: number): BubbleView | null {
  const chunks = speechChunks(text);
  if (!chunks.length) return null;
  const reached = Number.isFinite(spokenTo) ? Math.max(0, spokenTo) : 0;
  let index = chunks.findIndex((chunk) => reached <= chunk.end);
  if (index < 0) index = chunks.length - 1;
  const current = chunks[index];
  const before = chunks[index - 1];
  const words = before ? before.text.split(/\s+/) : [];
  const previous = before ? (words.length > TAIL_WORDS ? "…" + words.slice(-TAIL_WORDS).join(" ") : before.text) : null;
  return { current, previous, spoken: Math.max(0, Math.min(current.text.length, reached - current.start)) };
}

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
