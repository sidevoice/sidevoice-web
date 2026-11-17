/* The log as the viewer holds it: events exactly as a log file has them, tagged with the piece that wrote them (the file
 * does not say it), and the filters that narrow what shows of them. Pure: no React, no host. */

/** Who wrote an event: the app itself, the connector, or the core. */
export type LogPiece = "app" | "connector" | "core";
export const LOG_PIECES: readonly LogPiece[] = ["app", "connector", "core"];

/** One event of a log, as the file has it: its line, then the lines of its backtrace (if it has one), in `text`, untouched.
 *  `id` is stable for the event (a line number, a byte offset): rows are kept by it. */
export interface LogEvent {
  id: string;
  piece: LogPiece;
  text: string;
}

export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR";
/** What the filter keeps: every level, warnings and errors, or errors alone. */
export type LevelFilter = "all" | "warn" | "error";
export const LEVEL_FILTERS: readonly LevelFilter[] = ["all", "warn", "error"];

export interface LogFilters {
  query: string;
  level: LevelFilter;
  /** None chosen: every piece. */
  pieces: readonly LogPiece[];
}
export const NO_FILTERS: LogFilters = { query: "", level: "all", pieces: [] };

/** How many of the latest lines the viewer asks the source for. */
export const LINE_CHOICES = [100, 200, 500, 1000] as const;
export const DEFAULT_LINES = 200;

const RANK: Record<LogLevel, number> = { TRACE: 0, DEBUG: 0, INFO: 0, WARN: 1, ERROR: 2 };
const MINIMUM: Record<LevelFilter, number> = { all: 0, warn: 1, error: 2 };

/** The line as a log writes it: a time, then the level, then the rest (`target{span}: message fields`). The level is the
 *  first word after the time; a line that does not read so is of no level that stands out (INFO). */
const HEAD = /^(\s*\S+)(\s+)(TRACE|DEBUG|INFO|WARN|ERROR)(?=\s)/;

export function levelOf(text: string): LogLevel {
  return (HEAD.exec(text)?.[3] as LogLevel | undefined) ?? "INFO";
}

export interface LogHead { time: string; gap: string; level: LogLevel; rest: string }

/** The first line of an event split at its time and level, for colouring them; null where it does not read as a log line.
 *  The text is never changed: the parts put back are the line. */
export function headOf(text: string): LogHead | null {
  const match = HEAD.exec(text);
  if (!match) return null;
  return { time: match[1], gap: match[2], level: match[3] as LogLevel, rest: text.slice(match[0].length) };
}

/** What a search looks in: the event as written, and the name of its piece as the person sees it beside the line. */
const haystack = (event: LogEvent, pieceLabel: (piece: LogPiece) => string) => (pieceLabel(event.piece) + "\n" + event.text).toLowerCase();

/** What Copy puts on the clipboard: each event as the file has it (its backtrace under it), led by its piece in brackets, since the
 *  file does not say it and a pasted line must stay attributable (`[connector] 14:32:07.412  INFO …`). */
export function copyText(events: readonly LogEvent[], pieceLabel: (piece: LogPiece) => string): string {
  return events.map((event) => `[${pieceLabel(event.piece)}] ${event.text}`).join("\n");
}

/** The events the filters leave, in their order. */
export function filterEvents(events: readonly LogEvent[], filters: LogFilters, pieceLabel: (piece: LogPiece) => string): LogEvent[] {
  const query = filters.query.trim().toLowerCase();
  const minimum = MINIMUM[filters.level];
  return events.filter((event) => (!filters.pieces.length || filters.pieces.includes(event.piece))
    && RANK[levelOf(event.text)] >= minimum && (!query || haystack(event, pieceLabel).includes(query)));
}

export interface Facets {
  level: Record<LevelFilter, number>;
  piece: Record<LogPiece, number>;
}

/** What each choice of the filters would leave, as the cards and chips of the popover say it: a level's count under the
 *  pieces and the search chosen, a piece's under the level and the search chosen (in `events`, the lines asked for). */
export function facets(events: readonly LogEvent[], filters: LogFilters, pieceLabel: (piece: LogPiece) => string): Facets {
  const query = filters.query.trim().toLowerCase();
  const hit = (event: LogEvent) => !query || haystack(event, pieceLabel).includes(query);
  const onPiece = (event: LogEvent) => !filters.pieces.length || filters.pieces.includes(event.piece);
  const level = Object.fromEntries(LEVEL_FILTERS.map((value) => [value,
    events.filter((event) => onPiece(event) && hit(event) && RANK[levelOf(event.text)] >= MINIMUM[value]).length])) as Facets["level"];
  const piece = Object.fromEntries(LOG_PIECES.map((value) => [value,
    events.filter((event) => event.piece === value && hit(event) && RANK[levelOf(event.text)] >= MINIMUM[filters.level]).length])) as Facets["piece"];
  return { level, piece };
}

/** How many filters are on besides the search (the badge on the button). */
export const activeFilterCount = (filters: LogFilters) => (filters.level !== "all" ? 1 : 0) + filters.pieces.length;

/** What a line holds that is not plain text: a match of the search, or what the log's redaction left in place of a value. */
export interface Segment { text: string; kind?: "hit" | "redacted" }

const REDACTED = "<redacted>|\\[redacted\\]";
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The pattern of a search, built once for the search and not once per line drawn (a search is drawn on up to a thousand lines). */
let patternOf: { needle: string; pattern: RegExp } | null = null;
function patternFor(needle: string): RegExp {
  if (patternOf?.needle !== needle) patternOf = { needle, pattern: new RegExp(needle ? `(${escapeRegExp(needle)})|(${REDACTED})` : `()(${REDACTED})`, "gi") };
  patternOf.pattern.lastIndex = 0;
  return patternOf.pattern;
}

/** `text` cut into its plain parts, the matches of `query` and the redaction markers; joined, they are `text`. */
export function segments(text: string, query: string): Segment[] {
  const pattern = patternFor(query.trim());
  const parts: Segment[] = [];
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    if (!match[0]) continue;
    if (match.index > at) parts.push({ text: text.slice(at, match.index) });
    parts.push({ text: match[0], kind: match[1] ? "hit" : "redacted" });
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

/** What a part of the first line is, for its colour: the time, the level, the target (`audio`, `call{call=c-7f3a}`). */
export type Tone = "time" | "level" | "target";

/** A part of an event as it is drawn: its text, what the search or the redaction made of it, and what it is on the line. */
export interface Token extends Segment { tone?: Tone }

const TARGET = /^(\s+)(\S+?):(?=\s|$)/;

/** An event cut into the parts it is drawn in: the search's matches, the redaction markers, and the time, level and target of
 *  its first line. Joined, the parts are the event's text, untouched. One pass over the text, two cursors walking the matches and
 *  the (at most three, ordered, disjoint) tones: linear in the text and its matches, however many the search finds. */
export function tokens(text: string, query: string): Token[] {
  const head = headOf(text);
  const tones: { start: number; end: number; tone: Tone }[] = [];
  if (head) {
    const levelAt = head.time.length + head.gap.length;
    tones.push({ start: 0, end: head.time.length, tone: "time" }, { start: levelAt, end: levelAt + head.level.length, tone: "level" });
    const target = TARGET.exec(head.rest);
    if (target) tones.push({ start: levelAt + head.level.length + target[1].length, end: levelAt + head.level.length + target[1].length + target[2].length, tone: "target" });
  }
  // The parts of `segments` follow one another and cover the whole text: each has the offset it starts at.
  const spans: { end: number; kind?: Segment["kind"] }[] = [];
  let offset = 0;
  for (const part of segments(text, query)) { offset += part.text.length; spans.push({ end: offset, kind: part.kind }); }
  const result: Token[] = [];
  let at = 0, span = 0, tone = 0;
  while (at < text.length) {
    while (spans[span].end <= at) span++;
    while (tone < tones.length && tones[tone].end <= at) tone++;
    const inTone = tone < tones.length && tones[tone].start <= at ? tones[tone] : undefined;
    // The part ends where the match does, where the tone does, or where the next tone begins.
    const end = Math.min(spans[span].end, inTone ? inTone.end : tone < tones.length ? tones[tone].start : text.length);
    result.push({ text: text.slice(at, end), kind: spans[span].kind, tone: inTone?.tone });
    at = end;
  }
  return result;
}
